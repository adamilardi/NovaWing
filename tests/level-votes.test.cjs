const { test } = require('node:test');
const assert = require('node:assert/strict');
const Votes = require('../shared/level-votes.cjs');

test('a pilot has one vote per extra level and can change it', () => {
    const up = Votes.normalizeVote({ levelId: 12, name: 'Ada', vote: 'up' });
    assert.equal(up.nameKey, 'ada');
    const changed = Votes.applyVote([up], Votes.normalizeVote({ levelId: 12, name: 'ada', vote: 'down' }));
    assert.equal(changed.length, 1);
    assert.equal(changed[0].vote, 'down');
    assert.equal(changed[0].name, 'ada');
    const other = Votes.applyVote(changed, Votes.normalizeVote({ levelId: 12, name: 'Bo', vote: 'up' }));
    const summary = Votes.summarizeVotes(other).find(row => row.levelId === 12);
    assert.equal(summary.up, 1);
    assert.equal(summary.down, 1);
    assert.deepEqual(summary.likes, ['Bo']);
    assert.deepEqual(summary.dislikes, ['ada']);
    assert.equal(Votes.normalizeVote({ levelId: 4, name: 'Ada', vote: 'up' }), null);
    assert.equal(Votes.normalizeVote({ levelId: 12, name: 'Ada', vote: 'maybe' }), null);
});

