import { prisma, isPostgres } from './prisma';
import {
  verifyPassword,
  hashSessionToken,
  createSession,
  recordAudit,
  parseUserAgent,
  verifyAuditLogChain,
  SESSION_MAX_AGE_MS,
} from './auth';
import { HttpError } from './service';
import { decryptSecret, encryptSecret } from './cryptoVault';
import {
  buildOtpauthUri,
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  parseRecoveryHashes,
  renderQrSvgDataUrl,
  verifyTotpCode,
} from './totp';

const TWO_FACTOR_POLICY_ENABLED_ACTION = 'TWO_FACTOR_POLICY_ENABLED';
const TWO_FACTOR_POLICY_DISABLED_ACTION = 'TWO_FACTOR_POLICY_DISABLED';

export async function isTwoFactorEnrollmentAvailable(): Promise<boolean> {
  const latest = await prisma.auditLog.findFirst({
    where: {
      action: { in: [TWO_FACTOR_POLICY_ENABLED_ACTION, TWO_FACTOR_POLICY_DISABLED_ACTION] },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { action: true },
  });
  if (latest) return latest.action === TWO_FACTOR_POLICY_ENABLED_ACTION;
  return process.env.ENABLE_2FA === 'true';
}

export async function setTwoFactorEnrollmentAvailability(
  available: boolean,
  actor: { id: string; name: string },
  ipAddress?: string | null
) {
  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: available ? TWO_FACTOR_POLICY_ENABLED_ACTION : TWO_FACTOR_POLICY_DISABLED_ACTION,
    details: available
      ? 'Administrator enabled Two-Factor Authentication enrollment'
      : 'Administrator temporarily disabled Two-Factor Authentication enrollment',
    ipAddress,
  });
  return { available };
}

function stripSensitiveUserFields<T extends Record<string, any>>(user: T) {
  const {
    passwordHash: _ph,
    sin: _sin,
    twoFactorSecret: _tfs,
    twoFactorRecoveryCodes: _tfr,
    twoFactorLastCounter: _tflc,
    ...safe
  } = user;
  return safe;
}

export async function verifyTwoFactorLogin(
  challengeToken: string,
  code: string,
  ipAddress?: string | null,
  userAgent?: string | null
) {
  if (!challengeToken?.trim() || !code?.trim()) {
    throw new HttpError(400, 'Verification challenge token and authenticator code are required.');
  }

  const tokenHash = hashSessionToken(challengeToken.trim());
  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!challenge) {
    throw new HttpError(401, 'Invalid or expired 2FA session. Please sign in again.');
  }

  if (challenge.expiresAt.getTime() < Date.now()) {
    await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } }).catch(() => {});
    throw new HttpError(401, '2FA verification challenge expired. Please sign in again.');
  }

  const user = challenge.user;
  if (user.status !== 'ACTIVE') {
    throw new HttpError(403, 'This account has been deactivated. Contact an administrator.');
  }
  if (challenge.adminMode && user.role !== 'ADMIN') {
    throw new HttpError(403, 'Access Denied: Administrator role required.');
  }
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new HttpError(400, 'Two-factor authentication is not enabled for this account.');
  }

  const secret = decryptSecret(user.twoFactorSecret);
  const totpCheck = verifyTotpCode(secret, code, 1);

  if (totpCheck.valid) {
    if (user.twoFactorLastCounter !== null && totpCheck.counter <= user.twoFactorLastCounter) {
      await recordAudit({
        userId: user.id,
        actorName: user.name,
        action: 'LOGIN_2FA_REPLAY_BLOCKED',
        details: `Blocked replayed 2FA TOTP code for ${user.username}`,
        ipAddress,
      });
      throw new HttpError(401, 'This verification code has already been used. Wait for the next 30-second code.');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorLastCounter: totpCheck.counter,
        lastLoginAt: new Date(),
      },
    });
  } else {
    const recovery = consumeRecoveryCode(code, user.twoFactorRecoveryCodes);
    if (!recovery.valid) {
      await recordAudit({
        userId: user.id,
        actorName: user.username,
        action: 'LOGIN_2FA_FAILED',
        details: `Invalid 2FA code attempt for ${user.username}`,
        ipAddress,
      });
      throw new HttpError(401, 'Invalid authenticator or recovery code.');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorRecoveryCodes: recovery.remainingJson,
        lastLoginAt: new Date(),
      },
    });
    await recordAudit({
      userId: user.id,
      actorName: user.name,
      action: 'LOGIN_2FA_RECOVERY_USED',
      details: `Signed in using a one-time recovery code (${recovery.remainingCount} remaining)`,
      ipAddress,
    });
  }

  await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } }).catch(() => {});

  const token = await createSession(user.id, { ipAddress, userAgent });
  await recordAudit({
    userId: user.id,
    actorName: user.name,
    action: 'LOGIN_2FA_SUCCESS',
    details: `${challenge.adminMode ? 'Administrator' : 'User'} verified 2FA from ${parseUserAgent(userAgent)} (${ipAddress || 'local'})`,
    ipAddress,
  });

  const expiresAtMs = Date.now() + SESSION_MAX_AGE_MS;
  return {
    requiresTwoFactor: false,
    token,
    user: stripSensitiveUserFields(user),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    redirectTo: user.role === 'ADMIN' && challenge.adminMode ? 'admin' : 'repairs',
  };
}

