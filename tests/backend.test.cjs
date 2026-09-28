const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Readable, Writable } = require('node:stream');

// Run the real request handler and filesystem streams without binding a port.
async function serverFixture(t) {
    const fixtureRoot = await fs.mkdtemp('/tmp/novawing-http-');
    const publicRoot = path.join(fixtureRoot, 'public');
    await fs.mkdir(publicRoot);
    t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));
    const filename = path.resolve(__dirname, '../server.js');
    const localRequire = createRequire(filename);
    let handler;
    let now = Date.now();
    const clock = class extends Date { static now() { return now; } };
    const fakeServer = { on() {}, listen() {} };
    const context = vm.createContext({
        require(id) {
            if (id === 'http') return { createServer(callback) { handler = callback; return fakeServer; } };
            if (id === './scripts/build.cjs') return { OUTPUT: publicRoot, build: async () => publicRoot };
            return localRequire(id);
        },
        __dirname: fixtureRoot, process, console, URL, Buffer, Date: clock
    });
    vm.runInContext(await fs.readFile(filename, 'utf8'), context, { filename });
    async function request(url, { method = 'GET', headers = {}, body } = {}) {
        const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
        Object.assign(req, { url, method, headers: { host: 'localhost', ...headers }, socket: { remoteAddress: '127.0.0.1' } });
        const chunks = [];
        const res = new Writable({ write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
        res.writeHead = (status, responseHeaders = {}) => {
            res.statusCode = status;
            res.headers = responseHeaders;
            res.headersSent = true;
            return res;
        };
        const finished = new Promise((resolve, reject) => { res.once('finish', resolve); res.once('error', reject); });
        handler(req, res);
        await finished;
        const bytes = Buffer.concat(chunks);
        return { status: res.statusCode, headers: res.headers, bytes, json: () => JSON.parse(bytes.toString()) };
    }
    return { publicRoot, request, advance(ms) { now += ms; } };
}

test('static handler streams public modules/audio, supports HEAD and revalidation, and blocks private paths', async t => {
    const { publicRoot, request } = await serverFixture(t);
    await fs.mkdir(path.join(publicRoot, 'src'));
    await fs.mkdir(path.join(publicRoot, 'assets'));
    await fs.writeFile(path.join(publicRoot, 'index.html'), '<main>NovaWing</main>');
    await fs.writeFile(path.join(publicRoot, 'src/music.mjs'), 'export const music = true;');
    const audio = Buffer.from([82, 73, 70, 70, 0, 255, 42]);
    await fs.writeFile(path.join(publicRoot, 'assets/theme.wav'), audio);
    await fs.writeFile(path.join(publicRoot, '.private.json'), '{"private":true}');

    assert.equal((await request('/')).status, 200);
    const module = await request('/src/music.mjs?v=1');
    assert.equal(module.headers['Content-Type'], 'application/javascript');
    assert.equal(module.bytes.toString(), 'export const music = true;');
    const recording = await request('/assets/theme.wav');
    assert.equal(recording.headers['Content-Type'], 'audio/wav');
    assert.deepEqual(recording.bytes, audio);
    assert.equal(recording.headers['Content-Length'], audio.length);
    const head = await request('/assets/theme.wav', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.bytes.length, 0);
    assert.equal(head.headers['Content-Length'], audio.length);
    const cached = await request('/assets/theme.wav', { headers: { 'if-none-match': recording.headers.ETag } });
    assert.equal(cached.status, 304);
    assert.equal(cached.bytes.length, 0);
    for (const url of ['/server.js', '/shared/run-rules.cjs', '/data/leaderboard.json', '/.private.json', '/%2e%2e/server.js', '/assets/%2e%2e/%2e%2e/server.js']) {
        assert.equal((await request(url)).status, 404, url);
    }
    assert.equal((await request('/assets/%zz.wav')).status, 400);
});

test('Node completion handler applies shared scope rewards and locks accepted stats', async t => {
    const { request, advance } = await serverFixture(t);
    async function start(scope) {
        const response = await request('/api/run', { method: 'POST', body: { scope, version: '1.2.0' } });
        assert.equal(response.status, 201);
        return { runId: response.json().runId, scope, version: '1.2.0', score: 5500, kills: 3, accuracy: 90 };
    }
    const campaign = await start('campaign');
    assert.equal((await request('/api/run', { method: 'PATCH', body: campaign })).status, 400);
    advance(60000);
    assert.equal((await request('/api/run', { method: 'PATCH', body: { ...campaign, kills: 1 } })).status, 400);
    const completed = await request('/api/run', { method: 'PATCH', body: campaign });
    assert.equal(completed.status, 200);
    assert.equal(completed.json().timeMs, 60000);
    const repeated = await request('/api/run', { method: 'PATCH', body: { ...campaign, score: 999999, kills: 99 } });
    assert.deepEqual(repeated.json(), completed.json());
    const unknown = await start('level-99');
    advance(60000);
    assert.equal((await request('/api/run', { method: 'PATCH', body: unknown })).status, 400);
});

test('five-level campaign duration survives Node completion, leaderboard submission and reload', async t => {
    const Levels = require('../levels.js');
    const Rules = require('../shared/run-rules.cjs');
    const catalog = Levels.getEffectiveLevelDefs();
    const originalLength = catalog.length;
    t.after(() => { catalog.length = originalLength; });
    catalog.push(Levels.defineLevel({ id: 4 }), Levels.defineLevel({ id: 5 }));
    const { request, advance } = await serverFixture(t);
    const started = (await request('/api/run', { method: 'POST', body: { scope: 'campaign', version: 'extended' } })).json();
    assert.equal(Date.parse(started.expiresAt) - Date.parse(started.startedAt), Rules.runTokenTtlMs('campaign'));
    advance(16 * 60 * 1000);
    const rules = Rules.rulesForScope('campaign');
    const body = { runId: started.runId, scope: 'campaign', version: 'extended', score: rules.bossScore, kills: rules.bossKills, accuracy: 90 };
    const completion = await request('/api/run', { method: 'PATCH', body });
    assert.equal(completion.status, 200, completion.bytes.toString());
    const submission = await request('/api/leaderboard', { method: 'POST', body: { ...body, name: 'Extended' } });
    assert.equal(submission.status, 201, submission.bytes.toString());
    const leaderboard = await request('/api/leaderboard?scope=campaign&version=extended');
    assert.equal(leaderboard.json().entries[0].timeMs, 16 * 60 * 1000);
});

test('easy and hard scores stay on their own boards', async t => {
    const Rules = require('../shared/run-rules.cjs');
    const { request, advance } = await serverFixture(t);
    const rules = Rules.rulesForScope('campaign');
    async function postRun(scope, name) {
        const started = (await request('/api/run', {
            method: 'POST',
            body: { scope, version: 'boards' }
        })).json();
        advance(60000);
        const body = {
            runId: started.runId,
            scope,
            version: 'boards',
            score: rules.bossScore,
            kills: rules.bossKills,
            accuracy: 90
        };
        assert.equal((await request('/api/run', { method: 'PATCH', body })).status, 200);
        const submission = await request('/api/leaderboard', { method: 'POST', body: { ...body, name } });
        assert.equal(submission.status, 201, submission.bytes.toString());
        return submission.json();
    }

    await postRun('campaign', 'Hotshot');
    await postRun('campaign-easy', 'Cadet');
    await postRun('campaign-hard', 'Nova');

    const hotshot = await request('/api/leaderboard?scope=campaign&version=boards');
    const easy = await request('/api/leaderboard?scope=campaign-easy&version=boards');
    const hard = await request('/api/leaderboard?scope=campaign-hard&version=boards');
    assert.equal(hotshot.json().entries.length, 1);
    assert.equal(hotshot.json().entries[0].name, 'Hotshot');
    assert.equal(easy.json().entries[0].name, 'Cadet');
    assert.equal(hard.json().entries[0].name, 'Nova');
    assert.equal(easy.json().scope, 'campaign-easy');
    assert.equal(hard.json().scope, 'campaign-hard');
});

test('leaderboard GET is readable from the arcade and submissions stay same-origin', async () => {
    const { onRequest } = await import('../functions/api/leaderboard.js');
    const DB = {
        prepare() {
            return { bind() { return this; }, async all() { return { results: [] }; }, async first() { return null; } };
        }
    };
    const read = await onRequest({
        request: new Request('https://novawing.ailardi.com/api/leaderboard?version=1.2.1&scope=level-1', {
            headers: { Origin: 'https://ailardi.com' }
        }),
        env: { DB }
    });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('access-control-allow-origin'), 'https://ailardi.com');
    const preview = await onRequest({
        request: new Request('https://novawing.ailardi.com/api/leaderboard?version=1.2.1&scope=level-1', {
            headers: { Origin: 'https://6e241c78.ailardi-landing.pages.dev' }
        }),
        env: { DB }
    });
    assert.equal(preview.headers.get('access-control-allow-origin'), 'https://6e241c78.ailardi-landing.pages.dev');
    const nonstandardPort = await onRequest({
        request: new Request('https://novawing.ailardi.com/api/leaderboard?version=1.2.1&scope=level-1', {
            headers: { Origin: 'https://ailardi-landing.pages.dev:8443' }
        }),
        env: { DB }
    });
    assert.equal(nonstandardPort.headers.get('access-control-allow-origin'), null);
    const evil = await onRequest({
        request: new Request('https://novawing.ailardi.com/api/leaderboard?version=1.2.1&scope=level-1', {
            headers: { Origin: 'https://evil.example' }
        }),
        env: { DB }
    });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
    const post = await onRequest({
        request: new Request('https://novawing.ailardi.com/api/leaderboard', {
            method: 'POST',
            headers: { Origin: 'https://ailardi.com', 'content-type': 'application/json' },
            body: '{}'
        }),
        env: { DB }
    });
    assert.equal(post.headers.get('access-control-allow-origin'), null);
});

