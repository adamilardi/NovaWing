const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const assets = require('../src/assets.js');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'dist');
const ENTRY_FILES = ['index.html', 'levels.js', 'levels.validation.js', 'audio.js', 'game.js',
    'vendor/phaser.min.js',
    'src/assets.js', 'src/boss-director.js', 'src/level-flow.js', 'src/audio-director.js', 'src/pilot-facts.js', 'src/pilot-tactics.js', 'src/gameplay-rng.js',
    'src/corridor-math.js', 'src/enemy-math.js', 'src/wall-spawn.js', 'src/difficulty-heat.js'];

async function build(output = OUTPUT) {
    output = path.resolve(output);
    if (output !== OUTPUT && !output.startsWith('/tmp/')) {
        throw new Error('Build output must be dist/ or an isolated directory under /tmp/.');
    }
    if (output === '/tmp') throw new Error('Use an isolated build directory.');
    const assetFiles = assets.files();
    for (const file of assetFiles) {
        if (!/^assets\/(?:[\w.-]+\/)*[\w.-]+$/.test(file) || file.split('/').includes('..')) {
            throw new Error('Asset must be a local path under assets/: ' + file);
        }
    }
    const publicFiles = ENTRY_FILES.concat(assetFiles);
    await Promise.all(publicFiles.map(file => fs.access(path.join(ROOT, file))));
    await fs.mkdir(output, { recursive: true });
    // Rebuild the public output, including stale root files from earlier builds.
    // Authored source files are always inputs; only registered files are published.
    await Promise.all((await fs.readdir(output)).map(file =>
        fs.rm(path.join(output, file), { recursive: true, force: true })));
    await Promise.all(publicFiles.map(async file => {
        const target = path.join(output, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(path.join(ROOT, file), target);
    }));
    await stampCacheBusters(output);
    return output;
}

async function stampCacheBusters(output) {
    // Rewrite every local <script src> in the copied index.html (including the
    // document.write fallback string) to ?v=<content hash>, so a shipped URL
    // changes exactly when its bytes change. Absolute CDN URLs are untouched.
    const htmlPath = path.join(output, 'index.html');
    const html = await fs.readFile(htmlPath, 'utf8');
    const locals = new Set();
    for (const match of html.matchAll(/<script\s+src="(?!https?:|\/\/)([^"?#]+)(?:\?[^"#]*)?"/g)) {
        locals.add(match[1]);
    }
    const hashes = {};
    for (const rel of [...locals].sort()) {
        const bytes = await fs.readFile(path.join(output, rel)).catch(() => null);
        if (!bytes) throw new Error('index.html references an unpublished script: ' + rel);
        hashes[rel] = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    }
    const stamped = html.replace(
        /(<script\s+src="(?!https?:|\/\/)([^"?#]+))(?:\?[^"#]*)?(")/g,
        (full, prefix, rel, suffix) => `${prefix}?v=${hashes[rel]}${suffix}`
    );
    await fs.writeFile(htmlPath, stamped);
}

module.exports = { build, OUTPUT };
if (require.main === module) {
    build().then(output => console.log('Built public files in ' + output)).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
