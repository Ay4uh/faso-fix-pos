import app from './index';
import { ensureDatabaseSchema } from './initDb';
import { ensureAdminProvisioning } from './auth';
import { configureSqlite } from './backup';

let initialized = false;

async function initServerless() {
  if (initialized) return;
  try {
    await configureSqlite();
    await ensureDatabaseSchema();
    await ensureAdminProvisioning();
    initialized = true;
  } catch (err) {
    console.error('[Serverless Init Error]', err);
  }
}

export default async function handler(req: any, res: any) {
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

  return app(req, res);
}
