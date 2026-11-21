/**
 * Script to migrate data from local SQLite (prisma/dev.db) to a remote PostgreSQL database (Supabase, Neon, etc.)
 *
 * Usage:
 *   DATABASE_URL="postgresql://user:pass@host:5432/db" npx tsx scripts/migrate-to-postgres.ts
 */
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

async function runMigration() {
  const targetUrl = process.env.DATABASE_URL;
  if (!targetUrl || (!targetUrl.startsWith('postgresql://') && !targetUrl.startsWith('postgres://'))) {
    console.error('❌ Please set DATABASE_URL to a valid PostgreSQL connection string.');
    console.error('Example: DATABASE_URL="postgresql://postgres:password@db.supabase.co:5432/postgres" npx tsx scripts/migrate-to-postgres.ts');
    process.exit(1);
  }

  const sqlitePath = path.resolve(process.cwd(), 'prisma/dev.db');
  if (!fs.existsSync(sqlitePath)) {
    console.error(`❌ SQLite source database not found at ${sqlitePath}`);
    process.exit(1);
  }

  console.log(`Connecting to SQLite: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  console.log(`Connecting to PostgreSQL via Prisma...`);
  const prisma = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  try {
    await prisma.$connect();
    console.log('✅ Connected to target PostgreSQL database.');

    // 1. Users
    const users = sqlite.prepare('SELECT * FROM User').all() as any[];
    console.log(`Migrating ${users.length} Users...`);
    for (const u of users) {
      await prisma.user.upsert({
        where: { id: u.id },
        create: {
          id: u.id,
          username: u.username,
          email: u.email,
          name: u.name,
          passwordHash: u.passwordHash,
          role: u.role,
          status: u.status,
          phone: u.phone,
          bench: u.bench,
          hourlyRateCents: u.hourlyRateCents ?? 2200,
        },
        update: {},
      });
    }

    // 2. Settings
    const setting = sqlite.prepare('SELECT * FROM Setting WHERE id = 1').get() as any;
    if (setting) {
      console.log('Migrating Shop Settings...');
      await prisma.setting.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          shopName: setting.shopName,
          address: setting.address || '',
          phone: setting.phone || '',
          email: setting.email || '',
          taxLabel: setting.taxLabel || 'HST',
          taxRateBps: setting.taxRateBps || 1300,
          nextTicketNumber: setting.nextTicketNumber || 1,
        },
        update: {
          shopName: setting.shopName,
          address: setting.address || '',
          phone: setting.phone || '',
          email: setting.email || '',
          taxLabel: setting.taxLabel || 'HST',
          taxRateBps: setting.taxRateBps || 1300,
          nextTicketNumber: setting.nextTicketNumber || 1,
        },
      });
    }

    // 3. Customers
    const customers = sqlite.prepare('SELECT * FROM Customer').all() as any[];
    console.log(`Migrating ${customers.length} Customers...`);
    for (const c of customers) {
      await prisma.customer.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          fullName: c.fullName,
          phone: c.phone,
          email: c.email,
          altPhone: c.altPhone,
          notes: c.notes,
        },
        update: {},
      });
    }

    // 4. Inventory
    const items = sqlite.prepare('SELECT * FROM InventoryItem').all() as any[];
    console.log(`Migrating ${items.length} Inventory items...`);
    for (const item of items) {
      await prisma.inventoryItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          costCents: item.costCents,
          priceCents: item.priceCents,
          stock: item.stock,
          reorderPoint: item.reorderPoint,
          supplier: item.supplier,
        },
        update: {},
      });
    }

    console.log('🎉 Migration to PostgreSQL completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await prisma.$disconnect();
    sqlite.close();
  }
}

runMigration().catch(console.error);
