/**
 * Phaser CDN fallback contract (index.html + vendor/ + scripts/build.cjs).
 *
 * The CDN copy of Phaser is a single point of failure: if it fails, the
 * boot screen must load the vendored copy synchronously (preserving script
 * order) before any game script runs, and only report a load failure when
 * both copies are missing.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('../scripts/build.cjs');

const ROOT = path.resolve(__dirname, '..');

async function readHtml() {
    return fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
}

test('CDN failure falls back to the vendored Phaser before any game script', async () => {
    const html = await readHtml();
    const cdn = html.indexOf('cdn.jsdelivr.net/npm/phaser@');
    const fallback = html.indexOf('vendor/phaser.min.js');
    const firstGameScript = html.indexOf('<script src="src/assets.js');
    assert.ok(cdn !== -1, 'index.html must load Phaser from the CDN first');
    assert.ok(fallback !== -1, 'index.html must reference the vendored Phaser fallback');
    assert.ok(fallback > cdn, 'fallback must come after the CDN script tag');
    assert.ok(firstGameScript !== -1, 'expected game script tags in index.html');
    assert.ok(fallback < firstGameScript, 'fallback must run before any game script');
});

test('boot failure is reported only when both Phaser copies fail', async () => {
    const html = await readHtml();
    assert.ok(!html.includes('onerror="window.__novaPhaserLoadFailed'),
        'CDN tag must not report failure before the fallback runs');
    const flag = html.indexOf('__novaPhaserLoadFailed = true');
    const fallback = html.indexOf('vendor/phaser.min.js');
    assert.ok(flag !== -1, 'index.html must still report a failure when nothing loads');
    assert.ok(flag > fallback, 'failure flag must be set only after the fallback attempt');
    // The injected fallback executes when its own block finishes, so the flag
    // check must live in a later script block, not the same one.
    const injected = html.indexOf('document.write');
    const blockEnd = html.indexOf('</script>', injected);
    assert.ok(injected !== -1 && blockEnd !== -1 && blockEnd < flag,
        'failure flag must be checked in a script block after the fallback injection');
});

test('vendored Phaser version matches the CDN version', async () => {
    const html = await readHtml();
    const cdn = html.match(/cdn\.jsdelivr\.net\/npm\/phaser@([\d.]+)\/dist\/phaser\.min\.js/);
    assert.ok(cdn, 'CDN Phaser URL must carry a pinned version');
    const vendor = await fs.readFile(path.join(ROOT, 'vendor', 'phaser.min.js'), 'utf8');
    assert.ok(vendor.includes(cdn[1]),
        `vendor/phaser.min.js must be Phaser ${cdn[1]} to match the CDN tag`);
});

test('build publishes the vendored Phaser referenced by index.html', async () => {
    const output = await fs.mkdtemp('/tmp/novawing-cdn-fallback-');
    try {
        await build(output);
        await fs.access(path.join(output, 'vendor', 'phaser.min.js'));
    } finally { await fs.rm(output, { recursive: true, force: true }); }
});
