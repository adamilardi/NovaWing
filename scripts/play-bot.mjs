/**
 * NovaWing play-test bot — Playwright pilot for clearing levels reliably.
 *
 * The decision brain runs *inside* the page (rAF loop) so dodge latency is
 * one frame, not a Playwright round-trip. Node only logs and waits for outcome.
 *
 *   npm run bot
 *   npm run bot:campaign
 *   LEVEL=2 npm run bot
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
// Full campaign (L1 + L2) can take ~3–4 minutes with boost; default wide enough.
const DURATION_MS = Number(process.env.DURATION_MS || 360000);
const LOG_MS = Number(process.env.LOG_MS || 2000);
const SLOW_MO = Number(process.env.SLOW_MO || 0);
const TRIALS = Math.max(1, Number(process.env.TRIALS || 1));
const CACHED_CHROME = process.env.PLAYWRIGHT_CHROME ||
    '/home/adam/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const SCREENSHOT_DIR = process.env.BOT_SCREENSHOT_DIR ||
    path.join(__dirname, '..', '.bot-runs');
const RECORD_VIDEO = process.env.RECORD_VIDEO !== '0';

/**
 * In-page pilot. Serialized into the browser; no Node closures.
 * Survival first, then progress (boost), then DPS.
 * SPEEDRUN=1 (or ?speedrun=1) biases toward clear time: more boost, intro-boss DPS.
 */
