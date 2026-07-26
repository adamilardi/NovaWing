/**
 * Run a trained BC policy against the live game (Python → JSON weights).
 *
 *   npm run rl:play
 *   POLICY=rl/weights/bc-policy.json LEVEL=1 npm run rl:play
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    OBS_SIZE,
    encodeObservation,
    decodeAction
} from './obs-encode.mjs';
import { forwardPolicy } from './policy-infer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const HAS_DISPLAY = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const HEADLESS = process.env.HEADLESS === '0' ? false
    : (process.env.HEADLESS === '1' ? true : !HAS_DISPLAY);
const DURATION_MS = Number(process.env.DURATION_MS || 360000);
const TICK_MS = Number(process.env.TICK_MS || 16);
const POLICY_PATH = process.env.POLICY || path.join(ROOT, 'rl', 'weights', 'bc-policy.json');
const CACHED_CHROME = process.env.PLAYWRIGHT_CHROME ||
    '/home/adam/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

async function waitForGame(page, timeout = 25000) {
    await page.waitForFunction(() => {
        return window.__novawingDebug &&
            window.__novawingDebug.ready &&
            window.__novawingDebug.ready() &&
            typeof window.__novawingDebug.setBotInput === 'function' &&
            typeof window.__novawingDebug.getBotSnapshot === 'function';
    }, null, { timeout });
}

/**
 * Install encode + forward + rAF loop inside the page with policy weights.
 */
