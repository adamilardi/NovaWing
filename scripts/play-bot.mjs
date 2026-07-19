/**
 * NovaWing speed-clear bot — Playwright pilot tuned to minimize clear time.
 *
 * Strategy:
 *  - Wave phase: boost as much as boost economy allows (progress multiplies up to 1.55x).
 *  - Route for weapon → boost powerups; kill for boost refill.
 *  - Boss phase: track boss Y for DPS, micro-dodge missiles/lasers only when needed.
 *
 *   npm run bot
 *   TRIALS=5 npm run bot
 *   HEADLESS=0 RECORD_VIDEO=1 npm run bot
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const HAS_DISPLAY = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const HEADLESS = process.env.HEADLESS === '0' ? false
    : (process.env.HEADLESS === '1' ? true : !HAS_DISPLAY);
const DURATION_MS = Number(process.env.DURATION_MS || 180000);
const TICK_MS = Number(process.env.TICK_MS || 16);
const SLOW_MO = Number(process.env.SLOW_MO || 0);
const TRIALS = Math.max(1, Number(process.env.TRIALS || 1));
const CACHED_CHROME = process.env.PLAYWRIGHT_CHROME ||
    '/home/adam/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const SCREENSHOT_DIR = process.env.BOT_SCREENSHOT_DIR ||
    path.join(__dirname, '..', '.bot-runs');
const RECORD_VIDEO = process.env.RECORD_VIDEO !== '0';
// Stay left for reaction time; slide right slightly during boss for shot travel.
const HOME_X = 100;
const BOSS_X = 165;
const LANE_COUNT = 20;

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function halfSize(entity) {
    return {
        hw: Math.max(6, (entity.w || 40) * 0.5),
        hh: Math.max(6, (entity.h || 40) * 0.5)
    };
}

/** Continuous-time AABB sweep: earliest t in [0,horizon] where boxes overlap. */
function timeToCollision(px, py, pw, ph, threat, horizon = 2.8) {
    const { hw: thw, hh: thh } = halfSize(threat);
    const needX = pw + thw + 8;
    const needY = ph + thh + 10;
    const dx0 = threat.x - px;
    const dy0 = threat.y - py;
    const vx = threat.vx || 0;
    const vy = threat.vy || 0;

    if (Math.abs(dx0) <= needX && Math.abs(dy0) <= needY) return 0;

    // Separating-axis entry times for moving threat vs static ship.
    let tEnter = 0;
    let tExit = horizon;

    // X axis
    if (vx === 0) {
        if (Math.abs(dx0) > needX) return Infinity;
    } else {
        const t1 = (-needX - dx0) / vx;
        const t2 = (needX - dx0) / vx;
        const tin = Math.min(t1, t2);
        const tout = Math.max(t1, t2);
        tEnter = Math.max(tEnter, tin);
        tExit = Math.min(tExit, tout);
    }

    // Y axis
    if (vy === 0) {
        if (Math.abs(dy0) > needY) return Infinity;
    } else {
        const t1 = (-needY - dy0) / vy;
        const t2 = (needY - dy0) / vy;
        const tin = Math.min(t1, t2);
        const tout = Math.max(t1, t2);
        tEnter = Math.max(tEnter, tin);
        tExit = Math.min(tExit, tout);
    }

    if (tEnter > tExit || tExit < 0 || tEnter > horizon) return Infinity;
    return Math.max(0, tEnter);
}

function allThreats(snap) {
    const out = [];
    for (const e of snap.enemies || []) {
        out.push({
            ...e,
            kind: 'enemy',
            h: (e.h || 36) * (e.type === 'interceptor' ? 1.2 : 1)
        });
    }
    for (const o of snap.obstacles || []) out.push({ ...o, kind: 'obstacle' });
    for (const b of snap.enemyBullets || []) {
        out.push({
            ...b,
            kind: b.isLaser ? 'laser' : 'bullet',
            w: b.isLaser ? 800 : (b.w || 16),
            h: b.isLaser ? Math.max(30, b.h || 24) : (b.h || 12)
        });
    }
    for (const w of snap.walls || []) out.push({ ...w, kind: 'wall' });
    if (snap.boss && snap.boss.active !== false) {
        // Soft body threat — avoid ramming, not full hitbox for lane scoring.
        out.push({
            x: snap.boss.x - 40,
            y: snap.boss.y,
            vx: 0,
            vy: 0,
            w: Math.max(80, (snap.boss.w || 300) * 0.35),
            h: Math.max(60, (snap.boss.h || 150) * 0.38),
            kind: 'boss'
        });
    }
    return out;
}

