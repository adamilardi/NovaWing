/** Pure level-flow rules plus a lifetime for segment timers and tweens. */
(function (root) {
    'use strict';

    function kind(segment) {
        if (!segment) return 'waves';
        if (segment.kind) return segment.kind;
        if (segment.cinematic) return 'transition';
        return segment.bossEncounter || segment.gamePhase === 'boss' ? 'boss' : 'waves';
    }

    function encounter(level, key = 'standard') {
        return Object.assign({
            key, health: level.bossHealth, maxPhase: 3, outcome: 'defeat',
            escapeHpRatio: null, timeoutMs: null, entry: 'horizontal', arena: 'flat'
        }, level.bossEncounters && level.bossEncounters[key]);
    }

    function reward(level, key = 'standard') {
        const profile = encounter(level, key);
        if (profile.outcome === 'escape') return { score: 0, kills: 0 };
        return {
            score: Number.isFinite(profile.score) ? profile.score : level.bossScore,
            kills: Number.isFinite(profile.kills) ? profile.kills : level.bossKills
        };
    }

    function totals(level) {
        const segments = level.segments;
        if (!segments || !segments.length) return reward(level);
        return segments.filter(segment => kind(segment) === 'boss').reduce((sum, segment) => {
            const payout = reward(level, segment.bossEncounter || 'standard');
            return { score: sum.score + payout.score, kills: sum.kills + payout.kills };
        }, { score: 0, kills: 0 });
    }

    function afterSegment(level, segmentId) {
        const segment = level.segments && level.segments.find(item => item.id === segmentId);
        return segment && segment.next ? { next: segment.next, complete: false } : { next: null, complete: true };
    }

    function validate(levels, catalogs = {}) {
        const errors = [];
        const ids = new Set();
        const checkKeys = (keys, known, label) => {
            if (keys == null || !known) return;
            for (const key of keys) if (!known.has(key)) errors.push(label + ': unknown key ' + key);
        };
        for (const [index, level] of levels.entries()) {
            const label = 'Level ' + level.id;
            if (ids.has(level.id) || level.id !== index + 1) errors.push(label + ': ids must be unique campaign positions');
            ids.add(level.id);
            const segments = level.segments || [];
            const segmentIds = new Set(segments.map(segment => segment.id));
            if (segmentIds.size !== segments.length) errors.push(label + ': duplicate segment id');
            for (const item of [level, ...segments]) {
                checkKeys(item.wavePatternKeys, catalogs.waves, label);
                checkKeys(Object.values(item.art || {}), catalogs.assets, label);
                checkKeys(Object.values(item.music || {}).filter(Boolean), catalogs.tracks, label);
                const plan = item.powerups || [];
                if (plan.some((drop, i) => !Number.isFinite(drop.progressMs) || drop.progressMs < 0 || (i && drop.progressMs < plan[i - 1].progressMs))) {
                    errors.push(label + ': powerups must be sorted by progressMs');
                }
                checkKeys(plan.map(drop => drop.type), catalogs.powerups, label);
            }
            for (const segment of segments) {
                if (!segment.id || !['waves', 'boss', 'transition'].includes(kind(segment))) errors.push(label + ': invalid segment');
                if (segment.next && !segmentIds.has(segment.next)) errors.push(label + ': missing next segment ' + segment.next);
                if (segment.bossEncounter && !(level.bossEncounters && level.bossEncounters[segment.bossEncounter])) errors.push(label + ': missing encounter ' + segment.bossEncounter);
            }
            const visited = new Set();
            let segment = segments[0];
            while (segment) {
                if (visited.has(segment.id)) { errors.push(label + ': segment cycle'); break; }
                visited.add(segment.id);
                segment = segments.find(item => item.id === segment.next);
            }
            if (visited.size !== segments.length) errors.push(label + ': unreachable segments');
            for (const profile of Object.values(level.bossEncounters || {})) {
                if (profile.outcome && !['escape', 'defeat'].includes(profile.outcome)) errors.push(label + ': invalid boss outcome');
                for (const field of ['score', 'kills']) {
                    if (profile[field] != null && (!Number.isInteger(profile[field]) || profile[field] < 0)) errors.push(label + ': invalid boss ' + field);
                }
            }
        }
        if (errors.length) throw new Error(errors.join('\n'));
    }

    function createScope() {
        let generation = 0;
        const timers = new Set();
        const tweens = new Set();
        return {
            reset() {
                generation += 1;
                for (const timer of timers) timer.remove(false);
                for (const tween of tweens) tween.remove();
                timers.clear();
                tweens.clear();
            },
            delay(scene, ms, callback) {
                const entered = generation;
                const timer = scene.time.delayedCall(Math.max(0, ms), () => {
                    timers.delete(timer);
                    if (entered === generation) callback();
                });
                timers.add(timer);
                return timer;
            },
            tween(scene, config) {
                const entered = generation;
                const tween = scene.tweens.add(Object.assign({}, config, {
                    onComplete: (...args) => {
                        tweens.delete(tween);
                        if (entered === generation && config.onComplete) config.onComplete(...args);
                    }
                }));
                tweens.add(tween);
                return tween;
            }
        };
    }

    const api = { kind, encounter, reward, totals, afterSegment, validate, createScope };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NovaWingFlow = api;
})(typeof window !== 'undefined' ? window : globalThis);
