import app from '../src/server/index';
import { ensureDatabaseSchema } from '../src/server/initDb';
import { ensureAdminProvisioning } from '../src/server/auth';
import { configureSqlite } from '../src/server/backup';

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
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
}
