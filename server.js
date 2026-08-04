// Simple HTTP server for NovaWing
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 4000;
const HOST = '0.0.0.0';
const LEADERBOARD_LIMIT = 10;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const RUN_TOKEN_TTL_MS = 15 * 60 * 1000;
// A full campaign opens one campaign token plus one token per level.
const RUN_REQUEST_LIMIT = 120;
const RUN_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const MIN_COMPLETION_TIME_MS = 24 * 1000;
const MAX_COMPLETION_TIME_MS = 10 * 60 * 1000;
// Waves + splitter drones + long boss drone phases can legitimately exceed 80 kills.
const MAX_PLAUSIBLE_KILLS = 300;
const CAMPAIGN_BOSS_SCORE = 5500;
const FINAL_BOSS_SCORE = 2500;
const LEVEL_BOSS_SCORE = 1500;
// Upper bound uses the highest per-enemy kill payout (splitter parent = 200).
const MAX_KILL_SCORE = 200;
const MAX_POWERUP_BONUS_SCORE = 2500;
const MIN_MS_PER_KILL = 200;
const DATA_DIR = path.join(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const activeRuns = new Map();
const runRequestLog = new Map();
let leaderboardWriteQueue = Promise.resolve();

function isPublicRequest(requestPath) {
    if (
        requestPath === '/index.html' ||
        requestPath === '/game.js' ||
        requestPath === '/levels.js' ||
        requestPath === '/audio.js'
    ) {
        return true;
    }
    return /^\/assets\/[\w.-]+\.(png|jpe?g)$/i.test(requestPath);
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(payload));
}

function readRequestJson(req) {
    return new Promise((resolve, reject) => {
        const contentLength = Number(req.headers['content-length']);
        if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
            reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
            req.resume();
            return;
        }

        let body = '';
        let settled = false;
        let byteLength = 0;

        const settle = (fn, value) => {
            if (settled) return;
            settled = true;
            fn(value);
        };

        req.on('data', chunk => {
            if (settled) return;
            byteLength += chunk.length;
            if (byteLength > MAX_REQUEST_BODY_BYTES) {
                settle(reject, Object.assign(new Error('Request body too large'), { statusCode: 413 }));
                req.destroy();
                return;
            }
            body += chunk;
        });

        req.on('end', () => {
            if (settled) return;
            if (!body) {
                settle(resolve, {});
                return;
            }

            try {
                settle(resolve, JSON.parse(body));
            } catch (err) {
                settle(reject, Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
            }
        });

        req.on('error', err => settle(reject, err));
    });
}

