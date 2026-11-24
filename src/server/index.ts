import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { ZodError } from 'zod';
import {
  HttpError,
  getSettings,
  updateSettings,
  listTicketsPaginated,
  getTicket,
  createTicket,
  updateTicket,
  updateTicketApproval,
  deleteTicket,
  addItem,
  removeItem,
  addPayment,
  refundPayment,
  voidPayment,
  addNote,
  updateNote,
  deleteNote,
  addPhoto,
  listCustomersPaginated,
  lookupCustomerByPhone,
  getCustomer,
  updateCustomer,
  archiveCustomer,
  listParts,
  createPart,
  updatePart,
  adjustStock,
  deletePart,
  getDashboard,
  getReport,
  getSalesLaborAnalytics,
  exportTicketsCsv,
  loginUser,
  logoutUser,
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword,
  adminResetUserPassword,
  updateUserPreferences,
  listAuditLogsPaginated,
  getAdminOverview,
} from './service';
import { authenticateSession, destroySession, ensureAdminProvisioning, hashSessionToken, recordAudit } from './auth';
import { configureSqlite, createBackup, listBackups, resolveBackup, startBackupSchedule } from './backup';
import { ensureDatabaseSchema, ensureInitialInventory } from './initDb';
import * as payrollService from './payrollService';
import * as scheduleService from './scheduleService';
import * as notificationService from './notificationService';
import * as securityService from './securityService';
import { prisma } from './prisma';
import { buildReceiptHtml, buildBenchSlipHtml, buildLetterInvoiceHtml } from '../utils/receipt';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        name: string;
        role: string;
        status: string;
        phone: string | null;
        bench: string | null;
        bio: string | null;
        preferences: string;
        twoFactorEnabled: boolean;
        lastLoginAt: Date | null;
        createdAt: Date;
      };
      token?: string;
      authMethod?: 'bearer' | 'cookie';
      sessionExpired?: boolean;
    }
  }
}

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 4000;

const SESSION_COOKIE_NAME = 'fasofix_session';
const CSRF_HEADER_NAME = 'x-requested-with';
const CSRF_HEADER_VALUE = 'FasoFixPOS';
const ZERO_SCRIPT_HTML_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const STATIC_ALLOWED_ORIGINS = new Set([
  'https://fasodesk.repair',
  'https://www.fasodesk.repair',
  'https://faso-fix-pos.vercel.app',
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
]);

function isOriginAllowed(origin: string): boolean {
  if (STATIC_ALLOWED_ORIGINS.has(origin)) return true;
  if (!process.env.VERCEL && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return true;
  }
  return false;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function shouldUseSecureCookie(req: Request): boolean {
  if (process.env.VERCEL || req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https') return true;
  return false;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=86400',
  ];
  if (shouldUseSecureCookie(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
  ];
  if (shouldUseSecureCookie(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, false);
      if (isOriginAllowed(origin)) return callback(null, origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Idempotency-Key'],
  })
);
const largeJsonParser = express.json({ limit: '5mb' });
const defaultJsonParser = express.json({ limit: '256kb' });
app.use((req: Request, res: Response, next: NextFunction) => {
  const pathStr = req.path || '';
  if (
    pathStr === '/api/tickets' ||
    /^\/api\/tickets\/[^/]+$/.test(pathStr) ||
    /^\/api\/tickets\/[^/]+\/photos$/.test(pathStr)
  ) {
    return largeJsonParser(req, res, next);
  }
  return defaultJsonParser(req, res, next);
});

// Prevent any browser or CDN edge caching of dynamic POS API responses and enforce security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
});

// Sliding-window API burst rate limiter (600 req/min per IP)
const apiBurstBuckets = new Map<string, { count: number; resetAt: number }>();
const API_BURST_WINDOW_MS = 60_000;
const API_BURST_MAX_REQ = 600;
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);
  if (process.env.NODE_ENV === 'test' && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
    return next();
  }
  const now = Date.now();
  let bucket = apiBurstBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 1, resetAt: now + API_BURST_WINDOW_MS };
    apiBurstBuckets.set(ip, bucket);
    if (apiBurstBuckets.size > 5000) {
      const oldest = apiBurstBuckets.keys().next().value;
      if (oldest) apiBurstBuckets.delete(oldest);
    }
    return next();
  }
  bucket.count++;
  if (bucket.count > API_BURST_MAX_REQ) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({ success: false, error: 'Too many requests. Please slow down.' });
  }
  next();
});

// Session resolution middleware (Authorization: Bearer or HttpOnly SameSite=Strict cookie only)
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
      if (token) req.authMethod = 'bearer';
    } else {
      const cookies = parseCookies(req.headers.cookie);
      const cookieToken = cookies[SESSION_COOKIE_NAME];
      if (cookieToken) {
        token = cookieToken;
        req.authMethod = 'cookie';
      }
    }

    if (token) {
      req.token = token;
      const user = await authenticateSession(token);
      if (user) {
        req.user = user;
      } else {
        req.sessionExpired = true;
      }
    }
  } catch (err) {
    console.error('[Auth Middleware Error]', err);
  }
  next();
});

// CSRF defense-in-depth for cookie-authenticated state-changing API requests
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (req.authMethod !== 'cookie') return next();
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const xrw = String(req.headers[CSRF_HEADER_NAME] || '');
  if (xrw !== CSRF_HEADER_VALUE) {
    return res.status(403).json({
      success: false,
      error: 'CSRF validation failed: missing required request header.',
    });
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const sourceOrigin =
    typeof originHeader === 'string' && originHeader
      ? originHeader
      : typeof refererHeader === 'string' && refererHeader
      ? (() => {
          try {
            return new URL(refererHeader).origin;
          } catch {
            return 'INVALID';
          }
        })()
      : null;

  if (sourceOrigin) {
    const requestHost = String(req.headers.host || '').toLowerCase();
    let matchesHost = false;
    try {
      matchesHost = new URL(sourceOrigin).host.toLowerCase() === requestHost;
    } catch {}
    if (!matchesHost && !isOriginAllowed(sourceOrigin)) {
      return res.status(403).json({
        success: false,
        error: 'CSRF validation failed: cross-origin request rejected.',
      });
    }
  }
  next();
});

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: req.sessionExpired ? 'SESSION_EXPIRED' : 'AUTH_REQUIRED',
      error: req.sessionExpired
        ? 'Your session has expired after 24 hours. Please log in again.'
        : 'Authentication required. Please log in.',
    });
  }
  next();
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: req.sessionExpired ? 'SESSION_EXPIRED' : 'AUTH_REQUIRED',
      error: req.sessionExpired
        ? 'Your session has expired after 24 hours. Please log in again.'
        : 'Authentication required. Please log in.',
    });
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Access forbidden: Administrator privileges required.' });
  }
  next();
};

