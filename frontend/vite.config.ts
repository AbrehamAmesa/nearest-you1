import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8080';
  const isNginxLoopTarget =
    !env.VITE_API_PROXY_TARGET && process.env.NGINX_PORT === '8080';

  const sendUnavailableJson = (res: import('http').ServerResponse, statusCode: number, message: string) => {
    if (res.headersSent) return;
    const body = JSON.stringify({ error: message });
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    res.end(body);
  };

  const apiProxyGuardPlugin = () => ({
    name: 'ny-api-proxy-guard',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const reqUrl = req.url || '';
        if (
          (reqUrl === '/api' || reqUrl.startsWith('/api/')) &&
          (req.headers['x-ny-proxy-hop'] || isNginxLoopTarget)
        ) {
          sendUnavailableJson(
            res,
            503,
            'Backend API service is not configured or unavailable in this preview.'
          );
          return;
        }
        next();
      });
    },
    configurePreviewServer(server: import('vite').PreviewServer) {
      server.middlewares.use((req, res, next) => {
        const reqUrl = req.url || '';
        if (
          (reqUrl === '/api' || reqUrl.startsWith('/api/')) &&
          (req.headers['x-ny-proxy-hop'] || isNginxLoopTarget)
        ) {
          sendUnavailableJson(
            res,
            503,
            'Backend API service is not configured or unavailable in this preview.'
          );
          return;
        }
        next();
      });
    },
  });

  const proxyConfig = {
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true,
      ws: true,
      configure: (proxy: {
        on: (event: string, listener: (...args: any[]) => void) => void;
      }) => {
        proxy.on('proxyReq', (proxyReq: { setHeader: (name: string, value: string) => void }) => {
          proxyReq.setHeader('x-ny-proxy-hop', '1');
        });
        proxy.on('error', (_err: Error, _req: unknown, res: import('http').ServerResponse) => {
          sendUnavailableJson(res, 502, 'Backend API service unavailable.');
        });
      },
    },
  };

  return {
    plugins: [react(), tailwindcss(), apiProxyGuardPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      proxy: proxyConfig,
      hmr: env.DISABLE_HMR !== 'true',
      watch: env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      host: '0.0.0.0',
      port: Number(env.PORT) || 3000,
      allowedHosts: true,
      proxy: proxyConfig,
    },
  };
});
