const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const RUN_TOKEN_TTL_MS = 15 * 60 * 1000;
// A full campaign opens one campaign token plus one token per level.
const RUN_REQUEST_LIMIT = 120;
const RUN_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const MIN_COMPLETION_TIME_MS = 24 * 1000;
const MAX_COMPLETION_TIME_MS = 10 * 60 * 1000;
const MAX_PLAUSIBLE_KILLS = 300;
const CAMPAIGN_BOSS_SCORE = 5500;
const FINAL_BOSS_SCORE = 2500;
const LEVEL_BOSS_SCORE = 1500;
const MAX_KILL_SCORE = 200;
const MAX_POWERUP_BONUS_SCORE = 2500;
// Rough upper bound: more than ~1 kill per 200ms wall time is not plausible for this game.
const MIN_MS_PER_KILL = 200;

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== 'POST' && request.method !== 'PATCH') {
        return new Response('Method not allowed', {
            status: 405,
            headers: { Allow: 'POST, PATCH, OPTIONS', ...corsHeaders(request) }
        });
    }

    let payload;
    try {
        payload = await readJson(request);
    } catch (err) {
        return jsonResponse(request, { error: err.message || 'Invalid request' }, err.statusCode || 400);
    }

    if (request.method === 'PATCH') {
        const completion = await completeRun(env.DB, payload);
        if (!completion.ok) {
            return jsonResponse(request, { error: completion.error }, 400);
        }

        return jsonResponse(request, {
            runId: completion.runId,
            version: completion.version,
            scope: completion.scope,
            timeMs: completion.timeMs,
            score: completion.score,
            kills: completion.kills,
            accuracy: completion.accuracy,
            completedAt: new Date(completion.completedAt).toISOString()
        });
    }

    const clientKey = await getClientKey(request);
    const version = sanitizeGameVersion(payload.version);
    const scope = sanitizeLeaderboardScope(payload.scope);
    const runId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + RUN_TOKEN_TTL_MS;

    // Insert first, then verify the client is within the window. Concurrent
    // callers that slip past a pre-check count are pruned back under the limit.
    await env.DB.prepare(`
        INSERT INTO leaderboard_runs (id, game_version, scope, client_key, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
        runId,
        version,
        scope,
        clientKey,
        new Date(now).toISOString(),
        new Date(expiresAt).toISOString()
    ).run();

    const rateLimit = await checkRunRateLimit(env.DB, clientKey);
    if (!rateLimit.ok) {
        await env.DB.prepare(`
            DELETE FROM leaderboard_runs
            WHERE id = ? AND used_at IS NULL AND completed_at IS NULL
        `).bind(runId).run();
        return jsonResponse(request, { error: 'Too many run requests' }, 429);
    }

    await pruneExpiredRuns(env.DB, now);

    return jsonResponse(request, {
        runId,
        version,
        scope,
        startedAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString()
    }, 201);
}

async function readJson(request) {
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
        throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    }

    const body = await request.text();
    // Compare UTF-8 byte length, not JS string length (multi-byte names can under-count).
    if (new TextEncoder().encode(body).length > MAX_REQUEST_BODY_BYTES) {
        throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    }

    if (!body) return {};

    try {
        return JSON.parse(body);
    } catch (err) {
        throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
    }
}

async function pruneExpiredRuns(db, now) {
    const pruneBefore = new Date(now - RUN_REQUEST_WINDOW_MS).toISOString();

    await db.prepare(`
        DELETE FROM leaderboard_runs
        WHERE created_at <= ?
            AND (expires_at <= ? OR used_at IS NOT NULL)
    `).bind(pruneBefore, new Date(now).toISOString()).run();
}

async function completeRun(db, payload) {
    const runId = typeof payload.runId === 'string' ? payload.runId : '';
    const requestedVersion = sanitizeGameVersion(payload.version);
    const requestedScope = sanitizeLeaderboardScope(payload.scope);
    const now = Date.now();

    const run = await db.prepare(`
        SELECT id, game_version, scope, created_at, expires_at, used_at, completed_at, score, kills, accuracy
        FROM leaderboard_runs
        WHERE id = ?
    `).bind(runId).first();

    if (!run || run.used_at) return { ok: false, error: 'Invalid or expired run token' };
    if (run.game_version !== requestedVersion) return { ok: false, error: 'Run token version mismatch' };
    if (run.scope !== requestedScope) return { ok: false, error: 'Run token scope mismatch' };
    if (Date.parse(run.expires_at) <= now) return { ok: false, error: 'Run token expired' };

    const startedAt = Date.parse(run.created_at);

    // Already completed: return locked stats; do not accept a rewrite.
    if (run.completed_at) {
        const completedAt = Date.parse(run.completed_at);
        const timeMs = completedAt - startedAt;
        const score = Number(run.score);
        const kills = Number(run.kills);
        const accuracy = Number(run.accuracy);
        if (!Number.isFinite(timeMs) || !Number.isFinite(score) || !Number.isFinite(kills) || !Number.isFinite(accuracy)) {
            return { ok: false, error: 'Run is missing locked stats' };
        }

        return {
            ok: true,
            runId,
            version: run.game_version,
            scope: run.scope,
            completedAt,
            timeMs,
            score,
            kills,
            accuracy
        };
    }

    const completedAt = now;
    const timeMs = completedAt - startedAt;
    if (!Number.isFinite(timeMs) || timeMs < MIN_COMPLETION_TIME_MS || timeMs > MAX_COMPLETION_TIME_MS) {
        return { ok: false, error: 'Implausible run completion time' };
    }

    const stats = parseRunStats(payload);
    if (!stats) {
        return { ok: false, error: 'Invalid run stats' };
    }

    if (!isPlausibleCompletedRun({ timeMs, scope: run.scope, ...stats })) {
        return { ok: false, error: 'Implausible run stats' };
    }

    const update = await db.prepare(`
        UPDATE leaderboard_runs
        SET completed_at = ?, score = ?, kills = ?, accuracy = ?
        WHERE id = ? AND completed_at IS NULL AND used_at IS NULL
    `).bind(
        new Date(completedAt).toISOString(),
        stats.score,
        stats.kills,
        stats.accuracy,
        runId
    ).run();

    if (!update.meta || update.meta.changes !== 1) {
        return { ok: false, error: 'Invalid or expired run token' };
    }

    return {
        ok: true,
        runId,
        version: run.game_version,
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

function isPlausibleCompletedRun(entry) {
    if (entry.timeMs < MIN_COMPLETION_TIME_MS) return false;
    if (entry.timeMs > MAX_COMPLETION_TIME_MS) return false;
    if (entry.kills < 1) return false;
    if (entry.kills > MAX_PLAUSIBLE_KILLS) return false;
    const bossScore = getBossScoreForScope(entry.scope);
    const bossKills = entry.scope === 'campaign' ? 3 : 1;
    if (entry.score < bossScore) return false;

    // Kill rate vs wall-clock (server-measured time).
    if (entry.kills > Math.floor(entry.timeMs / MIN_MS_PER_KILL) + 1) return false;

    const regularKills = Math.max(0, entry.kills - bossKills);
    const maxScore = bossScore + regularKills * MAX_KILL_SCORE + MAX_POWERUP_BONUS_SCORE;
    if (entry.score > maxScore) return false;

    // Even a bare boss clear should not exceed boss + powerup ceiling with 1 kill.
    if (entry.kills === bossKills && entry.score > bossScore + MAX_POWERUP_BONUS_SCORE) return false;

    return true;
}

function getBossScoreForScope(scope) {
    if (scope === 'campaign') return CAMPAIGN_BOSS_SCORE;
    if (scope === 'level-3') return FINAL_BOSS_SCORE;
    return LEVEL_BOSS_SCORE;
}

async function checkRunRateLimit(db, clientKey) {
    const windowStart = new Date(Date.now() - RUN_REQUEST_WINDOW_MS).toISOString();
    const result = await db.prepare(`
        SELECT COUNT(*) AS count
        FROM leaderboard_runs
        WHERE client_key = ? AND created_at > ?
    `).bind(clientKey, windowStart).first();

    const count = Number(result && result.count);
    return { ok: !Number.isFinite(count) || count <= RUN_REQUEST_LIMIT };
}

async function getClientKey(request) {
    // Prefer the Cloudflare edge IP; never trust a spoofable X-Forwarded-For alone.
    const forwardedFor = (request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For') ||
        'unknown')
        .split(',')[0]
        .trim();
    const userAgent = request.headers.get('User-Agent') || '';
    const bytes = new TextEncoder().encode(forwardedFor + '\n' + userAgent);
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
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

function jsonResponse(request, payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders(request),
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function corsHeaders(request) {
    // Same-origin browser clients do not need CORS. Only echo a same-origin
    // Origin so third-party sites cannot call the API from a page context.
    const origin = request && request.headers ? request.headers.get('Origin') : null;
    if (!origin) return {};

    try {
        const requestUrl = new URL(request.url);
        const originUrl = new URL(origin);
        if (originUrl.origin !== requestUrl.origin) return {};
    } catch (err) {
        return {};
    }

    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}
