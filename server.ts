import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { getDb } from './server/db.ts';
import { attachAuthMiddleware } from './server/security.ts';
import { registerApiRoutes } from './server/routes.ts';

export async function createAppServer(customDbPath?: string) {
  const app = express();
  const db = getDb(customDbPath);

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachAuthMiddleware(db));

  registerApiRoutes(app, db);

  // API 404 handler (prevent falling through to HTML for unknown /api/* routes)
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: "So'ralgan API manzili topilmadi." });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else if (process.env.VITEST_NO_VITE !== 'true') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return { app, db };
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

async function listenWithPortFallback(app: express.Express, requestedPort: number) {
  const maxPort = Math.min(requestedPort + 10, 65535);

  for (let port = requestedPort; port <= maxPort; port += 1) {
    try {
      return await new Promise<number>((resolve, reject) => {
        const server = app.listen(port, '0.0.0.0');
        const onError = (error: Error) => reject(error);
        server.once('error', onError);
        server.once('listening', () => {
          server.off('error', onError);
          const address = server.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EADDRINUSE') {
        throw error;
      }

      console.warn(`Port ${port} is already in use; trying the next port.`);
    }
  }

  throw new Error(`Ports ${requestedPort}-${maxPort} are already in use.`);
}

if (isDirectRun) {
  const requestedPort = Number(process.env.PORT || 3000);
  createAppServer()
    .then(async ({ app }) => {
      const port = await listenWithPortFallback(app, requestedPort);
      console.log(`Mirzaobod PF-193 Monitoring server listening on http://0.0.0.0:${port}`);
    })
    .catch((error: unknown) => {
      console.error('Failed to start Mirzaobod PF-193 Monitoring server:', error);
      process.exitCode = 1;
    });
}
