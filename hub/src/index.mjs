const GAMES = [
  { prefix: '/novawing', origin: 'https://novawing.pages.dev' },
  { prefix: '/space-chicken', origin: 'https://space-chicken.pages.dev' },
];

function gameForPath(pathname) {
  return GAMES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function proxyGame(request, game, url) {
  if (url.pathname === game.prefix) {
    url.pathname = `${game.prefix}/`;
    return Response.redirect(url, 308);
  }

  const upstreamUrl = new URL(game.origin);
  upstreamUrl.pathname = url.pathname.slice(game.prefix.length) || '/';
  upstreamUrl.search = url.search;

  const upstreamRequest = new Request(upstreamUrl, request);
  const upstreamResponse = await fetch(upstreamRequest);
  const headers = new Headers(upstreamResponse.headers);
  const location = headers.get('Location');
  if (location) {
    const redirected = new URL(location, upstreamUrl);
    if (redirected.origin === upstreamUrl.origin) {
      redirected.protocol = url.protocol;
      redirected.host = url.host;
      redirected.pathname = `${game.prefix}${redirected.pathname}`;
      headers.set('Location', redirected.toString());
    }
  }
  headers.set('X-Ailardi-Game', game.prefix.slice(1));
  return withSecurityHeaders(new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const game = gameForPath(url.pathname);

    try {
      if (game) return await proxyGame(request, game, url);
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      console.error(JSON.stringify({
        message: 'arcade request failed',
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return new Response('The arcade hit a temporary glitch. Please retry.', {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  },
};

export { gameForPath, proxyGame };
