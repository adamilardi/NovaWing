import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseBossGun, BOSS_GUN } from '../../bot-guns.mjs';

test('boss gun target is the forgiving spread fan, never the boss-immune laser', () => {
    assert.equal(BOSS_GUN, 'spread');
});

test('laser at max rank cycles twice to reach spread (spread -> laser -> torrent order)', () => {
    assert.equal(chooseBossGun({ gun: 'laser', rank: 3 }), 2);
});

test('spread and torrent at max rank hold (both damage bosses)', () => {
    assert.equal(chooseBossGun({ gun: 'spread', rank: 3 }), 0);
    assert.equal(chooseBossGun({ gun: 'torrent', rank: 3 }), 0);
});

test('sub-max ranks hold: single and twin guns fire real bullets', () => {
    assert.equal(chooseBossGun({ gun: 'single', rank: 1 }), 0);
    assert.equal(chooseBossGun({ gun: 'twin', rank: 2 }), 0);
    assert.equal(chooseBossGun({ gun: 'laser', rank: 2 }), 0);
});

test('unknown or missing gun state holds instead of flailing', () => {
    assert.equal(chooseBossGun({ gun: 'mystery', rank: 3 }), 0);
    assert.equal(chooseBossGun({ gun: undefined, rank: 3 }), 0);
    assert.equal(chooseBossGun({ gun: 'laser', rank: undefined }), 0);
    assert.equal(chooseBossGun({}), 0);
});
