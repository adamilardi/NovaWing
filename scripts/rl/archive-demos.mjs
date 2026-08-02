/**
 * Archive demo JSONL that doesn't match the current OBS contract (or all demos).
 *
 *   npm run rl:archive-demos           # move non-v2 demos aside
 *   npm run rl:archive-demos -- --all  # move everything under demos/
 *
 * Destination: rl/demos/_archive_<stamp>/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OBS_VERSION, OBS_SIZE } from './obs-encode.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DEMO_DIR = process.env.DEMO_DIR || path.join(ROOT, 'rl', 'demos');
const ALL = process.argv.includes('--all') || process.env.ALL === '1';

function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function readHeader(file) {
    try {
        const fh = fs.openSync(file, 'r');
        const buf = Buffer.alloc(4096);
        const n = fs.readSync(fh, buf, 0, 4096, 0);
        fs.closeSync(fh);
        const line = buf.slice(0, n).toString('utf8').split('\n')[0];
        return JSON.parse(line);
    } catch {
        return null;
    }
}

function main() {
    if (!fs.existsSync(DEMO_DIR)) {
        console.log(`No demos dir: ${DEMO_DIR}`);
        return;
    }
    const files = fs.readdirSync(DEMO_DIR)
        .filter((f) => f.startsWith('demo-') && f.endsWith('.jsonl'))
        .map((f) => path.join(DEMO_DIR, f));

    if (!files.length) {
        console.log('No demo-*.jsonl to archive.');
        return;
    }

    const toMove = [];
    let keep = 0;
    for (const file of files) {
        if (ALL) {
            toMove.push(file);
            continue;
        }
        const header = readHeader(file);
        const ver = header && header.obsVersion != null ? header.obsVersion : null;
        const size = header && header.obsSize != null ? header.obsSize : null;
        if (ver === OBS_VERSION && size === OBS_SIZE) {
            keep += 1;
            continue;
        }
        toMove.push(file);
    }

    if (!toMove.length) {
        console.log(`Nothing to archive. ${keep} demos already match OBS v${OBS_VERSION} size=${OBS_SIZE}.`);
        return;
    }

    const dest = path.join(DEMO_DIR, `_archive_obs${OBS_VERSION}_${stamp()}`);
    fs.mkdirSync(dest, { recursive: true });
    for (const file of toMove) {
        const base = path.basename(file);
        fs.renameSync(file, path.join(dest, base));
    }
    console.log(`Archived ${toMove.length} demos → ${path.relative(ROOT, dest)}`);
    if (!ALL) console.log(`Kept ${keep} current OBS v${OBS_VERSION} demos in ${path.relative(ROOT, DEMO_DIR)}`);
    console.log('Next: LEVEL=1 EPISODES=8 npm run rl:record && npm run rl:train');
}

main();
