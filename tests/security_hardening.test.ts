/**
 * Dedicated Security Hardening Verification Suite
 * Tests session token hashing, removal of clientUsers/syncPayload backdoor,
 * HttpOnly SameSite=Strict cookie + CSRF protection, strict CORS, CSP & security headers,
 * paystub HTML XSS escaping, strong password policy, financial/archive RBAC,
 * query-string token rejection, and DB-backed brute-force lockout.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { app } from '../src/server/index';
import { prisma } from '../src/server/prisma';
import { ensureAdminProvisioning, hashPassword, hashSessionToken } from '../src/server/auth';
import { buildPaystubHtml } from '../src/server/payrollService';

describe('Security Hardening Suite (10/10 Controls)', () => {
  let server: http.Server;
  let baseUrl = '';
  let adminToken = '';
  let techToken = '';
  let adminCookie = '';
  let testUserId = '';
  let testTicketId = '';
  let testCustomerId = '';
  let testPeriodId = '';
  let testPaystubId = '';
  let initialNextTicketNumber: number | null = null;
  const suffix = String(Date.now());
  const rogueUsername = `rogue_${suffix}`;
  const tempTechUsername = `sec_tech_${suffix}`;
  const bruteUser = `sec_brute_${suffix}`;

  async function req(
    path: string,
    opts: {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    } = {}
  ) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: opts.method || 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    const setCookies =
      typeof (res.headers as any).getSetCookie === 'function'
        ? ((res.headers as any).getSetCookie() as string[])
        : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie') as string]
        : [];
    return { status: res.status, headers: res.headers, setCookies, text, json };
  }

  before(async () => {
    await ensureAdminProvisioning();
    const s = await prisma.setting.findUnique({ where: { id: 1 } });
    initialNextTicketNumber = s?.nextTicketNumber ?? null;

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Sign in as admin and inspect Set-Cookie
    const aLogin = await req('/api/auth/login', {
      method: 'POST',
      body: {
        usernameOrEmail: 'admin',
        password: process.env.ADMIN_PASSWORD || 'Admin@FasoFix2026!',
        adminMode: true,
      },
    });
    assert.equal(aLogin.status, 200, `Admin login failed: ${aLogin.text}`);
    adminToken = aLogin.json.token;
    assert.ok(aLogin.setCookies.length >= 1, 'Expected Set-Cookie on login');
    adminCookie = aLogin.setCookies[0].split(';')[0];

    // Create a clean temporary technician user for security tests
    const techPw = 'SecTechPass@2026!';
    const createTech = await req('/api/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        username: tempTechUsername,
        email: `${tempTechUsername}@example.com`,
        name: `SEC_<script>alert("xss")</script>_Tech`,
        password: techPw,
        role: 'USER',
        bench: 'Bench #07',
      },
    });
    assert.equal(createTech.status, 201, `Temp tech creation failed: ${createTech.text}`);
    testUserId = createTech.json.data.id;
    assert.equal(createTech.json.data.passwordHash, undefined);
    assert.equal(createTech.json.data.syncPayload, undefined);

    const tLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: tempTechUsername, password: techPw, adminMode: false },
    });
    assert.equal(tLogin.status, 200);
    techToken = tLogin.json.token;
  });

  after(async () => {
    try {
      await prisma.auditLog.deleteMany({ where: { actorName: { in: [bruteUser, rogueUsername] } } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { details: { contains: rogueUsername } } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { details: { contains: tempTechUsername } } }).catch(() => {});
      if (testPaystubId) await prisma.paystub.delete({ where: { id: testPaystubId } }).catch(() => {});
      if (testPeriodId) await prisma.payrollPeriod.delete({ where: { id: testPeriodId } }).catch(() => {});
      if (testTicketId) {
        await prisma.ticketEvent.deleteMany({ where: { ticketId: testTicketId } }).catch(() => {});
        await prisma.payment.deleteMany({ where: { ticketId: testTicketId } }).catch(() => {});
        await prisma.ticketItem.deleteMany({ where: { ticketId: testTicketId } }).catch(() => {});
        await prisma.ticket.delete({ where: { id: testTicketId } }).catch(() => {});
      }
      if (initialNextTicketNumber !== null) {
        await prisma.setting.update({
          where: { id: 1 },
          data: { nextTicketNumber: initialNextTicketNumber },
        }).catch(() => {});
      }
      if (testCustomerId) {
        await prisma.device.deleteMany({ where: { customerId: testCustomerId } }).catch(() => {});
        await prisma.customer.delete({ where: { id: testCustomerId } }).catch(() => {});
      }
      if (testUserId) {
        await prisma.auditLog.deleteMany({ where: { userId: testUserId } }).catch(() => {});
        await prisma.session.deleteMany({ where: { userId: testUserId } }).catch(() => {});
        await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
      }
      await prisma.session.deleteMany({ where: { token: hashSessionToken(adminToken) } }).catch(() => {});
    } finally {
      (server as any)?.closeAllConnections?.();
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      await prisma.$disconnect();
    }
  });

  test('1. Legacy clientUsers forgery injection is blocked & passwordHash/syncPayload never returned', async () => {
    // Attempt to forge an ADMIN user using the legacy hardcoded secret
    const legacyKey = 'fasofix-cloud-session-secret-key-2026';
    const forgedUser = {
      id: crypto.randomUUID(),
      username: rogueUsername,
      email: `${rogueUsername}@evil.example`,
      name: 'Rogue Admin',
      passwordHash: hashPassword('RoguePass@2026!'),
      role: 'ADMIN',
      status: 'ACTIVE',
    };
    const payload = Buffer.from(JSON.stringify(forgedUser)).toString('base64url');
    const signature = crypto.createHmac('sha256', legacyKey).update(payload).digest('base64url');

    const injectRes = await req('/api/auth/login', {
      method: 'POST',
      body: {
        usernameOrEmail: rogueUsername,
        password: 'RoguePass@2026!',
        adminMode: true,
        clientUsers: [{ payload, signature }],
      },
    });
    assert.equal(injectRes.status, 401);
    const dbCheck = await prisma.user.findUnique({ where: { username: rogueUsername } });
    assert.equal(dbCheck, null, 'Forged clientUsers payload must never create DB user');

    // Verify admin user endpoints omit passwordHash and syncPayload
    const listRes = await req('/api/admin/users', { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(listRes.status, 200);
    for (const u of listRes.json.data) {
      assert.equal(u.passwordHash, undefined);
      assert.equal(u.syncPayload, undefined);
      assert.equal(u.sin, undefined);
    }

    const syncRes = await req('/api/sync/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { clientUsers: [{ payload, signature }] },
    });
    assert.equal(syncRes.status, 200);
    const syncedRogue = await prisma.user.findUnique({ where: { username: rogueUsername } });
    assert.equal(syncedRogue, null, '/api/sync/users must not inject clientUsers');

    const resetRes = await req(`/api/admin/users/${testUserId}/reset-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { newPassword: 'SecTechPass@2027!' },
    });
    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.json.syncPayload, undefined);

    // Re-login after password reset
    const reLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: tempTechUsername, password: 'SecTechPass@2027!' },
    });
    assert.equal(reLogin.status, 200);
    techToken = reLogin.json.token;
  });

  test('2. Sessions are SHA-256 hashed in DB, HttpOnly/SameSite=Strict cookie works, and query ?token= is rejected', async () => {
    const rawRow = await prisma.session.findUnique({ where: { token: techToken } });
    assert.equal(rawRow, null, 'Raw bearer token must never be stored plaintext in DB');
    const hashedRow = await prisma.session.findUnique({ where: { token: hashSessionToken(techToken) } });
    assert.ok(hashedRow, 'SHA-256 hash of session token must exist in DB');

    // Query parameter ?token= must be rejected
    const qRes = await req(`/api/tickets?token=${encodeURIComponent(techToken)}`);
    assert.equal(qRes.status, 401, '?token= query param authentication must be rejected');

    // Legacy x-session-token header must also be rejected
    const xRes = await req('/api/tickets', { headers: { 'x-session-token': techToken } });
    assert.equal(xRes.status, 401, 'Legacy x-session-token header must be rejected');

    // Cookie authentication works on GET
    const cookieMe = await req('/api/auth/me', { headers: { Cookie: adminCookie } });
    assert.equal(cookieMe.status, 200);
    assert.equal(cookieMe.json.authenticated, true);
    assert.equal(cookieMe.json.user.role, 'ADMIN');

    // Set-Cookie must carry HttpOnly and SameSite=Strict
    const loginSetCookie = (
      await req('/api/auth/login', {
        method: 'POST',
        body: { usernameOrEmail: tempTechUsername, password: 'SecTechPass@2027!' },
      })
    ).setCookies[0];
    assert.match(loginSetCookie, /HttpOnly/i);
    assert.match(loginSetCookie, /SameSite=Strict/i);
  });

  test('3. Cookie CSRF defense blocks state changes without X-Requested-With or with untrusted Origin', async () => {
    const noHeaderRes = await req('/api/auth/preferences', {
      method: 'PUT',
      headers: { Cookie: adminCookie },
      body: { preferences: { soundFX: true } },
    });
    assert.equal(noHeaderRes.status, 403, 'Cookie PUT without X-Requested-With must be blocked with 403');

    const badOriginRes = await req('/api/auth/preferences', {
      method: 'PUT',
      headers: {
        Cookie: adminCookie,
        'X-Requested-With': 'FasoFixPOS',
        Origin: 'https://evil-attacker.example',
      },
      body: { preferences: { soundFX: true } },
    });
    assert.equal(badOriginRes.status, 403, 'Cookie PUT with foreign Origin must be blocked with 403');

    const validCookieRes = await req('/api/auth/preferences', {
      method: 'PUT',
      headers: {
        Cookie: adminCookie,
        'X-Requested-With': 'FasoFixPOS',
        Origin: 'https://fasodesk.repair',
      },
      body: { preferences: { soundFX: true } },
    });
    assert.equal(validCookieRes.status, 200);
  });

  test('4. Strict CORS, security headers, zero-script print CSP, and paystub XSS escaping', async () => {
    const evilCors = await req('/api/auth/me', {
      headers: { Origin: 'https://evil-attacker.example' },
    });
    assert.equal(evilCors.headers.get('access-control-allow-origin'), null);
    assert.equal(evilCors.headers.get('x-powered-by'), null);
    assert.equal(evilCors.headers.get('x-frame-options'), 'DENY');
    assert.equal(evilCors.headers.get('x-content-type-options'), 'nosniff');
    assert.match(evilCors.headers.get('strict-transport-security') || '', /max-age=63072000/);

    const goodCors = await req('/api/auth/me', {
      headers: { Origin: 'https://fasodesk.repair' },
    });
    assert.equal(goodCors.headers.get('access-control-allow-origin'), 'https://fasodesk.repair');
    assert.equal(goodCors.headers.get('access-control-allow-credentials'), 'true');

    // Paystub XSS escaping + zero-script HTML CSP
    const now = new Date();
    const period = await prisma.payrollPeriod.create({
      data: {
        periodNumber: 900000 + Math.floor(Math.random() * 90000),
        startDate: new Date(now.getTime() - 7 * 86400000),
        endDate: now,
        payDate: now,
        periodType: 'WEEKLY',
        status: 'DRAFT',
      },
    });
    testPeriodId = period.id;
    const stub = await prisma.paystub.create({
      data: {
        payrollPeriodId: period.id,
        userId: testUserId,
        hourlyRateCents: 2200,
        overtimeRateCents: 3300,
        regularPayCents: 2200,
        grossPayCents: 2200,
        netPayCents: 2000,
        totalDeductionsCents: 200,
      },
    });
    testPaystubId = stub.id;

    const html = await buildPaystubHtml(stub.id, true);
    assert.equal(html.includes('<script>alert("xss")</script>'), false);
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));

    const httpStub = await req(`/api/timeclock/my-paystubs/${stub.id}/html`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(httpStub.status, 200);
    assert.match(httpStub.headers.get('content-security-policy') || '', /default-src 'none'/);
  });

  test('5. Admin-only financial refund/void & customer archive + strong password enforcement', async () => {
    const cr = await req('/api/tickets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${techToken}` },
      body: {
        customer: { fullName: `SEC Customer ${suffix}`, phone: `416555${suffix.slice(-4)}` },
        device: { name: 'Sec iPhone 15' },
        faultDescription: 'SEC screen check',
        laborCents: 10000,
      },
    });
    assert.equal(cr.status, 201);
    testTicketId = cr.json.data.id;
    testCustomerId = cr.json.data.customerId;

    const pay = await req(`/api/tickets/${testTicketId}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techToken}` },
      body: { amountCents: 5000, method: 'CARD', note: 'Deposit' },
    });
    assert.equal(pay.status, 201);
    const paymentId = pay.json.data.payments[0].id;

    // Tech must get 403 on refund, payment void, archive, unarchive
    assert.equal(
      (
        await req(`/api/tickets/${testTicketId}/refund`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${techToken}` },
          body: { amountCents: 1000, method: 'CARD', reason: 'Tech attempt' },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await req(`/api/tickets/${testTicketId}/payments/${paymentId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${techToken}` },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await req(`/api/customers/${testCustomerId}/archive`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${techToken}` },
        })
      ).status,
      403
    );

    // Admin succeeds on refund, archive, unarchive
    assert.equal(
      (
        await req(`/api/tickets/${testTicketId}/refund`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: { amountCents: 1000, method: 'CARD', reason: 'Admin refund' },
        })
      ).status,
      201
    );
    assert.equal(
      (
        await req(`/api/customers/${testCustomerId}/archive`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      ).status,
      200
    );
    assert.equal(
      (
        await req(`/api/customers/${testCustomerId}/unarchive`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      ).status,
      200
    );

    // Weak password rejected with 400
    const weakCreate = await req('/api/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        username: `weak_${suffix}`,
        email: `weak_${suffix}@example.com`,
        name: 'Weak User',
        password: 'alllowercasepassword',
        role: 'USER',
      },
    });
    assert.equal(weakCreate.status, 400);
  });

  test('6. DB-backed brute-force lockout persists across requests in AuditLog', async () => {
    for (let i = 0; i < 5; i++) {
      const fail = await req('/api/auth/login', {
        method: 'POST',
        body: { usernameOrEmail: bruteUser, password: 'WrongPassword1!' },
      });
      assert.equal(fail.status, 401);
    }
    const locked = await req('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: bruteUser, password: 'WrongPassword1!' },
    });
    assert.equal(locked.status, 429);

    const failRows = await prisma.auditLog.count({
      where: { action: 'LOGIN_FAILED', actorName: bruteUser },
    });
    assert.equal(failRows, 5, '5 failed attempts must be persisted in AuditLog');
  });
});
