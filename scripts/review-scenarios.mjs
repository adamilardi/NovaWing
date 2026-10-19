/**
 * Pure scenario builder for scripts/review-screenshots.mjs.
 *
 * The default suite covers L1 waves, L2 canyon, and the L1 boss. LEVELS=
 * builds per-level waves + boss captures so the game-reviewer skill can
 * collect shot evidence for any level under review (e.g. LEVELS=12,17).
 */
export function parseLevels(raw) {
    if (!raw) return [];
    const out = [];
    for (const part of String(raw).split(',')) {
        const n = Math.floor(Number(part.trim()));
        if (Number.isInteger(n) && n >= 1 && !out.includes(n)) out.push(n);
    }
    return out;
}

export function buildReviewScenarios({ levels = [] } = {}) {
    if (!levels.length) {
        return [
            { name: 'l1-waves', params: { level: '1' }, shotsAt: [8000, 20000, 35000] },
            { name: 'l2-canyon', params: { level: '2' }, shotsAt: [10000, 25000] },
            { name: 'l1-boss', params: { boss: '1' }, shotsAt: [10000, 22000] },
        ];
    }
    const scenarios = [];
    for (const level of levels) {
        scenarios.push({ name: `l${level}-waves`, params: { level: String(level) }, shotsAt: [8000, 20000, 35000] });
        scenarios.push({ name: `l${level}-boss`, params: { level: String(level), boss: '1' }, shotsAt: [10000, 22000] });
    }
    return scenarios;
}
