/**
 * Linux GPU backend selection for the bot browser launcher.
 *   node --test scripts/rl/tests/chrome-gpu.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectLinuxGpuEnv } from '../chrome.mjs';

describe('selectLinuxGpuEnv', () => {
    it('returns null when no GPU device exists', () => {
        assert.equal(selectLinuxGpuEnv({}), null);
        assert.equal(selectLinuxGpuEnv({ dxg: false, dri: false, wsl: true }), null);
        assert.equal(selectLinuxGpuEnv(), null);
    });
    it('forces the d3d12 gallium driver on WSL with /dev/dxg', () => {
        assert.deepEqual(selectLinuxGpuEnv({ dxg: true, dri: true, wsl: true }), { GALLIUM_DRIVER: 'd3d12' });
        assert.deepEqual(selectLinuxGpuEnv({ dxg: true, dri: false, wsl: true }), { GALLIUM_DRIVER: 'd3d12' });
    });
    it('lets Mesa auto-pick on bare metal with DRI', () => {
        assert.deepEqual(selectLinuxGpuEnv({ dxg: false, dri: true, wsl: false }), {});
    });
});
