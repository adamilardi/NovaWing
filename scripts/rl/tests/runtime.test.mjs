/**
 * Unit tests for OBS runtime / reward helpers.
 *   node --test scripts/rl/tests/runtime.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    OBS_VERSION,
    OBS_SIZE,
    ACTION_SIZE,
    encodeObservation,
    encodeAction,
    decodeAction
} from '../obs-encode.mjs';
import { forwardPolicy } from '../policy-infer.mjs';
import {
    stepReward,
    applyTerminalReward,
    REWARD_WIN,
    REWARD_DEATH
} from '../rewards.mjs';
import { loadRuntime, RUNTIME_PURE_PATH } from '../load-runtime.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..', '..');

function fixtureSnap() {
    return {
        ready: true,
        player: { x: 120, y: 300, vx: 10, vy: -5 },
        world: { height: 600 },
        time: 1000,
        lives: 3,
        weaponLevel: 1,
        hasShield: false,
        boostEnergy: 80,
        boostLocked: false,
        levelDurationMs: 60000,
        levelProgressMs: 15000,
        phase: 'waves',
        level: 1,
        scrollMode: 'horizontal',
        combatOrientation: 'right',
        segment: null,
        enemies: [{ x: 400, y: 300, vx: -50, vy: 0, type: 'regular', health: 2 }],
        obstacles: [],
        enemyBullets: [{ x: 350, y: 300, vx: -200, vy: 0, isLaser: false }],
        walls: [],
        powerups: [],
        openBands: [[100, 200], [300, 400]],
        boss: null,
        blackHole: { active: false, preview: false, config: {} },
        score: 100,
        isBoosting: false
    };
}

describe('OBS contract', () => {
    it('matches Python contract constants', () => {
        const py = fs.readFileSync(path.join(ROOT, 'rl', 'contract.py'), 'utf8');
        assert.match(py, /OBS_VERSION\s*=\s*2/);
        assert.match(py, /OBS_SIZE\s*=\s*176/);
        assert.match(py, /ACTION_SIZE\s*=\s*4/);
        assert.equal(OBS_VERSION, 2);
        assert.equal(OBS_SIZE, 176);
        assert.equal(ACTION_SIZE, 4);
    });

    it('encodeObservation fills exact OBS_SIZE', () => {
        const obs = encodeObservation(fixtureSnap());
        assert.equal(obs.length, OBS_SIZE);
        assert.ok(obs.some((v) => v !== 0));
    });

    it('encode/decode action round-trip', () => {
        const a = encodeAction({ x: 0.5, y: -1, fire: true, boost: false });
        assert.deepEqual(a, [0.5, -1, 1, 0]);
        const d = decodeAction(a);
        assert.equal(d.x, 0.5);
        assert.equal(d.y, -1);
        assert.equal(d.fire, true);
        assert.equal(d.boost, false);
    });
});

describe('runtime-pure single source', () => {
    it('loadRuntime API matches obs-encode exports', () => {
        const rt = loadRuntime();
        assert.equal(rt.OBS_SIZE, OBS_SIZE);
        const a = encodeObservation(fixtureSnap());
        const b = rt.encodeObservation(fixtureSnap());
        assert.equal(a.length, b.length);
        for (let i = 0; i < a.length; i++) {
            assert.ok(Math.abs(a[i] - b[i]) < 1e-6, `mismatch at ${i}`);
        }
    });

    it('runtime-pure.js exists and is importable as script', () => {
        assert.ok(fs.existsSync(RUNTIME_PURE_PATH));
        assert.ok(fs.readFileSync(RUNTIME_PURE_PATH, 'utf8').includes('NovaWingRL'));
    });
});

describe('forwardPolicy', () => {
    it('runs a tiny identity-ish MLP', () => {
        // 176 -> 4 identity-like zeros bias
        const w = Array.from({ length: 4 }, (_, i) => {
            const row = new Array(OBS_SIZE).fill(0);
            row[i] = 1;
            return row;
        });
        const policy = {
            obsSize: OBS_SIZE,
            actionSize: 4,
            layers: [{ w, b: [0, 0, 0, 0], act: 'identity' }]
        };
        const obs = new Float32Array(OBS_SIZE);
        obs[0] = 0.5;
        obs[1] = -0.5;
        obs[2] = 2;
        obs[3] = -2;
        const y = forwardPolicy(policy, obs);
        assert.ok(Math.abs(y[0] - Math.tanh(0.5)) < 1e-5);
        assert.ok(Math.abs(y[1] - Math.tanh(-0.5)) < 1e-5);
        // sigmoid(2) ~ 0.88, sigmoid(-2) ~ 0.12
        assert.ok(y[2] > 0.8);
        assert.ok(y[3] < 0.2);
    });
});

describe('rewards', () => {
    it('stepReward is dense only (no terminal)', () => {
        const prev = {
            score: 0,
            lives: 3,
            level: 1,
            phase: 'waves',
            levelProgressMs: 0,
            levelDurationMs: 60000,
            isBoosting: false
        };
        const snap = {
            score: 400,
            lives: 3,
            level: 1,
            phase: 'waves',
            levelProgressMs: 6000,
            levelDurationMs: 60000,
            isBoosting: true
        };
        const r = stepReward(prev, snap);
        // progress 0.1 * 3 + score 1.0 + boost 0.05 - 0.002
        assert.ok(r > 1.0);
        assert.ok(r < 5.0);
    });

    it('applyTerminalReward once', () => {
        const steps = [{ reward: 0.1 }];
        let ret = 0.1;
        ret = applyTerminalReward(steps, ret, 'win');
        assert.equal(steps[0].reward, 0.1 + REWARD_WIN);
        assert.equal(ret, 0.1 + REWARD_WIN);
        ret = applyTerminalReward(steps, ret, 'death');
        assert.equal(steps[0].reward, 0.1 + REWARD_WIN + REWARD_DEATH);
    });
});
