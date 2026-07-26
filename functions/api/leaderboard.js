const LEADERBOARD_LIMIT = 10;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const MIN_COMPLETION_TIME_MS = 24 * 1000;
const MAX_COMPLETION_TIME_MS = 10 * 60 * 1000;
// Waves + splitter drones + long boss drone phases can legitimately exceed 80 kills.
const MAX_PLAUSIBLE_KILLS = 300;
const BOSS_SCORE = 2500;
// Upper bound uses the highest per-enemy kill payout (splitter parent = 200).
const MAX_KILL_SCORE = 200;
const MAX_POWERUP_BONUS_SCORE = 2500;
const MIN_MS_PER_KILL = 200;

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method === 'GET') {
        const version = getRequestVersion(request);
        const entries = await getLeaderboard(env.DB, version);
        return jsonResponse(request, { version, entries });
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

    const rankedEntries = await getRankedEntries(env.DB, entry.version);
    const rank = rankedEntries.findIndex(candidate => candidate.id === entry.id) + 1;
    const entries = rankedEntries.slice(0, LEADERBOARD_LIMIT);

    await pruneLeaderboard(env.DB);

    return jsonResponse(request, { entry, rank, version: entry.version, entries }, 201);
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

async function inspectRunToken(db, payload) {
    const runId = typeof payload.runId === 'string' ? payload.runId : '';
    const requestedVersion = sanitizeGameVersion(payload.version);
    const now = Date.now();

    const result = await db.prepare(`
        SELECT id, game_version, created_at, expires_at, used_at, completed_at, score, kills, accuracy
        FROM leaderboard_runs
        WHERE id = ?
    `).bind(runId).first();

    if (!result || result.used_at) return { ok: false, error: 'Invalid or expired run token' };
    if (result.game_version !== requestedVersion) return { ok: false, error: 'Run token version mismatch' };
    if (Date.parse(result.expires_at) <= now) return { ok: false, error: 'Run token expired' };
    if (!result.completed_at) return { ok: false, error: 'Run is not complete' };

    const startedAt = Date.parse(result.created_at);
    const completedAt = Date.parse(result.completed_at);
    const timeMs = completedAt - startedAt;
    const score = Number(result.score);
    const kills = Number(result.kills);
    const accuracy = Number(result.accuracy);
    if (!Number.isFinite(timeMs) || timeMs < MIN_COMPLETION_TIME_MS || timeMs > MAX_COMPLETION_TIME_MS) {
        return { ok: false, error: 'Implausible run completion time' };
    }
    if (!Number.isFinite(score) || !Number.isFinite(kills) || !Number.isFinite(accuracy)) {
        return { ok: false, error: 'Run is missing locked stats' };
    }

    return {
        ok: true,
        runId,
        version: result.game_version,
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
                    id, game_version, name, time_ms, score, kills, accuracy, created_at
                )
                SELECT ?, ?, ?, ?, ?, ?, ?, ?
                WHERE EXISTS (
                    SELECT 1
                    FROM leaderboard_runs
                    WHERE id = ? AND used_at = ? AND completed_at IS NOT NULL
                )
            `).bind(
                entry.id,
                entry.version,
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

function isPlausibleCompletedRun(entry) {
    if (entry.timeMs < MIN_COMPLETION_TIME_MS) return false;
    if (entry.timeMs > MAX_COMPLETION_TIME_MS) return false;
    if (entry.kills < 1) return false;
    if (entry.kills > MAX_PLAUSIBLE_KILLS) return false;
    if (entry.score < BOSS_SCORE) return false;

    if (entry.kills > Math.floor(entry.timeMs / MIN_MS_PER_KILL) + 1) return false;

    const regularKills = Math.max(0, entry.kills - 1);
    const maxScore = BOSS_SCORE + regularKills * MAX_KILL_SCORE + MAX_POWERUP_BONUS_SCORE;
    if (entry.score > maxScore) return false;

    if (entry.kills === 1 && entry.score > BOSS_SCORE + MAX_POWERUP_BONUS_SCORE) return false;

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
