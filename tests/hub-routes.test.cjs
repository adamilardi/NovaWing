/**
 * Hub Worker route guard (hub/wrangler.jsonc).
 *
 * Live traffic is served by Cloudflare Pages projects directly (see AGENTS.md):
 * the ailardi-arcade Worker router is retained as historical code only. Its
 * config must not attach to any domain, otherwise a redeploy would shadow the
 * live ailardi.com Pages site.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

async function readWranglerJsonc() {
    const raw = await fs.readFile(path.join(ROOT, 'hub', 'wrangler.jsonc'), 'utf8');
    const stripped = raw
        .split('\n')
        .filter(line => !line.trimStart().startsWith('//'))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    return { raw, config: JSON.parse(stripped) };
}

test('historical hub Worker defines no routes or custom domains', async () => {
    const { raw, config } = await readWranglerJsonc();
    assert.ok(!('routes' in config), 'hub/wrangler.jsonc must not define routes');
    assert.ok(!raw.includes('custom_domain'), 'hub/wrangler.jsonc must not claim a custom domain');
});
