import crypto from 'node:crypto';
import { prisma } from './prisma';

/**
 * NIST SP 800-63B compliant password hashing using scrypt.
 * Stores format: salt:hash
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, combined: string): boolean {
  try {
    const parts = combined.split(':');
    if (parts.length !== 2) return false;
    const [salt, key] = parts;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomBytes(24).toString('hex'));

/** Run constant-shape scrypt verification when an account does not exist to prevent timing enumeration. */
export function verifyDummyPassword(password: string): void {
  verifyPassword(password, DUMMY_PASSWORD_HASH);
}

/** Hash bearer/cookie session tokens with SHA-256 before database persistence and revocation lookup. */
export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate a cryptographically secure 256-bit random session token.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Strict 24-hour maximum session lifetime enforced across ALL user roles
 * (Administrator, Manager, Technician, Regular Employee).
 * Refreshes or reopening the browser never bypass or extend this 24-hour window.
 */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours (86,400,000 ms)

/** Derive a concise human-readable device/browser summary from a User-Agent header. */
export function parseUserAgent(ua?: string | null): string {
  const s = (ua || '').trim();
  if (!s) return 'Unknown Client';
  let browser = 'Browser';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s) && !/Chrome\//i.test(s)) browser = 'Safari';
  else if (/node|undici|curl|Postman/i.test(s)) browser = 'API Client';

  let os = '';
  if (/iPhone|iPad/i.test(s)) os = 'iOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(s)) os = 'macOS';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/Linux/i.test(s)) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
}

/**
 * Create a persistent session for a user valid for a strict maximum of 24 hours.
 * Returns the raw bearer/cookie token while storing only its SHA-256 hash in the database.
 */
export async function createSession(
  userId: string,
  meta?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS); // Strictly 24 hours
  const rawToken = generateToken();
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  let persisted = false;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.session.create({
        data: {
          token: tokenHash,
          userId,
          ipAddress: meta?.ipAddress ? String(meta.ipAddress).slice(0, 100) : null,
          userAgent: meta?.userAgent ? String(meta.userAgent).slice(0, 200) : null,
          lastActiveAt: now,
          expiresAt,
        },
      });
      persisted = true;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!persisted) {
    console.error('[Create Session Error]', lastErr);
    throw new Error('Failed to persist session — please try signing in again.');
  }

  return rawToken;
}

const MAX_REVOKED_CACHE = 2000;
const revokedTokens = new Set<string>();

function cacheRevokedHash(tokenHash: string) {
  revokedTokens.add(tokenHash);
  if (revokedTokens.size > MAX_REVOKED_CACHE) {
    const oldest = revokedTokens.values().next().value;
    if (oldest) revokedTokens.delete(oldest);
  }
}

export async function destroySession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  cacheRevokedHash(tokenHash);
  await prisma.session.deleteMany({ where: { token: { in: [tokenHash, token] } } }).catch(() => {});
}

/**
 * Validate a session token and return the associated active user.
 */
export async function authenticateSession(
  token: string | undefined,
  _clientHeaders?: { userId?: string; userName?: string; userRole?: string }
) {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  if (revokedTokens.has(tokenHash) || revokedTokens.has(token)) return null;

  // Single-query session + user verification (accepts hashed production tokens and legacy test rows)
  const session = await prisma.session.findFirst({
    where: { token: { in: [tokenHash, token] } },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          status: true,
          phone: true,
          bio: true,
          bench: true,
          preferences: true,
          twoFactorEnabled: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (session) {
    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    if (session.user.status !== 'ACTIVE') {
      return null;
    }
    // Throttled fire-and-forget activity heartbeat (at most once every 5 minutes) to preserve zero-latency reads
    if (Date.now() - session.lastActiveAt.getTime() > 5 * 60_000) {
      prisma.session
        .update({ where: { id: session.id }, data: { lastActiveAt: new Date() } })
        .catch(() => {});
    }
    return session.user;
  }

  return null;
}

export function computeAuditHash(fields: {
  prevHash: string;
  userId?: string | null;
  actorName: string;
  action: string;
  details: string;
  ipAddress?: string | null;
  createdAt: Date;
}): string {
  const payload = [
    fields.prevHash,
    fields.userId || '',
    fields.actorName,
    fields.action,
    fields.details,
    fields.ipAddress || '',
    fields.createdAt.toISOString(),
  ].join('|');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Verify cryptographic integrity of hash-chained AuditLog entries.
 */
export async function verifyAuditLogChain(limit = 200): Promise<{
  checked: number;
  intact: boolean;
  tamperedCount: number;
  tamperedIds: string[];
}> {
  const rows = await prisma.auditLog.findMany({
    where: { entryHash: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  const tamperedIds: string[] = [];
  for (const row of rows) {
    const expected = computeAuditHash({
      prevHash: row.prevHash || 'GENESIS',
      userId: row.userId,
      actorName: row.actorName,
      action: row.action,
      details: row.details,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
    });
    if (expected !== row.entryHash) {
      tamperedIds.push(row.id);
    }
  }

  return {
    checked: rows.length,
    intact: tamperedIds.length === 0,
    tamperedCount: tamperedIds.length,
    tamperedIds,
  };
}

/**
 * Record an immutable hash-chained audit log entry.
 */
export async function recordAudit(params: {
  userId?: string | null;
  actorName: string;
  action: string;
  details: string;
  ipAddress?: string | null;
}) {
  try {
    const latest = await prisma.auditLog.findFirst({
      where: { entryHash: { not: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { entryHash: true },
    });
    const prevHash = latest?.entryHash || 'GENESIS';
    const createdAt = new Date();
    const entryHash = computeAuditHash({
      prevHash,
      userId: params.userId || null,
      actorName: params.actorName,
      action: params.action,
      details: params.details,
      ipAddress: params.ipAddress || null,
      createdAt,
    });

    return await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        actorName: params.actorName,
        action: params.action,
        details: params.details,
        ipAddress: params.ipAddress || null,
        prevHash,
        entryHash,
        createdAt,
      },
    });
  } catch (err) {
    console.error('[AuditLog Error]', err);
  }
}

/**
 * Ensure an initial administrator account exists in the database.
 */
export async function ensureAdminProvisioning(): Promise<void> {
  const adminCount = await prisma.user.count({
    where: { role: 'ADMIN' },
  });

  if (adminCount === 0) {
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@fasofix.ca';
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin@FasoFix2026!';
    const adminName = 'Lead Shop Administrator';

    const hashedPassword = hashPassword(adminPass);

    const created = await prisma.user.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        username: adminUser,
        email: adminEmail,
        name: adminName,
        passwordHash: hashedPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
        bench: 'Bench #01',
        bio: 'Primary store administrator and certified lead master technician.',
        preferences: JSON.stringify({
          soundFX: true,
          compactView: false,
          autoPrint: false,
          emailAlerts: true,
          highPriorityAudio: true,
          lowStockAlerts: true,
        }),
      },
    });

    await recordAudit({
      userId: created.id,
      actorName: 'SYSTEM_BOOT',
      action: 'ADMIN_PROVISIONED',
      details: `Initial administrator provisioned with username: ${adminUser} and email: ${adminEmail}`,
    });

    console.log('------------------------------------------------------------');
    console.log('[Faso Fix Security] Initial Administrator Account Provisioned:');
    console.log(`  Username: ${adminUser}`);
    console.log(`  Email:    ${adminEmail}`);
    console.log('  Please log in and rotate the initial password immediately.');
    console.log('------------------------------------------------------------');
  }
}
