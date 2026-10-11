// Votes for the imported bonus levels. One pilot name has one vote per level.
const EXTRA_LEVEL_IDS = [12, 13, 14, 15, 16];
const MAX_VOTES_PER_LEVEL = 200;

function sanitizeVoteName(value) {
    const cleaned = String(value || '')
        .replace(/[^\w .-]/g, '')
        .trim()
        .slice(0, 14);
    return cleaned || 'Pilot';
}

function normalizeVote(input) {
    if (!input || typeof input !== 'object') return null;
    const levelId = Math.floor(Number(input.levelId));
    if (!EXTRA_LEVEL_IDS.includes(levelId)) return null;
    if (input.vote !== 'up' && input.vote !== 'down') return null;
    const name = sanitizeVoteName(input.name);
    const updatedAt = typeof input.updatedAt === 'string' && input.updatedAt
        ? input.updatedAt
        : new Date().toISOString();
    return { levelId, name, nameKey: name.toLowerCase(), vote: input.vote, updatedAt };
}

function applyVote(votes, next) {
    const list = (Array.isArray(votes) ? votes : [])
        .map(normalizeVote)
        .filter(Boolean);
    const index = list.findIndex(row => row.levelId === next.levelId && row.nameKey === next.nameKey);
    if (index >= 0) {
        const copy = list.slice();
        copy[index] = next;
        return copy;
    }
    const onLevel = list.filter(row => row.levelId === next.levelId).length;
    if (onLevel >= MAX_VOTES_PER_LEVEL) return null;
    return list.concat(next);
}

function summarizeVotes(votes) {
    const rows = (Array.isArray(votes) ? votes : []).map(normalizeVote).filter(Boolean);
    return EXTRA_LEVEL_IDS.map(levelId => {
        const mine = rows.filter(row => row.levelId === levelId);
        const likes = mine.filter(row => row.vote === 'up').map(row => row.name).sort((a, b) => a.localeCompare(b));
        const dislikes = mine.filter(row => row.vote === 'down').map(row => row.name).sort((a, b) => a.localeCompare(b));
        return { levelId, up: likes.length, down: dislikes.length, likes, dislikes };
    });
}

module.exports = {
    EXTRA_LEVEL_IDS,
    MAX_VOTES_PER_LEVEL,
    sanitizeVoteName,
    normalizeVote,
    applyVote,
    summarizeVotes
};
