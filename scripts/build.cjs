const fs = require('node:fs/promises');
const path = require('node:path');
const assets = require('../src/assets.js');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'dist');
const ENTRY_FILES = ['index.html', 'levels.js', 'audio.js', 'game.js',
    'src/assets.js', 'src/level-flow.js', 'src/audio-director.js'];

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
    return output;
}

module.exports = { build, OUTPUT };
if (require.main === module) {
    build().then(output => console.log('Built public files in ' + output)).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
