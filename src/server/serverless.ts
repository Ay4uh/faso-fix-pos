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
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
}