function laneYs(snap) {
    const wh = (snap.world && snap.world.height) || 600;
    const ys = [];
    if (snap.openBands && snap.openBands.length) {
        for (const [top, bot] of snap.openBands) {
            const innerTop = top + 32;
            const innerBot = bot - 32;
            if (innerBot <= innerTop) {
                ys.push((top + bot) * 0.5);
                continue;
            }
            const steps = Math.max(4, Math.round((innerBot - innerTop) / 24));
            for (let i = 0; i <= steps; i++) {
                ys.push(innerTop + (innerBot - innerTop) * (i / steps));
            }
        }
    } else {
        for (let i = 0; i < LANE_COUNT; i++) {
            ys.push(70 + (wh - 140) * (i / (LANE_COUNT - 1)));
        }
    }
    return ys;
}

function powerupValue(pu, snap) {
    const low = (snap.lives || 0) <= 1;
    if (pu.type === 'weapon' && snap.weaponLevel < 3) return 60 - snap.weaponLevel * 8;
    if (pu.type === 'boost' && snap.boostEnergy < 70) return low ? 28 : 44;
    if (pu.type === 'shield' && !snap.hasShield) return low ? 55 : 34;
    if (pu.type === 'repair' && snap.lives <= 2) return low ? 70 : 42;
    if (pu.type === 'bomb') return 16;
    if (pu.type === 'weapon') return 6;
    return 4;
}