async function readLeaderboard() {
    try {
        const raw = await fs.promises.readFile(LEADERBOARD_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return sortLeaderboard(parsed.map(normalizeEntry).filter(Boolean));
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

async function writeLeaderboard(entries) {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(LEADERBOARD_FILE, JSON.stringify(entries, null, 2) + '\n');
}

function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const name = sanitizeName(entry.name);
    const version = sanitizeGameVersion(entry.version);
    const scope = sanitizeLeaderboardScope(entry.scope);
    const timeMs = Math.round(Number(entry.timeMs));
    const score = Math.round(Number(entry.score));
    const kills = Math.round(Number(entry.kills));
    const accuracy = Math.round(Number(entry.accuracy));

    if (!Number.isFinite(timeMs) || timeMs <= 0 || timeMs > 10 * 60 * 1000) return null;
    if (!Number.isFinite(score) || score < 0 || score > 1000000) return null;
    if (!Number.isFinite(kills) || kills < 0 || kills > 10000) return null;
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return null;

    return {
        id: typeof entry.id === 'string' && entry.id ? entry.id.slice(0, 80) : crypto.randomUUID(),
        version,
        scope,
        name,
        timeMs,
        score,
        kills,
        accuracy,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString()
    };
}

function sanitizeGameVersion(value) {
    const cleaned = String(value || '')
        .replace(/[^\w.-]/g, '')
        .trim()
        .slice(0, 24);

    return cleaned || '1.0.0';
}

function sanitizeLeaderboardScope(value) {
    const scope = String(value || 'campaign').toLowerCase();
    return scope === 'level-1' || scope === 'level-2' || scope === 'level-3'
        ? scope
        : 'campaign';
}

function sanitizeName(value) {
    const cleaned = String(value || '')
        .replace(/[^\w .-]/g, '')
        .trim()
        .slice(0, 14);

    return cleaned || 'Pilot';
}

function sortLeaderboard(entries) {
    return entries.sort((a, b) => {
        if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
        if (a.score !== b.score) return b.score - a.score;
        if (a.kills !== b.kills) return b.kills - a.kills;
        return String(a.createdAt).localeCompare(String(b.createdAt));
    });
}

async function handleLeaderboardRequest(req, res) {
    if (req.method === 'GET') {
        const version = getRequestVersion(req);
        const scope = getRequestScope(req);
        const entries = (await readLeaderboard())
            .filter(entry => entry.version === version && entry.scope === scope)
            .slice(0, LEADERBOARD_LIMIT);
        sendJson(res, 200, { version, scope, entries });
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'GET, POST' });
        res.end('Method not allowed');
        return;
    }

    const payload = await readRequestJson(req);
    // Stats were locked at run completion. Leaderboard POST may only choose a name.
    const runValidation = inspectRunToken(payload);
    if (!runValidation.ok) {
        sendJson(res, 400, { error: runValidation.error });
        return;
    }

    const submittedEntry = normalizeEntry({
        name: payload.name,
        version: runValidation.version,
        scope: runValidation.scope,
        timeMs: runValidation.timeMs,
        score: runValidation.score,
        kills: runValidation.kills,
        accuracy: runValidation.accuracy,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
    });

    if (!submittedEntry || !isPlausibleCompletedRun(submittedEntry)) {
        sendJson(res, 400, { error: 'Invalid leaderboard entry' });
        return;
    }

    const consumed = markRunTokenUsed(runValidation.runId);
    if (!consumed.ok) {
        sendJson(res, 400, { error: consumed.error });
        return;
    }

    const result = await queueLeaderboardWrite(async () => {
        const entries = await readLeaderboard();
        const sorted = sortLeaderboard(entries.concat(submittedEntry));
        const versionEntries = sorted.filter(entry =>
            entry.version === submittedEntry.version && entry.scope === submittedEntry.scope
        );
        const rank = versionEntries.findIndex(entry => entry.id === submittedEntry.id) + 1;
        const savedEntries = sorted.filter(entry => {
            const sameVersionRank = sorted
                .filter(candidate =>
                    candidate.version === entry.version && candidate.scope === entry.scope
                )
                .findIndex(candidate => candidate.id === entry.id);
            return sameVersionRank >= 0 && sameVersionRank < LEADERBOARD_LIMIT;
        });
        await writeLeaderboard(savedEntries);
        return { rank, savedEntries: versionEntries.slice(0, LEADERBOARD_LIMIT) };
    });

    sendJson(res, 201, {
        entry: submittedEntry,
        rank: result.rank,
        version: submittedEntry.version,
        scope: submittedEntry.scope,
        entries: result.savedEntries
    });
}

async function handleRunRequest(req, res) {
    if (req.method !== 'POST' && req.method !== 'PATCH') {
        res.writeHead(405, { Allow: 'POST, PATCH' });
        res.end('Method not allowed');
        return;
    }

    const payload = await readRequestJson(req);

    if (req.method === 'PATCH') {
        const completion = completeRunToken(payload);
        if (!completion.ok) {
            sendJson(res, 400, { error: completion.error });
            return;
        }

        sendJson(res, 200, {
            runId: completion.runId,
            version: completion.version,
            scope: completion.scope,
            timeMs: completion.timeMs,
            score: completion.score,
            kills: completion.kills,
            accuracy: completion.accuracy,
            completedAt: new Date(completion.completedAt).toISOString()
        });
        return;
    }

    const clientKey = getClientKey(req);
    if (!allowRunRequest(clientKey)) {
        sendJson(res, 429, { error: 'Too many run requests' });
        return;
    }

    const version = sanitizeGameVersion(payload.version);
    const scope = sanitizeLeaderboardScope(payload.scope);
    const runId = crypto.randomUUID();
    const now = Date.now();
    activeRuns.set(runId, {
        version,
        scope,
        clientKey,
        startedAt: now,
        expiresAt: now + RUN_TOKEN_TTL_MS,
        completedAt: null,
        score: null,
        kills: null,
        accuracy: null
    });
    pruneExpiredRuns();

    sendJson(res, 201, {
        runId,
        version,
        scope,
        startedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + RUN_TOKEN_TTL_MS).toISOString()
    });
}