const getParam = (req: Request, name: string): string => {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : (val || '');
};

// ---------------------------------------------------------------------------
// Real-Time Server-Sent Events (SSE) Live Bus
// ---------------------------------------------------------------------------
interface SseClient {
  id: string;
  res: Response;
}

const sseClients: SseClient[] = [];

export function broadcastLiveEvent(event: string, data: any = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].res.write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

app.get('/api/live/stream', requireAuth, (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: Date.now() })}\n\n`);

  const clientId = crypto.randomUUID();
  const client: SseClient = { id: clientId, res };
  sseClients.push(client);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const index = sseClients.findIndex((c) => c.id === clientId);
    if (index !== -1) sseClients.splice(index, 1);
  });
});

// ---------------------------------------------------------------------------
// Authentication & Current User Profile Routes
// ---------------------------------------------------------------------------

function getClientIp(req: Request): string {
  try {
    if (process.env.VERCEL) {
      const vercelIp = req.headers['x-vercel-forwarded-for'];
      if (typeof vercelIp === 'string' && vercelIp.trim()) {
        return vercelIp.split(',')[0].trim();
      }
      const realIp = req.headers['x-real-ip'];
      if (typeof realIp === 'string' && realIp.trim()) {
        return realIp.trim();
      }
    } else {
      const realIp = req.headers['x-real-ip'];
      if (typeof realIp === 'string' && realIp.trim()) {
        return realIp.trim();
      }
      if (req.socket && req.socket.remoteAddress) {
        return req.socket.remoteAddress;
      }
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
      }
    }
    return req.socket?.remoteAddress || req.ip || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

// Persistent PostgreSQL-backed brute-force lockout: max 5 failures per IP+account / 30 per IP per 15 mins
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILS = 5;
const LOGIN_IP_MAX_FAILS = 30;

async function checkDbAttemptLimit(ip: string, actor: string, action: string): Promise<void> {
  const cutoff = new Date(Date.now() - LOGIN_WINDOW_MS);
  const [userFailCount, ipFailCount] = await Promise.all([
    prisma.auditLog.count({
      where: { action, ipAddress: ip, actorName: actor, createdAt: { gte: cutoff } },
    }),
    prisma.auditLog.count({
      where: { action, ipAddress: ip, createdAt: { gte: cutoff } },
    }),
  ]);

  if (userFailCount >= LOGIN_MAX_FAILS || ipFailCount >= LOGIN_IP_MAX_FAILS) {
    throw new HttpError(429, 'Too many failed attempts. Please wait 15 minutes and try again.');
  }
}

app.post('/api/auth/login', wrap(async (req, res) => {
  const ip = getClientIp(req);
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
  const who = String(req.body?.usernameOrEmail || '').trim().toLowerCase().slice(0, 80) || 'unknown';

  await checkDbAttemptLimit(ip, who, 'LOGIN_FAILED');

  try {
    const result = await loginUser(req.body, ip, ua);
    await prisma.auditLog
      .deleteMany({ where: { action: 'LOGIN_FAILED', ipAddress: ip, actorName: who } })
      .catch(() => {});

    if (result.requiresTwoFactor) {
      return res.json({ success: true, ...result });
    }

    // Rotate out any prior session token on re-login / role elevation
    if (req.token && result.token && req.token !== result.token) {
      await destroySession(req.token).catch(() => {});
    }
    if (result.token) {
      setSessionCookie(req, res, result.token);
    }
    res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      await recordAudit({
        action: 'LOGIN_FAILED',
        actorName: who,
        ipAddress: ip,
        details: `Failed login attempt for ${who}`,
      });
    }
    throw err;
  }
}));

app.post('/api/auth/login/verify-2fa', wrap(async (req, res) => {
  const ip = getClientIp(req);
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
  const challengeToken = String(req.body?.challengeToken || '');
  const code = String(req.body?.code || '');
  const actorKey = challengeToken ? hashSessionToken(challengeToken).slice(0, 16) : '2fa';

  await checkDbAttemptLimit(ip, actorKey, 'LOGIN_2FA_CHALLENGE_FAIL');

  try {
    const result = await securityService.verifyTwoFactorLogin(challengeToken, code, ip, ua);
    await prisma.auditLog
      .deleteMany({ where: { action: 'LOGIN_2FA_CHALLENGE_FAIL', ipAddress: ip } })
      .catch(() => {});

    if (req.token && result.token && req.token !== result.token) {
      await destroySession(req.token).catch(() => {});
    }
    setSessionCookie(req, res, result.token);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      await recordAudit({
        action: 'LOGIN_2FA_CHALLENGE_FAIL',
        actorName: actorKey,
        ipAddress: ip,
        details: 'Failed 2FA verification challenge attempt',
      });
    }
    throw err;
  }
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const token = req.token;
  if (token) {
    await logoutUser(token, req.user?.name);
  }
  clearSessionCookie(req, res);
  res.json({ success: true, message: 'Logged out successfully' });
}));

app.get('/api/auth/me', wrap(async (req, res) => {
  if (!req.user) {
    return res.json({ success: true, authenticated: false, user: null });
  }
  res.json({ success: true, authenticated: true, user: req.user });
}));

app.put('/api/auth/profile', requireAuth, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const { name, email, phone, bench, bio, preferences } = req.body || {};
  const sanitizedProfile: Record<string, unknown> = {};
  if (name !== undefined) sanitizedProfile.name = name;
  if (email !== undefined) sanitizedProfile.email = email;
  if (phone !== undefined) sanitizedProfile.phone = phone;
  if (bench !== undefined) sanitizedProfile.bench = bench;
  if (bio !== undefined) sanitizedProfile.bio = bio;
  if (preferences !== undefined) sanitizedProfile.preferences = preferences;

  const updated = await updateUser(req.user!.id, sanitizedProfile, actor);
  res.json({ success: true, user: updated });
}));

app.put('/api/auth/password', requireAuth, wrap(async (req, res) => {
  const ip = getClientIp(req);
  await checkDbAttemptLimit(ip, req.user!.username, 'PASSWORD_FAILED');
  try {
    const result = await changeUserPassword(req.user!.id, req.body, req.user!.name, req.token);
    await prisma.auditLog
      .deleteMany({ where: { action: 'PASSWORD_FAILED', ipAddress: ip, actorName: req.user!.username } })
      .catch(() => {});
    res.json(result);
  } catch (err) {
    if (err instanceof HttpError && err.status === 400) {
      await recordAudit({
        userId: req.user!.id,
        actorName: req.user!.username,
        action: 'PASSWORD_FAILED',
        ipAddress: ip,
        details: `Failed password change attempt for ${req.user!.username}`,
      });
    }
    throw err;
  }
}));

app.put('/api/auth/preferences', requireAuth, wrap(async (req, res) => {
  const updated = await updateUserPreferences(req.user!.id, req.body.preferences || req.body);
  res.json({ success: true, preferences: updated.preferences });
}));

// Two-Factor Authentication (TOTP) & Active Device Session Endpoints
app.get('/api/auth/2fa/status', requireAuth, wrap(async (req, res) => {
  const data = await securityService.getTwoFactorStatus(req.user!.id);
  res.json({ success: true, data });
}));

app.post('/api/auth/2fa/setup', requireAuth, wrap(async (req, res) => {
  const data = await securityService.beginTwoFactorSetup(req.user!.id);
  res.json({ success: true, data });
}));

app.post('/api/auth/2fa/confirm', requireAuth, wrap(async (req, res) => {
  const ip = getClientIp(req);
  await checkDbAttemptLimit(ip, req.user!.name, 'TWO_FACTOR_FAILED');
  const data = await securityService.confirmTwoFactorSetup(req.user!.id, String(req.body?.code || ''), req.user!.name, ip);
  await prisma.auditLog.deleteMany({ where: { action: 'TWO_FACTOR_FAILED', ipAddress: ip, actorName: req.user!.name } }).catch(() => {});
  res.json({ success: true, data });
}));

app.post('/api/auth/2fa/disable', requireAuth, wrap(async (req, res) => {
  const ip = getClientIp(req);
  await checkDbAttemptLimit(ip, req.user!.name, 'TWO_FACTOR_FAILED');
  const data = await securityService.disableTwoFactor(
    req.user!.id,
    String(req.body?.currentPassword || ''),
    String(req.body?.code || ''),
    req.user!.name,
    req.token,
    ip
  );
  res.json({ success: true, data });
}));

app.post('/api/auth/2fa/recovery', requireAuth, wrap(async (req, res) => {
  const ip = getClientIp(req);
  await checkDbAttemptLimit(ip, req.user!.name, 'TWO_FACTOR_FAILED');
  const data = await securityService.regenerateRecoveryCodes(
    req.user!.id,
    String(req.body?.currentPassword || ''),
    String(req.body?.code || ''),
    req.user!.name,
    ip
  );
  res.json({ success: true, data });
}));

app.get('/api/auth/sessions', requireAuth, wrap(async (req, res) => {
  const sessions = await securityService.listUserSessions(req.user!.id, req.token);
  res.json({ success: true, data: sessions });
}));

app.delete('/api/auth/sessions/other', requireAuth, wrap(async (req, res) => {
  const result = await securityService.revokeOtherUserSessions(
    req.user!.id,
    req.token,
    req.user!.name,
    getClientIp(req)
  );
  res.json({ success: true, data: result });
}));

app.delete('/api/auth/sessions/:id', requireAuth, wrap(async (req, res) => {
  const result = await securityService.revokeUserSession(
    req.user!.id,
    getParam(req, 'id'),
    req.user!.name,
    getClientIp(req)
  );
  res.json({ success: true, data: result });
}));

app.post('/api/auth/verify-unlock', requireAuth, wrap(async (req, res) => {
  const ip = getClientIp(req);
  await checkDbAttemptLimit(ip, req.user!.username, 'UNLOCK_FAILED');
  const result = await securityService.verifyTerminalUnlock(
    req.user!.id,
    String(req.body?.password || ''),
    req.body?.code !== undefined ? String(req.body.code) : undefined,
    ip
  );
  await prisma.auditLog.deleteMany({ where: { action: 'UNLOCK_FAILED', ipAddress: ip, actorName: req.user!.username } }).catch(() => {});
  res.json({ success: true, ...result });
}));

// ---------------------------------------------------------------------------
// Administrator Management Endpoints (Strictly requireAdmin)
// ---------------------------------------------------------------------------

app.get('/api/admin/overview', requireAdmin, wrap(async (_req, res) => {
  const overview = await getAdminOverview();
  res.json({ success: true, data: overview });
}));

app.get('/api/users', requireAuth, wrap(async (_req, res) => {
  const users = await listUsers({}, false);
  res.json({ success: true, count: users.length, data: users, users });
}));

app.post('/api/sync/users', requireAdmin, wrap(async (req, res) => {
  const { deletedUserIds } = req.body || {};
  if (Array.isArray(deletedUserIds) && deletedUserIds.length > 0) {
    const safeDeletedIds = deletedUserIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0 && id !== req.user!.id);
    if (safeDeletedIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: safeDeletedIds } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: safeDeletedIds } } }).catch(() => {});
    }
  }
  const allUsers = await listUsers({}, false);
  res.json({ success: true, count: allUsers.length, data: allUsers });
}));

app.get('/api/admin/users', requireAdmin, wrap(async (req, res) => {
  const search = req.query.search as string | undefined;
  const role = req.query.role as string | undefined;
  const status = req.query.status as string | undefined;
  const users = await listUsers({ search, role, status }, false);
  res.json({ success: true, count: users.length, data: users });
}));

app.post('/api/admin/users', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const user = await createUser(req.body, actor);
  res.status(201).json({ success: true, data: user });
}));

app.get('/api/admin/users/:id', requireAdmin, wrap(async (req, res) => {
  const user = await getUser(getParam(req, 'id'));
  res.json({ success: true, data: user });
}));

app.put('/api/admin/users/:id', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const user = await updateUser(getParam(req, 'id'), req.body, actor);
  res.json({ success: true, data: user });
}));

app.delete('/api/admin/users/:id', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const result = await deleteUser(getParam(req, 'id'), actor);
  res.json(result);
}));

app.post('/api/admin/users/:id/reset-password', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const result = await adminResetUserPassword(getParam(req, 'id'), req.body, actor);
  res.json(result);
}));

app.get('/api/admin/audit-logs', requireAdmin, wrap(async (req, res) => {
  const hasPage = req.query.page !== undefined;
  const page = hasPage ? parseInt(req.query.page as string, 10) || 1 : 1;
  const pageSize = req.query.pageSize
    ? parseInt(req.query.pageSize as string, 10)
    : req.query.limit
    ? parseInt(req.query.limit as string, 10)
    : hasPage
    ? 25
    : 100;
  const action = req.query.action as string | undefined;
  const search = req.query.search as string | undefined;
  const result = await listAuditLogsPaginated({ page, pageSize, action, search });
  res.json({
    success: true,
    count: result.items.length,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    hasMore: result.hasMore,
    data: result.items,
  });
}));

app.get('/api/admin/security/posture', requireAdmin, wrap(async (_req, res) => {
  const posture = await securityService.getAdminSecurityPosture();
  res.json({ success: true, data: posture });
}));

app.post('/api/admin/security/2fa-availability', requireAdmin, wrap(async (req, res) => {
  if (typeof req.body?.available !== 'boolean') {
    throw new HttpError(400, 'Boolean field "available" is required.');
  }
  const data = await securityService.setTwoFactorEnrollmentAvailability(
    req.body.available,
    { id: req.user!.id, name: req.user!.name },
    getClientIp(req)
  );
  res.json({ success: true, data });
}));

app.get('/api/admin/sessions', requireAdmin, wrap(async (req, res) => {
  const sessions = await securityService.listAllActiveSessions(req.token);
  res.json({ success: true, data: sessions });
}));

app.delete('/api/admin/sessions/:id', requireAdmin, wrap(async (req, res) => {
  const result = await securityService.adminRevokeSessionById(
    getParam(req, 'id'),
    { id: req.user!.id, name: req.user!.name },
    getClientIp(req)
  );
  res.json({ success: true, data: result });
}));

app.post('/api/admin/users/:id/revoke-sessions', requireAdmin, wrap(async (req, res) => {
  const result = await securityService.adminRevokeUserSessions(
    getParam(req, 'id'),
    { id: req.user!.id, name: req.user!.name },
    getClientIp(req)
  );
  res.json({ success: true, data: result });
}));

app.post('/api/admin/users/:id/reset-2fa', requireAdmin, wrap(async (req, res) => {
  const result = await securityService.adminResetUserTwoFactor(
    getParam(req, 'id'),
    { id: req.user!.id, name: req.user!.name },
    getClientIp(req)
  );
  res.json({ success: true, data: result });
}));

// ---------------------------------------------------------------------------
// Dashboard, Stats & Reports
// ---------------------------------------------------------------------------

app.get('/api/dashboard', requireAuth, wrap(async (_req, res) => {
  const data = await getDashboard();
  res.json({ success: true, data });
}));

// Backwards compatibility endpoint for any dashboard KPI widgets
app.get('/api/stats', requireAuth, wrap(async (_req, res) => {
  const data = await getDashboard();
  res.json({
    success: true,
    data: {
      ...data,
      totalActive: data.open,
      waitingOnParts: data.waitingOnParts,
      completed: data.completed,
      pending: data.pending,
      inProgress: data.inProgress,
      totalPipeline: data.openValueCents / 100,
      projectedPipeline: data.openValueCents / 100,
      securedInvoiced: data.collectedMonthCents / 100,
      customerCount: data.customerCount,
    },
  });
}));

app.get('/api/reports', requireAuth, wrap(async (req, res) => {
  const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
  const data = await getReport(days);
  res.json({ success: true, data });
}));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

app.get('/api/settings', requireAuth, wrap(async (_req, res) => {
  const settings = await getSettings();
  res.json({ success: true, data: settings });
}));

app.put('/api/settings', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const settings = await updateSettings(req.body, actor);
  broadcastLiveEvent('settings_updated', settings);
  res.json({ success: true, data: settings });
}));

// ---------------------------------------------------------------------------
// Tickets (Work Orders)
// ---------------------------------------------------------------------------

app.get('/api/tickets', requireAuth, wrap(async (req, res) => {
  const view = (req.query.view || req.query.status || 'OPEN') as string;
  const search = req.query.search as string | undefined;
  const bench = req.query.bench as string | undefined;
  const sort = req.query.sort as string | undefined;
  const warranty = req.query.warranty as string | undefined;
  const hasPage = req.query.page !== undefined;
  const page = hasPage ? parseInt(req.query.page as string, 10) || 1 : 1;
  const pageSize = req.query.pageSize
    ? parseInt(req.query.pageSize as string, 10)
    : req.query.limit
    ? parseInt(req.query.limit as string, 10)
    : hasPage
    ? 25
    : 200;
  const result = await listTicketsPaginated({ view, search, bench, sort, warranty, page, pageSize });
  res.json({
    success: true,
    count: result.items.length,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    hasMore: result.hasMore,
    data: result.items,
  });
}));

app.get('/api/tickets/:id', requireAuth, wrap(async (req, res) => {
  const ticket = await getTicket(getParam(req, 'id'));
  res.json({ success: true, data: ticket });
}));

app.get('/api/tickets/:id/print', requireAuth, wrap(async (req, res) => {
  let ticket: any = null;
  try {
    ticket = await getTicket(getParam(req, 'id'));
  } catch {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', ZERO_SCRIPT_HTML_CSP);
    return res.status(200).send(`
      <!doctype html><html><head><title>Print Preview</title></head>
      <body style="font-family:sans-serif;padding:40px;text-align:center;color:#334155">
        <h2 style="color:#0f172a">Faso Fix POS • Print Dispatch</h2>
        <p>Work order not found in active database records. Please close this tab and click Print from your open work order screen.</p>
      </body></html>
    `);
  }
  const shop = await getSettings();
  const format = (req.query.format as string) || 'letter';
  let html = '';

  if (format === '80mm') {
    html = buildReceiptHtml(ticket as any, shop, '80mm');
  } else if (format === '58mm') {
    html = buildReceiptHtml(ticket as any, shop, '58mm');
  } else if (format === 'slip' || format === 'bench') {
    html = buildBenchSlipHtml(ticket as any, shop);
  } else {
    html = buildLetterInvoiceHtml(ticket as any, shop);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', ZERO_SCRIPT_HTML_CSP);
  res.send(html);
}));

app.post('/api/tickets', requireAuth, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const ticket = await createTicket(req.body, actor);
  broadcastLiveEvent('ticket_created', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

app.put('/api/tickets/:id', requireAuth, wrap(async (req, res) => {
  const ticket = await updateTicket(getParam(req, 'id'), req.body, req.user!.name, req.user!.id, req.user!.role);
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

app.post('/api/tickets/:id/approval', requireAuth, wrap(async (req, res) => {
  const ticket = await updateTicketApproval(getParam(req, 'id'), req.body, {
    id: req.user!.id,
    name: req.user!.name,
    role: req.user!.role,
  });
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const ticketId = getParam(req, 'id');
  const result = await deleteTicket(ticketId, actor.name);

  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: 'TICKET_DELETE',
    details: `Administrator deleted work order ${ticketId}`,
  });

  broadcastLiveEvent('ticket_deleted', { id: ticketId });
  res.json({ success: true, data: result });
}));

// Quick complete shortcut
app.post('/api/tickets/:id/quick-complete', requireAuth, wrap(async (req, res) => {
  const ticket = await updateTicket(getParam(req, 'id'), { status: 'COMPLETED' }, req.user!.name, req.user!.id, req.user!.role);
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, message: 'Work order marked completed', data: ticket });
}));

// Line items / parts attachment
app.post('/api/tickets/:id/items', requireAuth, wrap(async (req, res) => {
  const ticket = await addItem(getParam(req, 'id'), req.body, req.user!.name, req.user!.id, req.user!.role);
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

// Backward-compatible route for parts attachment
app.post('/api/tickets/:id/parts', requireAuth, wrap(async (req, res) => {
  const { partId, customName, price, quantity } = req.body;
  const ticket = await addItem(getParam(req, 'id'), {
    partId: partId || undefined,
    description: customName || undefined,
    unitPriceCents: price !== undefined ? Math.round(Number(price) * 100) : undefined,
    quantity: quantity ? Number(quantity) : 1,
  }, req.user!.name, req.user!.id, req.user!.role);
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id/items/:itemId', requireAuth, wrap(async (req, res) => {
  const ticket = await removeItem(getParam(req, 'id'), getParam(req, 'itemId'), req.user!.name, req.user!.id, req.user!.role);
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

// Payments & Refunds
app.post('/api/tickets/:id/payments', requireAuth, wrap(async (req, res) => {
  const body = req.body || {};
  const amountCents = body.amountCents ?? (body.amount !== undefined ? Math.round(Number(body.amount) * 100) : undefined);
  const idempotencyKey = body.idempotencyKey || (req.headers['x-idempotency-key'] as string | undefined);
  const ticket = await addPayment(getParam(req, 'id'), {
    amountCents,
    method: body.method || 'CASH',
    note: body.note,
    idempotencyKey,
  }, req.user!.name, req.user!.id);
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

app.post('/api/tickets/:id/refund', requireAdmin, wrap(async (req, res) => {
  const body = req.body || {};
  const amountCents = body.amountCents ?? (body.amount !== undefined ? Math.round(Number(body.amount) * 100) : undefined);
  const idempotencyKey = body.idempotencyKey || (req.headers['x-idempotency-key'] as string | undefined);
  const ticket = await refundPayment(getParam(req, 'id'), {
    amountCents,
    method: body.method || 'CARD',
    reason: body.reason,
    idempotencyKey,
  }, req.user!.name, req.user!.id);
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id/payments/:paymentId', requireAdmin, wrap(async (req, res) => {
  const ticket = await voidPayment(getParam(req, 'id'), getParam(req, 'paymentId'), req.user!.name, req.user!.id);
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

// Device Photos (Magic-byte validated)
app.post('/api/tickets/:id/photos', requireAuth, wrap(async (req, res) => {
  const ticket = await addPhoto(getParam(req, 'id'), req.body, req.user!.name, req.user!.id);
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

// Notes & notifications
app.post('/api/tickets/:id/notes', requireAuth, wrap(async (req, res) => {
  const { note, message, type, kind } = req.body;
  const noteKind = kind || (type === 'CUSTOMER' ? 'CUSTOMER_NOTE' : 'INTERNAL_NOTE');
  const ticket = await addNote(getParam(req, 'id'), {
    kind: noteKind,
    message: message || note || '',
  }, req.user!.name);
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

app.post('/api/tickets/:id/notify', requireAuth, wrap(async (req, res) => {
  const { message, customerPhone } = req.body;
  const ticket = await addNote(getParam(req, 'id'), {
    kind: 'MESSAGE',
    message: `[SMS to ${customerPhone || 'Customer'}]: ${message}`,
  }, req.user!.name);
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, message: `Notification sent to ${customerPhone}`, data: ticket });
}));

app.put('/api/tickets/:id/notes/:noteId', requireAuth, wrap(async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Note message cannot be empty' });
  }
  const ticket = await updateNote(getParam(req, 'id'), getParam(req, 'noteId'), message);
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id/notes/:noteId', requireAuth, wrap(async (req, res) => {
  const ticket = await deleteNote(getParam(req, 'id'), getParam(req, 'noteId'));
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

app.get('/api/customers', requireAuth, wrap(async (req, res) => {
  const search = req.query.search as string | undefined;
  const includeArchived = req.query.includeArchived === 'true';
  const hasPage = req.query.page !== undefined;
  const page = hasPage ? parseInt(req.query.page as string, 10) || 1 : 1;
  const pageSize = req.query.pageSize
    ? parseInt(req.query.pageSize as string, 10)
    : req.query.limit
    ? parseInt(req.query.limit as string, 10)
    : hasPage
    ? 25
    : 200;
  const result = await listCustomersPaginated({ search, includeArchived, page, pageSize });
  res.json({
    success: true,
    count: result.items.length,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    hasMore: result.hasMore,
    data: result.items,
  });
}));

app.get('/api/customers/lookup', requireAuth, wrap(async (req, res) => {
  const phone = (req.query.phone as string) || '';
  const customer = await lookupCustomerByPhone(phone);
  res.json({ success: true, data: customer });
}));

app.get('/api/customers/:id', requireAuth, wrap(async (req, res) => {
  const customer = await getCustomer(getParam(req, 'id'));
  res.json({ success: true, data: customer });
}));

app.put('/api/customers/:id', requireAuth, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const customer = await updateCustomer(getParam(req, 'id'), req.body, actor);
  broadcastLiveEvent('customer_updated', customer);
  res.json({ success: true, data: customer });
}));

app.post('/api/customers/:id/archive', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const customer = await archiveCustomer(getParam(req, 'id'), true, actor);
  broadcastLiveEvent('customer_updated', customer);
  res.json({ success: true, data: customer });
}));

app.post('/api/customers/:id/unarchive', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const customer = await archiveCustomer(getParam(req, 'id'), false, actor);
  broadcastLiveEvent('customer_updated', customer);
  res.json({ success: true, data: customer });
}));

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

app.get('/api/inventory', requireAuth, wrap(async (req, res) => {
  const search = req.query.search as string | undefined;
  const parts = await listParts(search);
  res.json({ success: true, count: parts.length, data: parts });
}));

app.post('/api/inventory', requireAuth, wrap(async (req, res) => {
  const body = req.body || {};
  const costCents = body.costCents ?? (body.cost !== undefined ? Math.round(Number(body.cost) * 100) : 0);
  const priceCents = body.priceCents ?? (body.retail !== undefined ? Math.round(Number(body.retail) * 100) : (body.price !== undefined ? Math.round(Number(body.price) * 100) : 0));
  const stock = body.stock ?? (body.stockQuantity !== undefined ? Number(body.stockQuantity) : 0);
  const reorderPoint = body.reorderPoint !== undefined ? Number(body.reorderPoint) : 2;

  const actor = { id: req.user!.id, name: req.user!.name };
  const part = await createPart({
    sku: body.sku,
    name: body.name,
    category: body.category || 'GENERAL',
    costCents,
    priceCents,
    stock,
    reorderPoint,
    supplier: body.supplier,
  }, actor);
  broadcastLiveEvent('inventory_updated', part);
  res.status(201).json({ success: true, data: part });
}));

app.put('/api/inventory/:id', requireAuth, wrap(async (req, res) => {
  const body = req.body || {};
  const updateData: any = { ...body };
  if (body.cost !== undefined && body.costCents === undefined) {
    updateData.costCents = Math.round(Number(body.cost) * 100);
    delete updateData.cost;
  }
  if (body.retail !== undefined && body.priceCents === undefined) {
    updateData.priceCents = Math.round(Number(body.retail) * 100);
    delete updateData.retail;
  }
  if (body.stockQuantity !== undefined && body.stock === undefined) {
    updateData.stock = Number(body.stockQuantity);
    delete updateData.stockQuantity;
  }
  const actor = { id: req.user!.id, name: req.user!.name };
  const part = await updatePart(getParam(req, 'id'), updateData, actor);
  broadcastLiveEvent('inventory_updated', part);
  res.json({ success: true, data: part });
}));

app.post('/api/inventory/:id/adjust', requireAuth, wrap(async (req, res) => {
  const delta = Number(req.body.delta);
  if (isNaN(delta) || delta === 0) {
    throw new HttpError(400, 'A non-zero numeric delta is required for stock adjustment');
  }
  const actor = { id: req.user!.id, name: req.user!.name };
  const part = await adjustStock(getParam(req, 'id'), delta, actor);
  broadcastLiveEvent('inventory_updated', part);
  res.json({ success: true, data: part });
}));

app.delete('/api/inventory/:id', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const result = await deletePart(getParam(req, 'id'), actor);
  broadcastLiveEvent('inventory_updated', { id: getParam(req, 'id') });
  res.json({ success: true, data: result });
}));

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

app.get('/api/export/tickets', requireAuth, wrap(async (req, res) => {
  const csv = await exportTicketsCsv();
  await recordAudit({
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'EXPORT_TICKETS_CSV',
    details: 'Exported work orders CSV report',
    ipAddress: getClientIp(req),
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="FasoFix-WorkOrders.csv"');
  res.send(csv);
}));

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Database Backups (Admin only)
// ---------------------------------------------------------------------------

app.get('/api/admin/backups', requireAdmin, (_req, res) => {
  res.json({ success: true, data: listBackups() });
});

app.post('/api/admin/backups', requireAdmin, wrap(async (req, res) => {
  const info = await createBackup('manual');
  await recordAudit({ userId: req.user!.id, actorName: req.user!.name, action: 'BACKUP_CREATED', details: info.file });
  res.json({ success: true, data: info });
}));

app.get('/api/admin/backups/:file', requireAdmin, (req, res) => {
  const full = resolveBackup(getParam(req, 'file'));
  if (!full) return res.status(404).json({ success: false, error: 'Backup not found' });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(full)}"`);
  fs.createReadStream(full).pipe(res);
});

