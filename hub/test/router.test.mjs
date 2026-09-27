import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { gameForPath } from '../src/index.mjs';

test('matches only known game prefixes', () => {
  assert.equal(gameForPath('/novawing/levels.js').origin, 'https://novawing.pages.dev');
  assert.equal(gameForPath('/space-chicken/').origin, 'https://space-chicken.pages.dev');
  assert.equal(gameForPath('/novawingish'), undefined);
  assert.equal(gameForPath('/'), undefined);
});

test('redirects game roots to a trailing slash', async () => {
  const response = await worker.fetch(new Request('https://ailardi.com/novawing'), {});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://ailardi.com/novawing/');
});

test('strips the game prefix and preserves method, query, and body', async () => {
  const originalFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async request => {
    seen = request;
    return new Response('{"ok":true}', { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await worker.fetch(new Request('https://ailardi.com/novawing/api/run?level=2', {
      method: 'POST', body: '{"score":42}', headers: { 'Content-Type': 'application/json' },
    }), {});
    assert.equal(seen.url, 'https://novawing.pages.dev/api/run?level=2');
    assert.equal(seen.method, 'POST');
    assert.equal(await seen.text(), '{"score":42}');
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-ailardi-game'), 'novawing');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('serves non-game requests from the static asset binding', async () => {
  const env = { ASSETS: { fetch: async () => new Response('landing', { headers: { 'Content-Type': 'text/html' } }) } };
  const response = await worker.fetch(new Request('https://ailardi.com/'), env);
  assert.equal(await response.text(), 'landing');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