function scoreLane(y, x, snap, threats) {
    const p = snap.player;
    const pw = (p.w || 48) * 0.5;
    const ph = (p.h || 28) * 0.5;
    let score = 0;
    let minTtc = Infinity;

    for (const t of threats) {
        if (t.x < x - 60 && (t.vx || 0) <= 0 && t.kind !== 'laser' && t.kind !== 'wall') continue;
        if (t.x > x + 720 && t.kind !== 'wall') continue;

        const expanded = { ...t };
        if (t.kind === 'enemy' && t.type === 'interceptor') {
            expanded.h = (t.h || 36) + 40;
        }
        if (t.kind === 'bullet' && Math.abs(t.vy || 0) > 50) {
            expanded.h = (t.h || 12) + 16;
        }

        const ttc = timeToCollision(x, y, pw, ph, expanded, 2.8);
        if (ttc < Infinity) {
            minTtc = Math.min(minTtc, ttc);
            // Survival cost curve (lower score = better)
            if (ttc < 0.08) score += 1200;
            else if (ttc < 0.16) score += 520;
            else if (ttc < 0.28) score += 280;
            else if (ttc < 0.45) score += 150;
            else if (ttc < 0.75) score += 70;
            else if (ttc < 1.2) score += 28;
            else score += 10;

            if (t.kind === 'laser') score += 160 / (0.1 + ttc);
            if (t.kind === 'bullet') score += 70 / (0.15 + ttc);
            if (t.kind === 'obstacle') score += 45 / (0.2 + ttc);
            if (t.kind === 'enemy') score += 30 / (0.22 + ttc);
            if (t.kind === 'wall') score += 70 / (0.18 + ttc);
            if (t.kind === 'boss') score += 55 / (0.2 + ttc);
        } else {
            const dy = Math.abs(t.y - y);
            const dx = t.x - x;
            if (dx > -20 && dx < 380 && dy < 70) {
                score += (70 - dy) * 0.18 * clamp(1 - dx / 380, 0, 1);
            }
        }
    }

    if (minTtc < Infinity) score -= Math.min(minTtc, 2.0) * 32;
    else score -= 80;

    // Powerup chase when lane is safe enough
    if (minTtc > 0.35) {
        for (const pu of snap.powerups || []) {
            if (pu.x < x - 20 || pu.x > x + 480) continue;
            const dy = Math.abs(pu.y - y);
            if (dy > 100) continue;
            const value = powerupValue(pu, snap);
            score -= value * clamp(1 - dy / 100, 0, 1) * clamp(1 - (pu.x - x) / 480, 0.35, 1);
        }
    }

    // Kill pressure: soft enemies for boost refill; lighter weight early.
    if (minTtc > 0.45 && snap.phase === 'waves') {
        const killW = snap.weaponLevel >= 2 ? 1 : 0.45;
        for (const e of snap.enemies || []) {
            if (e.x < x + 20 || e.x > x + 520) continue;
            if ((e.type === 'splitter' || (e.health || 1) >= 8)) continue;
            const dy = Math.abs(e.y - y);
            if (dy < 28) score -= 12 * killW * clamp(1 - (e.x - x) / 520, 0.2, 1);
            else if (dy < 50) score -= 5 * killW * clamp(1 - (e.x - x) / 520, 0.2, 1);
        }
    }

    // Boss: track boss Y hard when safe (DPS), dodge body
    if (snap.phase === 'boss' && snap.boss) {
        const b = snap.boss;
        const bodyHalf = (b.h || 150) * 0.22;
        if (Math.abs(y - b.y) < bodyHalf + 18) score += 110;
        // Prefer center-line track for max multi-shot hits
        score += Math.abs(y - b.y) * 0.55;
        // Slight pocket offset only when under heavy fire
        if (minTtc < 0.5) {
            const pockets = [b.y - 95, b.y + 95, b.y - 140, b.y + 140];
            let best = Infinity;
            for (const pocket of pockets) {
                best = Math.min(best, Math.abs(y - clamp(pocket, 90, 510)));
            }
            score += best * 0.08;
        }
    }

    const wh = (snap.world && snap.world.height) || 600;
    if (y < 72) score += (72 - y) * 1.1;
    if (y > wh - 72) score += (y - (wh - 72)) * 1.1;
    const edgeDist = Math.min(y - 72, wh - 72 - y);
    if (edgeDist < 40) score += (40 - edgeDist) * 0.35;

    // Mild hysteresis
    score += Math.abs(y - p.y) * 0.04;

    return { score, minTtc };
}

function pickTarget(snap) {
    const p = snap.player;
    const threats = allThreats(snap);
    const ys = laneYs(snap);
    ys.push(p.y);

    if (snap.phase === 'boss' && snap.boss) {
        // Dense samples around boss for tracking
        for (let d = -160; d <= 160; d += 20) {
            ys.push(clamp(snap.boss.y + d, 80, 520));
        }
    }

    for (const pu of snap.powerups || []) {
        if (pu.x > p.x - 30 && pu.x < p.x + 450) ys.push(pu.y);
    }
    for (const e of snap.enemies || []) {
        if (e.x > p.x && e.x < p.x + 400) ys.push(e.y);
    }

    const homeX = snap.phase === 'boss' ? BOSS_X : HOME_X;
    const xOptions = snap.phase === 'boss'
        ? [homeX, homeX - 20, homeX + 25, Math.min(210, p.x + 10)]
        : [HOME_X, HOME_X + 18, HOME_X + 36, Math.max(70, p.x - 8)];

    let best = { x: homeX, y: p.y, score: Infinity, minTtc: 0 };

    for (const y of ys) {
        for (const x of xOptions) {
            const { score, minTtc } = scoreLane(y, x, snap, threats);
            const total = score + Math.abs(x - homeX) * 0.04;
            if (total < best.score) {
                best = { x, y, score: total, minTtc };
            }
        }
    }
    return best;
}

let bossWeaveDir = 1;
let bossWeaveUntil = 0;
let bossOrbitSign = 1;
let lastAimY = 300;

