import app from './index';
import { ensureDatabaseSchema, ensureInitialInventory } from './initDb';
import { ensureAdminProvisioning } from './auth';
import { configureSqlite } from './backup';

let initialized = false;
let initPromise: Promise<void> | null = null;

async function initServerless() {
  if (initialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await configureSqlite();
        await ensureDatabaseSchema();
        await ensureAdminProvisioning();
        await ensureInitialInventory();
        initialized = true;
      } catch (err) {
        console.error('[Serverless Init Error]', err);
      } finally {
        initPromise = null;
      }
    })();
  }
  await initPromise;
}

export default async function handler(req: any, res: any) {
  try {
    await initServerless();

    const originalPath =
      req.headers['x-forwarded-uri'] ||
      req.headers['x-matched-path'] ||
      (typeof req.headers['x-now-route-matches'] === 'string' && req.headers['x-now-route-matches'].includes('1=')
        ? '/api/' + req.headers['x-now-route-matches'].split('1=')[1].split('&')[0]
        : null);

    if (originalPath && typeof originalPath === 'string') {
      req.url = originalPath;
    } else if (req.url && !req.url.startsWith('/api')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }

    return await new Promise<void>((resolve, reject) => {
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', (err: any) => reject(err));
      app(req, res);
    });
  } catch (err: any) {
    console.error('[Serverless Handler Unhandled Exception]', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal server error occurred while processing request.',
        details: err?.message || String(err),
      });
    }
  }
}
