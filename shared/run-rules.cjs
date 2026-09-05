/** Identical completion validation for the Node server and both Pages endpoints. */
const Levels = require('../levels.js');
const Flow = require('../src/level-flow.js');

function rulesForScope(scope, catalog = Levels.getEffectiveLevelDefs()) {
    const match = /^level-([1-9]\d*)$/.exec(scope || '');
    const selected = scope === 'campaign' ? catalog : catalog.filter(level => match && level.id === Number(match[1]));
    if (!selected.length) return null;
    const payout = selected.reduce((sum, level) => {
        const reward = Flow.totals(level);
        return { score: sum.score + reward.score, kills: sum.kills + reward.kills };
    }, { score: 0, kills: 0 });
    const campaignScale = scope === 'campaign' ? Math.max(1, selected.length / 3) : 1;
    const drops = selected.reduce((sum, level) => sum + (level.segments && level.segments.length
        ? level.segments.reduce((count, segment) => count + (segment.powerups || level.powerups || []).length, 0)
        : (level.powerups || []).length), 0);
    return {
        bossScore: payout.score, bossKills: payout.kills,
        minTimeMs: 24000, maxTimeMs: 600000 * campaignScale,
        maxKills: Math.ceil(300 * campaignScale), maxKillScore: 250,
        maxPowerupScore: Math.max(6000, drops * 250), minMsPerKill: 200
    };
}

function isPlausibleTime(timeMs, scope, catalog) {
    const rules = rulesForScope(scope, catalog);
    return Boolean(rules && Number.isFinite(timeMs) && timeMs >= rules.minTimeMs && timeMs <= rules.maxTimeMs);
}

function runTokenTtlMs(scope, catalog) {
    const rules = rulesForScope(scope, catalog);
    return Math.max(15 * 60 * 1000, (rules ? rules.maxTimeMs : 0) + 5 * 60 * 1000);
}

function isPlausibleCompletedRun(entry, catalog) {
    if (!entry) return false;
    const rules = rulesForScope(entry.scope, catalog);
    if (!rules || !Number.isFinite(entry.timeMs) || !Number.isInteger(entry.score) || !Number.isInteger(entry.kills)) return false;
    if (entry.timeMs < rules.minTimeMs || entry.timeMs > rules.maxTimeMs) return false;
    if (entry.kills < rules.bossKills || entry.kills > rules.maxKills || entry.score < rules.bossScore) return false;
    if (entry.kills > Math.floor(entry.timeMs / rules.minMsPerKill) + 1) return false;
    const regularKills = entry.kills - rules.bossKills;
    return entry.score <= rules.bossScore + regularKills * rules.maxKillScore + rules.maxPowerupScore;
}

module.exports = { rulesForScope, isPlausibleTime, isPlausibleCompletedRun, runTokenTtlMs };
