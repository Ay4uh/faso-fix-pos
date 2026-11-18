import fs from 'node:fs';
import path from 'node:path';
import { prisma } from './prisma';

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || 'backups');
const KEEP = Number(process.env.BACKUP_KEEP || 30);
const INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS || 6);

/** Enable SQLite crash-safety & concurrency settings. */
export async function configureSqlite() {
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

/** Consistent online snapshot using SQLite VACUUM INTO (safe while app is running). */
export async function createBackup(reason = 'manual'): Promise<BackupInfo> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `apexfix-${stamp}-${reason.replace(/[^a-z0-9]/gi, '')}.db`;
  const full = path.join(BACKUP_DIR, file);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${full.replace(/'/g, "''")}'`);
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