function inspectRunToken(payload) {
    const runId = typeof payload.runId === 'string' ? payload.runId : '';
    const requestedVersion = sanitizeGameVersion(payload.version);
    const requestedScope = sanitizeLeaderboardScope(payload.scope);
    const run = activeRuns.get(runId);

    if (!run) return { ok: false, error: 'Invalid or expired run token' };
    if (run.version !== requestedVersion) return { ok: false, error: 'Run token version mismatch' };
    if (run.scope !== requestedScope) return { ok: false, error: 'Run token scope mismatch' };
    if (Date.now() > run.expiresAt) {
        activeRuns.delete(runId);
        return { ok: false, error: 'Run token expired' };
    }
    if (!run.completedAt) return { ok: false, error: 'Run is not complete' };
    if (!Number.isFinite(run.score) || !Number.isFinite(run.kills) || !Number.isFinite(run.accuracy)) {
        return { ok: false, error: 'Run is missing locked stats' };
    }

    return {
        ok: true,
        runId,
        version: run.version,
        scope: run.scope,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        timeMs: run.completedAt - run.startedAt,
        score: run.score,
        kills: run.kills,
        accuracy: run.accuracy
    };
}

function markRunTokenUsed(runId) {
    const run = activeRuns.get(runId);
    if (!run || !run.completedAt) {
        return { ok: false, error: 'Invalid or expired run token' };
    }
    if (Date.now() > run.expiresAt) {
        activeRuns.delete(runId);
        return { ok: false, error: 'Run token expired' };
    }

    activeRuns.delete(runId);
    return { ok: true };
}

function completeRunToken(payload) {
    const runId = typeof payload.runId === 'string' ? payload.runId : '';
    const requestedVersion = sanitizeGameVersion(payload.version);
    const requestedScope = sanitizeLeaderboardScope(payload.scope);
    const run = activeRuns.get(runId);
    const now = Date.now();

    if (!run) return { ok: false, error: 'Invalid or expired run token' };
    if (run.version !== requestedVersion) return { ok: false, error: 'Run token version mismatch' };
    if (run.scope !== requestedScope) return { ok: false, error: 'Run token scope mismatch' };
    if (now > run.expiresAt) {
        activeRuns.delete(runId);
        return { ok: false, error: 'Run token expired' };
    }

    // Already completed: return locked stats; do not accept a rewrite.
    if (run.completedAt) {
        if (!Number.isFinite(run.score) || !Number.isFinite(run.kills) || !Number.isFinite(run.accuracy)) {
            return { ok: false, error: 'Run is missing locked stats' };
        }

        return {
            ok: true,
            runId,
            version: run.version,
            scope: run.scope,
            completedAt: run.completedAt,
            timeMs: run.completedAt - run.startedAt,
            score: run.score,
            kills: run.kills,
            accuracy: run.accuracy
        };
    }

    const completedAt = now;
    const timeMs = completedAt - run.startedAt;
    if (timeMs < MIN_COMPLETION_TIME_MS || timeMs > MAX_COMPLETION_TIME_MS) {
        return { ok: false, error: 'Implausible run completion time' };
    }

    const stats = parseRunStats(payload);
    if (!stats) {
        return { ok: false, error: 'Invalid run stats' };
    }
    if (!isPlausibleCompletedRun({ timeMs, scope: run.scope, ...stats })) {
        return { ok: false, error: 'Implausible run stats' };
    }

    run.completedAt = completedAt;
    run.score = stats.score;
    run.kills = stats.kills;
    run.accuracy = stats.accuracy;

    return {
        ok: true,
        runId,
        version: run.version,
        scope: run.scope,
        completedAt,
        timeMs,
        score: stats.score,
        kills: stats.kills,
        accuracy: stats.accuracy
    };
}

function parseRunStats(payload) {
    if (!payload || typeof payload !== 'object') return null;

    const score = Math.round(Number(payload.score));
    const kills = Math.round(Number(payload.kills));
    const accuracy = Math.round(Number(payload.accuracy));

    if (!Number.isFinite(score) || score < 0 || score > 1000000) return null;
    if (!Number.isFinite(kills) || kills < 0 || kills > 10000) return null;
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return null;

    return { score, kills, accuracy };
}

function pruneExpiredRuns() {
    const now = Date.now();
    activeRuns.forEach((run, runId) => {
        if (now > run.expiresAt) activeRuns.delete(runId);
    });

    const windowStart = now - RUN_REQUEST_WINDOW_MS;
    runRequestLog.forEach((timestamps, clientKey) => {
        const recent = timestamps.filter(timestamp => timestamp > windowStart);
        if (recent.length) {
            runRequestLog.set(clientKey, recent);
        } else {
            runRequestLog.delete(clientKey);
        }
    });
}