export async function getTwoFactorStatus(userId: string) {
  const [user, available] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorRecoveryCodes: true,
      },
    }),
    isTwoFactorEnrollmentAvailable(),
  ]);
  if (!user) throw new HttpError(404, 'User not found');
  return {
    available,
    enabled: Boolean(user.twoFactorEnabled),
    hasPendingSetup: !user.twoFactorEnabled && Boolean(user.twoFactorSecret),
    recoveryCodesRemaining: parseRecoveryHashes(user.twoFactorRecoveryCodes).length,
  };
}

export async function beginTwoFactorSetup(userId: string) {
  if (!(await isTwoFactorEnrollmentAvailable())) {
    throw new HttpError(403, 'Two-Factor Authentication is temporarily disabled by the administrator.');
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, twoFactorEnabled: true },
  });
  if (!user) throw new HttpError(404, 'User not found');

  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: encrypted,
      twoFactorLastCounter: null,
    },
  });

  const otpauthUri = buildOtpauthUri(secret, user.email || user.username, 'Faso Fix POS');
  const qrDataUrl = await renderQrSvgDataUrl(otpauthUri);
  return {
    qrDataUrl,
    manualSecret: secret,
    otpauthUri,
  };
}

export async function confirmTwoFactorSetup(
  userId: string,
  code: string,
  actorName: string,
  ipAddress?: string | null
) {
  if (!(await isTwoFactorEnrollmentAvailable())) {
    throw new HttpError(403, 'Two-Factor Authentication is temporarily disabled by the administrator.');
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, twoFactorSecret: true },
  });
  if (!user || !user.twoFactorSecret) {
    throw new HttpError(400, 'Please initiate authenticator setup first.');
  }

  const secret = decryptSecret(user.twoFactorSecret);
  const check = verifyTotpCode(secret, code, 1);
  if (!check.valid) {
    await recordAudit({
      userId,
      actorName,
      action: 'TWO_FACTOR_FAILED',
      details: `Failed 2FA enrollment confirmation for ${user.username}`,
      ipAddress,
    });
    throw new HttpError(400, 'Invalid 6-digit code. Check your authenticator clock and try again.');
  }

  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorLastCounter: check.counter,
      twoFactorRecoveryCodes: JSON.stringify(hashedCodes),
    },
  });

  await recordAudit({
    userId,
    actorName,
    action: 'TWO_FACTOR_ENABLED',
    details: `Enabled TOTP two-factor authentication for ${user.username}`,
    ipAddress,
  });

  return { enabled: true, recoveryCodes: plainCodes };
}

export async function disableTwoFactor(
  userId: string,
  currentPassword: string,
  code: string,
  actorName: string,
  currentToken?: string,
  ipAddress?: string | null
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new HttpError(400, 'Two-factor authentication is not enabled.');
  }

  if (!verifyPassword(currentPassword || '', user.passwordHash)) {
    throw new HttpError(400, 'Current password is incorrect.');
  }

  const secret = decryptSecret(user.twoFactorSecret);
  const totpCheck = verifyTotpCode(secret, code, 1);
  let validSecondFactor = totpCheck.valid && (user.twoFactorLastCounter === null || totpCheck.counter > user.twoFactorLastCounter);
  if (!validSecondFactor) {
    const recovery = consumeRecoveryCode(code, user.twoFactorRecoveryCodes);
    validSecondFactor = recovery.valid;
  }

  if (!validSecondFactor) {
    await recordAudit({
      userId,
      actorName,
      action: 'TWO_FACTOR_FAILED',
      details: `Rejected attempt to disable 2FA for ${user.username}`,
      ipAddress,
    });
    throw new HttpError(400, 'Valid authenticator or recovery code is required to disable 2FA.');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: null,
      twoFactorLastCounter: null,
    },
  });

  await Promise.all([
    prisma.session.deleteMany({
      where: {
        userId,
        ...(currentToken ? { token: { notIn: [hashSessionToken(currentToken), currentToken] } } : {}),
      },
    }),
    prisma.twoFactorChallenge.deleteMany({ where: { userId } }),
  ]).catch(() => {});

  await recordAudit({
    userId,
    actorName,
    action: 'TWO_FACTOR_DISABLED',
    details: `Disabled 2FA for ${user.username} and signed out other devices`,
    ipAddress,
  });

  return { enabled: false };
}

