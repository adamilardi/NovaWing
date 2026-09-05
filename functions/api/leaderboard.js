import RunRules from '../../shared/run-rules.cjs';
const { isPlausibleCompletedRun, isPlausibleTime } = RunRules;
const LEADERBOARD_LIMIT = 10;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;


export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method === 'GET') {
        const version = getRequestVersion(request);
        const scope = getRequestScope(request);
        const entries = await getLeaderboard(env.DB, version, scope);
        return jsonResponse(request, { version, scope, entries });
    }

    if (request.method !== 'POST') {
        return new Response('Method not allowed', {
            status: 405,
            headers: { Allow: 'GET, POST, OPTIONS', ...corsHeaders(request) }
        });
    }

    let payload;
    try {
        payload = await readJson(request);
    } catch (err) {
        return jsonResponse(request, { error: err.message || 'Invalid request' }, err.statusCode || 400);
    }

    // Stats were locked at run completion. Leaderboard POST may only choose a name.
    const runValidation = await inspectRunToken(env.DB, payload);
    if (!runValidation.ok) {
        return jsonResponse(request, { error: runValidation.error }, 400);
    }

    const entry = normalizeEntry({
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

    if (!entry || !isPlausibleCompletedRun(entry)) {
        return jsonResponse(request, { error: 'Invalid leaderboard entry' }, 400);
    }

    const consumed = await consumeRunTokenAndInsert(env.DB, runValidation.runId, entry);
    if (!consumed.ok) {
        return jsonResponse(request, { error: consumed.error }, 400);
    }

    const rankedEntries = await getRankedEntries(env.DB, entry.version, entry.scope);
    const rank = rankedEntries.findIndex(candidate => candidate.id === entry.id) + 1;
    const entries = rankedEntries.slice(0, LEADERBOARD_LIMIT);

    await pruneLeaderboard(env.DB);

    return jsonResponse(request, {
        entry,
        rank,
        version: entry.version,
        scope: entry.scope,
        entries
    }, 201);
}

async function readJson(request) {
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
        throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    }

    const body = await readBodyLimited(request, MAX_REQUEST_BODY_BYTES);
    if (!body) return {};

    try {
        return JSON.parse(body);
    } catch (err) {
        throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
    }
}

async function readBodyLimited(request, maxBytes) {
    if (!request.body || typeof request.body.getReader !== 'function') {
        const text = await request.text();
        if (new TextEncoder().encode(text).length > maxBytes) {
            throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
        }
        return text;
    }

    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            total += value.byteLength;
            if (total > maxBytes) {
                throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
            }
            chunks.push(value);
        }
    } finally {
        try { await reader.cancel(); } catch (err) { /* already closed */ }
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
        bytes.set(chunks[i], offset);
        offset += chunks[i].byteLength;
    }
    return new TextDecoder().decode(bytes);
}

async function getLeaderboard(db, version, scope) {
    return (await getRankedEntries(db, version, scope)).slice(0, LEADERBOARD_LIMIT);
}

