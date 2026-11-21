import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const isPostgres = !!(
  process.env.DATABASE_URL &&
  (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://'))
);

if (process.env.VERCEL && !isPostgres) {
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
      url: process.env.DATABASE_URL || 'file:./dev.db',
    },
  },
});