function installPolicyPilot(policy) {
    // Inlined minimal encode/forward so inference runs at frame rate (no CDP lag).
    // Must stay behavior-compatible with scripts/rl/obs-encode.mjs + policy-infer.mjs.
    window.__novawingPolicy = policy;

    const K_ENEMIES = 6, K_OBSTACLES = 4, K_BULLETS = 8, K_WALLS = 6, K_POWERUPS = 3, K_BANDS = 3;
    const OBS_SIZE = policy.obsSize;
    const ENEMY_TYPE_ID = { regular: 0.2, interceptor: 0.5, splitter: 0.8, splitterDrone: 0.65, bossDrone: 0.9 };
    const POWERUP_TYPE_ID = { weapon: 0.2, boost: 0.35, shield: 0.5, repair: 0.65, bomb: 0.8 };

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function nrm(v, scale) {
        if (!Number.isFinite(v) || !scale) return 0;
        return clamp(v / scale, -2, 2);
    }
    function sortByDist(entities, px, py) {
        return (entities || []).map(function (e) {
            const dx = (e.x || 0) - px;
            const dy = (e.y || 0) - py;
            return { e: e, dx: dx, dy: dy, d2: dx * dx + dy * dy };
        }).sort(function (a, b) { return a.d2 - b.d2; });
    }

    function encode(snap) {
        const out = new Float32Array(OBS_SIZE);
        if (!snap || !snap.player) return out;
        const p = snap.player;
        const wh = (snap.world && snap.world.height) || 600;
        const now = snap.time || 0;
        const invuln = snap.playerInvulnerableUntil && now < snap.playerInvulnerableUntil ? 1 : 0;
        const dur = snap.levelDurationMs || 60000;
        const progress = dur > 0 ? clamp((snap.levelProgressMs || 0) / dur, 0, 1) : 0;
        let o = 0;
        out[o++] = nrm(p.x, 800);
        out[o++] = nrm(p.y, wh);
        out[o++] = nrm(p.vx, 500);
        out[o++] = nrm(p.vy, 500);
        out[o++] = clamp((snap.lives || 0) / 5, 0, 1);
        out[o++] = clamp((snap.weaponLevel || 1) / 3, 0, 1);
        out[o++] = snap.hasShield ? 1 : 0;
        out[o++] = clamp((snap.boostEnergy || 0) / 100, 0, 1);
        out[o++] = snap.boostLocked ? 1 : 0;
        out[o++] = invuln;
        out[o++] = progress;
        out[o++] = snap.phase === 'waves' ? 1 : 0;
        out[o++] = snap.phase === 'boss' ? 1 : 0;
        out[o++] = clamp((snap.level || 1) / 3, 0, 1);

        function fill(ranked, k, dims, write) {
            for (let i = 0; i < k; i++) {
                if (i < ranked.length) write(ranked[i]);
                else for (let d = 0; d < dims; d++) out[o++] = 0;
            }
        }
        const px = p.x, py = p.y;
        fill(sortByDist(snap.enemies, px, py), K_ENEMIES, 6, function (r) {
            out[o++] = nrm(r.dx, 400); out[o++] = nrm(r.dy, 300);
            out[o++] = nrm(r.e.vx, 400); out[o++] = nrm(r.e.vy, 300);
            out[o++] = ENEMY_TYPE_ID[r.e.type] != null ? ENEMY_TYPE_ID[r.e.type] : 0.2;
            out[o++] = clamp((r.e.health || 1) / 12, 0, 1);
        });
        fill(sortByDist(snap.obstacles, px, py), K_OBSTACLES, 5, function (r) {
            out[o++] = nrm(r.dx, 400); out[o++] = nrm(r.dy, 300);
            out[o++] = nrm(r.e.vx, 200); out[o++] = nrm(r.e.vy, 200);
            out[o++] = nrm(Math.max(r.e.w || 40, r.e.h || 40), 80);
        });
        fill(sortByDist(snap.enemyBullets, px, py), K_BULLETS, 5, function (r) {
            out[o++] = nrm(r.dx, 400); out[o++] = nrm(r.dy, 300);
            out[o++] = nrm(r.e.vx, 500); out[o++] = nrm(r.e.vy, 400);
            out[o++] = r.e.isLaser ? 1 : 0;
        });
        fill(sortByDist(snap.walls, px, py), K_WALLS, 5, function (r) {
            out[o++] = nrm(r.dx, 400); out[o++] = nrm(r.dy, 400);
            out[o++] = nrm(r.e.vx, 200);
            out[o++] = nrm(r.e.w || 96, 200);
            out[o++] = nrm(r.e.h || 80, 400);
        });
        fill(sortByDist(snap.powerups, px, py), K_POWERUPS, 4, function (r) {
            out[o++] = nrm(r.dx, 400); out[o++] = nrm(r.dy, 300);
            out[o++] = POWERUP_TYPE_ID[r.e.type] != null ? POWERUP_TYPE_ID[r.e.type] : 0.2;
            out[o++] = nrm(Math.sqrt(r.d2), 500);
        });
        const bands = snap.openBands || [];
        for (let i = 0; i < K_BANDS; i++) {
            if (i < bands.length) {
                out[o++] = clamp(bands[i][0] / wh, 0, 1);
                out[o++] = clamp(bands[i][1] / wh, 0, 1);
            } else { out[o++] = 0; out[o++] = 0; }
        }
        const b = snap.boss;
        if (b && snap.phase === 'boss') {
            out[o++] = 1;
            out[o++] = nrm((b.x || 0) - px, 500);
            out[o++] = nrm((b.y || 0) - py, wh);
            out[o++] = clamp((b.health || 0) / 280, 0, 1);
            out[o++] = clamp((b.phase || 1) / 3, 0, 1);
            out[o++] = nrm(b.w || 300, 400);
        } else {
            out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
        }
        return out;
    }

    function matvec(w, bias, x) {
        const out = new Float32Array(bias.length);
        for (let i = 0; i < bias.length; i++) {
            let s = bias[i];
            const row = w[i];
            for (let j = 0; j < x.length; j++) s += row[j] * x[j];
            out[i] = s;
        }
        return out;
    }
    function relu(x) {
        const out = new Float32Array(x.length);
        for (let i = 0; i < x.length; i++) out[i] = x[i] > 0 ? x[i] : 0;
        return out;
    }
    function sigmoid(v) {
        if (v >= 0) { const z = Math.exp(-v); return 1 / (1 + z); }
        const z = Math.exp(v); return z / (1 + z);
    }
    function forward(obs) {
        let h = obs;
        const layers = policy.layers;
        for (let li = 0; li < layers.length; li++) {
            const layer = layers[li];
            h = matvec(layer.w, layer.b, h);
            if (layer.act === 'relu') h = relu(h);
        }
        return {
            x: Math.tanh(h[0] || 0),
            y: Math.tanh(h[1] || 0),
            fire: sigmoid(h[2] || 0) >= 0.5,
            boost: sigmoid(h[3] || 0) >= 0.5
        };
    }

    function tick() {
        try {
            if (!window.__novawingDebug || !window.__novawingDebug.getBotSnapshot) return;
            const snap = window.__novawingDebug.getBotSnapshot();
            window.__novawingPolicyLastSnap = snap;
            if (!snap || !snap.ready || !snap.player) return;
            if (snap.levelEnded || snap.victoryPending) {
                window.__novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false });
                window.__novawingPolicyOutcome = snap.victoryPending ? 'win' : 'lose';
                return;
            }
            if (snap.levelTransitioning) {
                window.__novawingDebug.setBotInput({ x: 0, y: 0, fire: true, boost: false });
                return;
            }
            const obs = encode(snap);
            const action = forward(obs);
            window.__novawingPolicyLastAction = action;
            window.__novawingDebug.setBotInput(action);
        } catch (err) {
            window.__novawingPolicyError = String(err && err.message ? err.message : err);
        }
    }
    function loop() {
        tick();
        window.__novawingPolicyRaf = requestAnimationFrame(loop);
    }
    window.__novawingPolicyOutcome = null;
    window.__novawingPolicyError = null;
    window.__novawingPolicyStop = function () {
        if (window.__novawingPolicyRaf) cancelAnimationFrame(window.__novawingPolicyRaf);
        window.__novawingPolicyRaf = null;
        if (window.__novawingDebug && window.__novawingDebug.clearBotInput) {
            window.__novawingDebug.clearBotInput();
        }
    };
    window.__novawingPolicyRaf = requestAnimationFrame(loop);
    return true;
}