/** Threat at the ship's CURRENT position (not a candidate lane). */
function currentThreat(snap) {
    const p = snap.player;
    if (!p) return { ttc: Infinity, dodgeDir: 0, bullets: 0 };
    const pw = (p.w || 48) * 0.5;
    const ph = (p.h || 28) * 0.5;
    const threats = allThreats(snap);
    let minTtc = Infinity;
    let dodgeDir = 0;
    let bullets = 0;

    for (const t of threats) {
        if (t.kind === 'bullet' || t.kind === 'laser') bullets += 1;
        // Inflate bullets for reaction margin
        const expanded = { ...t };
        if (t.kind === 'bullet') {
            expanded.w = (t.w || 16) + 10;
            expanded.h = (t.h || 12) + 18;
        }
        if (t.kind === 'laser') {
            expanded.h = (t.h || 28) + 20;
        }
        const ttc = timeToCollision(p.x, p.y, pw, ph, expanded, 2.5);
        if (ttc < minTtc) {
            minTtc = ttc;
            // Step away from threat centerline
            if (t.kind === 'laser' || t.kind === 'bullet' || t.kind === 'enemy') {
                dodgeDir = (t.y + (t.vy || 0) * Math.min(ttc, 0.4)) >= p.y ? -1 : 1;
            }
        }
    }

    // Predictive intercept for bullets aimed at us (boss missiles lead)
    for (const b of snap.enemyBullets || []) {
        if (b.isLaser) {
            if (Math.abs(b.y - p.y) < 48) {
                minTtc = Math.min(minTtc, 0.05);
                dodgeDir = b.y >= p.y ? -1 : 1;
            }
            continue;
        }
        const vx = b.vx || -380;
        if (vx >= -20) continue;
        if (b.x < p.x - 30 || b.x > p.x + 420) continue;
        const tHit = (b.x - p.x) / -vx;
        if (tHit < 0 || tHit > 0.85) continue;
        const predY = b.y + (b.vy || 0) * tHit;
        const miss = Math.abs(predY - p.y);
        if (miss < 46) {
            const urgency = tHit;
            if (urgency < minTtc) {
                minTtc = urgency;
                dodgeDir = predY >= p.y ? -1 : 1;
            }
        }
    }

    return { ttc: minTtc, dodgeDir, bullets };
}