function isPlausibleCompletedRun(entry) {
    if (entry.timeMs < MIN_COMPLETION_TIME_MS) return false;
    if (entry.timeMs > MAX_COMPLETION_TIME_MS) return false;
    if (entry.kills < 1) return false;
    if (entry.kills > MAX_PLAUSIBLE_KILLS) return false;
    const bossScore = getBossScoreForScope(entry.scope);
    const bossKills = entry.scope === 'campaign' ? 3 : 1;
    if (entry.score < bossScore) return false;

    if (entry.kills > Math.floor(entry.timeMs / MIN_MS_PER_KILL) + 1) return false;

    const regularKills = Math.max(0, entry.kills - bossKills);
    const maxScore = bossScore + regularKills * MAX_KILL_SCORE + MAX_POWERUP_BONUS_SCORE;
    if (entry.score > maxScore) return false;

    if (entry.kills === bossKills && entry.score > bossScore + MAX_POWERUP_BONUS_SCORE) return false;

    return true;
}

function getBossScoreForScope(scope) {
    if (scope === 'campaign') return CAMPAIGN_BOSS_SCORE;
    if (scope === 'level-3') return FINAL_BOSS_SCORE;
    return LEVEL_BOSS_SCORE;
}

function getClientKey(req) {
    // Only honor X-Forwarded-For when explicitly behind a trusted reverse proxy.
    // Otherwise clients can spoof the header and bypass the run rate limit.
    if (process.env.TRUST_PROXY === '1') {
        const forwardedFor = String(req.headers['x-forwarded-for'] || '')
            .split(',')[0]
            .trim();
        if (forwardedFor) return forwardedFor;
    }

    return req.socket.remoteAddress || 'unknown';
}

function allowRunRequest(clientKey) {
    const now = Date.now();
    const windowStart = now - RUN_REQUEST_WINDOW_MS;
    const recent = (runRequestLog.get(clientKey) || [])
        .filter(timestamp => timestamp > windowStart);

    if (recent.length >= RUN_REQUEST_LIMIT) {
        runRequestLog.set(clientKey, recent);
        return false;
    }

    recent.push(now);
    runRequestLog.set(clientKey, recent);
    return true;
}

function getRequestVersion(req) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return sanitizeGameVersion(url.searchParams.get('version'));
}

function getRequestScope(req) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return sanitizeLeaderboardScope(url.searchParams.get('scope'));
}

function queueLeaderboardWrite(task) {
    const nextWrite = leaderboardWriteQueue.then(task, task);
    leaderboardWriteQueue = nextWrite.catch(() => {});
    return nextWrite;
}

const server = http.createServer((req, res) => {
    const rawUrl = typeof req.url === 'string' ? req.url : '/';
    const pathOnly = rawUrl.split('?')[0];
    let decodedPath;
    try {
        decodedPath = decodeURIComponent(pathOnly);
    } catch (err) {
        res.writeHead(400);
        res.end('Bad request');
        return;
    }

    const requestPath = decodedPath === '/' ? '/index.html' : decodedPath;
    if (requestPath === '/api/run') {
        handleRunRequest(req, res).catch(err => {
            if (!res.headersSent) {
                sendJson(res, err.statusCode || 500, { error: err.message || 'Server error' });
            }
        });
        return;
    }

    if (requestPath === '/api/leaderboard') {
        handleLeaderboardRequest(req, res).catch(err => {
            if (!res.headersSent) {
                sendJson(res, err.statusCode || 500, { error: err.message || 'Server error' });
            }
        });
        return;
    }

    if (!isPublicRequest(requestPath)) {
        res.writeHead(404);
        res.end('File not found');
        return;
    }

    const filePath = path.resolve(__dirname, `.${requestPath}`);
    const relativePath = path.relative(__dirname, filePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        res.writeHead(403);
        res.end('Access forbidden');
        return;
    }

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }

        let contentType = 'text/plain';
        const ext = path.extname(filePath);
        switch (ext) {
            case '.html': contentType = 'text/html'; break;
            case '.css': contentType = 'text/css'; break;
            case '.js': contentType = 'application/javascript'; break;
            case '.png': contentType = 'image/png'; break;
            case '.jpg':
            case '.jpeg': contentType = 'image/jpeg'; break;
            default: contentType = 'text/plain';
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Server error');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Start with a different port, for example: PORT=4001 node server.js`);
        process.exit(1);
    }

    throw err;
});

server.listen(PORT, HOST, () => {
    console.log(`NovaWing running at http://${HOST}:${PORT}`);
    console.log(`🎮 From Windows: http://localhost:${PORT}`);
});
