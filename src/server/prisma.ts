import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

if (process.env.VERCEL) {
  const tmpDb = '/tmp/dev.db';
  if (!fs.existsSync(tmpDb)) {
    const seedDb = path.resolve(process.cwd(), 'prisma/seed.db');
    if (fs.existsSync(seedDb)) {
      try {
        fs.copyFileSync(seedDb, tmpDb);
      } catch (err) {
        console.error('[Prisma] Error copying seed DB to /tmp:', err);
      }
    }
  }
  process.env.DATABASE_URL = `file:${tmpDb}`;
}

export const prisma = new PrismaClient();
