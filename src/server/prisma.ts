import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

export const SUPABASE_URL =
  'postgresql://postgres.wlfrpafmlgadpupvublx:Fasofix%402026@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true';

const explicitUrl = process.env.DATABASE_URL;
const isExplicitSqlite = !!(explicitUrl && explicitUrl.startsWith('file:'));
let activeDbUrl = isExplicitSqlite ? explicitUrl : (explicitUrl || SUPABASE_URL);

export const isPostgres = !isExplicitSqlite;

if (isPostgres && !activeDbUrl.includes('connection_limit=')) {
  const sep = activeDbUrl.includes('?') ? '&' : '?';
  activeDbUrl = `${activeDbUrl}${sep}connection_limit=5&pool_timeout=15`;
}

// Ensure process.env.DATABASE_URL matches the active connection for downstream services
process.env.DATABASE_URL = activeDbUrl;

if (process.env.VERCEL && isExplicitSqlite) {
  const tmpDb = '/tmp/dev.db';
  if (!fs.existsSync(tmpDb)) {
    const candidates = [
      path.resolve(process.cwd(), 'prisma/seed.db'),
      path.resolve(process.cwd(), 'seed.db'),
      path.join(process.cwd(), 'prisma/dev.db'),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        try {
          fs.copyFileSync(cand, tmpDb);
          break;
        } catch (err) {
          console.error('[Prisma] Error copying seed DB to /tmp:', err);
        }
      }
    }
  }
  process.env.DATABASE_URL = `file:${tmpDb}`;
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  transactionOptions: {
    maxWait: 15000,
    timeout: 20000,
  },
});
