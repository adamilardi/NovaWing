const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Pages endpoints return 503 JSON without a D1 binding', async () => {
    const { onRequest: run } = await import('../functions/api/run.js');
    const { onRequest: board } = await import('../functions/api/leaderboard.js');
    const post = (url) => new Request(url, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: '{}' });
    const runRes = await run({ request: post('https://example.test/api/run'), env: {} });
    assert.equal(runRes.status, 503);
    assert.equal(runRes.headers.get('x-content-type-options'), 'nosniff');
    const boardRes = await board({ request: post('https://example.test/api/leaderboard'), env: {} });
    assert.equal(boardRes.status, 503);
    const getRes = await board({ request: new Request('https://example.test/api/leaderboard'), env: {} });
    assert.equal(getRes.status, 503);
});

test('run rate-limit key ignores User-Agent rotation', async () => {
    const { onRequest: run } = await import('../functions/api/run.js');
    const rows = [];
    const DB = {
        prepare() {
            return { bind() { return this; },
                async run() { rows.push(1); return { meta: { changes: 1 } }; },
                async first() { return { count: 0 }; } };
        }
    };
    for (const ua of ['A', 'B', 'C']) {
        const res = await run({ request: new Request('https://example.test/api/run', { method: 'POST',
            headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', 'User-Agent': ua },
            body: JSON.stringify({ scope: 'campaign' }) }), env: { DB } });
        assert.equal(res.status, 201, await res.clone().text());
    }
});