// ---------------------------------------------------------------------------
// Employee Time Clock & Paystub Routes
// ---------------------------------------------------------------------------

app.get('/api/timeclock/status', requireAuth, wrap(async (req, res) => {
  const status = await payrollService.getTimeClockStatus(req.user!.id);
  res.json({ success: true, data: status });
}));

app.post('/api/timeclock/clock-in', requireAuth, wrap(async (req, res) => {
  const shift = await payrollService.clockIn(req.user!.id, req.body?.notes);
  res.json({ success: true, data: shift });
}));

app.post('/api/timeclock/clock-out', requireAuth, wrap(async (req, res) => {
  const shift = await payrollService.clockOut(req.user!.id, req.body?.notes, req.body?.shiftData);
  res.json({ success: true, data: shift });
}));

app.post('/api/sync/tickets', requireAdmin, wrap(async (req, res) => {
  const { deletedIds } = req.body || {};
  if (Array.isArray(deletedIds) && deletedIds.length > 0) {
    for (const id of deletedIds) {
      if (typeof id === 'string' && id.trim()) {
        await deleteTicket(id).catch(() => {});
      }
    }
  }

  res.json({ success: true, message: 'Sync complete' });
}));

app.post('/api/timeclock/break-start', requireAuth, wrap(async (req, res) => {
  const brk = await payrollService.startBreak(req.user!.id, req.body?.type);
  res.json({ success: true, data: brk });
}));

