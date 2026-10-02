import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRunWin, advanceCampaign } from '../run-outcome.mjs';

test('intermediate clears end level runs but never campaign runs', () => {
    const cleared = { level: 1, levelCompleted: true, awaitingNextLevel: true };
    assert.equal(isRunWin(cleared, 1), true);
    assert.equal(isRunWin(cleared), false);
    assert.equal(isRunWin({ level: 2 }, 1), true);
    assert.equal(isRunWin({ level: 2 }), false);
    assert.equal(isRunWin({ level: 7, victoryPending: true }), true);
    assert.equal(isRunWin({ level: 7, levelCompleted: true }), false);
    assert.equal(isRunWin({ level: 7, levelCompleted: true }, 7), true);
    assert.equal(isRunWin({ level: 3, levelEnded: true, lives: 1 }, 3), false);
    assert.equal(isRunWin(null), false);
});

test('campaign continuation uses the results action and clears old pilot outcomes', async () => {
    let advanced = 0;
    globalThis.awaitingNextLevel = true;
    globalThis.resultsGamepadActions = { goNext: () => {
        advanced++;
        globalThis.awaitingNextLevel = false;
    } };
    globalThis.window = { __novawingPilotOutcome: 'win', __novawingPolicyOutcome: 'win' };
    const page = { evaluate: async fn => fn() };
    const clear = { awaitingNextLevel: true, levelCompleted: true };
    try {
        assert.equal(await advanceCampaign(page, clear, 1), false);
        assert.equal(await advanceCampaign(page, { victoryPending: true, ...clear }), false);
        assert.equal(await advanceCampaign(page, {}), false);
        assert.equal(advanced, 0);
        assert.equal(await advanceCampaign(page, clear), true);
        assert.equal(advanced, 1);
        assert.equal(window.__novawingPilotOutcome, null);
        assert.equal(window.__novawingPolicyOutcome, null);
        globalThis.awaitingNextLevel = true;
        globalThis.resultsGamepadActions = null;
        await assert.rejects(advanceCampaign(page, clear), /no next-level action/);
    } finally {
        delete globalThis.awaitingNextLevel;
        delete globalThis.resultsGamepadActions;
        delete globalThis.window;
    }
});
