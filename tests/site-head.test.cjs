/**
 * Public page head contract (index.html).
 *
 * The game boots inside a canvas, but the tab, search results, and link
 * unfurls read the head: a favicon, a description, and Open Graph tags.
 * The favicon is an inline data URI so the build publishes no extra file.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('page head carries favicon, description, and OG tags', () => {
    assert.ok(html.includes('<link rel="icon"'), 'favicon link missing');
    assert.ok(html.includes('<meta name="description"'), 'description meta missing');
    assert.ok(html.includes('<meta property="og:title"'), 'og:title missing');
    assert.ok(html.includes('<meta property="og:description"'), 'og:description missing');
    assert.ok(html.includes('<meta property="og:type"'), 'og:type missing');
});

test('favicon needs no published asset', () => {
    const match = html.match(/<link rel="icon" href="([^"]+)"/);
    assert.ok(match, 'favicon link missing');
    assert.ok(match[1].startsWith('data:image/svg+xml,'), 'favicon must be an inline data URI');
});