app.post('/api/timeclock/break-end', requireAuth, wrap(async (req, res) => {
  const brk = await payrollService.endBreak(req.user!.id);
  res.json({ success: true, data: brk });
}));

app.get('/api/timeclock/my-shifts', requireAuth, wrap(async (req, res) => {
  const shifts = await payrollService.getMyShifts(req.user!.id, {
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    limit: req.query.limit ? Number(req.query.limit) : 50,
  });
  res.json({ success: true, data: shifts });
}));

app.get('/api/timeclock/my-paystubs', requireAuth, wrap(async (req, res) => {
  const paystubs = await payrollService.getMyPaystubs(req.user!.id);
  res.json({ success: true, data: paystubs });
}));

app.get('/api/timeclock/my-paystubs/:id', requireAuth, wrap(async (req, res) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const paystub = await payrollService.getMyPaystub(req.user!.id, getParam(req, 'id'), isAdmin);
  res.json({ success: true, data: paystub });
}));

app.get('/api/timeclock/my-paystubs/:id/html', requireAuth, wrap(async (req, res) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const html = await payrollService.buildPaystubHtml(getParam(req, 'id'), isAdmin, req.user!.id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', ZERO_SCRIPT_HTML_CSP);
  res.send(html);
}));

// ---------------------------------------------------------------------------
// Admin Time & Attendance Routes
// ---------------------------------------------------------------------------

