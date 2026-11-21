import fs from 'node:fs';
import path from 'node:path';

const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
if (fs.existsSync(schemaPath)) {
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const dbUrl = process.env.DATABASE_URL || '';
  const isPostgres = dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://');
  const targetProvider = isPostgres ? 'postgresql' : 'sqlite';

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
