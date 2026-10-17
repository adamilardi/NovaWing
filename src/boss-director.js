/** Unique expansion boss patterns and simulation-clock encounter state. */
(function (root) {
'use strict';
const catalog = Object.freeze({
    foundryWarden: { name: 'FOUNDRY WARDEN', color: 0xff9c38, width: 340,
        phases: ['REACTOR SHUTTERS', 'TWIN FURNACES', 'OVERDRIVE SWEEPS'], windupMs: 1100, activeMs: 500, recoveryMs: 2900 },
    auroraSentinel: { name: 'AURORA SENTINEL', color: 0x77eeff, width: 245,
        phases: ['CRYSTAL FAN', 'SHIFTING ICE GAPS', 'AURORA STORM'], windupMs: 1050, activeMs: 450, recoveryMs: 2000 },
    voidCantor: { name: 'VOID CANTOR', color: 0xdc83ff, width: 250,
        phases: ['SINGLE SIGIL', 'DUAL INVOCATION', 'TRIPLE CHOIR'], windupMs: 1200, activeMs: 550, recoveryMs: 2500 },
    graveyardLeviathan: { name: 'GRAVEYARD LEVIATHAN', color: 0xffbd77, width: 365,
        phases: ['SALVAGE TORPEDOES', 'STAGGERED BATTERIES', 'WRECKAGE ESCORT'], windupMs: 1000, activeMs: 1000, recoveryMs: 2200 },
    prismCaster: { name: 'PRISM CASTER', color: 0x66f6ff, width: 340,
        phases: ['SINGLE LENS', 'SPLIT BEAMS', 'NARROW PRISM'], windupMs: 1100, activeMs: 520, recoveryMs: 2400 },
    trenchCustodian: { name: 'TRENCH CUSTODIAN', color: 0x3df0b0, width: 350,
        phases: ['PROBING CURRENTS', 'CROSSING VOLLEYS', 'ABYSSAL CUSTODY'], windupMs: 1100, activeMs: 600, recoveryMs: 2000 },
    tempestCondenser: { name: 'TEMPEST CONDENSER', color: 0xffc233, width: 245,
        phases: ['FIRST CIRCUIT', 'CROSS CHARGE', 'FULL TEMPEST'], windupMs: 1100, activeMs: 550, recoveryMs: 2200 },
    duneHerald: { name: 'DUNE HERALD', color: 0xffb347, width: 260,
        phases: ['SWEEP LINES', 'COMBINED ARMS', 'GLASS STORM'], windupMs: 1100, activeMs: 550, recoveryMs: 2200 },
    gardenEngine: { name: 'GARDEN ENGINE', color: 0x7dff6a, width: 350,
        phases: ['CULTIVATION', 'OVERGROWTH', 'BLOOM'], windupMs: 1100, activeMs: 600, recoveryMs: 2200 },
    obsidianHierophant: { name: 'OBSIDIAN HIEROPHANT', color: 0xffd166, width: 260,
        phases: ['FIRST GATE', 'TWIN RITE', 'BLACK LITURGY'], windupMs: 1100, activeMs: 550, recoveryMs: 2400 },
    cinderfallTyrant: { name: 'CINDERFALL TYRANT', color: 0xff5a22, width: 340,
        phases: ['VENT BREACH', 'TWIN ERUPTION', 'CALDERA WRATH'], windupMs: 1150, activeMs: 650, recoveryMs: 2300 },
    heliosGatekeeper: { name: 'HELIOS GATEKEEPER', color: 0xffc14d, width: 245,
        phases: ['FIRST LANCE', 'TWIN SWEEPS', 'GATE BARRAGE'], windupMs: 1100, activeMs: 600, recoveryMs: 2200 },
    neonChoir: { name: 'NEON CHOIR', color: 0x2ee6c8, width: 340,
        phases: ['LOW TIDE', 'HARMONY', 'FULL RESONANCE'], windupMs: 1100, activeMs: 600, recoveryMs: 2200 }
});
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function plan(id, cycle, phase, focus = 300, extra = null) {
    if (!catalog[id]) throw new Error('Unknown boss behavior: ' + id);
    phase = clamp(phase, 1, 3);
    if (id === 'foundryWarden') {
        const center = clamp(focus, 160, 440);
        return { kind: 'furnaceSweep', lanes: phase === 1 ? [center]
            : [clamp(center - 70, 100, 500), clamp(center + 70, 100, 500)], thickness: phase === 3 ? 30 : 24 };
    }
    if (id === 'auroraSentinel') {
        const count = 5 + phase * 2;
        const gap = [1, Math.floor(count / 2) - 1, count - 3][cycle % 3];
        const angles = Array.from({ length: count }, (_, i) => 35 + 110 * i / (count - 1))
            .filter((_, i) => i !== gap && i !== gap + 1);
        return { kind: 'iceFan', angles, speed: 165 + phase * 22, gap };
    }
    if (id === 'voidCantor') {
        return { kind: 'sigilLanes', lanes: phase === 1 ? [cycle % 2 ? 520 : 280]
            : phase === 2 ? (cycle % 2 ? [280, 520] : [160, 640])
            : (cycle % 2 ? [160, 400, 640] : [250, 550]), thickness: 26 };
    }
    if (id === 'prismCaster') {
        // The safe gap walks a fixed cycle. It does not chase the pilot.
        const gapCenter = [160, 300, 440, 240][cycle % 4];
        const half = phase === 1 ? 0 : phase === 2 ? 150 : 110;
        const lanes = phase === 1
            ? [gapCenter < 300 ? 460 : 150]
            : [clamp(gapCenter - half, 90, 510), clamp(gapCenter + half, 90, 510)];
        return { kind: 'prismSweep', lanes, thickness: phase === 3 ? 26 : 20, gapCenter };
    }
    if (id === 'trenchCustodian') {
        // Cores alternate by cycle: even cycles vent the upper cannon-core as an
        // aimed torpedo fan; odd cycles vent the lower torpedo-core as lane sweeps.
        if (cycle % 2 === 0) {
            const count = 3 + phase;
            const aim = clamp(180 + (focus - 300) * 0.06, 162, 198);
            const spread = 13;
            const angles = Array.from({ length: count }, (_, i) =>
                aim - spread * (count - 1) / 2 + spread * i);
            return { kind: 'iceFan', angles, speed: 195 + phase * 20, core: 'upper' };
        }
        const lanes = phase === 1 ? [clamp(focus, 120, 480)]
            : phase === 2 ? [clamp(focus - 130, 90, 510), clamp(focus + 130, 90, 510)]
            : [150, 300, 450];
        return { kind: 'custodianSweep', lanes, thickness: 24, core: 'lower' };
    }
    if (id === 'tempestCondenser') {
        // Even cycles vent a radial spark ring; odd cycles fire aimed vane volleys.
        if (cycle % 2 === 0) {
            const count = 10 + phase * 2;
            const angles = Array.from({ length: count }, (_, i) => 360 * i / count);
            return { kind: 'iceFan', angles, speed: 150 + phase * 12 };
        }
        const aim = clamp(90 + (focus - 400) * 0.08, 65, 115);
        return { kind: 'vaneVolley', angles: [aim - 8, aim, aim + 8], speed: 230 + phase * 18, bursts: 3 };
    }
    if (id === 'duneHerald') {
        // Walking lane sets every cycle; aimed volleys join from phase 2.
        const slots = [170, 300, 430, 560, 630];
        const start = (cycle + phase) % 3;
        const lanes = phase === 1 ? [slots[start], slots[start + 2]]
            : [slots[start], slots[start + 1], slots[start + 2]];
        const plan = { kind: 'sigilLanes', lanes, thickness: 22 };
        if (phase >= 2) {
            const aim = clamp(90 + (focus - 400) * 0.08, 65, 115);
            plan.angles = [aim - 10, aim, aim + 10];
            plan.speed = 225 + phase * 15;
            plan.bursts = phase;
        }
        return plan;
    }
    if (id === 'heliosGatekeeper') {
        const focusX = clamp(focus, 120, 680);
        if (phase === 1) {
            const lane = cycle % 2 === 0 ? 150 : 650;
            return { kind: 'flareLance', lanes: [lane],
                sweepVx: [lane < 400 ? 150 : -150], thickness: 26 };
        }
        if (phase === 2) {
            return { kind: 'flareLance', lanes: [150, 650],
                sweepVx: [150, -150], thickness: 26 };
        }
        return { kind: 'flareLance', lanes: [150, focusX, 650],
            sweepVx: [170, focusX < 400 ? 120 : -120, -170], thickness: 30 };
    }
    if (id === 'cinderfallTyrant') {
        const focusAlt = typeof extra === 'number' ? extra : 400;
        const px = clamp(focusAlt, 100, 700);
        const lanes = phase === 1
            ? (px < 400 ? [px, px + 170] : [px - 170, px])
            : (px < 300 ? [px, px + 170, px + 340]
                : px > 500 ? [px - 340, px - 170, px]
                : [px - 170, px, px + 170]);
        const attack = { kind: 'eruptionColumns', lanes, thickness: phase === 3 ? 34 : 28 };
        if (phase >= 2) {
            attack.sparks = phase;
            attack.sparkSpeed = 250 + phase * 20;
        }
        return attack;
    }
    if (id === 'neonChoir') {
        // Tide resonance: horizontal lane sweeps plus delayed seeker motes.
        // Lanes bracket the pilot; motes bloom at walking slots so the safe
        // pocket is beside the lanes, never inside them.
        const focusY = clamp(focus, 120, 480);
        const lanes = phase === 1 ? [Math.round(focusY)]
            : [Math.round(clamp(focusY - 140, 90, 510)), Math.round(clamp(focusY + 140, 90, 510))];
        const attack = { kind: 'tideResonance', lanes, thickness: phase === 3 ? 28 : 24 };
        const slots = [220, 400, 580];
        const count = phase === 1 ? 2 : 3;
        attack.motes = [];
        for (let i = 0; i < count; i++) {
            attack.motes.push({
                x: slots[(cycle + i) % slots.length],
                y: Math.round(clamp(focusY + (i % 2 ? 110 : -110), 100, 500)),
                r: 42,
                fuseMs: 1100 + i * 250
            });
        }
        if (phase >= 3) {
            const aim = clamp(180 + (focusY - 300) * 0.06, 162, 198);
            attack.angles = [aim - 10, aim, aim + 10];
            attack.speed = 235;
            attack.bursts = 2;
        }
        return attack;
    }
    if (id === 'obsidianHierophant') {
        const slots = [170, 310, 490, 630];
        const start = cycle % 2;
        const lanes = phase === 1 ? [slots[start], slots[start + 2]]
            : phase === 2 ? slots.filter((_, index) => index !== cycle % slots.length)
            : [slots[(cycle + 1) % 2], slots[((cycle + 1) % 2) + 1], slots[((cycle + 1) % 2) + 2]];
        const attack = { kind: 'gateDischarge', lanes, thickness: 24 };
        const count = phase === 1 ? 3 : 5;
        const aim = clamp(90 + (focus - 400) * 0.08, 65, 115);
        const spread = 12;
        attack.angles = Array.from({ length: count }, (_, i) => aim - spread * (count - 1) / 2 + spread * i);
        attack.speed = 220 + phase * 15;
        attack.bursts = phase >= 3 ? 2 : 1;
        return attack;
    }
    if (id === 'gardenEngine') {
        const sections = extra && typeof extra === 'object' ? extra : null;
        const order = ['mortar', 'lasher', 'battery'];
        const alive = sections
            ? order.filter(name => !sections[name] || sections[name].destroyed !== true)
            : order.slice();
        const solo = phase >= 2 && alive.length === 1;
        let arms;
        if (alive.length === 0) arms = [];
        else if (phase >= 2 && alive.length >= 2) {
            const pairs = [];
            for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
                if (alive.length === 2 || alive[i] === 'lasher' || alive[j] === 'lasher') {
                    pairs.push([alive[i], alive[j]]);
                }
            }
            arms = pairs.length ? pairs[cycle % pairs.length] : [alive[cycle % alive.length]];
        } else arms = [alive[cycle % alive.length]];
        const focusY = clamp(focus, 120, 480);
        let attack;
        if (arms[0] === 'lasher') attack = { kind: 'custodianSweep', sections: arms.slice() };
        else if (arms[0] === 'battery') attack = { kind: 'salvageBurst', sections: arms.slice() };
        else attack = { kind: 'sporeBloom', sections: arms.slice() };
        if (arms.includes('mortar')) {
            const count = phase >= 3 ? 3 : 2;
            const slots = [200, 340, 480];
            attack.blooms = [];
            for (let i = 0; i < count; i++) {
                attack.blooms.push({
                    x: slots[(cycle + i) % slots.length],
                    y: Math.round(clamp(focusY + (i % 2 ? 95 : -95), 100, 500)),
                    r: 46,
                    fuseMs: 950 + (solo ? i * 550 : 0)
                });
            }
            if (solo) attack.blooms.push({
                x: slots[(cycle + 2) % slots.length],
                y: Math.round(clamp(focusY + 150, 100, 500)),
                r: 46,
                fuseMs: 1500
            });
        }
        if (arms.includes('lasher')) {
            attack.lanes = (phase === 1 && !solo) ? [Math.round(focusY)]
                : [Math.round(clamp(focusY - 130, 90, 510)), Math.round(clamp(focusY + 130, 90, 510))];
            attack.thickness = phase >= 3 ? 26 : 24;
        }
        if (arms.includes('battery')) {
            const aim = clamp(180 + (focusY - 300) * 0.06, 162, 198);
            attack.angles = [aim - 9, aim, aim + 9];
            attack.speed = 245 + phase * 15;
            attack.bursts = (phase >= 3 ? 4 : 3) + (solo ? 2 : 0);
            attack.batteryOffset = 32;
        }
        return attack;
    }
    const upper = cycle % 2 === 0;
    return { kind: 'salvageBurst', angles: phase === 1 ? [170, 190]
        : upper ? [180, 192, 204] : [156, 168, 180],
        batteryOffset: phase === 1 ? null : upper ? -32 : 32,
        speed: 205 + phase * 22, bursts: phase === 1 ? 2 : 3,
        escorts: phase === 3 && cycle % 3 === 2 ? 2 : 0 };
}
function create(id, time = 0) {
    if (!catalog[id]) throw new Error('Unknown boss behavior: ' + id);
    const state = { id, mode: 'recovery', phase: 1, cycle: 0, nextAt: time + 1600,
        windupUntil: null, activeUntil: null, plan: null };
    if (id === 'gardenEngine') {
        state.sections = {
            mortar: { hp: 40, max: 40, destroyed: false },
            lasher: { hp: 40, max: 40, destroyed: false },
            battery: { hp: 40, max: 40, destroyed: false }
        };
    }
    return state;
}
function tick(state, time, phase, tempo = 1, focus = 300, focusAlt = 400) {
    const spec = catalog[state.id];
    state.phase = clamp(phase, 1, 3);
    // Tempo changes cadence, not reaction time. Warnings never shrink below their
    // authored length and are retained together with their exact attack plan.
    const scale = Math.max(0.65, Number.isFinite(tempo) ? tempo : 1);
    if (state.mode === 'recovery' && time >= state.nextAt) {
        state.mode = 'windup';
        const extra = state.id === 'gardenEngine' ? (state.sections || null) : focusAlt;
        state.plan = plan(state.id, state.cycle, state.phase, focus, extra);
        state.windupUntil = time + spec.windupMs;
        state.activeUntil = state.windupUntil + spec.activeMs;
        return { kind: 'windup', plan: state.plan, activatesAt: state.windupUntil, endsAt: state.activeUntil };
    }
    if (state.mode === 'windup' && time >= state.windupUntil) {
        state.mode = 'attack';
        return { kind: 'attack', plan: state.plan, endsAt: state.activeUntil };
    }
    if (state.mode === 'attack' && time >= state.activeUntil) {
        state.mode = 'recovery';
        state.cycle++;
        state.nextAt = time + spec.recoveryMs * scale / (1 + (state.phase - 1) * 0.1);
        return { kind: 'recovery' };
    }
    return null;
}
function vulnerable(state) {
    if (!state) return true;
    if (state.id === 'foundryWarden') return state.mode === 'recovery';
    // Exposed cores vent during windup/attack; shutters close in recovery.
    if (state.id === 'trenchCustodian') return state.mode !== 'recovery';
    if (state.id === 'obsidianHierophant') return state.mode !== 'recovery';
    // Shield-gap gating is positional and lives in hitBoss, not here.
    if (state.id === 'tempestCondenser') return true;
    return true;
}
// Rectangles tile the unchanged canonical AI image at rest. Independent image
// parts retain source pixels; charge, opening and recoil are code articulation.
function parts(id) {
    if (id === 'foundryWarden') return [
        { name: 'upperGun', rect: [0, 0, 0.47, 0.39] },
        { name: 'lowerGun', rect: [0, 0.39, 0.47, 0.26] },
        { name: 'legs', rect: [0, 0.65, 0.47, 0.35] },
        { name: 'crown', rect: [0.47, 0, 0.53, 0.26] },
        { name: 'leftShutter', rect: [0.47, 0.26, 0.125, 0.32] },
        { name: 'rightShutter', rect: [0.595, 0.26, 0.125, 0.32] },
        { name: 'engine', rect: [0.72, 0.26, 0.28, 0.32] },
        { name: 'feet', rect: [0.47, 0.58, 0.53, 0.42] }
    ];
    if (id === 'auroraSentinel') return [
        { name: 'leftWing', rect: [0, 0, 0.37, 1] },
        { name: 'core', rect: [0.37, 0, 0.26, 1] },
        { name: 'rightWing', rect: [0.63, 0, 0.37, 1] }
    ];
    if (id === 'voidCantor') return [
        { name: 'northSigil', rect: [0, 0, 1, 0.20] },
        { name: 'leftRing', rect: [0, 0.20, 0.28, 0.60] },
        { name: 'core', rect: [0.28, 0.20, 0.44, 0.60] },
        { name: 'rightRing', rect: [0.72, 0.20, 0.28, 0.60] },
        { name: 'southSigil', rect: [0, 0.80, 1, 0.20] }
    ];
    if (id === 'prismCaster') return [
        { name: 'upperGuns', rect: [0, 0, 0.34, 0.33] },
        { name: 'midGuns', rect: [0, 0.33, 0.34, 0.34] },
        { name: 'lowerGuns', rect: [0, 0.67, 0.34, 0.33] },
        { name: 'upperPetal', rect: [0.34, 0, 0.28, 0.38] },
        { name: 'lens', rect: [0.34, 0.38, 0.28, 0.24] },
        { name: 'lowerPetal', rect: [0.34, 0.62, 0.28, 0.38] },
        { name: 'hull', rect: [0.62, 0, 0.22, 1] },
        { name: 'engine', rect: [0.84, 0, 0.16, 1] }
    ];
    if (id === 'trenchCustodian') return [
        { name: 'cannonArc', rect: [0, 0, 0.38, 0.55] },
        { name: 'upperCore', rect: [0.38, 0, 0.30, 0.55] },
        { name: 'tailTop', rect: [0.68, 0, 0.32, 0.55] },
        { name: 'tubeBank', rect: [0, 0.55, 0.38, 0.45] },
        { name: 'lowerCore', rect: [0.38, 0.55, 0.30, 0.45] },
        { name: 'tailFin', rect: [0.68, 0.55, 0.32, 0.45] }
    ];
    if (id === 'tempestCondenser') return [
        { name: 'ringNW', rect: [0, 0, 0.33, 0.22] },
        { name: 'ringN', rect: [0.33, 0, 0.34, 0.22] },
        { name: 'ringNE', rect: [0.67, 0, 0.33, 0.22] },
        { name: 'ringW', rect: [0, 0.22, 0.33, 0.30] },
        { name: 'core', rect: [0.33, 0.22, 0.34, 0.30] },
        { name: 'ringE', rect: [0.67, 0.22, 0.33, 0.30] },
        { name: 'vaneW', rect: [0, 0.52, 0.33, 0.48] },
        { name: 'vanes', rect: [0.33, 0.52, 0.34, 0.48] },
        { name: 'vaneE', rect: [0.67, 0.52, 0.33, 0.48] }
    ];
    if (id === 'duneHerald') return [
        { name: 'crownL', rect: [0, 0, 0.5, 0.28] },
        { name: 'crownR', rect: [0.5, 0, 0.5, 0.28] },
        { name: 'hullL', rect: [0, 0.28, 0.5, 0.32] },
        { name: 'hullR', rect: [0.5, 0.28, 0.5, 0.32] },
        { name: 'podL', rect: [0, 0.60, 0.25, 0.40] },
        { name: 'emitters', rect: [0.25, 0.60, 0.50, 0.40] },
        { name: 'podR', rect: [0.75, 0.60, 0.25, 0.40] }
    ];
    if (id === 'gardenEngine') return [
        { name: 'mortar', rect: [0, 0, 0.32, 0.35] },
        { name: 'lasher', rect: [0, 0.35, 0.32, 0.30] },
        { name: 'battery', rect: [0, 0.65, 0.32, 0.35] },
        { name: 'hull', rect: [0.32, 0, 0.68, 1] }
    ];
    if (id === 'obsidianHierophant') return [
        { name: 'shardN', rect: [0, 0, 1, 0.178] },
        { name: 'shardW', rect: [0, 0.178, 0.2125, 0.648] },
        { name: 'core', rect: [0.2125, 0.178, 0.575, 0.648] },
        { name: 'shardE', rect: [0.7875, 0.178, 0.2125, 0.648] },
        { name: 'shardS', rect: [0, 0.826, 1, 0.174] }
    ];
    if (id === 'cinderfallTyrant') return [
        { name: 'crown', rect: [0, 0, 1, 0.25] },
        { name: 'maw', rect: [0, 0.25, 1, 0.375] },
        { name: 'vents', rect: [0, 0.625, 1, 0.375] }
    ];
    if (id === 'neonChoir') return [
        { name: 'crowns', rect: [0, 0, 0.30, 1] },
        { name: 'hull', rect: [0.30, 0, 0.38, 1] },
        { name: 'fins', rect: [0.68, 0, 0.32, 0.5] },
        { name: 'tail', rect: [0.68, 0.5, 0.32, 0.5] }
    ];
    return [
        { name: 'battery', rect: [0, 0, 1, 0.38] },
        { name: 'hull', rect: [0, 0.38, 1, 0.27] },
        { name: 'keel', rect: [0, 0.65, 1, 0.35] }
    ];
}
function pose(state, name, time) {
    const spec = catalog[state.id];
    const charge = state.mode === 'windup' ? clamp(1 - (state.windupUntil - time) / spec.windupMs, 0, 1) : 0;
    const recoil = state.mode === 'attack' ? Math.max(0, 1 - (time - state.windupUntil) / 220) : 0;
    const result = { x: 0, y: 0, angle: 0, charge, recoil };
    if (state.id === 'foundryWarden') {
        const opening = state.mode === 'recovery' ? 1 : state.mode === 'windup' ? 1 - charge : 0;
        if (name === 'leftShutter') result.x = -9 * opening;
        if (name === 'rightShutter') result.x = 9 * opening;
        if (name === 'upperGun' || name === 'lowerGun') result.x = 10 * recoil;
    } else if (state.id === 'auroraSentinel') {
        const side = name === 'leftWing' ? -1 : name === 'rightWing' ? 1 : 0;
        result.x = side * (2 + charge * 7);
        result.angle = side * (Math.sin(time * 0.003) * 1.5 + charge * 3 - recoil * 4);
    } else if (state.id === 'voidCantor') {
        if (name === 'leftRing' || name === 'rightRing') {
            const side = name === 'leftRing' ? -1 : 1;
            result.x = side * charge * 9;
            result.angle = side * (charge * 4 - recoil * 3);
        }
        if (name === 'northSigil') result.y = -charge * 8 + recoil * 5;
        if (name === 'southSigil') result.y = charge * 8 - recoil * 5;
    } else if (state.id === 'prismCaster') {
        const side = name === 'upperPetal' ? -1 : name === 'lowerPetal' ? 1 : 0;
        if (side) {
            result.y = side * charge * 12;
            result.angle = side * (charge * 8 - recoil * 3);
        }
        if (name === 'upperGuns' || name === 'midGuns' || name === 'lowerGuns') result.x = 9 * recoil;
        if (name === 'engine') result.x = -6 * recoil;
    } else if (state.id === 'trenchCustodian') {
        const upperActive = !state.plan || state.plan.core !== 'lower';
        if (name === 'upperCore') {
            result.y = -charge * (upperActive ? 7 : 2);
            result.x = -recoil * (upperActive ? 8 : 0);
        }
        if (name === 'lowerCore') {
            result.y = charge * (upperActive ? 2 : 7);
            result.x = -recoil * (upperActive ? 0 : 8);
        }
        if (name === 'cannonArc' || name === 'tubeBank') result.x = 9 * recoil;
        if (name === 'tailTop') result.y = -Math.sin(time * 0.002) * 2;
        if (name === 'tailFin') result.y = Math.sin(time * 0.002) * 2;
    } else if (state.id === 'tempestCondenser') {
        const phase = { ringE: -0.37, ringNE: -0.86, ringN: -1.57, ringNW: -2.28, ringW: -2.77 }[name];
        if (phase !== undefined) {
            const w = Math.sin(time * 0.0012) * (3 + charge * 7);
            result.x = -Math.sin(phase) * w;
            result.y = Math.cos(phase) * w;
        }
        if (name === 'core') result.y = -charge * 5;
        if (name === 'vaneW' || name === 'vanes' || name === 'vaneE') result.y = 8 * recoil;
    } else if (state.id === 'duneHerald') {
        if (name === 'emitters') result.y = charge * 6 + recoil * 10;
        if (name === 'podL' || name === 'podR') result.y = 8 * recoil;
        if (name === 'hullL') result.x = -charge * 3;
        if (name === 'hullR') result.x = charge * 3;
        if (name === 'crownL') result.y = -Math.sin(time * 0.002) * 2;
        if (name === 'crownR') result.y = Math.sin(time * 0.002) * 2;
    } else if (state.id === 'gardenEngine') {
        const firing = (state.plan && state.plan.sections) || [];
        const section = (state.sections && state.sections[name]) || null;
        if (name === 'mortar' || name === 'lasher' || name === 'battery') {
            const active = firing.includes(name);
            result.x = (active ? -charge * 10 : -charge * 2) + (active ? recoil * 7 : 0);
            if (section && section.destroyed) {
                result.y = 6;
                result.angle = name === 'lasher' ? 4 : -3;
            }
        } else if (name === 'hull') {
            result.x = -recoil * 2;
        }
    } else if (state.id === 'obsidianHierophant') {
        const slot = { shardN: 0, shardE: 1, shardS: 2, shardW: 3 }[name];
        if (slot !== undefined) {
            const angle = time * 0.0011 + slot * Math.PI / 2;
            const align = state.mode === 'attack' ? 1 : charge;
            const fx = [0, 14, 0, -14][slot];
            const fy = [-14, 0, 14, 0][slot];
            result.x = Math.cos(angle) * 10 * (1 - align) + fx * align - fx * 0.4 * recoil;
            result.y = Math.sin(angle) * 10 * (1 - align) + fy * align - fy * 0.4 * recoil;
        }
        if (name === 'core') result.y = charge * 3 + recoil * 5;
    } else if (state.id === 'cinderfallTyrant') {
        if (name === 'maw') result.x = 9 * recoil - charge * 3;
        if (name === 'vents') result.y = charge * 6;
        if (name === 'crown') result.y = -Math.sin(time * 0.002) * 2;
    } else if (state.id === 'neonChoir') {
        if (name === 'crowns') {
            result.x = -charge * 10 + recoil * 6;
            result.y = Math.sin(time * 0.004) * 3 * (0.4 + charge);
        } else if (name === 'hull') {
            result.x = -recoil * 3;
        } else if (name === 'fins') {
            result.y = -Math.sin(time * 0.003) * 4 - charge * 4;
        } else if (name === 'tail') {
            result.y = Math.sin(time * 0.003 + 1) * 4 + charge * 4;
        }
    } else if (name === 'battery') {
        result.x = 11 * recoil;
        result.y = -charge * 3;
    } else if (name === 'keel') result.y = Math.sin(time * 0.002) * 2;
    return result;
}
const api = { catalog, plan, create, tick, vulnerable, parts, pose };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.NovaWingBosses = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