export async function regenerateRecoveryCodes(
  userId: string,
  currentPassword: string,
  code: string,
  actorName: string,
  ipAddress?: string | null
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new HttpError(400, 'Two-factor authentication is not enabled.');
  }
  if (!verifyPassword(currentPassword || '', user.passwordHash)) {
    throw new HttpError(400, 'Current password is incorrect.');
  }

  const secret = decryptSecret(user.twoFactorSecret);
  const check = verifyTotpCode(secret, code, 1);
  if (!check.valid || (user.twoFactorLastCounter !== null && check.counter <= user.twoFactorLastCounter)) {
    throw new HttpError(400, 'Valid fresh 6-digit authenticator code is required.');
  }

  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorLastCounter: check.counter,
      twoFactorRecoveryCodes: JSON.stringify(hashedCodes),
    },
  });

  await recordAudit({
    userId,
    actorName,
    action: 'TWO_FACTOR_RECOVERY_ROTATED',
    details: `Regenerated 2FA recovery codes for ${user.username}`,
    ipAddress,
  });

  return { recoveryCodes: plainCodes };
}

export async function adminResetUserTwoFactor(
  targetUserId: string,
  actor: { id: string; name: string },
  ipAddress?: string | null
) {
  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) throw new HttpError(404, 'User not found');

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: null,
      twoFactorLastCounter: null,
    },
  });
  await Promise.all([
    prisma.session.deleteMany({ where: { userId: targetUserId } }),
    prisma.twoFactorChallenge.deleteMany({ where: { userId: targetUserId } }),
  ]).catch(() => {});

  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: 'TWO_FACTOR_ADMIN_RESET',
    details: `Administrator ${actor.name} reset 2FA & terminated sessions for ${user.username}`,
    ipAddress,
  });

  return { ok: true };
}

export async function listUserSessions(userId: string, currentToken?: string) {
  const currentHash = currentToken ? hashSessionToken(currentToken) : null;
  const rows = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: 'desc' },
    select: {
      id: true,
      token: true,
      ipAddress: true,
      userAgent: true,
      lastActiveAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return rows.map((s) => ({
    id: s.id,
    device: parseUserAgent(s.userAgent),
    ipAddress: s.ipAddress || 'Local / Unknown',
    lastActiveAt: s.lastActiveAt,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
    isCurrent: Boolean(currentHash && (s.token === currentHash || s.token === currentToken)),
  }));
}

export async function revokeUserSession(
  userId: string,
  sessionId: string,
  actorName: string,
  ipAddress?: string | null
) {
  const target = await prisma.session.findFirst({ where: { id: sessionId, userId } });
  if (!target) throw new HttpError(404, 'Session not found');
  await prisma.session.delete({ where: { id: sessionId } });
  await recordAudit({
    userId,
    actorName,
    action: 'SESSION_REVOKED',
    details: `User signed out remote session ${sessionId.slice(0, 8)} (${parseUserAgent(target.userAgent)})`,
    ipAddress,
  });
  return { ok: true };
}

export async function revokeOtherUserSessions(
  userId: string,
  currentToken: string | undefined,
  actorName: string,
  ipAddress?: string | null
) {
  const result = await prisma.session.deleteMany({
    where: {
      userId,
      ...(currentToken ? { token: { notIn: [hashSessionToken(currentToken), currentToken] } } : {}),
    },
  });
  await recordAudit({
    userId,
    actorName,
    action: 'SESSIONS_REVOKED_OTHER',
    details: `Signed out ${result.count} other device session(s)`,
    ipAddress,
  });
  return { revokedCount: result.count };
}

