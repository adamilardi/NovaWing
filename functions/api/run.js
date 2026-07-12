const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const RUN_TOKEN_TTL_MS = 15 * 60 * 1000;
const RUN_REQUEST_LIMIT = 30;
const RUN_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const MIN_COMPLETION_TIME_MS = 24 * 1000;
const MAX_COMPLETION_TIME_MS = 10 * 60 * 1000;

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST' && request.method !== 'PATCH') {
        return new Response('Method not allowed', {
            status: 405,
            headers: { Allow: 'POST, PATCH, OPTIONS' }
        });
    }

    let payload;
    try {
        payload = await readJson(request);
    } catch (err) {
        return jsonResponse({ error: err.message || 'Invalid request' }, err.statusCode || 400);
    }

    if (request.method === 'PATCH') {
        const completion = await completeRun(env.DB, payload);
        if (!completion.ok) {
            return jsonResponse({ error: completion.error }, 400);
        }

        return jsonResponse({
            runId: completion.runId,
            version: completion.version,
            timeMs: completion.timeMs,
            completedAt: new Date(completion.completedAt).toISOString()
        });
    }

    const clientKey = await getClientKey(request);
    const rateLimit = await checkRunRateLimit(env.DB, clientKey);
    if (!rateLimit.ok) {
        return jsonResponse({ error: 'Too many run requests' }, 429);
    }

    const version = sanitizeGameVersion(payload.version);
    const runId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + RUN_TOKEN_TTL_MS;

    await env.DB.prepare(`
        INSERT INTO leaderboard_runs (id, game_version, client_key, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `).bind(
        runId,
        version,
        clientKey,
        new Date(now).toISOString(),
        new Date(expiresAt).toISOString()
    ).run();

    await pruneExpiredRuns(env.DB, now);

    return jsonResponse({
        runId,
        version,
        startedAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString()
    }, 201);
}

async function readJson(request) {
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
    const now = Date.now();

    const run = await db.prepare(`
        SELECT id, game_version, created_at, expires_at, used_at, completed_at
        FROM leaderboard_runs
        WHERE id = ?
    `).bind(runId).first();

    if (!run || run.used_at) return { ok: false, error: 'Invalid or expired run token' };
    if (run.game_version !== requestedVersion) return { ok: false, error: 'Run token version mismatch' };
    if (Date.parse(run.expires_at) <= now) return { ok: false, error: 'Run token expired' };

    const startedAt = Date.parse(run.created_at);
    const completedAt = run.completed_at ? Date.parse(run.completed_at) : now;
    const timeMs = completedAt - startedAt;
    if (!Number.isFinite(timeMs) || timeMs < MIN_COMPLETION_TIME_MS || timeMs > MAX_COMPLETION_TIME_MS) {
        return { ok: false, error: 'Implausible run completion time' };
    }

    if (!run.completed_at) {
        const update = await db.prepare(`
            UPDATE leaderboard_runs
            SET completed_at = ?
            WHERE id = ? AND completed_at IS NULL AND used_at IS NULL
        `).bind(new Date(completedAt).toISOString(), runId).run();

        if (!update.meta || update.meta.changes !== 1) {
            return { ok: false, error: 'Invalid or expired run token' };
        }
    }

    return {
        ok: true,
        runId,
        version: run.game_version,
        completedAt,
        timeMs
    };
}

async function checkRunRateLimit(db, clientKey) {
    const windowStart = new Date(Date.now() - RUN_REQUEST_WINDOW_MS).toISOString();
    const result = await db.prepare(`
        SELECT COUNT(*) AS count
        FROM leaderboard_runs
        WHERE client_key = ? AND created_at > ?
    `).bind(clientKey, windowStart).first();

    const count = Number(result && result.count);
    return { ok: !Number.isFinite(count) || count < RUN_REQUEST_LIMIT };
}

async function getClientKey(request) {
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

function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders(),
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}