function decide(snap) {
    if (!snap || !snap.ready || !snap.player || snap.levelEnded || snap.victoryPending) {
        return { x: 0, y: 0, fire: false, boost: false, note: 'idle' };
    }

    const p = snap.player;
    const target = pickTarget(snap);
    const here = currentThreat(snap);
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    // Use the tighter of lane-plan TTC and current-position TTC
    const ttc = Math.min(target.minTtc, here.ttc);
    const now = snap.time || Date.now();
    const invuln = snap.playerInvulnerableUntil && now < snap.playerInvulnerableUntil;
    const lowLives = (snap.lives || 0) <= 1 && !snap.hasShield;

    let ax = 0;
    let ay = 0;
    if (dx < -6) ax = -1;
    else if (dx > 10) ax = 1;
    if (dy < -4) ay = -1;
    else if (dy > 4) ay = 1;

    // Hard override: dodge threats at current position first
    if (here.ttc < 0.55 && here.dodgeDir !== 0) {
        ay = here.dodgeDir;
        if (here.ttc < 0.28 && p.x > 80) ax = -1;
    } else if (ttc < 0.28 && Math.abs(dy) > 2) {
        ay = dy < 0 ? -1 : 1;
        if (p.x > 85) ax = -1;
    }

    if (snap.phase === 'boss' && snap.boss) {
        const b = snap.boss;
        const phase = b.phase || 1;
        const hp = Number.isFinite(b.health) ? b.health : 240;
        const panic = here.ttc < 0.36 && here.dodgeDir !== 0;
        const pressured = here.ttc < 0.58 || here.bullets >= 4;
        const onEdge = p.y < 125 || p.y > 475;

        if (now > bossWeaveUntil) {
            bossOrbitSign *= -1;
            bossWeaveUntil = now + (pressured ? 320 : 460);
        }
        if (p.y <= 105) bossOrbitSign = 1;
        if (p.y >= 495) bossOrbitSign = -1;

        if (panic && !onEdge) {
            ay = here.dodgeDir;
            if (p.x > 85) ax = -1;
        } else if (onEdge) {
            // Edge camping stalls DPS for seconds — force back into the boss band
            ay = p.y < 300 ? 1 : -1;
        } else if (invuln) {
            const err = b.y - p.y;
            ay = Math.abs(err) > 6 ? (err > 0 ? 1 : -1) : bossOrbitSign * 0.5;
        } else if (hp > 160) {
            // Phase 1: glue to boss, micro-weave only
            const aimY = clamp(b.y + bossOrbitSign * 18, 110, 490);
            lastAimY = aimY;
            ay = Math.abs(p.y - aimY) > 7 ? (p.y < aimY ? 1 : -1) : bossOrbitSign * 0.55;
        } else if (pressured) {
            // Phase 2/3 under fire: orbit just outside missile lead, still on body
            const amp = phase >= 3 ? 62 : 48;
            const aimY = clamp(b.y + bossOrbitSign * amp, 110, 490);
            lastAimY = aimY;
            ay = Math.abs(p.y - aimY) > 10 ? (p.y < aimY ? 1 : -1) : bossOrbitSign * 0.7;
        } else {
            const aimY = clamp(b.y + bossOrbitSign * 24, 110, 490);
            lastAimY = aimY;
            ay = Math.abs(p.y - aimY) > 8 ? (p.y < aimY ? 1 : -1) : bossOrbitSign * 0.5;
        }

        // Hold DPS X
        if (p.x < 148) ax = Math.max(ax, 0.7);
        if (p.x > 205) ax = -1;
        if (b.x > 750 && p.x < 175) ax = Math.max(ax, 0.35);
        if (b.x <= 700 && p.x < 155) ax = Math.max(ax, 0.5);
    }

    // --- Boost policy (speed clear) ---
    let boost = false;
    const energy = snap.boostEnergy || 0;
    const locked = snap.boostLocked;
    if (!locked && energy > 4) {
        if (snap.phase === 'waves') {
            // Early weapon: cautious boost (ramming at 470 speed is a common early death).
            // After wpn2+: push progress hard.
            const early = snap.weaponLevel < 2;
            const safeTtc = early ? 0.42 : (lowLives ? 0.32 : 0.18);
            if (ttc > safeTtc || invuln) boost = true;
            else if (!early && (snap.lives >= 2 || snap.hasShield) && energy > 45 && ttc > 0.12) {
                boost = true;
            }
            const prog = snap.levelProgressMs || 0;
            const dur = snap.levelDurationMs || 60000;
            if (prog > dur * 0.88 && energy > 8 && ttc > 0.14) boost = true;
        } else if (snap.phase === 'boss') {
            if (here.ttc < 0.55 || ttc < 0.55) boost = true;
            else if (Math.abs(p.y - lastAimY) > 50 && energy > 25) boost = true;
            else if (here.bullets >= 3 && energy > 15) boost = true;
        }
    }

    const fire = true;

    const ttcLabel = ttc === Infinity ? 'inf' : ttc.toFixed(2);
    const prog = snap.levelProgressMs != null
        ? `${Math.round((snap.levelProgressMs / (snap.levelDurationMs || 60000)) * 100)}%`
        : '?';
    return {
        x: ax,
        y: ay,
        fire,
        boost,
        note: `ttc=${ttcLabel} cur=${here.ttc === Infinity ? 'inf' : here.ttc.toFixed(2)} bl=${here.bullets} y=${target.y.toFixed(0)} e=${energy.toFixed(0)} p=${prog} w${snap.weaponLevel}`
    };
}

async function waitForGame(page, timeout = 25000) {
    await page.waitForFunction(() => {
        return window.__novawingDebug &&
            window.__novawingDebug.ready &&
            window.__novawingDebug.ready() &&
            typeof window.__novawingDebug.setBotInput === 'function' &&
            typeof window.__novawingDebug.getBotSnapshot === 'function';
    }, null, { timeout });
}

