import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const host = process.env.NW2_HOST || '127.0.0.1';
const port = Number(process.env.NW2_PORT || 4177);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pck': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
};

export function startServer({ listenHost = host, listenPort = port } = {}) {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, `http://${listenHost}`).pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const path = resolve(root, `.${pathname}`);
    const outside = relative(root, path);
    if (outside === '..' || outside.startsWith(`..${sep}`)) {
      response.writeHead(403).end();
      return;
    }

    let file = path;
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      const info = statSync(file);
      if (!info.isFile()) throw new Error('not a file');
      response.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(listenPort, listenHost, () => accept(server));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  const address = server.address();
  process.stdout.write(`NovaWing 2 comparison: http://${host}:${address.port}/\n`);
}
