import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const frontendDir = path.dirname(__filename);
const distDir = path.join(frontendDir, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

const port = Number.parseInt(process.env.PORT || '3000', 10) || 3000;
const host = '0.0.0.0';
const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ||
  process.env.API_PROXY_TARGET ||
  'http://127.0.0.1:8080';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

let activeBuildPromise = null;

function ensureDistBuiltInBackground() {
  if (fs.existsSync(indexHtmlPath) || activeBuildPromise) {
    return activeBuildPromise;
  }

  const viteBin = path.join(frontendDir, 'node_modules', '.bin', 'vite');
  const rootViteBin = path.join(frontendDir, '..', 'node_modules', '.bin', 'vite');
  const binPath = fs.existsSync(viteBin) ? viteBin : fs.existsSync(rootViteBin) ? rootViteBin : null;

  if (!binPath) {
    console.warn('[server] frontend/dist/index.html missing and vite binary not found; waiting for static files.');
    return null;
  }

  console.log('[server] frontend/dist missing on boot; building production bundle in background...');
  activeBuildPromise = new Promise((resolve) => {
    const child = spawn(binPath, ['build'], {
      cwd: frontendDir,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[server] background vite build exited with code ${code}`);
      } else {
        console.log('[server] background vite build completed.');
      }
      activeBuildPromise = null;
      resolve();
    });
    child.on('error', (err) => {
      console.error('[server] background vite build failed:', err.message);
      activeBuildPromise = null;
      resolve();
    });
  });

  return activeBuildPromise;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function serveFile(req, res, filePath, cacheControl) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': cacheControl,
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Internal Server Error');
    });
    stream.pipe(res);
  });
}

function proxyApiRequest(req, res) {
  let targetUrl;
  try {
    targetUrl = new URL(req.url || '/', apiProxyTarget);
  } catch (err) {
    sendJson(res, 500, { error: 'Invalid API proxy target', detail: err.message });
    return;
  }

  const targetPort = Number(targetUrl.port) || (targetUrl.protocol === 'https:' ? 443 : 80);
  const isLoopback = targetUrl.hostname === '127.0.0.1' || targetUrl.hostname === 'localhost';
  const isNginxLoopTarget =
    !process.env.VITE_API_PROXY_TARGET &&
    !process.env.API_PROXY_TARGET &&
    process.env.NGINX_PORT === '8080' &&
    isLoopback &&
    targetPort === 8080;
  if ((isLoopback && targetPort === port) || req.headers['x-ny-proxy-hop'] || isNginxLoopTarget) {
    sendJson(res, 503, { error: 'Backend API service is not configured or unavailable' });
    return;
  }

  const transport = targetUrl.protocol === 'https:' ? https : http;
  const headers = { ...req.headers };
  headers.host = targetUrl.host;
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = 'https';
  headers['x-ny-proxy-hop'] = '1';

  const proxyReq = transport.request(
    targetUrl,
    {
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      sendJson(res, 502, {
        error: 'Backend service unavailable',
        detail: err.message,
      });
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  const reqUrl = req.url || '/';
  const qIndex = reqUrl.indexOf('?');
  const rawPathname = qIndex === -1 ? reqUrl : reqUrl.slice(0, qIndex);

  if (rawPathname === '/healthz') {
    sendJson(res, 200, { status: 'ok', distReady: fs.existsSync(indexHtmlPath) });
    return;
  }

  if (rawPathname === '/api' || rawPathname.startsWith('/api/')) {
    proxyApiRequest(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(rawPathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  if (!fs.existsSync(indexHtmlPath) && activeBuildPromise) {
    await Promise.race([
      activeBuildPromise,
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  }

  const relativePath = decodedPathname.replace(/^\/+/, '');
  const resolvedCandidate = path.resolve(distDir, relativePath || 'index.html');
  const isInsideDist =
    resolvedCandidate === distDir || resolvedCandidate.startsWith(distDir + path.sep);

  if (!isInsideDist) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (
    relativePath &&
    fs.existsSync(resolvedCandidate) &&
    fs.statSync(resolvedCandidate).isFile()
  ) {
    const cacheControl = relativePath.startsWith('assets/')
      ? 'public, max-age=31536000, immutable'
      : relativePath === 'index.html'
        ? 'no-cache'
        : 'public, max-age=3600';
    serveFile(req, res, resolvedCandidate, cacheControl);
    return;
  }

  if (decodedPathname.startsWith('/assets/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  if (fs.existsSync(indexHtmlPath)) {
    serveFile(req, res, indexHtmlPath, 'no-cache');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end('<!doctype html><html><body><p>Starting Nearest You...</p></body></html>');
});

server.on('upgrade', (req, socket, head) => {
  const reqUrl = req.url || '/';
  const qIndex = reqUrl.indexOf('?');
  const rawPathname = qIndex === -1 ? reqUrl : reqUrl.slice(0, qIndex);
  if (
    rawPathname !== '/api' &&
    !rawPathname.startsWith('/api/') &&
    !rawPathname.startsWith('/ws/')
  ) {
    socket.destroy();
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(reqUrl, apiProxyTarget);
  } catch {
    socket.destroy();
    return;
  }

  const targetPort = Number(targetUrl.port) || (targetUrl.protocol === 'https:' ? 443 : 80);
  const isLoopback = targetUrl.hostname === '127.0.0.1' || targetUrl.hostname === 'localhost';
  if ((isLoopback && targetPort === port) || req.headers['x-ny-proxy-hop']) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const transport = targetUrl.protocol === 'https:' ? https : http;
  const headers = { ...req.headers };
  headers.host = targetUrl.host;
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = 'https';
  headers['x-ny-proxy-hop'] = '1';

  const proxyReq = transport.request(targetUrl, {
    method: req.method || 'GET',
    headers,
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    let responseHead = `HTTP/1.1 ${proxyRes.statusCode || 101} ${proxyRes.statusMessage || 'Switching Protocols'}\r\n`;
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      responseHead += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
    }
    responseHead += '\r\n';
    socket.write(responseHead);
    if (proxyHead && proxyHead.length > 0) {
      socket.write(proxyHead);
    }
    if (head && head.length > 0) {
      proxySocket.write(head);
    }
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
    proxySocket.on('close', () => socket.end());
    socket.on('close', () => proxySocket.end());
  });

  proxyReq.on('response', (proxyRes) => {
    let responseHead = `HTTP/1.1 ${proxyRes.statusCode || 502} ${proxyRes.statusMessage || 'Bad Gateway'}\r\n`;
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      responseHead += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
    }
    responseHead += '\r\n';
    socket.write(responseHead);
    proxyRes.pipe(socket);
  });

  proxyReq.on('error', () => {
    socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });

  proxyReq.end();
});

server.on('error', (err) => {
  console.error('[server] HTTP server error:', err);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`[server] Nearest You listening on http://${host}:${port}`);
  if (!fs.existsSync(indexHtmlPath)) {
    ensureDistBuiltInBackground();
  }
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
