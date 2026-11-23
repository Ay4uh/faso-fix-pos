import fs from 'node:fs';
import path from 'node:path';
import { prisma } from './prisma';

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || (process.env.VERCEL ? '/tmp/backups' : 'backups'));
const KEEP = Number(process.env.BACKUP_KEEP || 30);
const INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS || 6);

/** Enable SQLite crash-safety & concurrency settings. */
export async function configureSqlite() {
  const isPostgres = !!(
    process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://'))
  );
  if (isPostgres) return;

  // PRAGMAs that return rows must use queryRaw
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
}

export interface BackupInfo {
  file: string;
  sizeBytes: number;
  createdAt: string;
}

/** Consistent online snapshot (safe while app is running). */
export async function createBackup(reason = 'manual'): Promise<BackupInfo> {
  const isPostgres = !!(
    process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://'))
  );

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `apexfix-${stamp}-${reason.replace(/[^a-z0-9]/gi, '')}.db`;
  const full = path.join(BACKUP_DIR, file);

  if (isPostgres) {
    const [
      users,
      settings,
      tickets,
      customers,
      devices,
      shifts,
      audits,
      inventoryParts,
      wageRates,
      scheduledShifts,
      payrollPeriods,
      paystubs,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.setting.findMany(),
      prisma.ticket.findMany({ include: { items: true, payments: true, events: true } }),
      prisma.customer.findMany(),
      prisma.device.findMany(),
      prisma.shift.findMany(),
      prisma.auditLog.findMany({ take: 500 }),
      prisma.inventoryPart.findMany(),
      prisma.wageRate.findMany(),
      prisma.scheduledShift.findMany(),
      prisma.payrollPeriod.findMany(),
      prisma.paystub.findMany(),
    ]);
    const safeUsers = users.map(
      ({ passwordHash: _ph, sin, twoFactorSecret: _tfs, twoFactorRecoveryCodes: _tfr, twoFactorLastCounter: _tflc, ...u }) => {
        const digits = sin ? sin.replace(/\D/g, '') : '';
        return {
          ...u,
          sin: digits.length >= 3 ? `***-***-${digits.slice(-3)}` : null,
        };
      }
    );

    const snapshot = {
      timestamp: new Date().toISOString(),
      reason,
      provider: 'postgresql',
      data: {
        users: safeUsers,
        settings,
        tickets,
        customers,
        devices,
        shifts,
        audits,
        inventoryParts,
        wageRates,
        scheduledShifts,
        payrollPeriods,
        paystubs,
      },
    };
    fs.writeFileSync(full, JSON.stringify(snapshot, null, 2), 'utf-8');
  } else {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${full.replace(/'/g, "''")}'`);
  }

  pruneBackups();
  const st = fs.statSync(full);
  return { file, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
}

export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^apexfix-.*\.db$/.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Returns absolute path if the name is a valid backup file (prevents path traversal). */
export function resolveBackup(name: string): string | null {
  if (!/^apexfix-[\w-]+\.db$/.test(name)) return null;
  const full = path.join(BACKUP_DIR, name);
  return fs.existsSync(full) ? full : null;
}

function pruneBackups() {
  const all = listBackups();
  for (const b of all.slice(KEEP)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.file)); } catch {}
  }
}

export function startBackupSchedule() {
  createBackup('startup').catch((e) => console.error('[Backup] startup failed', e));
  setInterval(() => {
    createBackup('auto').catch((e) => console.error('[Backup] scheduled failed', e));
  }, INTERVAL_HOURS * 3600_000).unref();
  console.log(`[Backup] Auto-backup every ${INTERVAL_HOURS}h → ${BACKUP_DIR} (keeping ${KEEP})`);
}
