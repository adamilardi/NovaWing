const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Corridor = require('../src/corridor-math.js');

// Corridor routing rules live in src/corridor-math.js (game.js keeps thin
// wrappers). These expectations characterize the shipped canyon behavior.

test('band signatures ignore order and round to whole pixels', () => {
    assert.equal(Corridor.openBandsSignature([[0, 100], [200, 300]]), '0:100|200:300');
    assert.equal(Corridor.openBandsSignature(null), '');
    assert.equal(Corridor.openBandsSignature([]), '');
    assert.ok(Corridor.openBandsRoughlyEqual([[0, 100], [200, 300]], [[200, 300], [0, 100]]));
    assert.ok(Corridor.openBandsRoughlyEqual([[0, 100.4]], [[0, 100]]));
    assert.ok(!Corridor.openBandsRoughlyEqual([[0, 100]], [[0, 200]]));
});

test('point-in-band tests honor padding and default to open sky', () => {
    assert.equal(Corridor.yOverlapsBand(50, [0, 100]), true);
    assert.equal(Corridor.yOverlapsBand(100, [0, 100]), true);
    assert.equal(Corridor.yOverlapsBand(50, [0, 100], 60), false);
    assert.equal(Corridor.yInOpenBands(150, null), true);
    assert.equal(Corridor.yInOpenBands(150, [[0, 100]]), false);
    assert.equal(Corridor.yInOpenBands(150, [[0, 100], [120, 200]]), true);
});

test('closing regions keep only bands losing significant overlap', () => {
    assert.equal(Corridor.bandHasSignificantOverlap([0, 200], [[150, 400]]), false);
    assert.equal(Corridor.bandHasSignificantOverlap([0, 200], [[50, 400]]), true);
    assert.equal(Corridor.bandHasSignificantOverlap([0, 200], null), false);
    assert.deepEqual(Corridor.getClosingRegions([[0, 300]], [[0, 100]]), []);
    assert.deepEqual(Corridor.getClosingRegions([[0, 300]], [[250, 600]]), [[0, 300]]);
    assert.deepEqual(Corridor.getClosingRegions([[0, 50]], [[400, 600]]), [],
        'slivers below the warning height stay silent');
    assert.deepEqual(Corridor.getClosingRegions([[0, 50]], [[400, 600]], 40), [[0, 50]]);
    assert.deepEqual(Corridor.getClosingRegions([[0, 300]], []), [[0, 300]]);
    assert.deepEqual(Corridor.getClosingRegions([], [[0, 300]]), []);
});

test('escape hints point at the nearest surviving opening', () => {
    assert.equal(Corridor.getEscapeDirection([400, 500], [[0, 100]]), 'up');
    assert.equal(Corridor.getEscapeDirection([0, 100], [[400, 500]]), 'down');
    assert.equal(Corridor.getEscapeDirection([400, 500], [[0, 100], [500, 600]]), 'down');
    assert.equal(Corridor.getEscapeDirection([400, 500], []), null);
});

test('layout-change scan finds the next differing path event', () => {
    const events = [{ progressMs: 0, openBands: [[0, 100]] }, { progressMs: 5000, openBands: [[0, 200]] }];
    assert.equal(Corridor.findNextBandLayoutChange(events, 0, [[0, 100]]).index, 1);
    assert.equal(Corridor.findNextBandLayoutChange(events, 0, [[0, 200]]).index, 0);
    assert.equal(Corridor.findNextBandLayoutChange(events, 2, [[0, 100]]), null);
    assert.equal(Corridor.findNextBandLayoutChange(null, 0, [[0, 100]]), null);
});

test('blocked ranges complement the openings across the playfield', () => {
    assert.deepEqual(Corridor.blockedRangesFromOpenBands([[200, 400]], 600), [[0, 200], [400, 600]]);
    assert.deepEqual(Corridor.blockedRangesFromOpenBands([[0, 100], [500, 600]], 600), [[100, 500]]);
    assert.deepEqual(Corridor.blockedRangesFromOpenBands(null, 600), [[0, 600]]);
    assert.deepEqual(Corridor.blockedRangesFromOpenBands([[0, 600]], 600), []);
    assert.deepEqual(Corridor.blockedRangesFromOpenBands([[200, 400]]),
        Corridor.blockedRangesFromOpenBands([[200, 400]], 600));
});

test('game.js keeps delegating wrappers with the original corridor names', () => {
    const source = fs.readFileSync('game.js', 'utf8');
    for (const name of ['openBandsSignature', 'openBandsRoughlyEqual', 'yOverlapsBand',
        'yInOpenBands', 'bandHasSignificantOverlap', 'getClosingRegions',
        'getEscapeDirection', 'findNextBandLayoutChange', 'blockedRangesFromOpenBands']) {
        assert.ok(source.includes(`function ${name}(`), `game.js must keep ${name}`);
    }
    assert.ok(source.includes('NovaWingCorridor.getClosingRegions'));
    assert.ok(source.includes('NovaWingCorridor.blockedRangesFromOpenBands'));
    assert.ok(source.includes('PATH_WARNING_MIN_CLOSE_HEIGHT'),
        'game tuning constant must still feed the corridor module');
    const html = fs.readFileSync('index.html', 'utf8');
    const moduleTag = html.indexOf('src/corridor-math.js');
    const gameTag = html.indexOf('src="game.js');
    assert.ok(moduleTag > 0 && moduleTag < gameTag, 'corridor-math must load before game.js');
});
