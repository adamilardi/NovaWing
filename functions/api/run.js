const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const RUN_TOKEN_TTL_MS = 15 * 60 * 1000;

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
        return new Response('Method not allowed', {
            status: 405,
            headers: { Allow: 'POST, OPTIONS' }
        });
    }

    let payload;
    try {
        payload = await readJson(request);
    } catch (err) {
        return jsonResponse({ error: err.message || 'Invalid request' }, err.statusCode || 400);
    }

    const version = sanitizeGameVersion(payload.version);
    const runId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + RUN_TOKEN_TTL_MS;

    await env.DB.prepare(`
        INSERT INTO leaderboard_runs (id, game_version, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    `).bind(
        runId,
        version,
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

    if (body.length > MAX_REQUEST_BODY_BYTES) {
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
    await db.prepare(`
        DELETE FROM leaderboard_runs
        WHERE expires_at <= ? OR used_at IS NOT NULL
    `).bind(new Date(now).toISOString()).run();
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}