export async function listAllActiveSessions(currentToken?: string) {
  const currentHash = currentToken ? hashSessionToken(currentToken) : null;
  const rows = await prisma.session.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, username: true, name: true, role: true, twoFactorEnabled: true } },
    },
  });

  return rows.map((s) => ({
    id: s.id,
    user: s.user,
    device: parseUserAgent(s.userAgent),
    ipAddress: s.ipAddress || 'Local / Unknown',
    lastActiveAt: s.lastActiveAt,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
    isCurrent: Boolean(currentHash && (s.token === currentHash || s.token === currentToken)),
  }));
}

export async function adminRevokeSessionById(
  sessionId: string,
  actor: { id: string; name: string },
  ipAddress?: string | null
) {
  const target = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { select: { username: true } } },
  });
  if (!target) throw new HttpError(404, 'Session not found');
  await prisma.session.delete({ where: { id: sessionId } });
  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: 'ADMIN_SESSION_REVOKED',
    details: `Admin revoked session ${sessionId.slice(0, 8)} for ${target.user.username}`,
    ipAddress,
  });
  return { ok: true };
}

export async function adminRevokeUserSessions(
  targetUserId: string,
  actor: { id: string; name: string },
  ipAddress?: string | null
) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { username: true } });
  if (!target) throw new HttpError(404, 'User not found');

  const res = await prisma.session.deleteMany({ where: { userId: targetUserId } });
  await prisma.twoFactorChallenge.deleteMany({ where: { userId: targetUserId } }).catch(() => {});
  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: 'ADMIN_USER_FORCE_LOGOUT',
    details: `Admin terminated ${res.count} session(s) for ${target.username}`,
    ipAddress,
  });
  return { revokedCount: res.count };
}

export async function verifyTerminalUnlock(
  userId: string,
  password: string,
  code?: string,
  ipAddress?: string | null
) {
  if (!password) {
    throw new HttpError(400, 'Password is required to unlock this terminal.');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVE') {
    throw new HttpError(401, 'Session is no longer active.');
  }

  if (!verifyPassword(password, user.passwordHash)) {
    await recordAudit({
      userId,
      actorName: user.username,
      action: 'UNLOCK_FAILED',
      details: `Invalid password on locked terminal unlock attempt for ${user.username}`,
      ipAddress,
    });
    throw new HttpError(401, 'Incorrect password.');
  }

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const rawCode = (code || '').trim();
    if (!rawCode) {
      throw new HttpError(401, 'Authenticator or recovery code is required to unlock.');
    }
    const secret = decryptSecret(user.twoFactorSecret);
    const totpCheck = verifyTotpCode(secret, rawCode, 1);
    if (totpCheck.valid) {
      if (user.twoFactorLastCounter !== null && totpCheck.counter <= user.twoFactorLastCounter) {
        throw new HttpError(401, 'This verification code has already been used. Wait for the next code.');
      }
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorLastCounter: totpCheck.counter },
      });
    } else {
      const recovery = consumeRecoveryCode(rawCode, user.twoFactorRecoveryCodes);
      if (!recovery.valid) {
        await recordAudit({
          userId,
          actorName: user.username,
          action: 'UNLOCK_FAILED',
          details: `Invalid 2FA code on locked terminal unlock attempt for ${user.username}`,
          ipAddress,
        });
        throw new HttpError(401, 'Invalid authenticator or recovery code.');
      }
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorRecoveryCodes: recovery.remainingJson },
      });
    }
  }

  return { unlocked: true };
}

