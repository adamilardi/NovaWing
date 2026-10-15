/** Pure enemy aim math: nose angles, target selection and shot vectors.
 *
 * Extracted from game.js so the campaign's aiming rules are unit-testable
 * without Phaser or a DOM. The module takes every game dependency
 * (scroll mode, ships, clamp/distance helpers, fallback shot speed) as an
 * explicit argument; game.js keeps thin wrappers with the original names.
 */
(function (root) {
    'use strict';

    function normalizeAngleDegrees(angle) {
        let a = angle % 360;
        if (a > 180) a -= 360;
        if (a < -180) a += 360;
        return a;
    }

    function faceAngleToward(fromX, fromY, toX, toY, upright) {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const deg = upright
            ? Math.atan2(-dx, dy) * 180 / Math.PI
            : Math.atan2(dy, dx) * 180 / Math.PI + 180;
        return normalizeAngleDegrees(deg);
    }

    function turnAngleToward(current, target, maxStep) {
        const delta = normalizeAngleDegrees(target - current);
        if (delta > maxStep) return current + maxStep;
        if (delta < -maxStep) return current - maxStep;
        return current + delta;
    }

    function isVerticalScrollMode(scrollMode) {
        return scrollMode === 'vertical';
    }

    function nearestShip(enemy, ships, distSquared) {
        const candidates = (ships || []).filter(ship => ship && ship.active);
        if (!candidates.length) return null;
        if (!enemy) return candidates[0];
        return candidates.reduce((nearest, ship) => {
            const a = distSquared(enemy.x, enemy.y, nearest.x, nearest.y);
            const b = distSquared(enemy.x, enemy.y, ship.x, ship.y);
            return b < a ? ship : nearest;
        });
    }

    // Sample a predicted lane at a human-readable reaction cadence. Once a
    // close pass begins, retain that lane so a late dodge can beat the attack.
    // State belongs to one pooled enemy and must be cleared on reuse.
    function pursuitLane(enemy, target, state, options) {
        const { vertical, dt, soft, minLane, maxLane } = options;
        const axis = vertical ? 'x' : 'y';
        const approach = vertical ? 'y' : 'x';
        const velocity = enemy.body && enemy.body.velocity;
        // World boost changes the actual approach speed before pursuit runs.
        const speed = velocity && Number.isFinite(velocity[approach])
            ? velocity[approach]
            : (vertical ? enemy.baseVelocityY : enemy.baseVelocityX);
        const gap = target[approach] - enemy[approach];
        const closing = Number.isFinite(speed) && gap * speed > 0;
        const timeToPass = closing ? Math.abs(gap / speed) : Infinity;
        const next = state || { lane: target[axis], remaining: 0, committed: false };
        if (state) next.remaining -= Math.max(0, dt);
        if (!next.committed && next.remaining <= 0) {
            const velocity = target.body && target.body.velocity;
            const lateral = velocity && Number.isFinite(velocity[axis]) ? velocity[axis] : 0;
            const leadTime = Math.min(soft ? 0.14 : 0.3, timeToPass);
            const lead = Math.max(-70, Math.min(70, lateral * leadTime));
            next.lane = Math.max(minLane, Math.min(maxLane, target[axis] + lead));
            const interval = soft ? 0.24 : 0.16;
            // Carry frame overshoot so reaction cadence does not drift with FPS.
            next.remaining = interval - (Math.max(0, -next.remaining) % interval);
        }
        if (timeToPass < 0.32) next.committed = true;
        return next;
    }

    // Aimed enemy shot along the approach axis with perpendicular lead.
    // enemy: the shooter ({x, y, displayWidth/Height, shotSpeed?, shotAimScale?,
    //   shotMaxDx/Dy?, fireMode?, facePlayer?}).
    // target: the ship being shot at, or null when no ship is alive.
    // options: { muzzleScale?, leadPerpendicular?, predictiveAimSeconds?, speed? }.
    // env: { vertical, fallbackSpeed, clamp } — scroll orientation, signed
    //   default shot speed and a (value, lo, hi) clamp helper.
    function fireVector(enemy, target, options, env) {
        if (!target) return { x: enemy.x, y: enemy.y, vx: 0, vy: 0 };
        const opts = options || {};
        const context = env || {};
        const vertical = context.vertical === true;
        const fallbackSpeed = Number.isFinite(context.fallbackSpeed) ? context.fallbackSpeed : -430;
        const clamp = typeof context.clamp === 'function'
            ? context.clamp
            : ((value, lo, hi) => Math.min(hi, Math.max(lo, value)));
        // Predict only a short perpendicular displacement, preserving authored
        // firing axes, aim caps and flat-shot enemies. Shots never home afterward.
        if (opts.predictiveAimSeconds > 0 && !enemy.facePlayer && enemy.fireMode !== 'plunge') {
            const axis = vertical ? 'x' : 'y';
            const approachGap = vertical ? Math.abs(target.y - enemy.y) : Math.abs(target.x - enemy.x);
            const shotSpeed = Math.abs(opts.speed || enemy.shotSpeed || fallbackSpeed);
            const leadTime = Math.min(opts.predictiveAimSeconds, approachGap / (shotSpeed || 1));
            const velocity = target.body && target.body.velocity;
            const lateral = velocity && Number.isFinite(velocity[axis]) ? velocity[axis] : 0;
            target = { x: target.x, y: target.y, body: target.body,
                [axis]: target[axis] + clamp(lateral * leadTime, -70, 70) };
        }
        const muzzleScale = Number.isFinite(opts.muzzleScale) ? opts.muzzleScale : 0.46;
        const speed = Number.isFinite(opts.speed)
            ? opts.speed
            : (enemy.shotSpeed || fallbackSpeed);
        const speedMag = Math.abs(speed);
        const aimScale = Number.isFinite(enemy.shotAimScale) ? enemy.shotAimScale : 1.1;

        if (vertical) {
            const maxDx = Number.isFinite(enemy.shotMaxDx)
                ? enemy.shotMaxDx
                : (Number.isFinite(enemy.shotMaxDy) ? enemy.shotMaxDy : 150);
            let dx = clamp(
                (target.x - enemy.x) * aimScale,
                -maxDx,
                maxDx
            );
            if (opts.leadPerpendicular && target.body) {
                dx = clamp(
                    dx + target.body.velocity.x * 0.12,
                    -maxDx,
                    maxDx
                );
            }
            // Fire toward the player on the approach axis (risers climb from below → shoot up).
            const vySign = target.y < enemy.y - 4 ? -1 : 1;
            return {
                x: enemy.x,
                y: enemy.y + enemy.displayHeight * muzzleScale * vySign,
                vx: dx,
                vy: speedMag * vySign
            };
        }

        const maxDy = Number.isFinite(enemy.shotMaxDy) ? enemy.shotMaxDy : 150;
        // Plungers (top/bottom divers) fire vertically down/up the camp column,
        // forcing horizontal movement instead of another flat leftward shot.
        if (enemy.fireMode === 'plunge') {
            const vySign = target.y < enemy.y - 4 ? -1 : 1;
            const maxDx = Number.isFinite(enemy.shotMaxDx) ? enemy.shotMaxDx : 120;
            const vx = clamp((target.x - enemy.x) * 0.3, -maxDx, maxDx);
            return {
                x: enemy.x,
                y: enemy.y + enemy.displayHeight * muzzleScale * vySign,
                vx: vx,
                vy: speedMag * vySign
            };
        }
        // Flank divers/risers point their nose at the player, so non-plunge shots
        // fly straight down the nose instead of flat leftward past the target.
        if (enemy.facePlayer) {
            const aimDx = target.x - enemy.x;
            const aimDy = target.y - enemy.y;
            const aimDist = Math.hypot(aimDx, aimDy) || 1;
            const noseRange = Math.max(enemy.displayWidth || 0, enemy.displayHeight || 0) * muzzleScale;
            return {
                x: enemy.x + (aimDx / aimDist) * noseRange,
                y: enemy.y + (aimDy / aimDist) * noseRange,
                vx: (aimDx / aimDist) * speedMag,
                vy: (aimDy / aimDist) * speedMag
            };
        }
        let dy = clamp(
            (target.y - enemy.y) * aimScale,
            -maxDy,
            maxDy
        );
        if (opts.leadPerpendicular && target.body) {
            dy = clamp(
                dy + target.body.velocity.y * 0.12,
                -maxDy,
                maxDy
            );
        }
        // Preserve signed shotSpeed (negative = left) for horizontal identity.
        const vx = Number.isFinite(opts.speed) ? opts.speed : (enemy.shotSpeed || fallbackSpeed);
        return {
            x: enemy.x - enemy.displayWidth * muzzleScale,
            y: enemy.y,
            vx: vx,
            vy: dy
        };
    }

    const api = { normalizeAngleDegrees, faceAngleToward, turnAngleToward, isVerticalScrollMode, nearestShip, pursuitLane, fireVector };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NovaWingEnemyMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
