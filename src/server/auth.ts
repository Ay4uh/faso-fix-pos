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

const SESSION_SIGNING_KEY = process.env.SESSION_SECRET || 'fasofix-cloud-session-secret-key-2026';

export function createSignedToken(userId: string, username: string, role: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, u: username, r: role, exp: expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(payload).digest('base64url');
  return `s.${payload}.${signature}`;
}

export function verifySignedToken(token: string): { uid: string; u: string; r: string; exp: number } | null {
  try {
    if (!token.startsWith('s.')) return null;
    const parts = token.slice(2).split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(payload).digest('base64url');
    if (signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Generate a cryptographically secure random session token.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a persistent session for a user valid for 7 days.
 */
export async function createSession(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const token = createSignedToken(
    userId,
    user?.username || '',
    user?.role || 'USER',
    expiresAt.getTime()
  );

  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  }).catch(() => {});

  return token;
}

const revokedTokens = new Set<string>();

export async function destroySession(token: string): Promise<void> {
  revokedTokens.add(token);
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

/**
 * Validate a session token and return the associated active user.
 */
export async function authenticateSession(token: string | undefined) {
  if (!token || revokedTokens.has(token)) return null;

  // 1. Verify stateless signed session token (seamlessly valid across all serverless lambda containers)
  const verified = verifySignedToken(token);
  if (verified) {
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: verified.uid },
          { username: verified.u },
        ],
      },
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
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      await ensureAdminProvisioning();
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: verified.uid },
            { username: verified.u },
          ],
        },
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
          lastLoginAt: true,
          createdAt: true,
        },
      });
    }

    if (user && user.status === 'ACTIVE') {
      return user;
    }
    return null;
  }

  // 2. Fallback to database session table lookup
  const session = await prisma.session.findUnique({
    where: { token },
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
          lastLoginAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) return null;

  // Check if expired
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return null;
  }

  // Check if user is disabled
  if (session.user.status !== 'ACTIVE') {
    return null;
  }

  return session.user;
}

/**
 * Record an immutable audit log entry.
 */
export async function recordAudit(params: {
  userId?: string | null;
  actorName: string;
  action: string;
  details: string;
  ipAddress?: string | null;
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        actorName: params.actorName,
        action: params.action,
        details: params.details,
        ipAddress: params.ipAddress || null,
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
    console.log(`  Password: ${adminPass}`);
    console.log('  Please log in and update your password if desired.');
    console.log('------------------------------------------------------------');
  }

  // Also ensure default shop technician if only admin exists
  const techCount = await prisma.user.count({
    where: { role: 'USER' },
  });

  if (techCount === 0) {
    await prisma.user.create({
      data: {
        id: '00000000-0000-0000-0000-000000000002',
        username: 'tech',
        email: 'alex@fasofix.ca',
        name: 'Alex Mercer',
        passwordHash: hashPassword('Tech@FasoFix2026!'),
        role: 'USER',
        status: 'ACTIVE',
        bench: 'Bench #04 (Alex Mercer)',
        bio: 'Hardware & soldering specialist. 8 years mobile and logic board diagnostics.',
        preferences: JSON.stringify({
          soundFX: true,
          compactView: false,
          autoPrint: false,
          emailAlerts: true,
          highPriorityAudio: true,
          lowStockAlerts: true,
        }),
      },
    }).catch(() => {});
  }
}
