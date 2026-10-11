import Votes from '../../shared/level-votes.cjs';

const MAX_REQUEST_BODY_BYTES = 4 * 1024;

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const db = env ? env.DB : null;
    if (!db) {
        return jsonResponse(request, { error: 'Level votes unavailable' }, 503);
    }

    try {
        if (request.method === 'GET') {
            const votes = await readVotes(db);
            return jsonResponse(request, { levels: Votes.summarizeVotes(votes) });
        }
        if (request.method !== 'POST') {
            return new Response('Method not allowed', {
                status: 405,
                headers: { Allow: 'GET, POST, OPTIONS', ...corsHeaders(request) }
            });
        }

        const payload = await readJson(request);
        const vote = Votes.normalizeVote(payload);
        if (!vote) {
            return jsonResponse(request, { error: 'Invalid level vote' }, 400);
        }
        const saved = await upsertVote(db, vote);
        if (!saved.ok) {
            return jsonResponse(request, { error: saved.error }, 400);
        }
        const votes = await readVotes(db);
        return jsonResponse(request, {
            vote: { levelId: vote.levelId, name: vote.name, vote: vote.vote },
            levels: Votes.summarizeVotes(votes)
        }, 201);
    } catch (err) {
        console.error('level vote error', err);
        const status = err.statusCode || 500;
        return jsonResponse(request, { error: status === 500 ? 'Server error' : (err.message || 'Server error') }, status);
    }
}

async function readVotes(db) {
    const result = await db.prepare(
        'SELECT level_id, name, vote, updated_at FROM level_votes'
    ).all();
    return (result.results || []).map(row => Votes.normalizeVote({
        levelId: row.level_id,
        name: row.name,
        vote: row.vote,
        updatedAt: row.updated_at
    })).filter(Boolean);
}

async function upsertVote(db, vote) {
    const existing = await db.prepare(
        'SELECT vote FROM level_votes WHERE level_id = ? AND name_key = ?'
    ).bind(vote.levelId, vote.nameKey).first();
    if (!existing) {
        const count = await db.prepare(
            'SELECT COUNT(*) AS n FROM level_votes WHERE level_id = ?'
        ).bind(vote.levelId).first();
        if (count && Number(count.n) >= Votes.MAX_VOTES_PER_LEVEL) {
            return { ok: false, error: 'This stage has enough votes' };
        }
    }
    await db.prepare(
        `INSERT INTO level_votes (level_id, name_key, name, vote, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(level_id, name_key) DO UPDATE SET
            name = excluded.name,
            vote = excluded.vote,
            updated_at = excluded.updated_at`
    ).bind(vote.levelId, vote.nameKey, vote.name, vote.vote, vote.updatedAt).run();
    return { ok: true };
}

async function readJson(request) {
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
        throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    }
    const body = await request.text();
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

function jsonResponse(request, payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders(request),
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

function corsHeaders(request) {
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}