test('Pages leaderboard accepts shared extended-campaign duration and run endpoint issues matching TTL', async t => {
    const Levels = require('../levels.js');
    const Rules = require('../shared/run-rules.cjs');
    const catalog = Levels.getEffectiveLevelDefs();
    const originalLength = catalog.length;
    t.after(() => { catalog.length = originalLength; });
    catalog.push(Levels.defineLevel({ id: 4 }), Levels.defineLevel({ id: 5 }));
    const { onRequest: leaderboard } = await import('../functions/api/leaderboard.js');
    const { onRequest: run } = await import('../functions/api/run.js');
    const now = Date.now();
    const rules = Rules.rulesForScope('campaign');
    const row = { id: 'extended-probe', game_version: 'extended', scope: 'campaign',
        created_at: new Date(now - 16 * 60 * 1000).toISOString(), completed_at: new Date(now).toISOString(),
        expires_at: new Date(now + 60000).toISOString(), score: rules.bossScore, kills: rules.bossKills, accuracy: 90, continues: 2 };
    const DB = {
        prepare() { return { bind() { return this; }, async first() { return row; },
            async run() { return { meta: { changes: 1 } }; }, async all() { return { results: [] }; } }; },
        async batch() { return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]; }
    };
    const request = new Request('https://example.test/api/leaderboard', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: row.id, version: row.game_version, scope: row.scope, name: 'Extended' }) });
    const response = await leaderboard({ request, env: { DB } });
    assert.equal(response.status, 201, await response.clone().text());
    const entry = (await response.json()).entry;
    assert.equal(entry.timeMs, 16 * 60 * 1000);
    assert.equal(entry.continues, 2);
    const started = await run({ request: new Request('https://example.test/api/run', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: 'campaign' }) }), env: { DB } });
    assert.equal(started.status, 201, await started.clone().text());
    const token = await started.json();
    assert.equal(Date.parse(token.expiresAt) - Date.parse(token.startedAt), Rules.runTokenTtlMs('campaign'));
});