app.get('/api/admin/attendance/live', requireAdmin, wrap(async (_req, res) => {
  const roster = await payrollService.getLiveRoster();
  res.json({ success: true, data: roster });
}));

app.get('/api/admin/attendance', requireAdmin, wrap(async (req, res) => {
  const overview = await payrollService.getAttendanceOverview({
    userId: req.query.userId as string,
    status: req.query.status as string,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
  });
  res.json({ success: true, data: overview });
}));

app.post('/api/admin/attendance/shifts', requireAdmin, wrap(async (req, res) => {
  const shift = await payrollService.manualAddShift(
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: shift });
}));

app.put('/api/admin/attendance/shifts/:id', requireAdmin, wrap(async (req, res) => {
  const shift = await payrollService.manualEditShift(
    getParam(req, 'id'),
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: shift });
}));

app.delete('/api/admin/attendance/shifts/:id', requireAdmin, wrap(async (req, res) => {
  const result = await payrollService.deleteShift(
    getParam(req, 'id'),
    { id: req.user!.id, name: req.user!.name },
    req.body?.reason
  );
  res.json({ success: true, data: result });
}));

app.get('/api/admin/attendance/export', requireAdmin, wrap(async (req, res) => {
  const csv = await payrollService.exportAttendanceCsv({
    userId: req.query.userId as string,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

// ---------------------------------------------------------------------------
// Admin Wage & Compensation Routes
// ---------------------------------------------------------------------------

app.get('/api/admin/users/:id/wages', requireAdmin, wrap(async (req, res) => {
  const history = await payrollService.getUserWageHistory(getParam(req, 'id'));
  res.json({ success: true, data: history });
}));

app.post('/api/admin/users/:id/wages', requireAdmin, wrap(async (req, res) => {
  const updated = await payrollService.updateUserWage(
    getParam(req, 'id'),
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: updated });
}));

// ---------------------------------------------------------------------------
// Admin Payroll Management Routes
// ---------------------------------------------------------------------------

app.get('/api/admin/payroll/overview', requireAdmin, wrap(async (_req, res) => {
  const overview = await payrollService.getPayrollDashboardOverview();
  res.json({ success: true, data: overview });
}));

app.get('/api/admin/payroll/periods', requireAdmin, wrap(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const periods = await payrollService.listPayrollPeriods(limit);
  res.json({ success: true, data: periods });
}));

app.post('/api/admin/payroll/periods/calculate', requireAdmin, wrap(async (req, res) => {
  const calc = await payrollService.calculatePeriodPayroll({
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    payDate: req.body.payDate,
    periodType: req.body.periodType || 'BI_WEEKLY',
  });
  res.json({ success: true, data: calc });
}));

app.post('/api/admin/payroll/periods', requireAdmin, wrap(async (req, res) => {
  if (!req.body?.allowDuplicate && req.body?.startDate && req.body?.endDate) {
    const existing = await prisma.payrollPeriod.findFirst({
      where: {
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
        periodType: req.body.periodType || 'BI_WEEKLY',
      },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A payroll period (#${existing.periodNumber}) already exists for this exact date range and frequency.`,
      });
    }
  }
  const period = await payrollService.createPayrollPeriod(
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: period });
}));

app.get('/api/admin/payroll/periods/:id', requireAdmin, wrap(async (req, res) => {
  const period = await payrollService.getPayrollPeriod(getParam(req, 'id'));
  res.json({ success: true, data: period });
}));

app.put('/api/admin/payroll/paystubs/:id', requireAdmin, wrap(async (req, res) => {
  const updated = await payrollService.updatePaystubDraft(
    getParam(req, 'id'),
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: updated });
}));

app.post('/api/admin/payroll/periods/:id/finalize', requireAdmin, wrap(async (req, res) => {
  const finalized = await payrollService.finalizePayrollPeriod(
    getParam(req, 'id'),
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: finalized });
}));

