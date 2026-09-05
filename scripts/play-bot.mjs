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
                const final = snap.segment === 'finalBoss' ||
                    (snap.boss && snap.boss.encounter === 'final');
                return {
                    minX: 56,
                    maxX: 744,
                    minY: final ? 500 : 280,
                    maxY: final ? 582 : 540,
                    wh: wh
                };
            }
            return {
                minX: 60,
                maxX: 740,
                minY: 390,
                maxY: 545,
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
                h: (e.h || 36) * (e.type === 'interceptor' || e.type === 'riser' ? 1.3 : 1)
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
        if (pu.type === 'shield' && !snap.hasShield) {
            return isVertical(snap) ? 88 : (low ? 90 : 48);
        }
        if (pu.type === 'weapon' && snap.weaponLevel < 3) {
            if (snap.weaponLevel < 2) return low ? 70 : 96;
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
            score += column * 95;
            // Extra: a bullet already aligned on this X and closing from above is lethal.
            for (let i = 0; i < threats.length; i++) {
                const t = threats[i];
                if (t.kind !== 'bullet' && t.kind !== 'enemy') continue;
                if (Math.abs((t.x || 0) - x) > 34) continue;
                if (t.y < y - 12 && (t.vy || 0) > 40) score += t.kind === 'bullet' ? 220 : 90;
            }
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
            score += Math.abs(y - homeY) * 0.38;
            if (y < 340) score += (340 - y) * 1.4;
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
                    // Vertical lasers are X strips. Exact overlap used to
                    // always dodge left (x>=p.x), which walked the right-side
                    // park into the 400-column volley.
                    if (Math.abs(b.x - p.x) < 54) {
                        minTtc = Math.min(minTtc, 0.04);
                        const roomL = p.x - 70;
                        const roomR = 730 - p.x;
                        dodgeDir = roomL >= roomR ? -1 : 1;
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
                const fromAbove = b.y < p.y - 8 && vy > 16;
                const fromBelow = b.y > p.y + 8 && vy < -12;
                if (!fromAbove && !fromBelow) continue;
                if (fromAbove && b.y < p.y - 560) continue;
                if (fromBelow && b.y > p.y + 320) continue;
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
            // Phase-1 spawn is ~403px out (tHit≈1.06); 0.95 dropped the opening
            // frame of each volley so ttc/pressured lagged the gap finder.
            if (b.x < p.x - 30 || b.x > p.x + 640) continue;
            const tHit = (b.x - p.x) / -vx;
            if (tHit < 0 || tHit > 1.35) continue;
            const predY = b.y + (b.vy || 0) * tHit;
            if (Math.abs(predY - p.y) < 56 && tHit < minTtc) {
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
        safeY: 300,
        strafeSign: 1,
        laneHoldX: 400,
        laneHoldUntil: 0
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
            const by = snap.boss.y;
            samples.push(by, by - 90, by + 90, by - 140, by + 140, by - 190, by + 190);
        }

        // Volleys spawn at boss.x-122 (~533) and aim at the player. A constant
        // 0.38 hull-track beat a graze-lane (miss≈30) so we sat in the fan.
        const impacts = [];
        for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i];
            if (b.isLaser) continue;
            const vx = b.vx || -380;
            if (vx >= -10) continue;
            if (b.x < p.x - 40 || b.x > p.x + 640) continue;
            const tHit = (b.x - p.x) / -vx;
            if (tHit < 0 || tHit > 1.45) continue;
            impacts.push({ predY: b.y + (b.vy || 0) * tHit, tHit: tHit });
        }
        let aimY = 0;
        for (let i = 0; i < impacts.length; i++) aimY += impacts[i].predY;
        if (impacts.length) aimY /= impacts.length;
        const trackW = impacts.length >= 3 ? 0.05
            : impacts.length >= 1 ? 0.10
            : 0.32;

        let bestY = preferY;
        let bestScore = -Infinity;

        for (let si = 0; si < samples.length; si++) {
            const y = clamp(samples[si], bounds.minY, bounds.maxY);
            let score = 0;
            if (snap.boss) score -= Math.abs(y - snap.boss.y) * trackW;
            score -= Math.abs(y - p.y) * 0.05;
            score -= Math.abs(y - preferY) * (impacts.length >= 2 ? 0.16 : 0.08);
            if (impacts.length >= 2 && Math.abs(y - state.safeY) < 20) score += 10;

            if (impacts.length >= 2) {
                const aimMiss = Math.abs(y - aimY);
                if (aimMiss < 78) score -= (78 - aimMiss) * 1.35;
            }

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
                if (b.x < p.x - 40 || b.x > p.x + 640) continue;
                const tHit = (b.x - p.x) / -vx;
                if (tHit < 0 || tHit > 1.45) continue;
                const predY = b.y + (b.vy || 0) * tHit;
                const miss = Math.abs(predY - y);
                if (miss < 56) {
                    const urgency = 1 / (0.08 + tHit);
                    score -= (56 - miss) * urgency * 2.1;
                } else if (miss < 96) {
                    score -= (96 - miss) * 0.22;
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
     * Final-boss well: hazard rings sweep r=90↔280 (lethalWidth 22 → ~291).
     * At y≈572 the floor is already r≈312, so a bottom-center strafe stays
     * outside the rings AND can DPS the boss on the 400 column.
     */
    function blackHoleInfo(snap) {
        const bh = snap.blackHole || {};
        const cfg = bh.config || {};
        const x = cfg.x != null ? cfg.x : 400;
        const y = cfg.y != null ? cfg.y : 260;
        const p = snap.player;
        const dist = p ? (Math.hypot(p.x - x, p.y - y) || 0.001) : 999;
        return {
            active: Boolean(bh.active),
            preview: Boolean(bh.preview),
            x: x,
            y: y,
            dist: dist,
            minR: bh.active ? 304 : 0,
            dangerR: (cfg.dangerRadius != null ? cfg.dangerRadius : 48) + 20,
            killR: (cfg.killRadius != null ? cfg.killRadius : 28) + 16
        };
    }

    /**
     * Final-boss shots are +X=0 / vy=-690 from the floor. Orbit is
     * x=bhx+cos(a)r, y=bhy+sin(a)r so vx=-ω(y-bhy). 17% acc was aiming at
     * current X while the hull moved 50–75px during the 0.7s flight.
     */
    function finalLeadX(snap) {
        const b = snap.boss;
        const p = snap.player;
        if (!b || !p) return 400;
        const bh = blackHoleInfo(snap);
        const tShot = clamp((p.y - b.y) / 690, 0.1, 0.85);
        const omega = (b.phase >= 3) ? 0.75 : 0.55;
        const lead = -omega * (b.y - bh.y) * tShot;
        return clamp(b.x + lead, 90, 710);
    }

    /**
     * Vertical-boss gap finder: pick the X with max clearance from incoming
     * dive bullets / vertical laser strips.
     */
    function safestBossX(snap, preferX) {
        const p = snap.player;
        const bounds = playBounds(snap);
        const bullets = snap.enemyBullets || [];
        const bh = blackHoleInfo(snap);
        const samples = [];
        for (let x = bounds.minX; x <= bounds.maxX; x += 16) samples.push(x);
        samples.push(preferX, p.x);
        const leadX = (bh.active && p.y >= 520 && snap.boss) ? finalLeadX(snap) : null;
        if (snap.boss) {
            samples.push(snap.boss.x, snap.boss.x - 80, snap.boss.x + 80);
            if (leadX != null) samples.push(leadX);
        }

        let bestX = preferX;
        let bestScore = -Infinity;

        for (let si = 0; si < samples.length; si++) {
            const x = clamp(samples[si], bounds.minX, bounds.maxX);
            let score = 0;
            if (snap.boss && !bh.active) score -= Math.abs(x - snap.boss.x) * 0.15;
            if (leadX != null) score -= Math.abs(x - leadX) * 0.28;
            score -= Math.abs(x - p.x) * 0.05;
            score -= Math.abs(x - preferX) * 0.12;

            if (snap.boss) {
                const bodyHalf = (snap.boss.w || 220) * 0.22;
                const bodyDist = Math.abs(x - snap.boss.x);
                // Overhead hull is a DPS lane, not an X blocker (13% acc).
                const closeY = Math.abs((snap.boss.y || 0) - p.y) <
                    (snap.boss.h || 150) * 0.4 + 50;
                if (closeY && bodyDist < bodyHalf + 16) {
                    score -= (bodyHalf + 16 - bodyDist) * 6;
                }
            }

            if (bh.active) {
                const dist = Math.hypot(x - bh.x, p.y - bh.y);
                if (dist < bh.minR) score -= (bh.minR - dist) * 36;
                if (dist < bh.minR + 28) score -= (bh.minR + 28 - dist) * 8;
                // Crossing the well on X is a ring death above the floor.
                // At y≈572, r≈312 > ring 291, so 400 is legal for DPS.
                if (Math.abs(x - bh.x) < 110 && p.y < 520) score -= 260;
                if (Math.abs(x - bh.x) < 56 && p.y < 530) score -= 110;
            }

            for (let i = 0; i < bullets.length; i++) {
                const b = bullets[i];
                if (b.isLaser) {
                    const dx = Math.abs(b.x - x);
                    if (dx < 44) score -= (44 - dx) * 16;
                    continue;
                }
                const vy = b.vy || 380;
                if (vy <= 20) continue;
                if (b.y > p.y + 30 || b.y < p.y - 560) continue;
                const tHit = (p.y - b.y) / vy;
                if (tHit < 0 || tHit > 1.15) continue;
                const predX = b.x + (b.vx || 0) * tHit;
                const miss = Math.abs(predX - x);
                if (miss < 52) {
                    const urgency = 1 / (0.08 + tHit);
                    score -= (52 - miss) * urgency * 1.8;
                } else if (miss < 88) {
                    score -= (88 - miss) * 0.18;
                }
            }

            const enemies = snap.enemies || [];
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (e.y > p.y + 16) continue;
                const evy = e.vy || 0;
                const tHit = evy > 16 ? (p.y - e.y) / evy : 0.55;
                if (tHit < 0 || tHit > 1.3) continue;
                const predX = e.x + (e.vx || 0) * Math.min(tHit, 0.55);
                const miss = Math.abs(predX - x);
                if (miss < 44) {
                    score -= (44 - miss) * (e.type === 'interceptor' ? 2.4 : 1.5);
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

    /**
     * Vertical-wave gap finder: pick an X that is not a dive / riser / bullet column.
     */
    function safestWaveX(snap, preferX, commit) {
        const p = snap.player;
        const bounds = playBounds(snap);
        const bullets = snap.enemyBullets || [];
        const enemies = snap.enemies || [];
        const samples = [];
        for (let x = bounds.minX; x <= bounds.maxX; x += 18) samples.push(x);
        samples.push(preferX, p.x, 280, 520, 220, 580, 340, 460, 160, 640, 300, 500, 150, 650);
        // Mine-curtain gaps sit at 175/325/475/625 when slots are 100+150n.
        samples.push(175, 325, 475, 625, 125, 675);
        const obstacles = snap.obstacles || [];
        const mineXs = [];
        for (let i = 0; i < obstacles.length; i++) mineXs.push(obstacles[i].x || 0);
        mineXs.sort(function (a, b) { return a - b; });
        for (let i = 0; i < mineXs.length - 1; i++) {
            samples.push((mineXs[i] + mineXs[i + 1]) * 0.5);
        }
        let bestX = preferX;
        let bestScore = -Infinity;
        const diveLanes = [105, 185, 265, 345, 425, 505, 280, 340, 460, 520];
        for (let si = 0; si < samples.length; si++) {
            const x = clamp(samples[si], bounds.minX, bounds.maxX);
            let score = 0;
            score -= Math.abs(x - preferX) * (commit ? 0.14 : 0.05);
            // Stay in the current gap unless another column is clearly safer.
            // TTC ignores player vx, so a 5pt upgrade used to strafe through mines.
            // Commit (shield/weapon hunt) must actually leave the pocket.
            score -= Math.abs(x - p.x) * (commit ? 0.04 : 0.16);
            // 400 is V-tip / riser / mine-dropper. 18pts lost to a graze lane.
            if (Math.abs(x - 400) < 52) score -= (52 - Math.abs(x - 400)) * 1.1;
            // Authored dive lanes / V-wings. Soft so 320-weapon / 480-shield still win.
            for (let li = 0; li < diveLanes.length; li++) {
                const d = Math.abs(x - diveLanes[li]);
                if (d < 26) score -= (26 - d) * 0.65;
            }
            for (let i = 0; i < bullets.length; i++) {
                const b = bullets[i];
                if (b.isLaser) {
                    if (Math.abs(b.x - x) < 42) score -= (42 - Math.abs(b.x - x)) * 16;
                    continue;
                }
                const vy = b.vy || 0;
                if (Math.abs(vy) < 12) continue;
                const fromAbove = vy > 12 && b.y < p.y + 20 && b.y > p.y - 640;
                const fromBelow = vy < -12 && b.y > p.y - 20 && b.y < p.y + 300;
                if (!fromAbove && !fromBelow) continue;
                const tHit = (p.y - b.y) / vy;
                if (tHit < 0 || tHit > 1.2) continue;
                const predX = b.x + (b.vx || 0) * tHit;
                const miss = Math.abs(predX - x);
                if (miss < 44) score -= (44 - miss) * (1 / (0.08 + tHit)) * 1.8;
            }
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                const evy = e.vy || 0;
                const closingDown = e.y < p.y - 16 && evy > 6;
                const closingUp = e.y > p.y + 10 && evy < -6;
                let predX = e.x || 0;
                if (closingDown && evy > 10) {
                    const tHit = (p.y - e.y) / evy;
                    if (tHit > 0 && tHit < 1.3) {
                        predX = e.x + (e.vx || 0) * Math.min(tHit, 0.7);
                        // Homing interceptors start with vx≈0; pincer darts already
                        // carry convergeVx (±40). Extra lead walked us into the arms.
                        if ((e.type === 'interceptor' || e.type === 'dart') &&
                                Math.abs(e.vx || 0) < 22) {
                            const lead = e.type === 'interceptor' ? 175 : 90;
                            const gap = p.x - e.x;
                            predX = e.x + clamp(gap, -lead * tHit, lead * tHit);
                        }
                    }
                }
                const miss = Math.min(Math.abs(predX - x), Math.abs((e.x || 0) - x));
                if (miss > 70) continue;
                const homing = e.type === 'interceptor' || e.type === 'dart';
                const rising = e.type === 'riser' || closingUp;
                if (closingDown) score -= (homing ? 72 : 48) * clamp(1 - miss / 50, 0.2, 1);
                else if (rising) score -= 95 * clamp(1 - miss / 70, 0.2, 1);
                else if (e.y < p.y && miss < 28) score -= 18;
                else if (e.y > p.y && e.y < p.y + 160 && miss < 34) score -= 32;
            }
            for (let i = 0; i < obstacles.length; i++) {
                const o = obstacles[i];
                const dx = Math.abs((o.x || 0) - x);
                if (dx > 80) continue;
                if (o.y > p.y + 140 || o.y < p.y - 560) continue;
                // Close-in-Y mines clip a 72px hull; far mines only block the column.
                const yDist = o.y < p.y ? (p.y - o.y) : (o.y - p.y) * 0.7;
                const near = yDist < 110 ? 4.2 : (yDist < 220 ? 2.8 : 1.6);
                score -= (80 - dx) * near;
            }
            // Crossing a live column (mines have vx=0 so TTC stays inf until overlap).
            // Far mines (~2s above) used to cost 190 and trap us in a dart column.
            const spanLo = Math.min(p.x, x) + 14;
            const spanHi = Math.max(p.x, x) - 14;
            if (spanHi > spanLo) {
                for (let i = 0; i < obstacles.length; i++) {
                    const o = obstacles[i];
                    const ox = o.x || 0;
                    if (ox <= spanLo || ox >= spanHi) continue;
                    const yd = p.y - o.y;
                    if (yd > -50 && yd < 180) {
                        if (yd < 90) score -= 300;
                        else if (commit) score -= 8;
                        else if (yd < 140) score -= 70;
                        else score -= 18;
                    }
                }
                for (let i = 0; i < enemies.length; i++) {
                    const e = enemies[i];
                    const ex = e.x || 0;
                    if (ex <= spanLo || ex >= spanHi) continue;
                    const closing = (e.y < p.y - 8 && (e.vy || 0) > 8) ||
                        (e.type === 'riser' && e.y > p.y - 20 && e.y < p.y + 180);
                    if (!closing) continue;
                    const yd = p.y - (e.y || 0);
                    score -= yd < 140 ? 160 : 28;
                }
            }
            let hasRiser = false;
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (e.type === 'riser' || ((e.vy || 0) < -12 && e.y > p.y)) hasRiser = true;
            }
            if (hasRiser) {
                // 30px ban left a 30–48px dead zone that still clipped.
                const cols = [200, 400, 600];
                for (let ci = 0; ci < cols.length; ci++) {
                    const d = Math.abs(x - cols[ci]);
                    if (d < 54) score -= (54 - d) * 3.2;
                }
            }
            const edge = Math.min(x - bounds.minX, bounds.maxX - x);
            if (edge < 40) score -= (40 - edge) * 0.9;
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
        let waveEscape = false;
        if (dx < -6) ax = -1;
        else if (dx > 10) ax = 1;
        if (dy < -5) ay = -1;
        else if (dy > 5) ay = 1;

        // Commit to a dodge direction briefly to avoid thrashing.
        if (isVertical(snap)) {
            // In vertical mode dodgeDir is primarily an X-axis escape.
            if (snap.phase === 'waves') {
                const powerups = snap.powerups || [];
                // Flip parks at (400,460) with ~800ms i-frames. x===400 used to
                // pick 510 (WAVE_LANE 505 / V-wing 520) and boost into the opening.
                const spawnCol = Math.abs(p.x - 400) < 90;
                let huntX = p.x < 400 ? 300 : 475;
                if (spawnCol) huntX = 300;
                // Shield first (gauntlet is a blender), then weapon/repair.
                // Pickups drop at 70px/s from y=-50; hunting at 560px parks us
                // on 320/480 for ~7s under dive lanes. Shield is a life — start
                // earlier (~5s out). Other orbs wait until ~3s out.
                const huntOrder = [];
                for (let i = 0; i < powerups.length; i++) {
                    const pu = powerups[i];
                    const reach = (pu.type === 'shield' && !snap.hasShield) ? 380 : 260;
                    if (pu.y > p.y + 80 || pu.y < p.y - reach) continue;
                    if (pu.type === 'shield' && !snap.hasShield) huntOrder.unshift(pu.x);
                    else if (pu.type === 'repair' && (snap.lives || 0) <= 2) huntOrder.push(pu.x);
                    else if (pu.type === 'weapon' && (snap.weaponLevel || 1) < 3) {
                        // 38s Spread sits on V-wing 520. Twin is enough; parking
                        // there for the 7s drop is a blender death (Spread, 54 kills).
                        const needTwin = (snap.weaponLevel || 1) < 2;
                        const hot = [200, 280, 340, 400, 460, 505, 520, 600];
                        let onHot = false;
                        for (let hi = 0; hi < hot.length; hi++) {
                            if (Math.abs((pu.x || 0) - hot[hi]) < 22) onHot = true;
                        }
                        if (needTwin || !onHot) huntOrder.push(pu.x);
                    }
                }
                let hunting = false;
                if (huntOrder.length) {
                    huntX = huntOrder[0];
                    const obsB = snap.obstacles || [];
                    for (let hi = 0; hi < huntOrder.length; hi++) {
                        const hx = huntOrder[hi];
                        let blocked = false;
                        for (let bi = 0; bi < obsB.length; bi++) {
                            const o = obsB[bi];
                            // Only skip a pickup if a mine is in the lane now
                            // (far curtain rows used to cancel the 10s shield).
                            if (Math.abs((o.x || 0) - hx) < 50 && Math.abs(o.y - p.y) < 130) {
                                blocked = true;
                                break;
                            }
                        }
                        if (!blocked) {
                            huntX = hx;
                            hunting = true;
                            break;
                        }
                        if (hi === huntOrder.length - 1) {
                            huntX = p.x < 400 ? 300 : 475;
                        }
                    }
                }
                let risersOut = false;
                const ensHunt = snap.enemies || [];
                for (let i = 0; i < ensHunt.length; i++) {
                    const e = ensHunt[i];
                    if (e.type === 'riser' || ((e.vy || 0) < -12 && e.y > p.y - 20)) {
                        risersOut = true;
                        break;
                    }
                }
                if (risersOut && (Math.abs(huntX - 200) < 54 || Math.abs(huntX - 400) < 54 ||
                        Math.abs(huntX - 600) < 54)) {
                    huntX = huntX < 400 ? 300 : 475;
                    hunting = false;
                }
                let safeX = safestWaveX(snap, huntX, hunting);
                let diveCol = false;
                let riserBelow = false;
                let floorThreat = false;
                let holdHot = here.ttc < 0.22 || spawnCol;
                const ens = snap.enemies || [];
                for (let i = 0; i < ens.length; i++) {
                    const e = ens[i];
                    const evy = e.vy || 0;
                    const dxe = Math.abs((e.x || 0) - p.x);
                    // In-column risers only. 300px/58px used to mark all three
                    // columns hot at once and thrashed into dives.
                    const rising = e.type === 'riser' || (evy < -8 && e.y > p.y);
                    if (rising && e.y > p.y - 8 && e.y < p.y + 200 && dxe < 48) {
                        floorThreat = true;
                        riserBelow = true;
                        holdHot = true;
                    } else if (e.y > p.y + 6 && e.y < p.y + 150 && dxe < 72) {
                        floorThreat = true;
                    }
                    if (e.y < p.y - 12 && evy > 8) {
                        const tHit = (p.y - e.y) / evy;
                        if (tHit > 0 && tHit < 1.25) {
                            const predX = (e.x || 0) + (e.vx || 0) * Math.min(tHit, 0.5);
                            if (dxe < 50 || Math.abs(predX - p.x) < 54) {
                                diveCol = true;
                                holdHot = true;
                            }
                        }
                    }
                }
                const bls = snap.enemyBullets || [];
                for (let i = 0; i < bls.length; i++) {
                    const b = bls[i];
                    if (b.isLaser) {
                        if (Math.abs((b.x || 0) - p.x) < 54) holdHot = true;
                        continue;
                    }
                    const vy = b.vy || 0;
                    if (vy <= 16 || b.y > p.y - 8) continue;
                    const tHit = (p.y - b.y) / vy;
                    if (tHit < 0 || tHit > 0.85) continue;
                    const predX = (b.x || 0) + (b.vx || 0) * tHit;
                    if (Math.abs(predX - p.x) < 52) holdHot = true;
                }
                const obs = snap.obstacles || [];
                for (let i = 0; i < obs.length; i++) {
                    const o = obs[i];
                    const dxm = Math.abs((o.x || 0) - p.x);
                    if (dxm < 52 && o.y < p.y - 8 && o.y > p.y - 240) {
                        diveCol = true;
                        holdHot = true;
                    }
                    if (dxm < 52 && Math.abs(o.y - p.y) < 90) floorThreat = true;
                }
                // Spawn-break sits at 300 for the 3s weapon; the 10s shield is at
                // 480. safestWaveX refuses to cross 400 if anything is diving the
                // gate (span penalty 160 > prefer 25), so we missed the shield
                // and sat with unused boost until lives<=2 killed strafe.
                let crossHunt = false;
                if (hunting && Math.abs(huntX - p.x) > 64 && here.ttc > 0.16) {
                    let gateHot = false;
                    const glo = Math.min(p.x, huntX) + 18;
                    const ghi = Math.max(p.x, huntX) - 18;
                    for (let i = 0; i < ens.length; i++) {
                        const e = ens[i];
                        const ex = e.x || 0;
                        if (ex <= glo || ex >= ghi) continue;
                        const evy = e.vy || 0;
                        if (e.y < p.y - 8 && evy > 8) {
                            const tHit = (p.y - e.y) / evy;
                            if (tHit > 0 && tHit < 0.5) gateHot = true;
                        }
                    }
                    for (let i = 0; i < obs.length; i++) {
                        const o = obs[i];
                        const ox = o.x || 0;
                        if (ox <= glo || ox >= ghi) continue;
                        if (p.y - o.y < 100 && p.y - o.y > -30) gateHot = true;
                    }
                    if (!gateHot) {
                        safeX = huntX;
                        crossHunt = true;
                    }
                }
                // Hold the gap. Skipping hold whenever holdHot (ttc/dive) thrashed
                // through sibling columns (13% acc, unused boost, missed 10s shield).
                // Abandon only if THIS X is the dive, or we're still crossing to a pickup.
                const atHunt = hunting && Math.abs(p.x - huntX) < 44;
                const skipHold = (hunting && !atHunt) || crossHunt;
                const heldIsDive = diveCol && Math.abs(p.x - state.laneHoldX) < 40;
                if (!skipHold && now < state.laneHoldUntil &&
                        Math.abs(state.laneHoldX - p.x) < 150) {
                    if (!heldIsDive && Math.abs(safeX - state.laneHoldX) < 100) {
                        safeX = state.laneHoldX;
                    }
                } else {
                    state.laneHoldX = safeX;
                    state.laneHoldUntil = now + (heldIsDive ? 70 : 280);
                }
                waveEscape = holdHot || crossHunt;
                const errX = safeX - p.x;
                if (Math.abs(errX) > 10) ax = errX > 0 ? 1 : -1;
                else ax = 0;
                // Gap finder sometimes picks "stay" in a live dive. Step out.
                if (diveCol && ax === 0) {
                    ax = p.x >= 400 ? 1 : -1;
                    if (p.x > 640) ax = -1;
                    if (p.x < 160) ax = 1;
                    waveEscape = true;
                }
                // Climb only for risers in our column. Sitting at 418 walked
                // into dive traffic; home stays the aft pocket (y≈460).
                if (riserBelow && p.y > 405 && !diveCol) ay = -1;
                else if (p.y < VERT_HOME_Y - 12) ay = 1;
                else if (p.y > VERT_HOME_Y + 22) ay = -1;
                else ay = 0;
                if (floorThreat && ay > 0) ay = 0;
                // Meet a close orb instead of waiting at y=460 while it falls
                // through dive traffic (shield is 64px, 70px/s).
                if (hunting && atHunt && !diveCol && p.y > 398) {
                    for (let i = 0; i < powerups.length; i++) {
                        const pu = powerups[i];
                        if (Math.abs((pu.x || 0) - huntX) > 40) continue;
                        if (pu.y < p.y - 24 && pu.y > p.y - 220) {
                            ay = -1;
                            break;
                        }
                    }
                }
                // BH preview pull (60s) aims at (400,40). Sit-still boost sped
                // mines into the floor pocket; 400 is the well column.
                const preview = snap.blackHole && snap.blackHole.preview;
                if (preview) {
                    if (Math.abs(p.x - 400) < 70) {
                        ax = p.x >= 400 ? 1 : -1;
                        waveEscape = true;
                    }
                    if (p.y > VERT_HOME_Y + 8) ay = -1;
                    if (ay > 0 && p.y >= VERT_HOME_Y - 8) ay = 0;
                }
                // Panic-dodge only when impact is imminent. dodgeDir at ttc<0.32
                // walked into sibling dive columns and canceled the gap finder.
                if (here.kind === 'laser' && here.ttc < 0.6 && here.dodgeDir !== 0) {
                    ax = here.dodgeDir;
                } else if (here.ttc < 0.14 && here.dodgeDir !== 0) {
                    if (ax === 0 || (ax > 0) === (here.dodgeDir > 0)) ax = here.dodgeDir;
                }
            } else if ((here.kind === 'laser' && here.ttc < 0.6) || (here.ttc < 0.32 && here.dodgeDir !== 0)) {
                if (now > state.holdDodgeUntil || state.holdDodgeDir === 0) {
                    state.holdDodgeDir = here.dodgeDir;
                    state.holdDodgeUntil = now + (here.kind === 'laser' ? 280 : 180);
                }
                ax = state.holdDodgeDir;
                if (here.ttc < 0.34 && p.y < 520) ay = 1;
            } else if (ttc < 0.22 && Math.abs(dx) > 2) {
                ax = dx < 0 ? -1 : 1;
            }
            const bhWave = snap.blackHole || {};
            if ((bhWave.preview || bhWave.active) && p.y < 450) ay = 1;
        } else if (here.ttc < 0.5 && here.dodgeDir !== 0) {
            if (now > state.holdDodgeUntil || state.holdDodgeDir === 0) {
                state.holdDodgeDir = here.dodgeDir;
                state.holdDodgeUntil = now + (here.kind === 'laser' ? 280 : 260);
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
            const bh = blackHoleInfo(snap);
            // Final BH: sit on the floor (y≈572 → r≈312 > ring 291) and strafe
            // under the boss. Side-pockets had no DPS and same-side missiles
            // filled the 170px lane. Dropping from spawn (400,480) increases r
            // without crossing the well.
            const preferY = (isFinalBoss && bh.active) ? 572 : (isFinalBoss ? 552 : VERT_BOSS_Y);
            let pocketLo = bounds.minX + 8;
            let pocketHi = bounds.maxX - 8;
            let stationX = clamp(b.x, pocketLo + 30, pocketHi - 30);
            if (bh.active && isFinalBoss) {
                // Floor is ring-safe at y≈572. Sit under the hull (shots are
                // +X=0); outer*42 plus a 400-ban parked us opposite the boss.
                pocketLo = 90;
                pocketHi = 710;
                stationX = clamp(b.x, 140, 660);
            }

            if (p.y < preferY - 4) ay = 1;
            else if (p.y > preferY + 12) ay = -1;
            else ay = 0;
            if (bh.active && p.y < preferY) ay = 1;
            if (bh.active && ay < 0 && p.y < preferY + 20) ay = 0;

            if (bh.active && p.y < 530) {
                // Spawn is (400,480), r≈220 < minR 304. ax=0 rode the 400
                // column through pull + opening volley. Strafe out while dropping.
                const outer = p.x >= 400 ? 1 : -1;
                ax = Math.abs(p.x - 400) < 110 ? outer : 0;
                if (here.ttc < 0.4 && here.dodgeDir !== 0) {
                    const d = here.dodgeDir;
                    if (Math.abs((p.x + d * 48) - 400) >= Math.abs(p.x - 400) - 6) ax = d;
                }
            } else {
                if (p.x >= pocketHi - 22) state.strafeSign = -1;
                else if (p.x <= pocketLo + 22) state.strafeSign = 1;
                const bullets = snap.enemyBullets || [];
                let aimX = 0;
                let aimN = 0;
                let aimT = 9;
                for (let i = 0; i < bullets.length; i++) {
                    const bl = bullets[i];
                    if (bl.isLaser) {
                        if (Math.abs(bl.x - p.x) < 54 && aimT > 0.05) {
                            aimX = bl.x;
                            aimN = 1;
                            aimT = 0.05;
                        }
                        continue;
                    }
                    const vy = bl.vy || 0;
                    if (vy <= 15) continue;
                    if (bl.y > p.y + 20 || bl.y < p.y - 640) continue;
                    const tHit = (p.y - bl.y) / vy;
                    if (tHit < 0 || tHit > 1.2) continue;
                    const predX = bl.x + (bl.vx || 0) * tHit;
                    if (Math.abs(predX - p.x) < 120 && tHit < aimT + 0.16) {
                        aimX = predX;
                        aimN = 1;
                        aimT = Math.min(aimT, tHit);
                    }
                }
                const ens = snap.enemies || [];
                for (let i = 0; i < ens.length; i++) {
                    const e = ens[i];
                    if (e.y > p.y - 8 || e.y < p.y - 420) continue;
                    if (Math.abs((e.x || 0) - p.x) > 60) continue;
                    const evy = e.vy || 80;
                    const tHit = evy > 10 ? (p.y - e.y) / evy : 0.5;
                    if (tHit < 0 || tHit > 0.95) continue;
                    if (tHit < aimT + 0.08) {
                        aimX = e.x;
                        aimN = 1;
                        aimT = Math.min(aimT, tHit);
                    }
                }
                if (bh.active && isFinalBoss) {
                    // Under the hull when the sky is clear. Floor may cross 400.
                    let volleyN = 0;
                    for (let i = 0; i < bullets.length; i++) {
                        const bl = bullets[i];
                        if (bl.isLaser) continue;
                        const vy = bl.vy || 0;
                        if (vy <= 15) continue;
                        const tHit = (p.y - bl.y) / vy;
                        if (tHit <= 0 || tHit > 1.05) continue;
                        const predX = (bl.x || 0) + (bl.vx || 0) * tHit;
                        // Any on-screen missile used to keep off=82 and 14% acc.
                        if (Math.abs(predX - p.x) < 80) volleyN += 1;
                    }
                    let diveCol = false;
                    for (let i = 0; i < ens.length; i++) {
                        const e = ens[i];
                        if (e.y > p.y - 4 || e.y < p.y - 500) continue;
                        if (Math.abs((e.x || 0) - p.x) < 56) diveCol = true;
                    }
                    let laserOnUs = here.kind === 'laser' && here.ttc < 0.6;
                    if (!laserOnUs) {
                        for (let i = 0; i < bullets.length; i++) {
                            if (bullets[i].isLaser && Math.abs(bullets[i].x - p.x) < 52) {
                                laserOnUs = true;
                                break;
                            }
                        }
                    }
                    const bossLow = b.y > 260;
                    const skyHot = volleyN > 0 || diveCol || laserOnUs;
                    const onFloor = p.y >= 530;
                    let want = clamp(onFloor ? finalLeadX(snap) : b.x, 120, 680);
                    const diveOnUs = laserOnUs || diveCol ||
                        (aimN && aimT < (bossLow ? 0.72 : 0.5) && Math.abs(aimX - p.x) < 90);
                    if (diveOnUs) {
                        let dir = (aimN && !laserOnUs) ? (aimX >= p.x ? -1 : 1) : (p.x >= b.x ? 1 : -1);
                        if ((dir < 0 && p.x <= 120) || (dir > 0 && p.x >= 680)) dir = -dir;
                        if (!onFloor && Math.abs((p.x + dir * 100) - 400) < 40) dir = -dir;
                        state.laneHoldX = clamp(p.x + dir * 140, 90, 710);
                        state.laneHoldUntil = now + (laserOnUs ? 420 : 280);
                    } else if (skyHot) {
                        if (now > state.laneHoldUntil) {
                            const dir = aimN ? (aimX >= p.x ? -1 : 1) : (p.x >= b.x ? 1 : -1);
                            state.laneHoldX = clamp(p.x + dir * 90, 90, 710);
                        }
                        state.laneHoldUntil = Math.max(state.laneHoldUntil, now + 70);
                    } else if (now > state.laneHoldUntil) {
                        if (p.x <= 110) state.strafeSign = 1;
                        else if (p.x >= 690) state.strafeSign = -1;
                        else if (Math.abs(p.x - want) > 28) {
                            state.strafeSign = want >= p.x ? 1 : -1;
                        }
                    }
                    stationX = (now < state.laneHoldUntil) ? state.laneHoldX : want;
                } else if (aimN && aimT < 0.9) {
                    const away = aimX >= p.x ? -1 : 1;
                    let hold = p.x + away * 118;
                    if (hold < pocketLo + 18 || hold > pocketHi - 18) hold = p.x - away * 118;
                    hold = clamp(hold, pocketLo + 18, pocketHi - 18);
                    if (now > state.laneHoldUntil || Math.abs(state.laneHoldX - aimX) < 48) {
                        state.laneHoldX = hold;
                        state.laneHoldUntil = now + Math.max(420, aimT * 1000 + 200);
                    }
                    state.strafeSign = state.laneHoldX >= p.x ? 1 : -1;
                }
                const holding = now < state.laneHoldUntil;
                const cruiseX = clamp(
                    holding ? state.laneHoldX : stationX,
                    pocketLo + 12,
                    pocketHi - 12
                );
                let safeX = clamp(safestBossX(snap, cruiseX), pocketLo, pocketHi);
                if (bh.active && isFinalBoss && p.y < 530 && Math.abs(safeX - 400) < 50) {
                    safeX = cruiseX;
                }
                if (holding && Math.abs(safeX - state.laneHoldX) > 70) {
                    // Gap finder wins if the hold lane is the thing killing us.
                    const holdHot = here.kind === 'laser' || here.ttc < 0.28;
                    if (!holdHot) safeX = state.laneHoldX;
                }
                if (bh.active && Math.hypot(safeX - bh.x, Math.max(p.y, preferY) - bh.y) < bh.minR) {
                    safeX = cruiseX;
                }
                const errX = safeX - p.x;
                if (Math.abs(errX) > 8) ax = errX > 0 ? 1 : -1;
                else ax = 0;
                state.strafeSign = (ax || state.strafeSign);
            }

            if (here.ttc < 0.5 && here.dodgeDir !== 0) {
                let dir = here.dodgeDir;
                const towardWell = bh.active && isFinalBoss && p.y < 530 &&
                    Math.abs((p.x + dir * 56) - 400) < Math.abs(p.x - 400) - 8;
                // Right-side park: a laser on player.x used to skip the dodge
                // (dir pointed through 400). Flip to the outer wall instead.
                if (towardWell) dir = -dir;
                const dodgeX = p.x + dir * 56;
                const dodgeR = bh.active ? Math.hypot(dodgeX - bh.x, p.y - bh.y) : 999;
                const dodgePocket = dodgeX >= pocketLo - 6 && dodgeX <= pocketHi + 6;
                const safeR = !bh.active || dodgeR >= bh.minR - 4;
                if (dodgePocket && safeR) {
                    ax = dir;
                    state.strafeSign = dir;
                } else if (!bh.active || !isFinalBoss) {
                    ax = (dodgePocket && safeR) ? dir : -dir;
                    state.strafeSign = ax;
                }
            }
            if (here.ttc < 0.22 && p.y < preferY + 6) ay = 1;

            if (bh.active) {
                const distAt = function (x, y) {
                    return Math.hypot(x - bh.x, y - bh.y) || 0.001;
                };
                if (bh.dist < bh.minR) {
                    ay = p.y < preferY + 8 ? 1 : 0;
                    if (p.y >= 530 && here.ttc < 0.45 && here.dodgeDir) ax = here.dodgeDir;
                    else if (p.y < 530 && Math.abs(p.x - 400) < 110) {
                        ax = p.x >= 400 ? 1 : -1;
                    }
                } else if (distAt(p.x + ax * 40, p.y + ay * 40) < bh.minR) {
                    ay = 1;
                    ax = 0;
                }
            }
        } else if (snap.phase === 'boss' && snap.boss) {
            const b = snap.boss;
            const hp = Number.isFinite(b.health) ? b.health : 240;
            // bullets>=2 is true for a whole 3-missile volley (~1s), so a 118px
            // orbit sat off the hull the entire fight (11–12% acc, two L2 losses).
            const pressured = here.ttc < 0.7;
            // Clear: ~28px off hull (still on the ~150px body). Imminent: step
            // outside the ±42 launcher fan; safestBossY already leaves the aim band.
            const orbitAmp = isIntroBoss
                ? (SPEEDRUN ? 18 : 28)
                : (pressured ? 72 : (lowLives ? 40 : 28));
            const preferY = clamp(
                b.y + state.bossOrbitSign * orbitAmp,
                bounds.minY + 12,
                bounds.maxY - 12
            );

            if (now > state.bossWeaveUntil && here.ttc > 0.8) {
                state.bossOrbitSign *= -1;
                state.bossWeaveUntil = now + (pressured ? 420 : (isIntroBoss && SPEEDRUN ? 280 : 560));
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

            // Panic-only override. dodgeDir is "away from the nearest shot";
            // a 3-missile volley makes that walk into a sibling. Trust the
            // Y-gap finder unless impact is imminent (or a laser strip).
            if (here.dodgeDir !== 0 && (here.ttc < 0.16 || here.kind === 'laser')) {
                ay = here.dodgeDir;
            }

            // Park left for reaction time; 72 glued us to the wall with no DPS.
            const endgame = hp < 80 || here.bullets >= 5;
            let preferX = (lowLives || endgame || b.x < 520) ? 98 : 130;
            if (isIntroBoss && SPEEDRUN && !lowLives) preferX = 150;
            if (p.x < preferX - 10) ax = 0.5;
            else if (p.x > preferX + 18) ax = -1;
            else ax = 0;
            if (here.ttc < 0.32 && p.x > preferX + 8) ax = -1;

            // Don't over-weave into edges during bullet storms.
            if (endgame && !pressured && (p.y < bounds.minY + 40 || p.y > bounds.maxY - 40)) {
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

                const inCorridor = Boolean(snap.openBands && snap.openBands.length &&
                    yInOpenBand(p.y, snap, 48));
                if (!early && (ttc > safeTtc || invuln)) boost = true;
                else if (early && late && ttc > 0.6) boost = true;
                else if (!early && !lowLives && energy > 60 && ttc > 0.22) boost = true;
                else if (late && energy > 10 && ttc > 0.24) boost = true;
                // Canyon: 90s wave clock needs boost in-band. A prior nerf
                // (ttc>0.55 + lives>=3 + ttc<0.5 kill) caused mid-path deaths.
                else if (inCorridor && energy > 14 && ttc > 0.42 && here.kind !== 'wall') boost = true;
                else if (inCorridor && early && energy > 20 && ttc > 0.52 && prog > 2500) boost = true;
                // Speedrun: open space can boost earlier (progress clock is free time).
                else if (SPEEDRUN && openSpace && early && energy > 35 && ttc > 0.55) boost = true;
                else if (SPEEDRUN && openSpace && mid && energy > 20 && ttc > 0.28) boost = true;
                else if (SPEEDRUN && isVertical(snap) && energy > 40 && ttc > 0.7 && !lowLives) boost = true;

                if (here.kind === 'wall' && here.ttc < 0.55) boost = false;
                if (here.ttc < 0.2) boost = false;
                // Vertical gauntlet: boost walks you into dive/riser columns.
                if (isVertical(snap) && ttc < 0.65 && !invuln) boost = false;
                if (isVertical(snap) && (snap.lives || 0) <= 2 && !snap.hasShield && !invuln) boost = false;
                // Boost-strafe clips mines (TTC stays inf until the X slab overlaps).
                // Exception: leave spawn/hot column if the next ~90px is mine-free.
                if (isVertical(snap) && ax !== 0) {
                    let minePath = false;
                    const obsB = snap.obstacles || [];
                    const lo = Math.min(p.x, p.x + ax * 90);
                    const hi = Math.max(p.x, p.x + ax * 90);
                    for (let i = 0; i < obsB.length; i++) {
                        const o = obsB[i];
                        const ox = o.x || 0;
                        if (ox < lo - 8 || ox > hi + 8) continue;
                        if (p.y - o.y < 120 && p.y - o.y > -40) minePath = true;
                    }
                    if (invuln && !minePath) boost = true;
                    else if (minePath || !waveEscape) boost = false;
                    else if (waveEscape && energy > 8 && here.ttc > 0.12) boost = true;
                }
                // Don't boost into the floor, or during BH preview (pull + fast mines).
                if (isVertical(snap) && !invuln) {
                    if (ay > 0) boost = false;
                    if (snap.blackHole && snap.blackHole.preview) boost = false;
                }
                // Never boost while vertically off-corridor (rams the next wall column).
                if (snap.openBands && snap.openBands.length && !yInOpenBand(p.y, snap, 40)) {
                    boost = false;
                }
            } else if (snap.phase === 'boss') {
                // Boss: boost is a dodge snap, not a ram. ttc<0.4 used to
                // accelerate INTO volleys on L2 / final BH.
                if (here.ttc < 0.2) boost = true;
                else if (Math.abs(p.y - state.safeY) > 80 && energy > 30 && here.ttc > 0.4) boost = true;
                else if (!isVertical(snap) && Math.abs(p.y - state.safeY) > 70 &&
                    energy > 18 && here.ttc > 0.28 && here.ttc < 0.9) boost = true;
                else if (isIntroBoss && SPEEDRUN && energy > 20 && here.ttc > 0.5) boost = true;
                if (lowLives && here.ttc > 0.35) boost = false;
                const bh = blackHoleInfo(snap);
                if (bh.active && p) {
                    const towardX = (ax > 0 && p.x < bh.x) || (ax < 0 && p.x > bh.x);
                    const towardY = ay < 0 && p.y > bh.y;
                    // minR+50 used to blanket the whole floor (r≈312) and
                    // killed lateral dodge-boost; low-orbit volleys then ram.
                    if (towardX || towardY) boost = false;
                    else if (p.y >= 525 && ax !== 0 && here.ttc < 0.5) boost = true;
                    else if (p.y >= 525 && ax !== 0 && here.ttc > 0.4 && energy > 10 &&
                        snap.boss && Math.abs(p.x - finalLeadX(snap)) > 64) boost = true;
                    else if (bh.dist < bh.minR) boost = true;
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
    state.strafeSign = 1;
    state.laneHoldX = 400;
    state.laneHoldUntil = 0;
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