/** In-page heuristic pilot (also used by scripts/rl/record-demos.mjs). */
export function installInPagePilot() {
    if (window.__novawingPilotInstalled) return true;

    const HOME_X = 100;
    const BOSS_X = 140;
    const VERT_HOME_X = 400;
    const VERT_HOME_Y = 460;
    const VERT_BOSS_Y = 480;
    const LANE_COUNT = 18;
    // Speedrun bias: env injected via page URL or global override before install.
    let SPEEDRUN = false;
    try {
        SPEEDRUN = window.__novawingPilotSpeedrun === true ||
            (typeof location !== 'undefined' &&
                /(?:^|[?&])speedrun=1(?:&|$)/.test(location.search || ''));
    } catch (e) {
        SPEEDRUN = Boolean(window.__novawingPilotSpeedrun);
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function isVertical(snap) {
        return snap && (snap.scrollMode === 'vertical' || snap.combatOrientation === 'up');
    }

    function worldHeight(snap) {
        return (snap.world && snap.world.height) || 600;
    }

    function playBounds(snap) {
        const wh = worldHeight(snap);
        if (isVertical(snap)) {
            if (snap.phase === 'boss' && snap.boss) {
                return {
                    minX: 70,
                    maxX: 730,
                    minY: 280,
                    maxY: 540,
                    wh: wh
                };
            }
            return {
                minX: 60,
                maxX: 740,
                minY: 220,
                maxY: 540,
                wh: wh
            };
        }
        if (snap.phase === 'boss' && snap.boss) {
            const arena = snap.boss.y;
            return {
                minY: clamp(arena - 250, 60, wh - 120),
                maxY: clamp(arena + 250, 120, wh - 60),
                wh: wh
            };
        }
        if (snap.openBands && snap.openBands.length) {
            const tops = snap.openBands.map(function (b) { return b[0]; });
            const bots = snap.openBands.map(function (b) { return b[1]; });
            return {
                minY: Math.min.apply(null, tops) + 40,
                maxY: Math.max.apply(null, bots) - 40,
                wh: wh
            };
        }
        return { minY: 80, maxY: wh - 80, wh: wh };
    }

    function yInOpenBand(y, snap, pad) {
        pad = pad == null ? 30 : pad;
        if (!snap.openBands || !snap.openBands.length) return true;
        return snap.openBands.some(function (b) {
            return y >= b[0] + pad && y <= b[1] - pad;
        });
    }

    function nearestOpenBandY(y, snap) {
        if (!snap.openBands || !snap.openBands.length) return y;
        let best = y;
        let bestDist = Infinity;
        for (let i = 0; i < snap.openBands.length; i++) {
            const top = snap.openBands[i][0];
            const bot = snap.openBands[i][1];
            const center = (top + bot) * 0.5;
            const clamped = clamp(y, top + 40, bot - 40);
            const dist = Math.abs(y - clamped);
            if (dist < bestDist) {
                bestDist = dist;
                best = clamped;
            }
            if (!yInOpenBand(y, snap, 20) && Math.abs(y - center) < bestDist + 8) {
                best = center;
                bestDist = Math.abs(y - center);
            }
        }
        return best;
    }

    function halfSize(entity) {
        return {
            hw: Math.max(6, (entity.w || 40) * 0.5),
            hh: Math.max(6, (entity.h || 40) * 0.5)
        };
    }

    function timeToCollision(px, py, pw, ph, threat, horizon) {
        horizon = horizon == null ? 2.6 : horizon;
        const hs = halfSize(threat);
        const needX = pw + hs.hw + 8;
        const needY = ph + hs.hh + 10;
        const dx0 = threat.x - px;
        const dy0 = threat.y - py;
        const vx = threat.vx || 0;
        const vy = threat.vy || 0;

        if (Math.abs(dx0) <= needX && Math.abs(dy0) <= needY) return 0;

        let tEnter = 0;
        let tExit = horizon;

        if (vx === 0) {
            if (Math.abs(dx0) > needX) return Infinity;
        } else {
            const t1 = (-needX - dx0) / vx;
            const t2 = (needX - dx0) / vx;
            tEnter = Math.max(tEnter, Math.min(t1, t2));
            tExit = Math.min(tExit, Math.max(t1, t2));
        }

        if (vy === 0) {
            if (Math.abs(dy0) > needY) return Infinity;
        } else {
            const t1 = (-needY - dy0) / vy;
            const t2 = (needY - dy0) / vy;
            tEnter = Math.max(tEnter, Math.min(t1, t2));
            tExit = Math.min(tExit, Math.max(t1, t2));
        }

        if (tEnter > tExit || tExit < 0 || tEnter > horizon) return Infinity;
        return Math.max(0, tEnter);
    }

    function allThreats(snap) {
        const out = [];
        const enemies = snap.enemies || [];
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            out.push(Object.assign({}, e, {
                kind: 'enemy',
                h: (e.h || 36) * (e.type === 'interceptor' ? 1.3 : 1)
            }));
        }
        const obstacles = snap.obstacles || [];
        for (let i = 0; i < obstacles.length; i++) {
            out.push(Object.assign({}, obstacles[i], { kind: 'obstacle' }));
        }
        const bullets = snap.enemyBullets || [];
        const vertical = isVertical(snap);
        for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i];
            if (b.isLaser) {
                // Horizontal bosses: full-width Y lanes. Vertical L3: tall X strips.
                if (vertical) {
                    out.push(Object.assign({}, b, {
                        kind: 'laser',
                        w: Math.max(20, b.w || 28),
                        h: Math.max(200, b.h || 580)
                    }));
                } else {
                    out.push(Object.assign({}, b, {
                        kind: 'laser',
                        w: 800,
                        h: Math.max(30, b.h || 24)
                    }));
                }
            } else {
                out.push(Object.assign({}, b, {
                    kind: 'bullet',
                    w: b.w || 16,
                    h: b.h || 12
                }));
            }
        }
        const walls = snap.walls || [];
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            out.push(Object.assign({}, w, {
                kind: 'wall',
                w: (w.w || 96) + 14,
                h: (w.h || 40) + 12
            }));
        }
        if (snap.boss && snap.boss.active !== false) {
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

    function powerupValue(pu, snap) {
        const lives = snap.lives || 0;
        const low = lives <= 1;
        if (pu.type === 'repair' && lives <= 2) return low ? 100 : 72;
        if (pu.type === 'shield' && !snap.hasShield) return low ? 90 : 48;
        if (pu.type === 'weapon' && snap.weaponLevel < 3) {
            return low ? 36 : (58 - snap.weaponLevel * 8);
        }
        if (pu.type === 'boost' && snap.boostEnergy < 65) return low ? 12 : 38;
        if (pu.type === 'bomb') return 10;
        return 4;
    }

    function scoreLane(y, x, snap, threats) {
        const p = snap.player;
        const pw = (p.w || 48) * 0.48;
        const ph = (p.h || 28) * 0.48;
        const bounds = playBounds(snap);
        let score = 0;
        let minTtc = Infinity;

        if (snap.openBands && snap.openBands.length && !yInOpenBand(y, snap, 24)) {
            score += 1100;
            score += Math.abs(y - nearestOpenBandY(y, snap)) * 3;
        }

        const vertical = isVertical(snap);
        for (let i = 0; i < threats.length; i++) {
            const t = threats[i];
            if (vertical) {
                // Top-down: threats approach mainly on +Y (from above) / nearby X.
                if (t.kind !== 'laser' && t.kind !== 'wall' && t.kind !== 'boss') {
                    // Already below ship and not closing upward.
                    if (t.y > y + 40 && (t.vy || 0) >= -10) continue;
                    // Far above playfield.
                    if (t.y < y - 720) continue;
                    // Far lateral with little X velocity.
                    if (Math.abs((t.x || 0) - x) > 280 && Math.abs(t.vx || 0) < 40) continue;
                }
            } else {
                if (t.x < x - 50 && (t.vx || 0) <= 0 && t.kind !== 'laser' && t.kind !== 'wall') continue;
                if (t.x > x + 700 && t.kind !== 'wall') continue;
            }

            const expanded = Object.assign({}, t);
            if (t.kind === 'enemy' && t.type === 'interceptor') expanded.h = (t.h || 36) + 48;
            if (t.kind === 'bullet') {
                expanded.w = (t.w || 16) + 8;
                expanded.h = (t.h || 12) + 18;
            }
            if (t.kind === 'wall') {
                expanded.w = (t.w || 96) + 18;
                expanded.h = (t.h || 40) + 16;
            }

            const ttc = timeToCollision(x, y, pw, ph, expanded, 2.6);
            if (ttc < Infinity) {
                minTtc = Math.min(minTtc, ttc);
                if (ttc < 0.07) score += 1600;
                else if (ttc < 0.14) score += 700;
                else if (ttc < 0.25) score += 360;
                else if (ttc < 0.4) score += 190;
                else if (ttc < 0.7) score += 85;
                else if (ttc < 1.1) score += 34;
                else score += 12;

                if (t.kind === 'laser') score += 240 / (0.08 + ttc);
                if (t.kind === 'bullet') score += 110 / (0.12 + ttc);
                if (t.kind === 'obstacle') score += 60 / (0.18 + ttc);
                if (t.kind === 'enemy') score += 38 / (0.2 + ttc);
                if (t.kind === 'wall') score += 160 / (0.1 + ttc);
                if (t.kind === 'boss') score += 80 / (0.18 + ttc);
            } else if (t.kind === 'wall') {
                const dy = Math.abs(t.y - y);
                const dx = t.x - x;
                const sepX = pw + (t.w || 96) * 0.5 + 18;
                if (Math.abs(dx) < sepX) {
                    const overlapY = (ph + (t.h || 40) * 0.5 + 14) - dy;
                    if (overlapY > 0) score += overlapY * 10;
                }
            }
        }

        if (minTtc < Infinity) score -= Math.min(minTtc, 2) * 40;
        else score -= 100;

        if (vertical) {
            // Penalize sitting in a dive / riser column even when TTC is still long.
            let column = 0;
            for (let i = 0; i < threats.length; i++) {
                const t = threats[i];
                if (t.kind !== 'enemy' && t.kind !== 'bullet' && t.kind !== 'obstacle') continue;
                if (Math.abs((t.x || 0) - x) > 46) continue;
                const closingDown = t.y < y - 20 && (t.vy || 0) > 8;
                const closingUp = t.y > y + 20 && (t.vy || 0) < -8;
                if (closingDown || closingUp) column += t.kind === 'bullet' ? 1.4 : 1;
            }
            score += column * 55;
        }

        // Prefer corridor centers in canyon levels (strong).
        if (snap.openBands && snap.openBands.length) {
            const preferred = preferredOpenBands(snap) || snap.openBands;
            let bestCenterDist = Infinity;
            for (let i = 0; i < preferred.length; i++) {
                const c = (preferred[i][0] + preferred[i][1]) * 0.5;
                bestCenterDist = Math.min(bestCenterDist, Math.abs(y - c));
            }
            score += bestCenterDist * 0.35;
            // Soft penalty for leaving the preferred band entirely.
            const inPref = preferred.some(function (b) {
                return y >= b[0] + 45 && y <= b[1] - 45;
            });
            if (!inPref) score += 180;
        } else if (vertical) {
            // Stay in the aft pocket (bottom of screen), not mid-field into dives.
            const homeY = snap.phase === 'boss' ? VERT_BOSS_Y : VERT_HOME_Y;
            score += Math.abs(y - homeY) * 0.22;
        } else if ((snap.weaponLevel || 1) < 2) {
            // Early game: stay mid-screen, avoid top/bottom death traps.
            score += Math.abs(y - 300) * 0.25;
        }

        const puGate = (snap.lives || 0) <= 1 ? 0.32 : 0.4;
        if (minTtc > puGate) {
            const powerups = snap.powerups || [];
            for (let i = 0; i < powerups.length; i++) {
                const pu = powerups[i];
                const value = powerupValue(pu, snap);
                if (vertical) {
                    if (pu.y > y + 80 || pu.y < y - 560) continue;
                    if (Math.abs(pu.x - x) > 240) continue;
                    const ddy = Math.abs(pu.y - y);
                    const ddx = Math.abs(pu.x - x);
                    score -= value * clamp(1 - ddy / 420, 0, 1) * clamp(1 - ddx / 240, 0.35, 1);
                    continue;
                }
                if (pu.x < x - 20 || pu.x > x + 500) continue;
                if (snap.openBands && snap.openBands.length && !yInOpenBand(pu.y, snap, 14)) continue;
                const dy = Math.abs(pu.y - y);
                if (dy > 110) continue;
                score -= value * clamp(1 - dy / 110, 0, 1) * clamp(1 - (pu.x - x) / 500, 0.35, 1);
            }
        }

        if (minTtc > 0.5 && snap.phase === 'waves' && (snap.lives || 0) >= 2 && snap.weaponLevel >= 2) {
            const enemies = snap.enemies || [];
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (e.type === 'splitter' || (e.health || 1) >= 8) continue;
                if (vertical) {
                    if (e.y > y - 10 || e.y < y - 500) continue;
                    const dxe = Math.abs(e.x - x);
                    if (dxe < 26) score -= 10 * clamp(1 - (y - e.y) / 500, 0.2, 1);
                    continue;
                }
                if (e.x < x + 20 || e.x > x + 480) continue;
                const dy = Math.abs(e.y - y);
                if (dy < 26) score -= 10 * clamp(1 - (e.x - x) / 480, 0.2, 1);
            }
        }

        if (snap.phase === 'boss' && snap.boss) {
            const b = snap.boss;
            if (vertical) {
                const bodyHalf = (b.h || 150) * 0.22;
                if (y < b.y + bodyHalf + 50) score += (b.y + bodyHalf + 50 - y) * 2.2;
                score += Math.abs(x - b.x) * 0.12;
            } else {
                const bodyHalf = (b.h || 150) * 0.22;
                if (Math.abs(y - b.y) < bodyHalf + 20) score += 150;
                const trackW = (snap.lives || 0) <= 1 ? 0.22 : 0.48;
                score += Math.abs(y - b.y) * trackW;
            }
        }

        if (y < bounds.minY) score += (bounds.minY - y) * 1.6;
        if (y > bounds.maxY) score += (y - bounds.maxY) * 1.6;
        score += Math.abs(y - p.y) * 0.03;

        return { score: score, minTtc: minTtc };
    }

    /** Prefer the band that already contains the player, else the widest corridor. */
    function preferredOpenBands(snap) {
        if (!snap.openBands || !snap.openBands.length) return null;
        const p = snap.player;
        if (p) {
            for (let i = 0; i < snap.openBands.length; i++) {
                const b = snap.openBands[i];
                if (p.y >= b[0] + 20 && p.y <= b[1] - 20) return [b];
            }
        }
        // Widest band first (safest for canyon travel).
        let best = snap.openBands[0];
        let bestW = best[1] - best[0];
        for (let i = 1; i < snap.openBands.length; i++) {
            const w = snap.openBands[i][1] - snap.openBands[i][0];
            if (w > bestW) {
                best = snap.openBands[i];
                bestW = w;
            }
        }
        return [best];
    }

    function laneYs(snap) {
        const bounds = playBounds(snap);
        const ys = [];
        const bands = preferredOpenBands(snap) || snap.openBands;
        if (bands && bands.length) {
            for (let i = 0; i < bands.length; i++) {
                // Stay well inside walls — pad more aggressively than playBounds.
                const top = bands[i][0] + 50;
                const bot = bands[i][1] - 50;
                if (bot <= top) {
                    ys.push((bands[i][0] + bands[i][1]) * 0.5);
                    continue;
                }
                const mid = (top + bot) * 0.5;
                // Heavy center bias — canyon walls punish edge hugging.
                ys.push(mid, mid, mid - 28, mid + 28, mid - 55, mid + 55);
                const steps = Math.max(2, Math.round((bot - top) / 40));
                for (let s = 0; s <= steps; s++) {
                    ys.push(top + (bot - top) * (s / steps));
                }
            }
        } else {
            // Early weapon: stick near screen center; later sample full height.
            const early = (snap.weaponLevel || 1) < 2;
            const lo = early ? 180 : bounds.minY;
            const hi = early ? 420 : bounds.maxY;
            for (let i = 0; i < LANE_COUNT; i++) {
                ys.push(lo + (hi - lo) * (i / (LANE_COUNT - 1)));
            }
            ys.push(300, 280, 320);
        }
        if (snap.player) {
            const py = snap.player.y;
            ys.push(py, py - 24, py + 24, py - 48, py + 48);
        }
        return ys.map(function (y) { return clamp(y, 50, bounds.wh - 50); });
    }

    function pickTarget(snap) {
        const p = snap.player;
        const threats = allThreats(snap);
        const bounds = playBounds(snap);

        // --- Vertical / top-down (L3 after flip) ---
        if (isVertical(snap)) {
            const homeX = VERT_HOME_X;
            const homeY = snap.phase === 'boss' ? VERT_BOSS_Y : VERT_HOME_Y;
            const xs = [];
            const ys = [];
            for (let d = -220; d <= 220; d += 28) {
                xs.push(clamp(homeX + d, bounds.minX, bounds.maxX));
            }
            xs.push(
                p.x,
                clamp(p.x - 40, bounds.minX, bounds.maxX),
                clamp(p.x + 40, bounds.minX, bounds.maxX),
                300, 500, 250, 550
            );
            for (let d = -80; d <= 40; d += 20) {
                ys.push(clamp(homeY + d, bounds.minY, bounds.maxY));
            }
            ys.push(homeY, homeY - 30, homeY - 60, homeY + 20, p.y);
            const incoming = snap.enemies || [];
            for (let i = 0; i < incoming.length; i++) {
                const e = incoming[i];
                if (e.y < p.y + 40 && e.y > p.y - 520) {
                    xs.push(clamp(e.x, bounds.minX, bounds.maxX));
                }
            }
            if (snap.phase === 'boss' && snap.boss) {
                // Stay under boss; strafe on X with boss weave.
                for (let d = -200; d <= 200; d += 25) {
                    xs.push(clamp(snap.boss.x + d, bounds.minX, bounds.maxX));
                }
            }
            const powerups = snap.powerups || [];
            for (let i = 0; i < powerups.length; i++) {
                const pu = powerups[i];
                if (pu.y < p.y + 80 && pu.y > 40) {
                    xs.push(clamp(pu.x, bounds.minX, bounds.maxX));
                    ys.push(clamp(pu.y + 40, bounds.minY, bounds.maxY));
                }
            }
            let best = { x: homeX, y: homeY, score: Infinity, minTtc: 0 };
            for (let yi = 0; yi < ys.length; yi++) {
                for (let xi = 0; xi < xs.length; xi++) {
                    const y = clamp(ys[yi], bounds.minY, bounds.maxY);
                    const x = clamp(xs[xi], bounds.minX, bounds.maxX);
                    const result = scoreLane(y, x, snap, threats);
                    // Prefer the aft pocket; do not glue to screen center (riser columns).
                    let total = result.score + Math.abs(y - homeY) * 0.08 + Math.abs(x - homeX) * 0.012;
                    if (snap.phase === 'boss' && snap.boss) {
                        total += Math.abs(x - snap.boss.x) * 0.02;
                    }
                    if (total < best.score) {
                        best = { x: x, y: y, score: total, minTtc: result.minTtc };
                    }
                }
            }
            return best;
        }

        // --- Horizontal (L1/L2 / intro) ---
        const ys = laneYs(snap);
        ys.push(p.y);

        if (snap.phase === 'boss' && snap.boss) {
            for (let d = -170; d <= 170; d += 17) {
                ys.push(clamp(snap.boss.y + d, bounds.minY, bounds.maxY));
            }
        }

        const powerups = snap.powerups || [];
        for (let i = 0; i < powerups.length; i++) {
            const pu = powerups[i];
            if (pu.x > p.x - 30 && pu.x < p.x + 460) {
                if (!snap.openBands || yInOpenBand(pu.y, snap, 12)) ys.push(pu.y);
            }
        }

        const fragile = (snap.lives || 0) <= 1 && !snap.hasShield;
        const homeX = snap.phase === 'boss' ? BOSS_X : HOME_X;
        let xOptions;
        if (snap.phase === 'boss') {
            xOptions = fragile
                ? [homeX - 25, homeX - 8, homeX, 110]
                : [homeX, homeX - 15, homeX + 15, Math.min(185, p.x + 6)];
        } else {
            xOptions = [HOME_X, HOME_X + 12, HOME_X + 24, Math.max(72, p.x - 6)];
        }

        let best = { x: homeX, y: p.y, score: Infinity, minTtc: 0 };
        for (let yi = 0; yi < ys.length; yi++) {
            for (let xi = 0; xi < xOptions.length; xi++) {
                const y = ys[yi];
                const x = xOptions[xi];
                const result = scoreLane(y, x, snap, threats);
                const total = result.score + Math.abs(x - homeX) * 0.04;
                if (total < best.score) {
                    best = { x: x, y: y, score: total, minTtc: result.minTtc };
                }
            }
        }
        if (snap.openBands && snap.openBands.length && !yInOpenBand(best.y, snap, 20)) {
            best.y = nearestOpenBandY(best.y, snap);
        }
        return best;
    }

    function currentThreat(snap) {
        const p = snap.player;
        if (!p) return { ttc: Infinity, dodgeDir: 0, bullets: 0, kind: null };
        const pw = (p.w || 48) * 0.48;
        const ph = (p.h || 28) * 0.48;
        const threats = allThreats(snap);
        const vertical = isVertical(snap);
        let minTtc = Infinity;
        let dodgeDir = 0;
        let bullets = 0;
        let kind = null;

        for (let i = 0; i < threats.length; i++) {
            const t = threats[i];
            if (t.kind === 'bullet' || t.kind === 'laser') bullets += 1;
            const expanded = Object.assign({}, t);
            if (t.kind === 'bullet') {
                expanded.w = (t.w || 16) + 14;
                expanded.h = (t.h || 12) + 24;
            }
            if (t.kind === 'laser') {
                if (vertical) expanded.w = (t.w || 28) + 28;
                else expanded.h = (t.h || 28) + 28;
            }
            if (t.kind === 'wall') {
                expanded.w = (t.w || 96) + 12;
                expanded.h = (t.h || 40) + 14;
            }
            const ttc = timeToCollision(p.x, p.y, pw, ph, expanded, 2.4);
            if (ttc < minTtc) {
                minTtc = ttc;
                kind = t.kind;
                if (t.kind === 'laser' || t.kind === 'bullet' || t.kind === 'enemy' || t.kind === 'wall') {
                    if (vertical) {
                        const predX = t.x + (t.vx || 0) * Math.min(ttc, 0.35);
                        dodgeDir = predX >= p.x ? -1 : 1;
                    } else {
                        const predY = t.y + (t.vy || 0) * Math.min(ttc, 0.35);
                        dodgeDir = predY >= p.y ? -1 : 1;
                    }
                }
            }
        }

        const bulletsList = snap.enemyBullets || [];
        for (let i = 0; i < bulletsList.length; i++) {
            const b = bulletsList[i];
            if (b.isLaser) {
                if (vertical) {
                    // Vertical lasers are X strips.
                    if (Math.abs(b.x - p.x) < 54) {
                        minTtc = Math.min(minTtc, 0.04);
                        dodgeDir = b.x >= p.x ? -1 : 1; // used as X dodge via state
                        kind = 'laser';
                    }
                } else if (Math.abs(b.y - p.y) < 54) {
                    minTtc = Math.min(minTtc, 0.04);
                    dodgeDir = b.y >= p.y ? -1 : 1;
                    kind = 'laser';
                }
                continue;
            }
            if (vertical) {
                const vy = b.vy || 0;
                const fromAbove = b.y < p.y - 8 && vy > 20;
                const fromBelow = b.y > p.y + 8 && vy < -20;
                if (!fromAbove && !fromBelow) continue;
                if (fromAbove && b.y < p.y - 560) continue;
                if (fromBelow && b.y > p.y + 280) continue;
                const tHit = (p.y - b.y) / vy;
                if (tHit < 0 || tHit > 0.95) continue;
                const predX = b.x + (b.vx || 0) * tHit;
                if (Math.abs(predX - p.x) < 52 && tHit < minTtc) {
                    minTtc = tHit;
                    dodgeDir = predX >= p.x ? -1 : 1;
                    kind = 'bullet';
                }
                continue;
            }
            const vx = b.vx || -380;
            if (vx >= -20) continue;
            if (b.x < p.x - 30 || b.x > p.x + 480) continue;
            const tHit = (b.x - p.x) / -vx;
            if (tHit < 0 || tHit > 0.95) continue;
            const predY = b.y + (b.vy || 0) * tHit;
            if (Math.abs(predY - p.y) < 52 && tHit < minTtc) {
                minTtc = tHit;
                dodgeDir = predY >= p.y ? -1 : 1;
                kind = 'bullet';
            }
        }

        if (snap.openBands && snap.openBands.length && !yInOpenBand(p.y, snap, 26)) {
            const target = nearestOpenBandY(p.y, snap);
            dodgeDir = target >= p.y ? 1 : -1;
            minTtc = Math.min(minTtc, 0.1);
            kind = kind || 'wall';
        }

        return { ttc: minTtc, dodgeDir: dodgeDir, bullets: bullets, kind: kind };
    }

    const state = {
        bossOrbitSign: 1,
        bossWeaveUntil: 0,
        lastAimY: 300,
        holdDodgeDir: 0,
        holdDodgeUntil: 0,
        safeY: 300
    };

    /**
     * Classic shmup gap-finder: pick the Y with max clearance from predicted
     * bullet / laser / boss-body occupancy in the next ~0.7s.
     */
    function safestBossY(snap, preferY) {
        const p = snap.player;
        const bounds = playBounds(snap);
        const bullets = snap.enemyBullets || [];
        const samples = [];
        for (let y = bounds.minY; y <= bounds.maxY; y += 14) samples.push(y);
        samples.push(preferY, p.y, state.safeY);
        if (snap.boss) {
            samples.push(snap.boss.y, snap.boss.y - 90, snap.boss.y + 90);
        }

        let bestY = preferY;
        let bestScore = -Infinity;

        for (let si = 0; si < samples.length; si++) {
            const y = clamp(samples[si], bounds.minY, bounds.maxY);
            let score = 0;
            // Prefer near boss for DPS, but weakly.
            if (snap.boss) score -= Math.abs(y - snap.boss.y) * 0.15;
            score -= Math.abs(y - p.y) * 0.05;
            score -= Math.abs(y - preferY) * 0.08;

            // Soft boss body
            if (snap.boss) {
                const bodyHalf = (snap.boss.h || 150) * 0.24;
                const bodyDist = Math.abs(y - snap.boss.y);
                if (bodyDist < bodyHalf + 16) score -= (bodyHalf + 16 - bodyDist) * 6;
            }

            for (let i = 0; i < bullets.length; i++) {
                const b = bullets[i];
                if (b.isLaser) {
                    const dy = Math.abs(b.y - y);
                    if (dy < 40) score -= (40 - dy) * 14;
                    continue;
                }
                const vx = b.vx || -380;
                if (vx >= -10) continue;
                // Only care about bullets that will cross our X soon.
                if (b.x < p.x - 40 || b.x > p.x + 520) continue;
                const tHit = (b.x - p.x) / -vx;
                if (tHit < 0 || tHit > 0.85) continue;
                const predY = b.y + (b.vy || 0) * tHit;
                const miss = Math.abs(predY - y);
                if (miss < 48) {
                    const urgency = 1 / (0.08 + tHit);
                    score -= (48 - miss) * urgency * 1.6;
                } else if (miss < 80) {
                    score -= (80 - miss) * 0.15;
                }
            }

            // Edge soft penalty
            const edge = Math.min(y - bounds.minY, bounds.maxY - y);
            if (edge < 35) score -= (35 - edge) * 0.8;

            if (score > bestScore) {
                bestScore = score;
                bestY = y;
            }
        }
        return bestY;
    }

    /**
     * Vertical-boss gap finder: pick the X with max clearance from incoming
     * dive bullets / vertical laser strips.
     */
    function safestBossX(snap, preferX) {
        const p = snap.player;
        const bounds = playBounds(snap);
        const bullets = snap.enemyBullets || [];
        const samples = [];
        for (let x = bounds.minX; x <= bounds.maxX; x += 16) samples.push(x);
        samples.push(preferX, p.x);
        if (snap.boss) {
            samples.push(snap.boss.x, snap.boss.x - 80, snap.boss.x + 80);
        }

        let bestX = preferX;
        let bestScore = -Infinity;

        for (let si = 0; si < samples.length; si++) {
            const x = clamp(samples[si], bounds.minX, bounds.maxX);
            let score = 0;
            if (snap.boss) score -= Math.abs(x - snap.boss.x) * 0.15;
            score -= Math.abs(x - p.x) * 0.05;
            score -= Math.abs(x - preferX) * 0.08;

            if (snap.boss) {
                const bodyHalf = (snap.boss.w || 220) * 0.22;
                const bodyDist = Math.abs(x - snap.boss.x);
                if (bodyDist < bodyHalf + 16) score -= (bodyHalf + 16 - bodyDist) * 6;
            }

            for (let i = 0; i < bullets.length; i++) {
                const b = bullets[i];
                if (b.isLaser) {
                    const dx = Math.abs(b.x - x);
                    if (dx < 40) score -= (40 - dx) * 14;
                    continue;
                }
                const vy = b.vy || 380;
                if (vy <= 20) continue;
                if (b.y > p.y + 30 || b.y < p.y - 560) continue;
                const tHit = (p.y - b.y) / vy;
                if (tHit < 0 || tHit > 0.85) continue;
                const predX = b.x + (b.vx || 0) * tHit;
                const miss = Math.abs(predX - x);
                if (miss < 48) {
                    const urgency = 1 / (0.08 + tHit);
                    score -= (48 - miss) * urgency * 1.6;
                } else if (miss < 80) {
                    score -= (80 - miss) * 0.15;
                }
            }

            const edge = Math.min(x - bounds.minX, bounds.maxX - x);
            if (edge < 35) score -= (35 - edge) * 0.8;

            if (score > bestScore) {
                bestScore = score;
                bestX = x;
            }
        }
        return bestX;
    }

    function decide(snap) {
        if (!snap || !snap.ready || !snap.player || snap.levelEnded || snap.victoryPending) {
            return { x: 0, y: 0, fire: false, boost: false, note: 'idle' };
        }
        if (snap.levelTransitioning) {
            return { x: 0, y: 0, fire: true, boost: false, note: 'transition' };
        }

        const p = snap.player;
        let target = pickTarget(snap);
        // Canyon: hard-bias toward the preferred corridor center so we do not
        // scrape oncoming wall faces (the only wall contact that costs a life).
        if (snap.openBands && snap.openBands.length && snap.phase === 'waves') {
            const pref = preferredOpenBands(snap) || snap.openBands;
            const band = pref[0];
            const center = (band[0] + band[1]) * 0.5;
            const safeTop = band[0] + 55;
            const safeBot = band[1] - 55;
            if (target.y < safeTop || target.y > safeBot) {
                target = Object.assign({}, target, { y: clamp(target.y, safeTop, safeBot) });
            }
            // If outside the band entirely, abandon combat aim and return home.
            if (p.y < band[0] + 30 || p.y > band[1] - 30) {
                target = Object.assign({}, target, { y: center, x: Math.min(target.x, HOME_X + 10) });
            }
        }
        const here = currentThreat(snap);
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const ttc = Math.min(target.minTtc, here.ttc);
        const now = snap.time || performance.now();
        const invuln = snap.playerInvulnerableUntil && now < snap.playerInvulnerableUntil;
        const lowLives = (snap.lives || 0) <= 1 && !snap.hasShield;
        const bounds = playBounds(snap);

        let ax = 0;
        let ay = 0;
        if (dx < -6) ax = -1;
        else if (dx > 10) ax = 1;
        if (dy < -5) ay = -1;
        else if (dy > 5) ay = 1;

        // Commit to a dodge direction briefly to avoid thrashing.
        if (isVertical(snap)) {
            // In vertical mode dodgeDir is primarily an X-axis escape.
            if (here.ttc < 0.5 && here.dodgeDir !== 0) {
                if (now > state.holdDodgeUntil || state.holdDodgeDir === 0) {
                    state.holdDodgeDir = here.dodgeDir;
                    state.holdDodgeUntil = now + (here.kind === 'laser' ? 240 : 160);
                }
                ax = state.holdDodgeDir;
                if (here.ttc < 0.28 && p.y < 500) ay = 1; // drop back
            } else if (ttc < 0.24 && Math.abs(dx) > 2) {
                ax = dx < 0 ? -1 : 1;
            } else if (ttc > 0.7 && snap.phase === 'waves' && Math.abs(p.x - 400) < 36) {
                // Don't camp the 400 column — riser/V waves own it.
                ax = p.x >= 400 ? 1 : -1;
            }
        } else if (here.ttc < 0.5 && here.dodgeDir !== 0) {
            if (now > state.holdDodgeUntil || state.holdDodgeDir === 0) {
                state.holdDodgeDir = here.dodgeDir;
                state.holdDodgeUntil = now + (here.kind === 'laser' ? 240 : 160);
            }
            ay = state.holdDodgeDir;
            if (here.ttc < 0.3 && p.x > 72) ax = -1;
            if (here.kind === 'laser' || here.kind === 'wall') {
                ay = state.holdDodgeDir;
                if (p.x > 68) ax = -1;
            }
        } else if (ttc < 0.24 && Math.abs(dy) > 2) {
            ay = dy < 0 ? -1 : 1;
            if (p.x > 82) ax = -1;
        }

        const isIntroBoss = snap.segment === 'introBoss' ||
            (snap.boss && snap.boss.encounter === 'intro');
        const isFinalBoss = snap.segment === 'finalBoss' ||
            (snap.boss && snap.boss.encounter === 'final');
        const openSpace = !snap.openBands || !snap.openBands.length;

        if (snap.phase === 'boss' && snap.boss && isVertical(snap)) {
            const b = snap.boss;
            const hp = Number.isFinite(b.health) ? b.health : 240;
            const pressured = here.ttc < 0.7 || here.bullets >= 2;
            // Final BH fight: wider orbit; intro-style vertical: sit under and dump.
            const orbitR = isFinalBoss
                ? (lowLives || hp < 100 ? 110 : 70)
                : (lowLives || hp < 100 ? 90 : 40);
            const preferX = clamp(
                b.x + state.bossOrbitSign * orbitR,
                bounds.minX + 12,
                bounds.maxX - 12
            );
            if (now > state.bossWeaveUntil) {
                state.bossOrbitSign *= -1;
                state.bossWeaveUntil = now + (pressured ? 360 : 520);
            }
            if (p.x <= bounds.minX + 30) state.bossOrbitSign = 1;
            if (p.x >= bounds.maxX - 30) state.bossOrbitSign = -1;

            const safeX = safestBossX(snap, preferX);
            const errX = safeX - p.x;
            if (Math.abs(errX) > 10) ax = errX > 0 ? 1 : -1;
            else ax = 0;
            // Hold low for DPS window; climb slightly when safe.
            const preferY = VERT_BOSS_Y;
            const errY = preferY - p.y;
            if (Math.abs(errY) > 12) ay = errY > 0 ? 1 : -1;
            else ay = 0;
            if (here.ttc < 0.4 && here.dodgeDir !== 0) ax = here.dodgeDir;
            if (here.ttc < 0.28) ay = 1;

            // Black-hole arena: stay outside danger radius, never enter kill radius.
            const bh = snap.blackHole || {};
            if (bh.active && bh.config && p) {
                const cfg = bh.config;
                const ax0 = cfg.x != null ? cfg.x : 400;
                const ay0 = cfg.y != null ? cfg.y : 260;
                const dxBh = p.x - ax0;
                const dyBh = p.y - ay0;
                const dist = Math.sqrt(dxBh * dxBh + dyBh * dyBh) || 0.001;
                const dangerR = (cfg.dangerRadius != null ? cfg.dangerRadius : 48) + 28;
                const killR = (cfg.killRadius != null ? cfg.killRadius : 28) + 36;
                if (dist < killR) {
                    // Emergency spit-out direction
                    ax = dxBh / dist > 0 ? 1 : -1;
                    ay = dyBh / dist > 0 ? 1 : -1;
                } else if (dist < dangerR) {
                    ax = dxBh / dist > 0 ? 1 : -1;
                    if (p.y < ay0 + dangerR + 40) ay = 1;
                }
            }
        } else if (snap.phase === 'boss' && snap.boss) {
            const b = snap.boss;
            const hp = Number.isFinite(b.health) ? b.health : 240;
            const pressured = here.ttc < 0.7 || here.bullets >= 2;
            // Intro boss (L3): track tighter for faster escape threshold.
            const orbitAmp = isIntroBoss
                ? (SPEEDRUN ? 18 : 28)
                : (lowLives || hp < 100 ? 70 : 28);
            const preferY = clamp(
                b.y + state.bossOrbitSign * orbitAmp,
                bounds.minY + 12,
                bounds.maxY - 12
            );

            if (now > state.bossWeaveUntil) {
                state.bossOrbitSign *= -1;
                state.bossWeaveUntil = now + (pressured ? 360 : (isIntroBoss && SPEEDRUN ? 280 : 520));
            }
            if (p.y <= bounds.minY + 20) state.bossOrbitSign = 1;
            if (p.y >= bounds.maxY - 20) state.bossOrbitSign = -1;

            // Always recompute a clearance-based aim Y during boss.
            const safeY = safestBossY(snap, preferY);
            state.safeY = safeY;
            state.lastAimY = safeY;

            if (invuln && here.ttc > 0.4) {
                // Use i-frames to re-center for DPS.
                const err = b.y - p.y;
                ay = Math.abs(err) > 12 ? (err > 0 ? 1 : -1) : 0;
            } else if (isIntroBoss && SPEEDRUN && here.ttc > 0.45) {
                // Speedrun intro: stick closer to boss Y for DPS to force escape.
                const err = b.y - p.y;
                if (Math.abs(err) > 10) ay = err > 0 ? 1 : -1;
                else ay = 0;
            } else {
                const err = safeY - p.y;
                if (Math.abs(err) > 8) ay = err > 0 ? 1 : -1;
                else ay = 0;
            }

            // Immediate laser/bullet override still wins.
            if (here.ttc < 0.4 && here.dodgeDir !== 0) {
                ay = here.dodgeDir;
            }

            // Park left for reaction time; intro speedrun sits closer for DPS.
            const endgame = hp < 80 || here.bullets >= 5;
            let preferX = (lowLives || endgame || b.x < 520) ? 98 : 130;
            if (isIntroBoss && SPEEDRUN && !lowLives) preferX = 150;
            if (p.x < preferX - 10) ax = 0.5;
            else if (p.x > preferX + 18) ax = -1;
            else ax = 0;
            if (here.ttc < 0.32 && p.x > 78) ax = -1;

            // Don't over-weave into edges during bullet storms.
            if (endgame && (p.y < bounds.minY + 40 || p.y > bounds.maxY - 40)) {
                ay = p.y < b.y ? 1 : -1;
            }
        }

        // Boost: survival first; SPEEDRUN biases clear-time progress multiplier.
        let boost = false;
        const energy = snap.boostEnergy || 0;
        if (!snap.boostLocked && energy > 5) {
            if (snap.phase === 'waves') {
                const early = snap.weaponLevel < 2;
                const corridorTight = snap.openBands && snap.openBands.length === 1;
                let safeTtc = early ? 0.75 : (lowLives ? 0.45 : 0.26);
                if (corridorTight) safeTtc += 0.12;
                if (SPEEDRUN && openSpace) safeTtc *= 0.72;
                if (SPEEDRUN && isVertical(snap)) safeTtc = Math.min(safeTtc, 0.32);
                const prog = snap.levelProgressMs || 0;
                const dur = snap.levelDurationMs || 60000;
                const late = prog > dur * 0.88;
                const mid = prog > dur * 0.35;

                if (!early && (ttc > safeTtc || invuln)) boost = true;
                else if (early && late && ttc > 0.6) boost = true;
                else if (!early && !lowLives && energy > 60 && ttc > 0.22) boost = true;
                else if (late && energy > 10 && ttc > 0.24) boost = true;
                // Speedrun: open space can boost earlier (progress clock is free time).
                else if (SPEEDRUN && openSpace && early && energy > 35 && ttc > 0.55) boost = true;
                else if (SPEEDRUN && openSpace && mid && energy > 20 && ttc > 0.28) boost = true;
                else if (SPEEDRUN && isVertical(snap) && energy > 25 && ttc > 0.35 && !lowLives) boost = true;

                if (here.kind === 'wall' && here.ttc < 0.55) boost = false;
                if (here.ttc < 0.2) boost = false;
                // Never boost while vertically off-corridor (rams the next wall column).
                if (snap.openBands && snap.openBands.length && !yInOpenBand(p.y, snap, 40)) {
                    boost = false;
                }
            } else if (snap.phase === 'boss') {
                // Boss: boost mainly for emergency repositioning; intro DPS press.
                if (here.ttc < 0.4) boost = true;
                else if (Math.abs(p.y - state.safeY) > 70 && energy > 25 && here.ttc > 0.35) boost = true;
                else if (isIntroBoss && SPEEDRUN && energy > 20 && here.ttc > 0.5) boost = true;
                if (lowLives && here.ttc > 0.5) boost = false;
                // Never boost into the black hole.
                const bh = snap.blackHole || {};
                if (bh.active && bh.config && p) {
                    const cfg = bh.config;
                    const ax0 = cfg.x != null ? cfg.x : 400;
                    const ay0 = cfg.y != null ? cfg.y : 260;
                    const dist = Math.hypot(p.x - ax0, p.y - ay0);
                    if (dist < (cfg.dangerRadius || 48) + 50) boost = false;
                }
            }
        }

        const aimY = snap.phase === 'boss' ? state.safeY : target.y;
        const ttcLabel = ttc === Infinity ? 'inf' : ttc.toFixed(2);
        const prog = snap.levelProgressMs != null
            ? Math.round((snap.levelProgressMs / (snap.levelDurationMs || 60000)) * 100) + '%'
            : '?';
        return {
            x: ax,
            y: ay,
            fire: true,
            boost: boost,
            note: 'L' + (snap.level || '?') +
                ' ttc=' + ttcLabel +
                ' cur=' + (here.ttc === Infinity ? 'inf' : here.ttc.toFixed(2)) +
                ' bl=' + here.bullets +
                ' y=' + aimY.toFixed(0) +
                ' e=' + energy.toFixed(0) +
                ' p=' + prog +
                ' w' + snap.weaponLevel
        };
    }

    function tick() {
        try {
            if (!window.__novawingDebug || !window.__novawingDebug.getBotSnapshot) return;
            const snap = window.__novawingDebug.getBotSnapshot();
            window.__novawingPilotLastSnap = snap;
            if (!snap || !snap.ready) return;
            if (snap.levelEnded || snap.victoryPending) {
                window.__novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false });
                window.__novawingPilotOutcome = snap.victoryPending ? 'win' : 'lose';
                return;
            }
            const decision = decide(snap);
            window.__novawingPilotLastNote = decision.note;
            const input = {
                x: decision.x,
                y: decision.y,
                fire: decision.fire,
                boost: decision.boost
            };
            window.__novawingPilotLastInput = input;
            window.__novawingDebug.setBotInput(input);
        } catch (err) {
            window.__novawingPilotError = String(err && err.message ? err.message : err);
        }
    }

    function loop() {
        tick();
        window.__novawingPilotRaf = requestAnimationFrame(loop);
    }

    // Reset state for each install (new page).
    state.bossOrbitSign = 1;
    state.bossWeaveUntil = 0;
    state.lastAimY = 300;
    state.holdDodgeDir = 0;
    state.holdDodgeUntil = 0;
    window.__novawingPilotOutcome = null;
    window.__novawingPilotError = null;
    window.__novawingPilotLastNote = '';
    window.__novawingPilotLastSnap = null;
    window.__novawingPilotInstalled = true;
    window.__novawingPilotStop = function () {
        if (window.__novawingPilotRaf) cancelAnimationFrame(window.__novawingPilotRaf);
        window.__novawingPilotRaf = null;
        if (window.__novawingDebug && window.__novawingDebug.clearBotInput) {
            window.__novawingDebug.clearBotInput();
        }
    };
    window.__novawingPilotRaf = requestAnimationFrame(loop);
    return true;
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
    if (process.env.LEVEL) {
        url.searchParams.set('level', String(process.env.LEVEL));
    }
    // SPEEDRUN=1 biases heuristic pilot toward clear time (more boost / intro DPS).
    if (process.env.SPEEDRUN === '1' || process.env.SPEEDRUN === 'true') {
        url.searchParams.set('speedrun', '1');
    }

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
        if (dialog.type() === 'prompt') await dialog.accept('BotPilot');
        else await dialog.accept();
    });
    page.on('pageerror', err => console.error('[pageerror]', err.message || err));

    const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
    if (!resp || !resp.ok()) throw new Error(`Failed to load game: ${resp && resp.status()}`);

    await waitForGame(page);
    await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
    await page.waitForTimeout(150);

    const installed = await page.evaluate(installInPagePilot);
    if (!installed) throw new Error('Failed to install in-page pilot');
    console.log(`[trial ${trialIndex}] in-page pilot installed`);

    const started = Date.now();
    let lastLog = 0;
    let finalSnap = null;
    let peakScore = 0;
    let peakWeapon = 1;
    let reachedBoss = false;
    let bossAtMs = null;
    let won = false;
    let maxProgress = 0;
    let maxLevel = 1;
    let bossesCleared = 0;
    let lastPhase = 'waves';
    let lastLevel = 1;
    let ticks = 0;

    try {
        while (Date.now() - started < DURATION_MS) {
            const status = await page.evaluate(() => {
                const snap = window.__novawingPilotLastSnap ||
                    (window.__novawingDebug && window.__novawingDebug.getBotSnapshot
                        ? window.__novawingDebug.getBotSnapshot()
                        : null);
                return {
                    snap,
                    note: window.__novawingPilotLastNote || '',
                    outcome: window.__novawingPilotOutcome,
                    error: window.__novawingPilotError
                };
            });
            ticks += 1;
            if (status.error) console.error('[pilot]', status.error);
            const snap = status.snap;
            finalSnap = snap;

            if (snap) {
                if (snap.score > peakScore) peakScore = snap.score;
                if (snap.weaponLevel > peakWeapon) peakWeapon = snap.weaponLevel;
                if (snap.levelProgressMs > maxProgress) maxProgress = snap.levelProgressMs;
                if (snap.level > maxLevel) maxLevel = snap.level;
                if (lastPhase === 'boss' && snap.phase === 'waves' && snap.level > lastLevel) {
                    bossesCleared += 1;
                    console.log(`[bot t${trialIndex}] cleared boss → level ${snap.level}`);
                }
                lastPhase = snap.phase;
                lastLevel = snap.level || lastLevel;
                if (snap.phase === 'boss' && !reachedBoss) {
                    reachedBoss = true;
                    bossAtMs = snap.elapsedMs || (Date.now() - started);
                }
            }

            if (status.outcome === 'win' || (snap && snap.victoryPending)) {
                won = true;
                await page.waitForTimeout(2000);
                break;
            }
            if (status.outcome === 'lose' || (snap && snap.levelEnded)) {
                won = false;
                await page.waitForTimeout(400);
                break;
            }

            const now = Date.now();
            if (snap && now - lastLog > LOG_MS) {
                const el = snap.elapsedMs != null
                    ? (snap.elapsedMs / 1000).toFixed(1)
                    : ((now - started) / 1000).toFixed(1);
                const bhp = snap.boss && Number.isFinite(snap.boss.health)
                    ? ` hp=${snap.boss.health}`
                    : '';
                const name = snap.levelName ? ` ${snap.levelName}` : '';
                console.log(
                    `[bot t${trialIndex}] t=${el}s L${snap.level}${name} score=${snap.score} ` +
                    `lives=${snap.lives} wpn=${snap.weaponLevel} sh=${snap.hasShield ? 1 : 0} ` +
                    `phase=${snap.phase}${bhp} ${status.note}`
                );
                lastLog = now;
            }

            await page.waitForTimeout(100);
        }
    } finally {
        await page.evaluate(() => {
            if (window.__novawingPilotStop) window.__novawingPilotStop();
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
        bossesCleared,
        maxLevel,
        score: finalSnap ? finalSnap.score : peakScore,
        peakScore,
        peakWeapon,
        lives: finalSnap ? finalSnap.lives : null,
        phase: finalSnap ? finalSnap.phase : null,
        level: finalSnap ? finalSnap.level : null,
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
    console.log('NovaWing play-test bot (in-page pilot)');
    console.log(`URL: ${BASE}`);
    console.log(`headless=${HEADLESS} trials=${TRIALS} duration=${DURATION_MS}ms video=${RECORD_VIDEO}`);
    if (process.env.LEVEL) console.log(`start level=${process.env.LEVEL}`);

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
        maxLevelReached: Math.max(...results.map(r => r.maxLevel || 1)),
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

    process.exitCode = wins.length ? 0 : 2;
}

// Only auto-run when executed directly (not when imported by rl/record-demos).
const isMain = process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
