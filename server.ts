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

if (isDirectRun) {
  const PORT = Number(process.env.PORT || 3000);
  createAppServer().then(({ app }) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Mirzaobod PF-193 Monitoring server listening on http://0.0.0.0:${PORT}`);
    });
  });
}