async function main() {
    if (!fs.existsSync(POLICY_PATH)) {
        console.error(`Policy not found: ${POLICY_PATH}`);
        console.error('Train first: npm run rl:train');
        process.exit(1);
    }
    const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
    if (policy.obsSize !== OBS_SIZE) {
        console.error(`Policy obsSize ${policy.obsSize} != encoder OBS_SIZE ${OBS_SIZE}`);
        process.exit(1);
    }

    console.log('NovaWing RL policy pilot');
    console.log(`policy=${POLICY_PATH}`);
    console.log(`hidden=${JSON.stringify(policy.hidden)} obs=${policy.obsSize}`);
    console.log(`URL=${BASE} headless=${HEADLESS} duration=${DURATION_MS}ms`);

    // Node-side sanity check
    const dummy = new Float32Array(OBS_SIZE);
    const y = forwardPolicy(policy, dummy);
    console.log(`forward(zeros) -> ax=${y[0].toFixed(3)} ay=${y[1].toFixed(3)} fire=${y[2].toFixed(3)} boost=${y[3].toFixed(3)}`);

    const launchOptions = {
        headless: HEADLESS,
        args: [
            '--use-gl=swiftshader',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
            '--autoplay-policy=no-user-gesture-required'
        ]
    };
    if (fs.existsSync(CACHED_CHROME)) launchOptions.executablePath = CACHED_CHROME;

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
        viewport: { width: 960, height: 720 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.on('dialog', async (dialog) => {
        if (dialog.type() === 'prompt') await dialog.accept('RLPilot');
        else await dialog.accept();
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err.message || err));

    try {
        const url = new URL(BASE);
        url.searchParams.set('bot', String(Date.now()));
        url.searchParams.set('policy', '1');
        if (process.env.LEVEL) url.searchParams.set('level', String(process.env.LEVEL));

        const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
        if (!resp || !resp.ok()) throw new Error(`load failed: ${resp && resp.status()}`);
        await waitForGame(page);
        await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
        await page.waitForTimeout(150);

        await page.evaluate(installPolicyPilot, policy);
        console.log('policy pilot installed');

        const started = Date.now();
        let lastLog = 0;
        let won = false;
        let finalSnap = null;

        while (Date.now() - started < DURATION_MS) {
            const status = await page.evaluate(() => ({
                snap: window.__novawingPolicyLastSnap ||
                    (window.__novawingDebug && window.__novawingDebug.getBotSnapshot
                        ? window.__novawingDebug.getBotSnapshot()
                        : null),
                action: window.__novawingPolicyLastAction,
                outcome: window.__novawingPolicyOutcome,
                error: window.__novawingPolicyError
            }));
            if (status.error) console.error('[policy]', status.error);
            finalSnap = status.snap;

            if (status.outcome === 'win' || (status.snap && status.snap.victoryPending)) {
                won = true;
                break;
            }
            if (status.outcome === 'lose' || (status.snap && status.snap.levelEnded)) {
                won = false;
                break;
            }

            const now = Date.now();
            if (status.snap && now - lastLog > 2000) {
                const s = status.snap;
                const a = status.action || {};
                const el = s.elapsedMs != null ? (s.elapsedMs / 1000).toFixed(1) : '?';
                console.log(
                    `[policy] t=${el}s L${s.level} score=${s.score} lives=${s.lives} ` +
                    `phase=${s.phase} ax=${(a.x || 0).toFixed(2)} ay=${(a.y || 0).toFixed(2)} ` +
                    `boost=${a.boost ? 1 : 0}`
                );
                lastLog = now;
            }
            await page.waitForTimeout(100);
        }

        const result = {
            won,
            score: finalSnap ? finalSnap.score : null,
            lives: finalSnap ? finalSnap.lives : null,
            level: finalSnap ? finalSnap.level : null,
            phase: finalSnap ? finalSnap.phase : null,
            elapsedMs: finalSnap ? finalSnap.elapsedMs : null
        };
        console.log('\n======== POLICY RUN ========');
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = won ? 0 : 2;
    } finally {
        await page.evaluate(() => {
            if (window.__novawingPolicyStop) window.__novawingPolicyStop();
        }).catch(() => {});
        await context.close();
        await browser.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
