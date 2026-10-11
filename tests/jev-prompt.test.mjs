import assert from 'node:assert/strict';
import test from 'node:test';
import { formatActionLabel, jevActionGuidance, jevGoal, shortlistActionKeys } from '../scripts/jev-combat-state.mjs';

test('goal states the harness life rule without calling it Hotshot', () => {
    const goal = jevGoal(4);
    assert.match(goal, /Clear Level 4/);
    assert.match(goal, /3 lives/);
    assert.match(goal, /Continues are unlimited/);
    assert.match(goal, /losing the life/);
    assert.match(goal, /Auto-fire is held/);
    assert.doesNotMatch(goal, /Hotshot/i);
    assert.doesNotMatch(goal, /400–530|100–280/);
});

test('guidance names the score scale, post-action damage, bands, and boost', () => {
    const text = jevActionGuidance().join('\n');
    assert.match(text, /highest score/);
    assert.match(text, /endpointErrorPx above 12/);
    assert.match(text, /predictedDamage is a hit during this hold, about -10000/);
    assert.match(text, /postActionDamage is a hit if you then hold still, about -2500/);
    assert.match(text, /event horizon is about -100000/);
    assert.match(text, /predictedDamage outranks postActionDamage/);
    assert.match(text, /tacticalGoal/);
    assert.match(text, /openBands/);
    assert.match(text, /same stick without boost/);
    assert.doesNotMatch(text, /y=400|x=100/);
});

test('choice labels stay one line and keep the damage times', () => {
    const label = formatActionLabel({
        stick: 'up_left',
        boost: true,
        score: -10230.4,
        end: { x: 120.4, y: 480.2 },
        predictedDamage: { kind: 'telegraphed-laser', atMs: 40.2 },
        postActionDamage: null,
        edgeAtMs: 80
    });
    assert.equal(label, 'up_left boost=true score=-10230.4 end=120,480 damage=telegraphed-laser@40ms post=none edge=80ms');
    assert.equal(label.includes('\n'), false);
    assert.equal(formatActionLabel({
        stick: 'hold', boost: false, score: 8, predictedDamage: null, postActionDamage: null, edgeAtMs: null
    }), 'hold boost=false score=8 end=none damage=none post=none edge=none');
});

function opt(stick, boost, score, damage = null) {
    return { stick, boost, score, predictedDamage: damage, postActionDamage: null, end: { x: 1, y: 2 }, edgeAtMs: null };
}

test('shortlist keeps the best action, a damaged twin, and two other sticks', () => {
    const options = {
        up_boost: opt('up', true, 50),
        up: opt('up', false, 10, { kind: 'bullet', atMs: 40 }),
        hold: opt('hold', false, 40),
        left: opt('left', false, 30),
        left_boost: opt('left', true, 35),
        right: opt('right', false, 5)
    };
    assert.deepEqual(shortlistActionKeys(options, 'up_boost'), ['up_boost', 'up', 'hold', 'left_boost']);
    assert.deepEqual(shortlistActionKeys({
        hold: opt('hold', false, 9),
        up: opt('up', false, 4),
        up_boost: opt('up', true, 8),
        down: opt('down', false, 1)
    }, 'hold'), ['hold', 'up_boost', 'down']);
});
