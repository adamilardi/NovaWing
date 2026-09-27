/**
 * Dodge facts for NovaWing pilots.
 * Pure: no Phaser. Browser global NovaWingPilot, or module.exports.
 *
 * "Hold" means the ship stops. Each other move is full speed in that
 * direction. A move is safe when nothing overlaps the ship within the
 * horizon and the ship stays inside the play field.
 */
(function (root) {
    'use strict';

    var HORIZON_S = 0.7;
    var SAFE_S = 0.45;
    var EDGE_CHECK_S = 0.22;
    var MOVE_ORDER = [
        'hold', 'up', 'down', 'left', 'right',
        'up_left', 'up_right', 'down_left', 'down_right'
    ];
    var MOVE_AXES = {
        hold: [0, 0],
        up: [0, -1],
        down: [0, 1],
        left: [-1, 0],
        right: [1, 0],
        up_left: [-1, -1],
        up_right: [1, -1],
        down_left: [-1, 1],
        down_right: [1, 1]
    };

    function unit(x, y) {
        var len = Math.hypot(x, y);
        if (len < 0.04) return { x: 0, y: 0 };
        return { x: x / len, y: y / len };
    }

    function axisWindow(delta, relV, half) {
        if (Math.abs(relV) < 1e-3) {
            if (Math.abs(delta) <= half) return { enter: -Infinity, exit: Infinity };
            return null;
        }
        var t1 = (-half - delta) / relV;
        var t2 = (half - delta) / relV;
        return { enter: Math.min(t1, t2), exit: Math.max(t1, t2) };
    }

    /** Seconds until the ship body overlaps the threat, or null. */
    function overlapSeconds(ship, threat, svx, svy) {
        var dx = threat.x - ship.x;
        var dy = threat.y - ship.y;
        var rvx = (threat.vx || 0) - svx;
        var rvy = (threat.vy || 0) - svy;
        var hw = (threat.w || 16) * 0.5 + ship.w * 0.5;
        var hh = (threat.h || 16) * 0.5 + ship.h * 0.5;
        var x = axisWindow(dx, rvx, hw);
        var y = axisWindow(dy, rvy, hh);
        if (!x || !y) return null;
        var enter = Math.max(x.enter, y.enter);
        var exit = Math.min(x.exit, y.exit);
        if (enter > exit || exit < 0) return null;
        var t = Math.max(0, enter);
        if (t > HORIZON_S) return null;
        return t;
    }

    function inside(x, y, bounds) {
        return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
    }

    function holeHits(x, y, hole) {
        if (!hole) return false;
        var dx = x - hole.x;
        var dy = y - hole.y;
        var kill = (hole.killRadius || 28) + 10;
        return dx * dx + dy * dy <= kill * kill;
    }

    function firstHit(ship, threats, hole, svx, svy) {
        var best = null;
        for (var i = 0; i < threats.length; i++) {
            var t = overlapSeconds(ship, threats[i], svx, svy);
            if (t == null) continue;
            if (best == null || t < best) best = t;
        }
        if (hole) {
            var steps = 4;
            for (var s = 1; s <= steps; s++) {
                var dt = (SAFE_S * s) / steps;
                var x = ship.x + svx * dt;
                var y = ship.y + svy * dt;
                if (holeHits(x, y, hole)) {
                    if (best == null || dt < best) best = dt;
                    break;
                }
            }
        }
        return best;
    }

    function evaluateMove(ship, threats, hole, bounds, svx, svy) {
        var t = firstHit(ship, threats, hole, svx, svy);
        var aheadX = ship.x + svx * EDGE_CHECK_S;
        var aheadY = ship.y + svy * EDGE_CHECK_S;
        var hitsEdge = !inside(aheadX, aheadY, bounds);
        var safe = !hitsEdge && (t == null || t >= SAFE_S);
        return {
            safe: safe,
            hitsEdge: hitsEdge,
            ttiMs: t == null ? null : Math.round(t * 1000)
        };
    }

    function facts(input) {
        var ship = input.ship;
        var worldW = input.worldW || 800;
        var worldH = input.worldH || 600;
        var hw = ship.w * 0.5;
        var hh = ship.h * 0.5;
        var bounds = {
            minX: 24 + hw,
            maxX: worldW - 24 - hw,
            minY: 36 + hh,
            maxY: worldH - 28 - hh
        };
        var threats = []
            .concat(input.bullets || [])
            .concat(input.enemies || [])
            .concat(input.obstacles || []);
        if (input.boss) threats.push(input.boss);
        var hole = input.blackHole || null;
        var speed = Number.isFinite(input.speed) ? input.speed : 280;

        var holdHit = firstHit(ship, threats, hole, 0, 0);
        var listed = threats.map(function (threat) {
            var t = overlapSeconds(ship, threat, 0, 0);
            var dx = threat.x - ship.x;
            var dy = threat.y - ship.y;
            return {
                kind: threat.kind || 'object',
                type: threat.type || threat.kind || 'object',
                dx: Math.round(dx),
                dy: Math.round(dy),
                vx: Math.round(threat.vx || 0),
                vy: Math.round(threat.vy || 0),
                w: Math.round(threat.w || 16),
                h: Math.round(threat.h || 16),
                laser: Boolean(threat.laser),
                ttiMs: t == null ? null : Math.round(t * 1000),
                hitsIfHold: t != null,
                dist: Math.round(Math.hypot(dx, dy))
            };
        }).filter(function (threat) {
            return threat.hitsIfHold || threat.dist < 520 || threat.kind === 'boss';
        }).sort(function (a, b) {
            if (a.hitsIfHold !== b.hitsIfHold) return a.hitsIfHold ? -1 : 1;
            var at = a.ttiMs == null ? 99999 : a.ttiMs;
            var bt = b.ttiMs == null ? 99999 : b.ttiMs;
            if (at !== bt) return at - bt;
            return a.dist - b.dist;
        }).slice(0, 8);

        function movesAt(moveSpeed) {
            var out = {};
            for (var i = 0; i < MOVE_ORDER.length; i++) {
                var key = MOVE_ORDER[i];
                var axis = MOVE_AXES[key];
                var dir = unit(axis[0], axis[1]);
                out[key] = evaluateMove(ship, threats, hole, bounds, dir.x * moveSpeed, dir.y * moveSpeed);
            }
            return out;
        }

        var moves = movesAt(speed);
        var safest = 'hold';
        var safestTti = moves.hold.safe ? Infinity : (moves.hold.ttiMs == null ? -1 : moves.hold.ttiMs);
        for (var m = 0; m < MOVE_ORDER.length; m++) {
            var key = MOVE_ORDER[m];
            var move = moves[key];
            var score = move.safe ? Infinity : (move.ttiMs == null ? -1 : move.ttiMs);
            var better = score > safestTti || (score === safestTti && key === 'hold');
            if (better) {
                safest = key;
                safestTti = score;
            }
        }

        return {
            speed: Math.round(speed),
            edges: {
                left: Math.round(ship.x - bounds.minX),
                right: Math.round(bounds.maxX - ship.x),
                up: Math.round(ship.y - bounds.minY),
                down: Math.round(bounds.maxY - ship.y)
            },
            bounds: bounds,
            invulnerableMs: Math.max(0, Math.round(input.invulnerableMs || 0)),
            holdHits: holdHit != null && holdHit < SAFE_S,
            threats: listed,
            moves: moves,
            boostMoves: input.canBoost ? movesAt(input.boostSpeed || 470) : null,
            safest: safest,
            boss: input.boss ? {
                dx: Math.round(input.boss.x - ship.x),
                dy: Math.round(input.boss.y - ship.y),
                w: Math.round(input.boss.w || 0),
                h: Math.round(input.boss.h || 0),
                phase: input.boss.phase || 1,
                health: input.boss.health || 0,
                maxHealth: input.boss.maxHealth || 0,
                nextShotMs: Number.isFinite(input.boss.nextShotMs) ? Math.round(input.boss.nextShotMs) : null
            } : null
        };
    }

    var api = {
        HORIZON_S: HORIZON_S,
        MOVE_ORDER: MOVE_ORDER,
        facts: facts
    };
    root.NovaWingPilot = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