async function runOnce(browser, trialIndex) {
    const url = new URL(BASE);
    url.searchParams.set('bot', String(Date.now()));
    url.searchParams.set('trial', String(trialIndex));

    const videoDir = path.join(SCREENSHOT_DIR, 'video');
    if (RECORD_VIDEO) fs.mkdirSync(videoDir, { recursive: true });
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const context = await browser.newContext({
        viewport: { width: 960, height: 720 },
        deviceScaleFactor: 1,
        recordVideo: RECORD_VIDEO ? { dir: videoDir, size: { width: 960, height: 720 } } : undefined
    });
    const page = await context.newPage();

    page.on('dialog', async dialog => {
        // Auto-submit leaderboard name on victory
        if (dialog.type() === 'prompt') await dialog.accept('BotPilot');
        else await dialog.accept();
    });
    page.on('pageerror', err => console.error('[pageerror]', err.message || err));

    const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
    if (!resp || !resp.ok()) throw new Error(`Failed to load game: ${resp && resp.status()}`);

    await waitForGame(page);
    await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
    await page.waitForTimeout(200);

    const hookOk = await page.evaluate(() => {
        window.__novawingDebug.setBotInput({ x: 0, y: -1, fire: true, boost: false });
        const axes = window.__novawingDebug.getMovementAxes();
        return axes && axes.y < -0.5;
    });
    if (!hookOk) console.error('Bot input hook failed');
    else console.log(`[trial ${trialIndex}] input hook OK`);

    const started = Date.now();
    let lastLog = 0;
    let ticks = 0;
    let finalSnap = null;
    let peakScore = 0;
    let peakWeapon = 1;
    let reachedBoss = false;
    let bossAtMs = null;
    let won = false;
    let maxProgress = 0;

    // Reset weave state per trial
    bossWeaveDir = 1;
    bossWeaveUntil = 0;
    bossOrbitSign = 1;
    lastAimY = 300;

    try {
        while (Date.now() - started < DURATION_MS) {
            const snap = await page.evaluate(() => window.__novawingDebug.getBotSnapshot());
            finalSnap = snap;
            ticks += 1;
            if (snap && snap.score > peakScore) peakScore = snap.score;
            if (snap && snap.weaponLevel > peakWeapon) peakWeapon = snap.weaponLevel;
            if (snap && snap.levelProgressMs > maxProgress) maxProgress = snap.levelProgressMs;
            if (snap && snap.phase === 'boss' && !reachedBoss) {
                reachedBoss = true;
                bossAtMs = snap.elapsedMs || (Date.now() - started);
            }

            if (!snap || !snap.ready) {
                await page.waitForTimeout(TICK_MS);
                continue;
            }

            if (snap.victoryPending) {
                won = true;
                await page.evaluate(() => window.__novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false }));
                // Allow victory panel + name prompt + submit
                await page.waitForTimeout(2500);
                break;
            }

            if (snap.levelEnded) {
                won = false;
                await page.evaluate(() => window.__novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false }));
                await page.waitForTimeout(600);
                break;
            }

            const decision = decide(snap);
            await page.evaluate((input) => {
                window.__novawingDebug.setBotInput(input);
            }, {
                x: decision.x,
                y: decision.y,
                fire: decision.fire,
                boost: decision.boost
            });

            const now = Date.now();
            if (now - lastLog > 2000) {
                const el = snap.elapsedMs != null ? (snap.elapsedMs / 1000).toFixed(1) : ((now - started) / 1000).toFixed(1);
                const bhp = snap.boss && Number.isFinite(snap.boss.health) ? ` hp=${snap.boss.health}` : '';
                console.log(
                    `[bot t${trialIndex}] t=${el}s score=${snap.score} lives=${snap.lives} ` +
                    `wpn=${snap.weaponLevel} sh=${snap.hasShield ? 1 : 0} phase=${snap.phase}${bhp} ${decision.note}`
                );
                lastLog = now;
            }

            if (TRIALS === 1 && ticks % 250 === 0) {
                await page.screenshot({
                    path: path.join(SCREENSHOT_DIR, `tick-${String(ticks).padStart(5, '0')}.png`)
                }).catch(() => {});
            }

            await page.waitForTimeout(TICK_MS);
        }
    } finally {
        await page.evaluate(() => {
            if (window.__novawingDebug && window.__novawingDebug.clearBotInput) {
                window.__novawingDebug.clearBotInput();
            }
        }).catch(() => {});
        if (TRIALS === 1 || won) {
            await page.screenshot({
                path: path.join(SCREENSHOT_DIR, won ? 'win-final.png' : 'final.png'),
                fullPage: true
            }).catch(() => {});
        }
        await context.close();
    }

    let videoPath = null;
    if (RECORD_VIDEO && fs.existsSync(videoDir)) {
        const videos = fs.readdirSync(videoDir)
            .filter(f => f.endsWith('.webm'))
            .map(f => ({ f, m: fs.statSync(path.join(videoDir, f)).mtimeMs }))
            .sort((a, b) => a.m - b.m);
        if (videos.length) {
            const latest = path.join(videoDir, videos[videos.length - 1].f);
            const stable = path.join(SCREENSHOT_DIR, won ? 'win.webm' : 'last-run.webm');
            try {
                fs.copyFileSync(latest, stable);
                videoPath = stable;
            } catch (_) {
                videoPath = latest;
            }
        }
    }

    const elapsedMs = finalSnap && finalSnap.elapsedMs
        ? finalSnap.elapsedMs
        : (Date.now() - started);

    return {
        trial: trialIndex,
        won,
        reachedBoss,
        score: finalSnap ? finalSnap.score : peakScore,
        peakScore,
        peakWeapon,
        lives: finalSnap ? finalSnap.lives : null,
        phase: finalSnap ? finalSnap.phase : null,
        levelEnded: finalSnap ? finalSnap.levelEnded : null,
        victoryPending: finalSnap ? finalSnap.victoryPending : null,
        elapsedMs: Math.round(elapsedMs),
        elapsedSec: Number((elapsedMs / 1000).toFixed(2)),
        bossAtMs: bossAtMs != null ? Math.round(bossAtMs) : null,
        maxProgress: Math.round(maxProgress),
        durationSec: Number(((Date.now() - started) / 1000).toFixed(1)),
        ticks,
        video: videoPath
    };
}

