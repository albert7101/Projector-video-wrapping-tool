import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const portArgIndex = process.argv.indexOf('--port');
const port = Number(portArgIndex >= 0 ? process.argv[portArgIndex + 1] : process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const indexPath = path.join(root, 'index.html');
const html = await readFile(indexPath);
const etag = `"${createHash('sha1').update(html).digest('base64url')}"`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end();
  }

  if (url.pathname === '/favicon.ico') {
    response.writeHead(204, { 'Cache-Control': 'public, max-age=86400' });
    return response.end();
  }

  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not found');
  }

  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
    return response.end();
  }

  try {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.length,
      'Cache-Control': 'no-cache',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') return response.end();
    response.end(html);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unable to load the app');
  }
});

server.keepAliveTimeout = 5000;
server.headersTimeout = 10000;
server.requestTimeout = 15000;

server.listen(port, host, () => {
  console.log(`Projector Media Canvas: http://localhost:${port}/`);
});

server.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});
