const LEADERBOARD_LIMIT = 10;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const MIN_COMPLETION_TIME_MS = 18 * 1000;

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === 'GET') {
        const version = getRequestVersion(request);
        const entries = await getLeaderboard(env.DB, version);
        return jsonResponse({ version, entries });
    }

    if (request.method !== 'POST') {
        return new Response('Method not allowed', {
            status: 405,
            headers: { Allow: 'GET, POST, OPTIONS' }
        });
    }

    let payload;
    try {
        payload = await readJson(request);
    } catch (err) {
        return jsonResponse({ error: err.message || 'Invalid request' }, err.statusCode || 400);
    }

    const runValidation = await consumeRunToken(env.DB, payload);
    if (!runValidation.ok) {
        return jsonResponse({ error: runValidation.error }, 400);
    }

    const entry = normalizeEntry({
        ...payload,
        version: runValidation.version,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
    });

    if (!entry || !isPlausibleCompletedRun(entry, runValidation.startedAt)) {
        return jsonResponse({ error: 'Invalid leaderboard entry' }, 400);
    }

    await env.DB.prepare(`
        INSERT INTO leaderboard_entries (id, game_version, name, time_ms, score, kills, accuracy, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        entry.id,
        entry.version,
        entry.name,
        entry.timeMs,
        entry.score,
        entry.kills,
        entry.accuracy,
        entry.createdAt
    ).run();

    const rankedEntries = await getRankedEntries(env.DB, entry.version);
    const rank = rankedEntries.findIndex(candidate => candidate.id === entry.id) + 1;
    const entries = rankedEntries.slice(0, LEADERBOARD_LIMIT);

    await pruneLeaderboard(env.DB);

    return jsonResponse({ entry, rank, version: entry.version, entries }, 201);
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

async function getLeaderboard(db, version) {
    return (await getRankedEntries(db, version)).slice(0, LEADERBOARD_LIMIT);
}

async function getRankedEntries(db, version) {
    const result = await db.prepare(`
        SELECT id, game_version, name, time_ms, score, kills, accuracy, created_at
        FROM leaderboard_entries
        WHERE game_version = ?
        ORDER BY time_ms ASC, score DESC, kills DESC, created_at ASC
        LIMIT 100
    `).bind(version).all();

    return (result.results || []).map(row => ({
        id: row.id,
        version: row.game_version,
        name: row.name,
        timeMs: row.time_ms,
        score: row.score,
        kills: row.kills,
        accuracy: row.accuracy,
        createdAt: row.created_at
    }));
}

async function pruneLeaderboard(db) {
    await db.prepare(`
        DELETE FROM leaderboard_entries
        WHERE id NOT IN (
            SELECT id
            FROM (
                SELECT id,
                    ROW_NUMBER() OVER (
                        PARTITION BY game_version
                        ORDER BY time_ms ASC, score DESC, kills DESC, created_at ASC
                    ) AS leaderboard_rank
                FROM leaderboard_entries
            )
            WHERE leaderboard_rank <= 100
        )
    `).run();
}

async function consumeRunToken(db, payload) {
    const runId = typeof payload.runId === 'string' ? payload.runId : '';
    const requestedVersion = sanitizeGameVersion(payload.version);
    const now = Date.now();

    const result = await db.prepare(`
        SELECT id, game_version, created_at, expires_at, used_at
        FROM leaderboard_runs
        WHERE id = ?
    `).bind(runId).first();

    if (!result || result.used_at) return { ok: false, error: 'Invalid or expired run token' };
    if (result.game_version !== requestedVersion) return { ok: false, error: 'Run token version mismatch' };
    if (Date.parse(result.expires_at) <= now) return { ok: false, error: 'Run token expired' };

    const update = await db.prepare(`
        UPDATE leaderboard_runs
        SET used_at = ?
        WHERE id = ? AND used_at IS NULL
    `).bind(new Date(now).toISOString(), runId).run();

    if (!update.meta || update.meta.changes !== 1) {
        return { ok: false, error: 'Invalid or expired run token' };
    }

    return {
        ok: true,
        version: result.game_version,
        startedAt: Date.parse(result.created_at)
    };
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
        id: entry.id,
        version,
        name,
        timeMs,
        score,
        kills,
        accuracy,
        createdAt: entry.createdAt
    };
}

function sanitizeGameVersion(value) {
    const cleaned = String(value || '')
        .replace(/[^\w.-]/g, '')
        .trim()
        .slice(0, 24);

    return cleaned || '1.0.0';
}

function isPlausibleCompletedRun(entry, startedAt) {
    if (entry.timeMs < MIN_COMPLETION_TIME_MS) return false;
    if (entry.timeMs > Date.now() - startedAt + 2000) return false;
    if (entry.kills < 1) return false;

    return true;
}

function getRequestVersion(request) {
    const url = new URL(request.url);
    return sanitizeGameVersion(url.searchParams.get('version'));
}

function sanitizeName(value) {
    const cleaned = String(value || '')
        .replace(/[^\w .-]/g, '')
        .trim()
        .slice(0, 14);

    return cleaned || 'Pilot';
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}
