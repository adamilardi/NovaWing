/**
 * Load scripts/rl/runtime-pure.js into Node and re-export the API.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RUNTIME_PURE_PATH = path.join(__dirname, 'runtime-pure.js');

const require = createRequire(import.meta.url);

let cached = null;

export function loadRuntime() {
    if (cached) return cached;
    // Prefer require (module.exports) — fastest and reliable for this IIFE.
    try {
        cached = require(RUNTIME_PURE_PATH);
        if (cached && cached.OBS_SIZE) return cached;
    } catch {
        // fall through to vm
    }
    const code = fs.readFileSync(RUNTIME_PURE_PATH, 'utf8');
    const sandbox = { module: { exports: {} }, exports: {}, globalThis: {} };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(code, sandbox, { filename: 'runtime-pure.js' });
    cached = sandbox.module.exports && sandbox.module.exports.OBS_SIZE
        ? sandbox.module.exports
        : sandbox.globalThis.NovaWingRL;
    if (!cached || !cached.OBS_SIZE) {
        throw new Error('Failed to load NovaWingRL runtime-pure.js');
    }
    return cached;
}

export const runtime = loadRuntime();
