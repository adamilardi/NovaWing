const { test } = require('node:test');
const assert = require('node:assert/strict');

// Every authored terrain block must spawn inside the wall-cull range, or it
// deactivates on its first frame and the gate never appears (L17 reef gates,
// and every baked-terrain level, shipped exactly this way).
//
// Bounds mirror game.js isOffscreen with the wall pad (game.js wall update):
//   horizontal: x > GAME_WIDTH + pad + 30 culls  -> spawn x must stay <= that
//   vertical:   y < -pad - 80 culls              -> spawn y must stay >= that
// with GAME_WIDTH 800 and pad WALL_CULL_PAD below. If the pad changes in
// game.js, update the constant here to match.
const WALL_CULL_PAD = 160;
const MAX_SPAWN_X = 800 + WALL_CULL_PAD + 30;
const MIN_SPAWN_Y = -WALL_CULL_PAD - 80;

function shippedDefs() {
    const Levels = require('../levels.js');
    if (Levels.getEffectiveLevelDefs) return Levels.getEffectiveLevelDefs();
    return [];
}

test('terrain blocks spawn inside the wall-cull range on every level', () => {
    const defs = shippedDefs();
    assert.ok(defs.length >= 17, 'expected the full shipped catalog');
    let blocks = 0;
    for (const def of defs) {
        for (const seg of (def.segments || [])) {
            const vertical = seg.combatOrientation === 'up' || seg.scrollMode === 'vertical';
            for (const event of (seg.terrainEvents || [])) {
                for (const block of (event.blocks || [])) {
                    blocks += 1;
                    const along = Number(block.along) || 0;
                    if (vertical) {
                        const y = -110 - along;
                        assert.ok(y >= MIN_SPAWN_Y,
                            `L${def.id}/${seg.id} block spawns at y=${y}, culls below ${MIN_SPAWN_Y}`);
                    } else {
                        const x = 910 + along;
                        assert.ok(x <= MAX_SPAWN_X,
                            `L${def.id}/${seg.id} block spawns at x=${x}, culls past ${MAX_SPAWN_X}`);
                    }
                }
            }
        }
    }
    assert.ok(blocks > 100, `expected authored terrain blocks, saw ${blocks}`);
});
