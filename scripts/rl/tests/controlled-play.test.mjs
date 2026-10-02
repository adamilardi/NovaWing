import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpointError, jumpControlledSegment } from '../controlled-play.mjs';
import { runtime } from '../load-runtime.mjs';

test('terminal snapshots retain an outcome without an endpoint', () => {
    assert.equal(endpointError({ x: 10, y: 10 }, { player: null }), null);
    assert.equal(endpointError({ x: 10, y: 10 }, { player: { x: 13, y: 14 } }), 5);
});

test('failed or unsettled segment jumps cannot run a mislabeled scenario', async () => {
    let advanced = 0;
    const failed = { evaluate: async () => false, clock: { runFor: async () => advanced++ } };
    await assert.rejects(jumpControlledSegment(failed, 'finalBoss'), /failed/);
    assert.equal(advanced, 0);
    let calls = 0;
    const unsettled = { evaluate: async () => ++calls === 1,
        clock: { runFor: async () => advanced++ } };
    await assert.rejects(jumpControlledSegment(unsettled, 'topdown'), /orientation/);
    assert.equal(advanced, 180);
});

test('sampler retains boundary-crossing latent actions and samples both buttons', () => {
    const policy = { obsSize: 320, actionSize: 4,
        moveLogStd: [Math.log(0.22), Math.log(0.31)],
        layers: [{ w: Array.from({ length: 4 }, () => Array(320).fill(0)),
            b: [1, -1, 0, 0], act: 'identity' }] };
    let n = 0, b = 0;
    const sample = runtime.samplePolicyAction(policy, new Float32Array(320),
        () => [0.9, 0.1][b++], () => [3, -3][n++]);
    assert.ok(sample.behaviorAction[0] > 1);
    assert.ok(sample.behaviorAction[1] < -1);
    assert.deepEqual(sample.action, [1, -1, 0, 1]);
    assert.ok(Number.isFinite(sample.behaviorLogProb));
});