test('Continue count is validated, locked at completion, and retained on the leaderboard', async t => {
    const { request, advance } = await serverFixture(t);
    const started = (await request('/api/run', { method: 'POST', body: { scope: 'level-1', version: 'continues' } })).json();
    advance(60000);
    const body = { runId: started.runId, scope: 'level-1', version: 'continues', score: 1500, kills: 1, accuracy: 90, continues: 2 };
    for (const continues of [-1, 1.5, 4]) {
        assert.equal((await request('/api/run', { method: 'PATCH', body: { ...body, continues } })).status, 400);
    }
    const completed = await request('/api/run', { method: 'PATCH', body });
    assert.equal(completed.status, 200, completed.bytes.toString());
    assert.equal(completed.json().continues, 2);
    const repeated = await request('/api/run', { method: 'PATCH', body: { ...body, continues: 0 } });
    assert.equal(repeated.json().continues, 2);
    const posted = await request('/api/leaderboard', { method: 'POST', body: { ...body, continues: 0, name: 'Continued' } });
    assert.equal(posted.status, 201, posted.bytes.toString());
    assert.equal(posted.json().entry.continues, 2);
    const reloaded = await request('/api/leaderboard?scope=level-1&version=continues');
    assert.equal(reloaded.json().entries[0].continues, 2);
});
