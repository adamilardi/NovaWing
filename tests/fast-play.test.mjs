import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAST_STEP_MS, fastPlayEnabled } from '../scripts/fast-play.mjs';

test('fast play stays on 16 ms frames and yields for video or a headed window', () => {
    assert.equal(FAST_STEP_MS, 16);
    const saved = {
        FAST_PLAY: process.env.FAST_PLAY,
        RECORD_VIDEO: process.env.RECORD_VIDEO
    };
    try {
        delete process.env.FAST_PLAY;
        delete process.env.RECORD_VIDEO;
        assert.equal(fastPlayEnabled(true), true);
        assert.equal(fastPlayEnabled(false), false);
        process.env.RECORD_VIDEO = '1';
        assert.equal(fastPlayEnabled(true), false);
        delete process.env.RECORD_VIDEO;
        process.env.FAST_PLAY = '0';
        assert.equal(fastPlayEnabled(true), false);
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
