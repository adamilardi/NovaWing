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
const RUN_REQUEST_LIMIT = 30;
const RUN_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const MIN_COMPLETION_TIME_MS = 24 * 1000;
const MAX_COMPLETION_TIME_MS = 10 * 60 * 1000;
const MAX_PLAUSIBLE_KILLS = 80;
const BOSS_SCORE = 2500;
const REGULAR_KILL_SCORE = 150;
const MAX_POWERUP_BONUS_SCORE = 2500;
const DATA_DIR = path.join(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const activeRuns = new Map();
const runRequestLog = new Map();
let leaderboardWriteQueue = Promise.resolve();

function isPublicRequest(requestPath) {
    if (requestPath === '/index.html' || requestPath === '/game.js') return true;
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
        let body = '';

        req.on('data', chunk => {
            body += chunk;
            if (Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) {
                reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
                req.destroy();
            }
        });

        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
            }
        });

        req.on('error', reject);
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
        const entries = (await readLeaderboard())
            .filter(entry => entry.version === version)
            .slice(0, LEADERBOARD_LIMIT);
        sendJson(res, 200, { version, entries });
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'GET, POST' });
        res.end('Method not allowed');
        return;
    }

    const payload = await readRequestJson(req);
    const runValidation = consumeRunToken(payload);
    if (!runValidation.ok) {
        sendJson(res, 400, { error: runValidation.error });
        return;
    }

    const submittedEntry = normalizeEntry({
        ...payload,
        version: runValidation.version,
        timeMs: runValidation.timeMs,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
    });

    if (!submittedEntry || !isPlausibleCompletedRun(submittedEntry)) {
        sendJson(res, 400, { error: 'Invalid leaderboard entry' });
        return;
    }

    const result = await queueLeaderboardWrite(async () => {
        const entries = await readLeaderboard();
        const sorted = sortLeaderboard(entries.concat(submittedEntry));
        const versionEntries = sorted.filter(entry => entry.version === submittedEntry.version);
        const rank = versionEntries.findIndex(entry => entry.id === submittedEntry.id) + 1;
        const savedEntries = sorted.filter(entry => {
            const sameVersionRank = sorted
                .filter(candidate => candidate.version === entry.version)
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
            timeMs: completion.timeMs,
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
    const runId = crypto.randomUUID();
    const now = Date.now();
    activeRuns.set(runId, {
        version,
        clientKey,
        startedAt: now,
        expiresAt: now + RUN_TOKEN_TTL_MS,
        completedAt: null
    });
    pruneExpiredRuns();

    sendJson(res, 201, {
        runId,
        version,
        startedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + RUN_TOKEN_TTL_MS).toISOString()
    });
}

function consumeRunToken(payload) {
    const runId = typeof payload.runId === 'string' ? payload.runId : '';
    const requestedVersion = sanitizeGameVersion(payload.version);
    const run = activeRuns.get(runId);

    if (!run) return { ok: false, error: 'Invalid or expired run token' };
    if (run.version !== requestedVersion) return { ok: false, error: 'Run token version mismatch' };
    if (Date.now() > run.expiresAt) {
        activeRuns.delete(runId);
        return { ok: false, error: 'Run token expired' };
    }
    if (!run.completedAt) return { ok: false, error: 'Run is not complete' };

    activeRuns.delete(runId);
    return {
        ok: true,
        version: run.version,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        timeMs: run.completedAt - run.startedAt
    };
}

function completeRunToken(payload) {
    const runId = typeof payload.runId === 'string' ? payload.runId : '';
    const requestedVersion = sanitizeGameVersion(payload.version);
    const run = activeRuns.get(runId);
    const now = Date.now();

    if (!run) return { ok: false, error: 'Invalid or expired run token' };
    if (run.version !== requestedVersion) return { ok: false, error: 'Run token version mismatch' };
    if (now > run.expiresAt) {
        activeRuns.delete(runId);
        return { ok: false, error: 'Run token expired' };
    }

    const completedAt = run.completedAt || now;
    const timeMs = completedAt - run.startedAt;
    if (timeMs < MIN_COMPLETION_TIME_MS || timeMs > MAX_COMPLETION_TIME_MS) {
        return { ok: false, error: 'Implausible run completion time' };
    }

    run.completedAt = completedAt;

    return {
        ok: true,
        runId,
        version: run.version,
        completedAt,
        timeMs
    };
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
    if (entry.score < BOSS_SCORE) return false;

    const regularKills = Math.max(0, entry.kills - 1);
    const maxScore = BOSS_SCORE + regularKills * REGULAR_KILL_SCORE + MAX_POWERUP_BONUS_SCORE;
    if (entry.score > maxScore) return false;

    return true;
}

function getClientKey(req) {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim();
    return forwardedFor || req.socket.remoteAddress || 'unknown';
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
