const LEADERBOARD_LIMIT = 10;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === 'GET') {
        const entries = await getLeaderboard(env.DB);
        return jsonResponse({ entries });
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

    const entry = normalizeEntry({
        ...payload,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
    });

    if (!entry) {
        return jsonResponse({ error: 'Invalid leaderboard entry' }, 400);
    }

    await env.DB.prepare(`
        INSERT INTO leaderboard_entries (id, name, time_ms, score, kills, accuracy, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
        entry.id,
        entry.name,
        entry.timeMs,
        entry.score,
        entry.kills,
        entry.accuracy,
        entry.createdAt
    ).run();

    const rankedEntries = await getRankedEntries(env.DB);
    const rank = rankedEntries.findIndex(candidate => candidate.id === entry.id) + 1;
    const entries = rankedEntries.slice(0, LEADERBOARD_LIMIT);

    await pruneLeaderboard(env.DB);

    return jsonResponse({ entry, rank, entries }, 201);
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

async function getLeaderboard(db) {
    return (await getRankedEntries(db)).slice(0, LEADERBOARD_LIMIT);
}

async function getRankedEntries(db) {
    const result = await db.prepare(`
        SELECT id, name, time_ms, score, kills, accuracy, created_at
        FROM leaderboard_entries
        ORDER BY time_ms ASC, score DESC, kills DESC, created_at ASC
        LIMIT 100
    `).all();

    return (result.results || []).map(row => ({
        id: row.id,
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
            FROM leaderboard_entries
            ORDER BY time_ms ASC, score DESC, kills DESC, created_at ASC
            LIMIT 100
        )
    `).run();
}

function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const name = sanitizeName(entry.name);
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
        name,
        timeMs,
        score,
        kills,
        accuracy,
        createdAt: entry.createdAt
    };
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
