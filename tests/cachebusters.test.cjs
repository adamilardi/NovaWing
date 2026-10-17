/**
 * Cache-buster contract (index.html + scripts/build.cjs).
 *
 * Script ?v= tags are build-stamped content hashes, never hand versions: the
 * source keeps ?v=dev placeholders and the build rewrites each local script
 * src to the sha256 of the shipped bytes, so a URL changes exactly when its
 * file changes.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const path = require('node:path');
const { build } = require('../scripts/build.cjs');

const ROOT = path.resolve(__dirname, '..');
const HASH_RE = /^[0-9a-f]{12}$/;

function localScriptSrcs(html) {
    const srcs = [];
    const re = /<script\s+src="(?!https?:|\/\/)([^"#]+)"/g;
    let match;
    while ((match = re.exec(html)) !== null) srcs.push(match[1]);
    return srcs;
}

test('source keeps placeholders, never hand versions', async () => {
    const html = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
    const srcs = localScriptSrcs(html);
    assert.ok(srcs.length > 10, 'expected the game script tags in index.html');
    for (const src of srcs) {
        const query = src.split('?')[1];
        assert.ok(query === undefined || query === 'v=dev', `source src must be unbusted or ?v=dev: ${src}`);
    }
});

test('build stamps each local script with its content hash', async () => {
    const output = await fs.mkdtemp('/tmp/novawing-cachebusters-');
    try {
        await build(output);
        const html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
        assert.ok(!html.includes('?v=dev'), 'built index.html must not keep placeholders');
        const srcs = localScriptSrcs(html);
        assert.ok(srcs.length > 10, 'expected the game script tags in built index.html');
        for (const src of srcs) {
            const [rel, query] = src.split('?');
            assert.ok(query && query.startsWith('v='), `built src must carry a hash: ${src}`);
            const hash = query.slice(2);
            assert.ok(HASH_RE.test(hash), `hash must be 12 hex chars: ${src}`);
            const bytes = await fs.readFile(path.join(output, rel));
            const expected = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
            assert.equal(hash, expected, `stale hash for ${rel}`);
        }
        assert.ok(html.includes('cdn.jsdelivr.net/npm/phaser@'), 'CDN script must survive stamping');
    } finally { await fs.rm(output, { recursive: true, force: true }); }
});