app.get('/api/admin/payroll/periods/:id/export', requireAdmin, wrap(async (req, res) => {
  const csv = await payrollService.exportPayrollCsv(getParam(req, 'id'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payroll-period-${getParam(req, 'id')}.csv"`);
  res.send(csv);
}));

app.get('/api/admin/payroll/paystubs/:id/html', requireAdmin, wrap(async (req, res) => {
  const html = await payrollService.buildPaystubHtml(getParam(req, 'id'), true);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', ZERO_SCRIPT_HTML_CSP);
  res.send(html);
}));

// ---------------------------------------------------------------------------
// Employee Shift Scheduling & Compliance Endpoints
// ---------------------------------------------------------------------------

app.get('/api/schedules/my-schedule', requireAuth, wrap(async (req, res) => {
  const shifts = await scheduleService.listScheduledShifts({
    userId: req.user!.id,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    status: req.query.status as any,
    publishedOnly: true,
  });
  res.json({ success: true, count: shifts.length, data: shifts, schedules: shifts });
}));

app.get('/api/schedules', requireAuth, wrap(async (req, res) => {
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER';
  const userId = isAdmin ? (req.query.userId as string | undefined) : req.user!.id;
  const isPublishedParam = req.query.isPublished as string | undefined;
  const isPublished =
    isPublishedParam === 'true' ? true : isPublishedParam === 'false' ? false : undefined;
  const shifts = await scheduleService.listScheduledShifts({
    userId,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    status: req.query.status as any,
    publishedOnly: !isAdmin,
    isPublished: isAdmin ? isPublished : undefined,
  });
  res.json({ success: true, count: shifts.length, data: shifts });
}));

app.post('/api/schedules', requireAdmin, wrap(async (req, res) => {
  const result = await scheduleService.createScheduledShift(req.body, {
    id: req.user!.id,
    name: req.user!.name,
  });
  res.status(201).json({ success: true, ...result });
}));

app.post('/api/schedules/publish-all', requireAdmin, wrap(async (req, res) => {
  const result = await scheduleService.publishDraftShifts(
    {
      startDate: req.body?.startDate,
      endDate: req.body?.endDate,
      userId: req.body?.userId,
    },
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, ...result });
}));

app.get('/api/schedules/compare', requireAdmin, wrap(async (req, res) => {
  const startDate = (req.query.startDate as string) || new Date(Date.now() - 7 * 86400000).toISOString();
  const endDate = (req.query.endDate as string) || new Date().toISOString();
  const comparison = await scheduleService.compareScheduleVsActual(startDate, endDate);
  res.json({ success: true, data: comparison });
}));

app.put('/api/schedules/:id', requireAdmin, wrap(async (req, res) => {
  const result = await scheduleService.updateScheduledShift(
    getParam(req, 'id'),
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, ...result });
}));

