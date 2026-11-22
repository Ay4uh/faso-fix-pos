import fs from 'node:fs';
import path from 'node:path';

export const SUPABASE_URL =
  'postgresql://postgres.wlfrpafmlgadpupvublx:Fasofix%402026@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require';

const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
if (fs.existsSync(schemaPath)) {
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const dbUrl = process.env.DATABASE_URL || SUPABASE_URL;
  const isExplicitSqlite = dbUrl.startsWith('file:');
  const targetProvider = isExplicitSqlite ? 'sqlite' : 'postgresql';

  const updated = schemaContent.replace(
    /datasource\s+db\s*\{[\s\S]*?provider\s*=\s*"(sqlite|postgresql)"/,
    `datasource db {\n  provider = "${targetProvider}"`
  );

  if (updated !== schemaContent) {
    fs.writeFileSync(schemaPath, updated, 'utf8');
    console.log(`[prepare-db] Updated Prisma datasource provider to "${targetProvider}"`);
  } else {
    console.log(`[prepare-db] Prisma datasource provider already set to "${targetProvider}"`);
  }
}