async function getRankedEntries(db, version, scope) {
    const result = await db.prepare(`
        SELECT id, game_version, scope, name, time_ms, score, kills, accuracy, created_at
        FROM leaderboard_entries
        WHERE game_version = ? AND scope = ?
        ORDER BY time_ms ASC, score DESC, kills DESC, created_at ASC
        LIMIT 100
    `).bind(version, scope).all();

    return (result.results || []).map(row => ({
        id: row.id,
        version: row.game_version,
        scope: row.scope,
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
                        PARTITION BY game_version, scope
                        ORDER BY time_ms ASC, score DESC, kills DESC, created_at ASC
                    ) AS leaderboard_rank
                FROM leaderboard_entries
            )
            WHERE leaderboard_rank <= 100
        )
    `).run();
}

async function inspectRunToken(db, payload) {
    const runId = typeof payload.runId === 'string' ? payload.runId : '';
    const requestedVersion = sanitizeGameVersion(payload.version);
    const requestedScope = sanitizeLeaderboardScope(payload.scope);
    const now = Date.now();

    const result = await db.prepare(`
        SELECT id, game_version, scope, created_at, expires_at, used_at, completed_at, score, kills, accuracy
        FROM leaderboard_runs
        WHERE id = ?
    `).bind(runId).first();

    if (!result || result.used_at) return { ok: false, error: 'Invalid or expired run token' };
    if (result.game_version !== requestedVersion) return { ok: false, error: 'Run token version mismatch' };
    if (result.scope !== requestedScope) return { ok: false, error: 'Run token scope mismatch' };
    if (!result.completed_at) {
        if (Date.parse(result.expires_at) <= now) return { ok: false, error: 'Run token expired' };
        return { ok: false, error: 'Run is not complete' };
    }

    const startedAt = Date.parse(result.created_at);
    const completedAt = Date.parse(result.completed_at);
    const timeMs = completedAt - startedAt;
    const score = Number(result.score);
    const kills = Number(result.kills);
    const accuracy = Number(result.accuracy);
    if (!isPlausibleTime(timeMs, result.scope)) {
        return { ok: false, error: 'Implausible run completion time' };
    }
    if (!Number.isFinite(score) || !Number.isFinite(kills) || !Number.isFinite(accuracy)) {
        return { ok: false, error: 'Run is missing locked stats' };
    }

    return {
        ok: true,
        runId,
        version: result.game_version,
        scope: result.scope,
        startedAt,
        completedAt,
        timeMs,
        score,
        kills,
        accuracy
    };
}

/**
 * Mark the run token used and insert the leaderboard row in one D1 batch
 * (transactional). The INSERT is gated on the exact used_at stamp so a
 * concurrent loser cannot insert after losing the mark race.
 */
async function consumeRunTokenAndInsert(db, runId, entry) {
    const usedAt = new Date().toISOString();

    try {
        const results = await db.batch([
            db.prepare(`
                UPDATE leaderboard_runs
                SET used_at = ?
                WHERE id = ? AND used_at IS NULL AND completed_at IS NOT NULL
            `).bind(usedAt, runId),
            db.prepare(`
                INSERT INTO leaderboard_entries (
                    id, game_version, scope, name, time_ms, score, kills, accuracy, created_at
                )
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE EXISTS (
                    SELECT 1
                    FROM leaderboard_runs
                    WHERE id = ? AND used_at = ? AND completed_at IS NOT NULL
                )
            `).bind(
                entry.id,
                entry.version,
                entry.scope,
                entry.name,
                entry.timeMs,
                entry.score,
                entry.kills,
                entry.accuracy,
                entry.createdAt,
                runId,
                usedAt
            )
        ]);

        const markResult = results[0];
        const insertResult = results[1];
        if (!markResult || !markResult.meta || markResult.meta.changes !== 1) {
            return { ok: false, error: 'Invalid or expired run token' };
        }
        if (!insertResult || !insertResult.meta || insertResult.meta.changes !== 1) {
            return { ok: false, error: 'Failed to save leaderboard entry' };
        }

        return { ok: true };
    } catch (err) {
        return { ok: false, error: 'Failed to save leaderboard entry' };
    }
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

    if (!isPlausibleTime(timeMs, scope)) return null;
    if (!Number.isFinite(score) || score < 0 || score > 1000000) return null;
    if (!Number.isFinite(kills) || kills < 0 || kills > 10000) return null;
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return null;

    return {
        id: entry.id,
        version,
        scope,
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


function getRequestVersion(request) {
    const url = new URL(request.url);
    return sanitizeGameVersion(url.searchParams.get('version'));
}

function getRequestScope(request) {
    const url = new URL(request.url);
    return sanitizeLeaderboardScope(url.searchParams.get('scope'));
}

function sanitizeLeaderboardScope(value) {
    const scope = String(value || 'campaign').toLowerCase();
    if (scope === 'campaign') return 'campaign';
    if (/^level-[1-9]\d*$/.test(scope)) return scope;
    return 'campaign';
}

function sanitizeName(value) {
    const cleaned = String(value || '')
        .replace(/[^\w .-]/g, '')
        .trim()
        .slice(0, 14);

    return cleaned || 'Pilot';
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}