app.delete('/api/schedules/:id', requireAdmin, wrap(async (req, res) => {
  const result = await scheduleService.deleteScheduledShift(
    getParam(req, 'id'),
    { id: req.user!.id, name: req.user!.name }
  );
  res.json(result);
}));

app.post('/api/schedules/:id/duplicate', requireAdmin, wrap(async (req, res) => {
  const targetDate = req.body.targetDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const targetUserId = req.body.targetUserId;
  const result = await scheduleService.duplicateScheduledShift(
    getParam(req, 'id'),
    targetDate,
    targetUserId,
    { id: req.user!.id, name: req.user!.name }
  );
  res.status(201).json({ success: true, ...result });
}));

app.get('/api/schedules/export-csv', requireAdmin, wrap(async (req, res) => {
  const csv = await scheduleService.exportSchedulesCsv({
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    userId: req.query.userId as string,
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="schedules-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

// Time Off Requests
app.get('/api/time-off', requireAuth, wrap(async (req, res) => {
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER';
  const userId = isAdmin ? (req.query.userId as string) : req.user!.id;
  const requests = await scheduleService.listTimeOffRequests({
    userId,
    status: req.query.status as string,
  });
  res.json({ success: true, data: requests });
}));

app.post('/api/time-off', requireAuth, wrap(async (req, res) => {
  const request = await scheduleService.createTimeOffRequest({
    userId: req.user!.id,
    requestType: req.body.requestType,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    reason: req.body.reason,
  });
  res.status(201).json({ success: true, data: request });
}));

app.put('/api/time-off/:id', requireAdmin, wrap(async (req, res) => {
  const result = await scheduleService.reviewTimeOffRequest(
    getParam(req, 'id'),
    { status: req.body.status, reviewNotes: req.body.reviewNotes },
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: result });
}));

// Shift Swap Requests
app.get('/api/shift-swaps', requireAuth, wrap(async (req, res) => {
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER';
  const userId = isAdmin ? (req.query.userId as string) : req.user!.id;
  const swaps = await scheduleService.listShiftSwapRequests({
    userId,
    status: req.query.status as string,
  });
  res.json({ success: true, data: swaps });
}));

app.post('/api/shift-swaps', requireAuth, wrap(async (req, res) => {
  const swap = await scheduleService.createShiftSwapRequest({
    requesterId: req.user!.id,
    requesterShiftId: req.body.requesterShiftId,
    targetUserId: req.body.targetUserId,
    targetShiftId: req.body.targetShiftId,
    reason: req.body.reason,
  });
  res.status(201).json({ success: true, data: swap });
}));

app.put('/api/shift-swaps/:id', requireAdmin, wrap(async (req, res) => {
  const result = await scheduleService.reviewShiftSwapRequest(
    getParam(req, 'id'),
    { status: req.body.status, reviewNotes: req.body.reviewNotes },
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: result });
}));

// ---------------------------------------------------------------------------
// POS Sales Attribution & Labor Productivity Analytics
// ---------------------------------------------------------------------------

app.get('/api/reports/sales-labor', requireAdmin, wrap(async (req, res) => {
  const startDate = (req.query.startDate as string) || new Date(Date.now() - 30 * 86400000).toISOString();
  const endDate = (req.query.endDate as string) || new Date().toISOString();
  const analytics = await getSalesLaborAnalytics(startDate, endDate);
  res.json({ success: true, data: analytics });
}));

// ---------------------------------------------------------------------------
// In-App Notifications
// ---------------------------------------------------------------------------

app.get('/api/notifications', requireAuth, wrap(async (req, res) => {
  const unreadOnly = req.query.unreadOnly === 'true';
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
  const result = await notificationService.listUserNotifications(req.user!.id, { unreadOnly, limit });
  res.json({ success: true, ...result, data: result.notifications });
}));

app.post('/api/notifications/read-all', requireAuth, wrap(async (req, res) => {
  const result = await notificationService.markAllNotificationsRead(req.user!.id);
  res.json({ success: true, ...result });
}));

app.post('/api/notifications/:id/read', requireAuth, wrap(async (req, res) => {
  const notification = await notificationService.markNotificationRead(
    req.user!.id,
    getParam(req, 'id')
  );
  res.json({ success: true, data: notification });
}));

// ---------------------------------------------------------------------------
// Static Frontend Production Serving (Railway / Render / Persistent Server)
// ---------------------------------------------------------------------------
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) return next();
    if (req.method !== 'GET') return next();

    // Self-healing: if an old/stale JS asset is requested by a cached browser, force-reload the client
    if (req.path.startsWith('/assets/') && req.path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.send(`
        console.warn("[Faso Fix POS] Purging stale client cache...");
        if ('caches' in window) {
          caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
        }
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
          });
        }
        window.location.reload();
      `);
    }

    if (req.path.startsWith('/assets/') || req.path.includes('.')) {
      return res.status(404).send('Not Found');
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// Central Error Handler
// ---------------------------------------------------------------------------

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      success: false,
      error: 'Request payload too large for this endpoint.',
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: err.message,
      ...(err.activeShift ? { activeShift: err.activeShift } : {}),
      ...(err.details ? { details: err.details } : {}),
    });
  }
  if (err instanceof ZodError) {
    const issues = err.issues || (err as any).errors || [];
    const message = issues.map((e: any) => `${e.path.join('.') || 'input'}: ${e.message}`).join(', ');
    return res.status(400).json({ success: false, error: message || 'Invalid input', details: err.flatten() });
  }
  console.error('[API Error]', err);
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  return res.status(500).json({
    success: false,
    error: isProd ? 'Internal server error' : (err?.message || 'Internal server error'),
    ...(isProd ? {} : { details: err?.stack || String(err) }),
  });
});

export { app };
export default app;

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  app.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`[Faso Fix API] Running on http://localhost:${PORT}`);
    try {
      await configureSqlite();
      await ensureDatabaseSchema();
      await ensureAdminProvisioning();
      await ensureInitialInventory();
      if (process.env.NODE_ENV !== 'test') startBackupSchedule();
    } catch (err) {
      console.error('[Startup Error]', err);
    }
  });
}
