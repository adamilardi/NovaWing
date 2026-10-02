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
        phases: ['SALVAGE TORPEDOES', 'STAGGERED BATTERIES', 'WRECKAGE ESCORT'], windupMs: 1000, activeMs: 1000, recoveryMs: 2200 }
});
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function plan(id, cycle, phase, focus = 300) {
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
    const upper = cycle % 2 === 0;
    return { kind: 'salvageBurst', angles: phase === 1 ? [170, 190]
        : upper ? [180, 192, 204] : [156, 168, 180],
        batteryOffset: phase === 1 ? null : upper ? -32 : 32,
        speed: 205 + phase * 22, bursts: phase === 1 ? 2 : 3,
        escorts: phase === 3 && cycle % 3 === 2 ? 2 : 0 };
}
function create(id, time = 0) {
    if (!catalog[id]) throw new Error('Unknown boss behavior: ' + id);
    return { id, mode: 'recovery', phase: 1, cycle: 0, nextAt: time + 1600,
        windupUntil: null, activeUntil: null, plan: null };
}
function tick(state, time, phase, tempo = 1, focus = 300) {
    const spec = catalog[state.id];
    state.phase = clamp(phase, 1, 3);
    // Tempo changes cadence, not reaction time. Warnings never shrink below their
    // authored length and are retained together with their exact attack plan.
    const scale = Math.max(0.65, Number.isFinite(tempo) ? tempo : 1);
    if (state.mode === 'recovery' && time >= state.nextAt) {
        state.mode = 'windup';
        state.plan = plan(state.id, state.cycle, state.phase, focus);
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
    return !state || state.id !== 'foundryWarden' || state.mode === 'recovery';
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
