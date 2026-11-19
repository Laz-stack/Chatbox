#!/usr/bin/env node
// Chatbox local server. Zero dependencies, Node 18+.
//  - Serves the app from this folder.
//  - /proxy relays AI requests for providers that block calls from a browser.
//    It only listens on this computer (127.0.0.1) by default. Do not expose it
//    to the internet: anyone who can reach it could use it as an open relay.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};
const HIDDEN = new Set(['server.js', 'package.json']);
const DROP_REQ = new Set(['host', 'connection', 'content-length', 'origin', 'referer', 'cookie', 'x-target-url', 'accept-encoding', 'keep-alive', 'transfer-encoding', 'upgrade']);
const DROP_RES = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie']);

function allowedTarget(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:') return u;
    // Plain http only for local model servers (LM Studio, Ollama, llama.cpp…).
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname)) return u;
  } catch {}
  return null;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 20 * 1024 * 1024) throw new Error('Request too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function proxy(req, res) {
  const target = allowedTarget(req.headers['x-target-url']);
  if (!target) {
    res.writeHead(400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'Missing or unsupported x-target-url. Use https://, or http:// on localhost.' } }));
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!DROP_REQ.has(k) && !k.startsWith('sec-')) headers[k] = v;
  const ctl = new AbortController();
  res.on('close', () => ctl.abort());
  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const r = await fetch(target, { method: req.method, headers, body, signal: ctl.signal });
    const out = {};
    r.headers.forEach((v, k) => {
      if (!DROP_RES.has(k)) out[k] = v;
    });
    out['cache-control'] = 'no-cache';
    res.writeHead(r.status, out);
    if (!r.body) return res.end();
    for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (e) {
    if (ctl.signal.aborted) return;
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Local server could not reach the provider: ' + e.message } }));
  }
}

async function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, p));
  const base = p.split('/').pop();
  if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep) || base.startsWith('.') || HIDDEN.has(base) || p.includes('node_modules')) {
    res.writeHead(404);
    return res.end('Not found');
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname === '/proxy/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":true}');
  }
  if (pathname === '/proxy') return proxy(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Chatbox is running:  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.log('  Warning: the relay is reachable from other devices on your network.\n');
});