async function main() {
    console.log('NovaWing speed-clear bot');
    console.log(`URL: ${BASE}`);
    console.log(`headless=${HEADLESS} trials=${TRIALS} duration=${DURATION_MS}ms tick=${TICK_MS}ms video=${RECORD_VIDEO}`);

    const launchOptions = {
        headless: HEADLESS,
        slowMo: SLOW_MO,
        args: [
            '--use-gl=swiftshader',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
            '--autoplay-policy=no-user-gesture-required'
        ]
    };
    if (fs.existsSync(CACHED_CHROME)) {
        launchOptions.executablePath = CACHED_CHROME;
    }

    const browser = await chromium.launch(launchOptions);
    const results = [];

    try {
        for (let i = 1; i <= TRIALS; i++) {
            console.log(`\n=== trial ${i}/${TRIALS} ===`);
            const result = await runOnce(browser, i);
            results.push(result);
            console.log(JSON.stringify(result, null, 2));
        }
    } finally {
        await browser.close();
    }

    const wins = results.filter(r => r.won);
    const summary = {
        trials: results.length,
        wins: wins.length,
        winRate: Number((wins.length / results.length).toFixed(3)),
        bestWinSec: wins.length ? Math.min(...wins.map(r => r.elapsedSec)) : null,
        bestWinScore: wins.length ? Math.max(...wins.map(r => r.score)) : null,
        bestAnyScore: Math.max(...results.map(r => r.peakScore)),
        bossReaches: results.filter(r => r.reachedBoss).length,
        results
    };

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    fs.writeFileSync(
        path.join(SCREENSHOT_DIR, 'summary.json'),
        JSON.stringify(summary, null, 2) + '\n'
    );

    console.log('\n======== SUMMARY ========');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Wrote ${path.join(SCREENSHOT_DIR, 'summary.json')}`);

    // Exit 0 if any win (or single trial win); 2 if all losses
    process.exitCode = wins.length ? 0 : 2;
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