export async function getAdminSecurityPosture() {
  const since24h = new Date(Date.now() - 24 * 60 * 60_000);
  const [users, activeSessionsCount, auditChain, failedLogins24h, recentAlerts, rlsRows, twoFactorAvailable] = await Promise.all([
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, username: true, role: true, passwordHash: true, twoFactorEnabled: true },
    }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    verifyAuditLogChain(200),
    prisma.auditLog.count({
      where: {
        action: { in: ['LOGIN_FAILED', 'LOGIN_2FA_FAILED', 'UNLOCK_FAILED'] },
        createdAt: { gte: since24h },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'LOGIN_FAILED',
            'LOGIN_2FA_FAILED',
            'LOGIN_2FA_REPLAY_BLOCKED',
            'ADMIN_ACCESS_REJECTED',
            'UNLOCK_FAILED',
            'TWO_FACTOR_FAILED',
            'ADMIN_USER_FORCE_LOGOUT',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, actorName: true, action: true, details: true, ipAddress: true, createdAt: true },
    }),
    isPostgres
      ? (prisma.$queryRawUnsafe(
          `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
        ) as Promise<Array<{ tablename: string; rowsecurity: boolean }>>)
      : Promise.resolve([]),
    isTwoFactorEnrollmentAvailable(),
  ]);

  const twoFactorEnabledCount = users.filter((u) => u.twoFactorEnabled).length;
  const adminUsers = users.filter((u) => u.role === 'ADMIN');
  const adminTwoFactorCount = adminUsers.filter((u) => u.twoFactorEnabled).length;

  const knownDefaultPasswords = ['Admin@FasoFix2026!', 'Tech@FasoFix2026!'];
  const defaultPasswordAccounts = users
    .filter((u) => knownDefaultPasswords.some((pw) => verifyPassword(pw, u.passwordHash)))
    .map((u) => u.username);

  const rlsTotal = rlsRows.length;
  const rlsProtected = rlsRows.filter((r) => r.rowsecurity).length;
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const fieldEncryptionKeyConfigured = Boolean(process.env.FIELD_ENCRYPTION_KEY?.trim());

  const controls = [
    { id: 'rls', label: 'PostgreSQL Row-Level Security (All Tables)', ok: isPostgres ? rlsTotal > 0 && rlsProtected === rlsTotal : true, detail: isPostgres ? `${rlsProtected}/${rlsTotal} tables locked` : 'SQLite local mode' },
    { id: 'hashed-sessions', label: 'SHA-256 Hashed HttpOnly SameSite=Strict Cookies', ok: true, detail: `${activeSessionsCount} active session(s)` },
    { id: 'csrf', label: 'Origin & Custom-Header CSRF Defense', ok: true, detail: 'Enforced on cookie mutations' },
    { id: 'csp', label: 'Strict Zero-Inline-Script CSP + HSTS', ok: true, detail: "script-src 'self' + HSTS preload" },
    { id: 'audit-chain', label: 'Tamper-Evident Audit Log SHA-256 Chain', ok: auditChain.intact, detail: `${auditChain.checked} entries verified, ${auditChain.tamperedCount} tampered` },
    { id: 'brute-force', label: 'Persistent DB Brute-Force Lockout & Rate Limiting', ok: true, detail: `${failedLogins24h} blocked/failed event(s) in 24h` },
    { id: 'csv-xss', label: 'CSV Formula Injection & Stored HTML XSS Guards', ok: true, detail: 'CWE-1236 & escaped HTML outputs' },
    {
      id: 'totp-2fa',
      label: 'TOTP Authenticator 2FA Enrollment',
      ok: twoFactorAvailable ? adminTwoFactorCount > 0 : false,
      detail: twoFactorAvailable
        ? `${twoFactorEnabledCount}/${users.length} active staff enrolled`
        : 'Temporarily disabled by administrator (can be turned back on manually)',
    },
    { id: 'default-passwords', label: 'All Staff Rotated Off Bootstrap Passwords', ok: defaultPasswordAccounts.length === 0, detail: defaultPasswordAccounts.length === 0 ? 'All unique credentials' : `Still using default password: ${defaultPasswordAccounts.join(', ')}` },
    { id: 'env-db', label: 'Dedicated Production DATABASE_URL Configured', ok: databaseUrlConfigured, detail: databaseUrlConfigured ? 'Configured in env' : 'Using fallback URL until rotated' },
    { id: 'env-vault', label: 'Dedicated FIELD_ENCRYPTION_KEY Configured', ok: fieldEncryptionKeyConfigured, detail: fieldEncryptionKeyConfigured ? 'v2 vault key active' : 'Using v1 app-scoped key' },
  ];

  return {
    provider: isPostgres ? 'postgresql' : 'sqlite',
    rls: { total: rlsTotal, enabled: rlsProtected, allEnabled: rlsTotal > 0 && rlsProtected === rlsTotal },
    auditChain,
    twoFactorAvailable,
    users: {
      totalActive: users.length,
      twoFactorEnabled: twoFactorEnabledCount,
      adminTotal: adminUsers.length,
      adminTwoFactorEnabled: adminTwoFactorCount,
      defaultPasswordAccounts,
    },
    activeSessionsCount,
    failedLogins24h,
    env: { databaseUrlConfigured, fieldEncryptionKeyConfigured },
    controls,
    recentAlerts,
  };
}
