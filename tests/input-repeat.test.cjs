const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('game.js', 'utf8');
function bodyOf(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing function ${name}`);
    const end = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, end < 0 ? undefined : end);
}

// Holding a toggle key on a real keyboard fires keydown with repeat=true about
// every 30ms. Toggle/cycle actions must fire once per physical press: without a
// repeat guard, holding P strobes pause and ends in a random state, holding M
// ends with the mute unchanged, and holding R in pause blows through the
// two-step restart confirm and wipes the run.
const TOGGLES = ['togglePause()', 'toggleMute()', 'cycleAudioStyle(', 'cycleDifficultyMode(', 'confirmPauseRestart('];

test('every toggle/cycle in handleKeyboardDown is repeat-guarded', () => {
    const body = bodyOf('handleKeyboardDown');
    for (const call of TOGGLES) {
        let index = body.indexOf(call);
        assert.ok(index >= 0, `expected ${call} in handleKeyboardDown`);
        while (index >= 0) {
            const context = body.slice(Math.max(0, index - 200), index);
            assert.ok(context.includes('event.repeat'), `unguarded ${call}: holding the key would repeat the action`);
            index = body.indexOf(call, index + call.length);
        }
    }
});

test('held-key tracking still runs for every keydown (no blanket repeat return)', () => {
    const body = bodyOf('handleKeyboardDown');
    for (const track of [
        'trackMovementInput(event, true)',
        'trackBoostInput(event, true)',
        'trackFireInput(event, true)',
    ]) {
        assert.ok(body.includes(track), `held-key tracking must keep running: ${track}`);
    }
    assert.ok(
        !body.includes('if (event.repeat) return;'),
        'a blanket repeat return would also swallow held-key tracking'
    );
});
