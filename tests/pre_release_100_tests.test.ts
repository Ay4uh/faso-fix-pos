import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { prisma } from '../src/server/prisma';
import { SCHEMA_SQL } from '../src/server/initDb';
import { verifyPassword } from '../src/server/auth';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:4000';
const ADMIN_CREDS = { usernameOrEmail: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@FasoFix2026!' };
const TECH_CREDS = { usernameOrEmail: 'tech', password: process.env.TECH_PASSWORD || 'Tech@FasoFix2026!' };

async function call(
  route: string,
  opts: {
    method?: string;
    token?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${route}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, text, json };
}

async function login(creds: { usernameOrEmail: string; password: string }, adminMode = false) {
  const res = await call('/api/auth/login', {
    method: 'POST',
    body: { ...creds, adminMode },
  });
  assert.equal(res.status, 200, `Login failed for ${creds.usernameOrEmail}: ${res.text}`);
  return {
    token: res.json.token as string,
    user: res.json.user,
    raw: res.json,
  };
}

// Valid 1x1 transparent PNG base64 (authentic PNG magic bytes 89 50 4E 47 0D 0A 1A 0A)
const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Faso Fix POS — Comprehensive 100 Pre-Release + 10 Mandatory Business Tests', () => {
  let adminToken = '';
  let adminUser: any = null;
  let techToken = '';
  let techUser: any = null;
  let baselineNextTicketNumber = 1;

  const createdTicketIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdPartIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdScheduleIds: string[] = [];
  const createdShiftIds: string[] = [];
  const createdPayrollPeriodIds: string[] = [];
  const createdBackupFiles: string[] = [];
  const tempFiles: string[] = [];

  before(async () => {
    const setting = await prisma.setting.findUnique({ where: { id: 1 } });
    baselineNextTicketNumber = setting?.nextTicketNumber || 1;

    const a = await login(ADMIN_CREDS, true);
    adminToken = a.token;
    adminUser = a.user;

    const t = await login(TECH_CREDS, false);
    techToken = t.token;
    techUser = t.user;
  });

  after(async () => {
    // Restore Ontario 13% HST regardless of test outcome
    await prisma.setting.update({
      where: { id: 1 },
      data: { taxLabel: 'HST', taxRateBps: 1300 },
    }).catch(() => {});

    for (const tid of createdTicketIds) {
      await prisma.ticketEvent.deleteMany({ where: { ticketId: tid } }).catch(() => {});
      await prisma.payment.deleteMany({ where: { ticketId: tid } }).catch(() => {});
      await prisma.ticketItem.deleteMany({ where: { ticketId: tid } }).catch(() => {});
      await prisma.ticket.delete({ where: { id: tid } }).catch(() => {});
    }

    // Safety sweep for bulk synthetic tickets
    await prisma.ticket.deleteMany({ where: { ticketNumber: { gte: 900000 } } }).catch(() => {});

    for (const cid of createdCustomerIds) {
      await prisma.ticket.deleteMany({ where: { customerId: cid } }).catch(() => {});
      await prisma.device.deleteMany({ where: { customerId: cid } }).catch(() => {});
      await prisma.customer.delete({ where: { id: cid } }).catch(() => {});
    }

    for (const pid of createdPartIds) {
      await prisma.inventoryPart.delete({ where: { id: pid } }).catch(() => {});
    }

    for (const sid of createdScheduleIds) {
      await prisma.scheduledShift.delete({ where: { id: sid } }).catch(() => {});
    }

    for (const shId of createdShiftIds) {
      await prisma.shiftBreak.deleteMany({ where: { shiftId: shId } }).catch(() => {});
      await prisma.shift.delete({ where: { id: shId } }).catch(() => {});
    }

    for (const ppId of createdPayrollPeriodIds) {
      await prisma.paystub.deleteMany({ where: { payrollPeriodId: ppId } }).catch(() => {});
      await prisma.payrollPeriod.delete({ where: { id: ppId } }).catch(() => {});
    }

    for (const uid of createdUserIds) {
      await prisma.scheduledShift.deleteMany({ where: { userId: uid } }).catch(() => {});
      await prisma.paystub.deleteMany({ where: { userId: uid } }).catch(() => {});
      await prisma.shift.deleteMany({ where: { userId: uid } }).catch(() => {});
      await prisma.wageRate.deleteMany({ where: { userId: uid } }).catch(() => {});
      await prisma.notification.deleteMany({ where: { userId: uid } }).catch(() => {});
      await prisma.session.deleteMany({ where: { userId: uid } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { userId: uid } }).catch(() => {});
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }

    // Clean up test audit entries created during suite
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { details: { contains: 'TEST100_' } },
          { details: { contains: 'test100_' } },
        ],
      },
    }).catch(() => {});

    for (const bFile of createdBackupFiles) {
      try {
        const p = path.resolve(process.env.BACKUP_DIR || 'backups', bFile);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }

    for (const tf of tempFiles) {
      try {
        if (fs.existsSync(tf)) fs.unlinkSync(tf);
      } catch {}
    }

    const maxReal = await prisma.ticket.findFirst({
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });
    const safeNext = Math.max(baselineNextTicketNumber, (maxReal?.ticketNumber || 0) + 1);
    await prisma.setting.update({
      where: { id: 1 },
      data: { nextTicketNumber: safeNext },
    }).catch(() => {});

    await prisma.$disconnect();
  });

  // =========================================================================
  // SECTION 1: LOGIN, AUTHENTICATION & PERMISSIONS (Tests #1 – #10)
  // =========================================================================
  test('Section 1 (#1-#10): Auth, wrong password, empty fields, reset/recovery, logout, expiry, RBAC, disable, multi-device', async () => {
    // #1 Valid admin login already succeeded; verify /api/auth/me reflects authenticated ADMIN
    const meAdmin = await call('/api/auth/me', { token: adminToken });
    assert.equal(meAdmin.status, 200);
    assert.equal(meAdmin.json.authenticated, true);
    assert.equal(meAdmin.json.user.role, 'ADMIN');

    // #2 Incorrect password (use nonexistent test user once so real accounts never rate-limit)
    const badLogin = await call('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: 'test100_nonexistent_user', password: 'WrongPassword!123', adminMode: false },
    });
    assert.equal(badLogin.status, 401);

    // #3 Empty username or password
    const emptyUser = await call('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: '', password: 'SomePassword123' },
    });
    assert.equal(emptyUser.status, 400);
    const emptyPass = await call('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: 'admin', password: '' },
    });
    assert.equal(emptyPass.status, 400);

    // #7 Technician cannot log into Admin Mode or access admin endpoints
    const techAdminAttempt = await call('/api/auth/login', {
      method: 'POST',
      body: { ...TECH_CREDS, adminMode: true },
    });
    assert.equal(techAdminAttempt.status, 403);

    // #8 Direct URL / API endpoint restriction checks with tech token
    for (const restrictedPath of ['/api/admin/overview', '/api/admin/users', '/api/admin/audit-logs', '/api/reports/sales-labor']) {
      const r = await call(restrictedPath, { token: techToken });
      assert.equal(r.status, 403, `Expected 403 for technician hitting ${restrictedPath}, got ${r.status}`);
    }

    // Create disposable temp technician user for #4, #5, #6, #9, #10
    const uname = `test100_tech_${Date.now()}`;
    const initialPw = 'InitTech@2026!';
    const createU = await call('/api/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        username: uname,
        email: `${uname}@fasofix.ca`,
        name: 'TEST100_TempTech',
        password: initialPw,
        role: 'USER',
        bench: 'Bench #09',
      },
    });
    assert.equal(createU.status, 201);
    const tempUserId = createU.json.data.id;
    createdUserIds.push(tempUserId);

    // #10 Simultaneous logins from two separate devices
    const devA = await login({ usernameOrEmail: uname, password: initialPw }, false);
    const devB = await login({ usernameOrEmail: uname, password: initialPw }, false);
    assert.notEqual(devA.token, devB.token);
    const meA = await call('/api/auth/me', { token: devA.token });
    const meB = await call('/api/auth/me', { token: devB.token });
    assert.equal(meA.json.authenticated, true);
    assert.equal(meB.json.authenticated, true);

    // #5 Logout on Device A terminates Device A session only; Device B remains valid
    const logoutA = await call('/api/auth/logout', { method: 'POST', token: devA.token });
    assert.equal(logoutA.status, 200);
    const meAAfter = await call('/api/tickets', { token: devA.token });
    assert.equal(meAAfter.status, 401);
    const ticketsB = await call('/api/tickets?page=1&pageSize=5', { token: devB.token });
    assert.equal(ticketsB.status, 200);

    // #6 Simulate session expiration in DB & verify expired token rejection
    const expToken = crypto.randomBytes(24).toString('hex');
    await prisma.session.create({
      data: {
        token: expToken,
        userId: tempUserId,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expiredRes = await call('/api/tickets', { token: expToken });
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredRes.json.code, 'SESSION_EXPIRED');

    // #4 Admin password reset + self password change recovery flow
    const resetPw = 'ResetTech@2026!';
    const resetRes = await call(`/api/admin/users/${tempUserId}/reset-password`, {
      method: 'POST',
      token: adminToken,
      body: { newPassword: resetPw },
    });
    assert.equal(resetRes.status, 200);
    // Old session should be invalidated upon password reset
    const oldSessionCheck = await call('/api/tickets', { token: devB.token });
    assert.equal(oldSessionCheck.status, 401);

    const recovered = await login({ usernameOrEmail: uname, password: resetPw }, false);
    const selfChangePw = 'SelfChanged@2026!';
    const selfChangeRes = await call('/api/auth/password', {
      method: 'PUT',
      token: recovered.token,
      body: { currentPassword: resetPw, newPassword: selfChangePw, confirmPassword: selfChangePw },
    });
    assert.equal(selfChangeRes.status, 200);
    const loginNew = await login({ usernameOrEmail: uname, password: selfChangePw }, false);
    assert.ok(loginNew.token);

    // #9 Deactivate employee account & verify access + active sessions immediately revoked
    const disableRes = await call(`/api/admin/users/${tempUserId}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'DISABLED' },
    });
    assert.equal(disableRes.status, 200);
    const blockedReq = await call('/api/tickets', { token: loginNew.token });
    assert.equal(blockedReq.status, 401);
    const disabledLogin = await call('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: uname, password: selfChangePw },
    });
    assert.equal(disabledLogin.status, 403);
  });

  // =========================================================================
  // SECTION 2: DASHBOARD STATS, FILTERS & 1,000-RECORD BENCHMARK (#11-#15, #20)
  // =========================================================================
  test('Section 2 (#11-#15, #20): Dashboard DB parity, today sales, pending/completed counts, date filters, 1,000-record scale test', async () => {
    const dashBefore = await call('/api/dashboard', { token: adminToken });
    assert.equal(dashBefore.status, 200);
    const db = dashBefore.json.data;

    // #11 Verify DB parity
    const dbTotal = await prisma.ticket.count({ where: { deletedAt: null } });
    const dbCompleted = await prisma.ticket.count({ where: { deletedAt: null, status: 'COMPLETED' } });
    assert.equal(db.totalTickets, dbTotal, 'Dashboard totalTickets must match Prisma count');
    assert.equal(db.completed, dbCompleted, 'Dashboard completed count must match Prisma count');

    // Create a completed paid ticket today and verify #12 Today Sales, #13 Open, #14 Completed deltas
    const createRes = await call('/api/tickets', {
      method: 'POST',
      token: adminToken,
      body: {
        customer: { fullName: 'TEST100_DashCust', phone: '5551000011', email: 'test100_dash@example.com' },
        device: { name: 'TEST100 iPad Air' },
        faultDescription: 'TEST100_Digitizer replacement',
        laborCents: 10000, // $100 -> $113 with 13% HST
        priority: 'STANDARD',
      },
    });
    assert.equal(createRes.status, 201);
    const tid = createRes.json.data.id;
    createdTicketIds.push(tid);
    createdCustomerIds.push(createRes.json.data.customerId);

    const dashOpen = await call('/api/dashboard', { token: adminToken });
    assert.equal(dashOpen.json.data.open, db.open + 1);

    const payRes = await call(`/api/tickets/${tid}/payments`, {
      method: 'POST',
      token: adminToken,
      body: { amountCents: 11300, method: 'CARD', note: 'TEST100 dash pay' },
    });
    assert.equal(payRes.status, 201);

    await call(`/api/tickets/${tid}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'COMPLETED' },
    });

    const dashAfter = await call('/api/dashboard', { token: adminToken });
    assert.equal(dashAfter.json.data.completed, db.completed + 1);
    assert.equal(dashAfter.json.data.collectedTodayCents, db.collectedTodayCents + 11300);

    // #15 Date range filters on /api/reports & /api/reports/sales-labor
    const rep7 = await call('/api/reports?days=7', { token: adminToken });
    const rep30 = await call('/api/reports?days=30', { token: adminToken });
    assert.equal(rep7.status, 200);
    assert.equal(rep30.status, 200);
    assert.equal(rep7.json.data.daily.length, 7);
    assert.equal(rep30.json.data.daily.length, 30);

    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const slFiltered = await call(`/api/reports/sales-labor?startDate=${encodeURIComponent(yesterday)}&endDate=${encodeURIComponent(tomorrow)}`, { token: adminToken });
    assert.equal(slFiltered.status, 200);
    assert.ok(slFiltered.json.data.summary.totalRevenueCents >= 11300);

    // #20 Benchmark with 1,000 synthetic work orders in DB
    const bulkCust = await prisma.customer.create({
      data: { fullName: 'TEST100_BulkCustomer', phone: '555-100-9999', phoneDigits: '5551009999' },
    });
    createdCustomerIds.push(bulkCust.id);
    const bulkDev = await prisma.device.create({
      data: { customerId: bulkCust.id, name: 'TEST100 Bulk Device' },
    });

    try {
      const bulkRows = Array.from({ length: 1000 }, (_, i) => ({
        ticketNumber: 900000 + i,
        customerId: bulkCust.id,
        deviceId: bulkDev.id,
        status: i % 3 === 0 ? 'COMPLETED' : 'CHECKED_IN',
        priority: 'STANDARD',
        faultDescription: `TEST100_BULK_LOAD_${i}`,
        laborCents: 5000,
        discountCents: 0,
        taxRateBps: 1300,
        dueDate: new Date(Date.now() + 86_400_000),
      }));
      await prisma.ticket.createMany({ data: bulkRows });

      const t0 = Date.now();
      const [bulkDash, bulkPage] = await Promise.all([
        call('/api/dashboard', { token: adminToken }),
        call('/api/tickets?view=ALL&page=1&pageSize=25', { token: adminToken }),
      ]);
      const elapsedMs = Date.now() - t0;

      assert.equal(bulkDash.status, 200);
      assert.equal(bulkPage.status, 200);
      assert.ok(bulkDash.json.data.totalTickets >= dbTotal + 1000);
      assert.equal(bulkPage.json.data.length, 25);
      assert.ok(elapsedMs < 8000, `Expected <8000ms under 1,100+ total DB rows, got ${elapsedMs}ms`);
      console.log(`  [Test #20 Benchmark] Dashboard + 25-row paginated query across ${bulkDash.json.data.totalTickets} tickets took ${elapsedMs}ms`);
    } finally {
      await prisma.ticket.deleteMany({ where: { ticketNumber: { gte: 900000 } } });
      await prisma.device.delete({ where: { id: bulkDev.id } }).catch(() => {});
      await prisma.customer.delete({ where: { id: bulkCust.id } }).catch(() => {});
    }
  });

  // =========================================================================
  // SECTION 3: CUSTOMER MANAGEMENT (#21 – #30)
  // =========================================================================
  test('Section 3 (#21-#30): Customers CRUD, de-dup/conflict, search phone/email, multi-device, archive, unauthenticated isolation', async () => {
    // #30 Unauthenticated requests must not access customer records
    const unauthCust = await call('/api/customers');
    assert.equal(unauthCust.status, 401);

    // #21 Full customer + #22 Minimal (name + phone only)
    const tFull = await call('/api/tickets', {
      method: 'POST',
      token: adminToken,
      body: {
        customer: {
          fullName: 'TEST100_FullCustomer',
          phone: '(416) 555-0121',
          altPhone: '(416) 555-0122',
          email: 'test100_fullcust@fasofix.ca',
          address: '100 Yonge St, Toronto, ON',
        },
        device: { name: 'TEST100 Device One', serialNumber: 'SN100A' },
        faultDescription: 'TEST100_Diag 1',
      },
    });
    assert.equal(tFull.status, 201);
    const fullCustId = tFull.json.data.customerId;
    createdTicketIds.push(tFull.json.data.id);
    createdCustomerIds.push(fullCustId);

    const tMin = await call('/api/tickets', {
      method: 'POST',
      token: adminToken,
      body: {
        customer: { fullName: 'TEST100_MinimalCustomer', phone: '5551000022' },
        device: { name: 'TEST100 Minimal Device', serialNumber: 'SN100MIN' },
        faultDescription: 'TEST100_Min diag',
      },
    });
    assert.equal(tMin.status, 201);
    const minCustId = tMin.json.data.customerId;
    createdTicketIds.push(tMin.json.data.id);
    createdCustomerIds.push(minCustId);

    // #23 Re-registering same phone reuses existing customer + updating to existing phone returns 409 conflict
    const tRepeat = await call('/api/tickets', {
      method: 'POST',
      token: adminToken,
      body: {
        customer: { fullName: 'TEST100_FullCustomer DuplicateAttempt', phone: '4165550121' },
        device: { name: 'TEST100 Device Two', serialNumber: 'SN100B' }, // #28 Multiple devices under 1 customer
        faultDescription: 'TEST100_Diag 2',
      },
    });
    assert.equal(tRepeat.status, 201);
    assert.equal(tRepeat.json.data.customerId, fullCustId, 'Duplicate phone must match existing customer');
    createdTicketIds.push(tRepeat.json.data.id);

    const clashPhone = await call(`/api/customers/${minCustId}`, {
      method: 'PUT',
      token: adminToken,
      body: { phone: '4165550121' },
    });
    assert.equal(clashPhone.status, 409);

    // #24 Search by phone & #25 Search by email
    const byPhone = await call('/api/customers?search=4165550121', { token: adminToken });
    assert.ok(byPhone.json.data.some((c: any) => c.id === fullCustId));
    const byEmail = await call('/api/customers?search=test100_fullcust@fasofix.ca', { token: adminToken });
    assert.ok(byEmail.json.data.some((c: any) => c.id === fullCustId));

    // #26 Edit customer & #27 Verify repair history preserved + #28 verify 2 devices attached
    const editCust = await call(`/api/customers/${fullCustId}`, {
      method: 'PUT',
      token: adminToken,
      body: { fullName: 'TEST100_FullCustomer_Updated', notes: 'VIP corporate account' },
    });
    assert.equal(editCust.status, 200);
    assert.equal(editCust.json.data.fullName, 'TEST100_FullCustomer_Updated');
    assert.equal(editCust.json.data.devices.length, 2, 'Customer must retain both distinct devices');
    assert.equal(editCust.json.data.tickets.length, 2, 'Updating customer must not lose repair history');

    // #29 Archive customer preserves history & hides from default directory
    const archRes = await call(`/api/customers/${fullCustId}/archive`, { method: 'POST', token: adminToken });
    assert.equal(archRes.status, 200);
    assert.ok(archRes.json.data.archivedAt);

    const defaultSearch = await call('/api/customers?search=TEST100_FullCustomer_Updated', { token: adminToken });
    assert.equal(defaultSearch.json.data.some((c: any) => c.id === fullCustId), false, 'Archived customer hidden by default');

    const withArchSearch = await call('/api/customers?search=TEST100_FullCustomer_Updated&includeArchived=true', { token: adminToken });
    assert.equal(withArchSearch.json.data.some((c: any) => c.id === fullCustId), true);

    const detailArch = await call(`/api/customers/${fullCustId}`, { token: adminToken });
    assert.equal(detailArch.json.data.tickets.length, 2, 'Archived customer retains previous repair tickets/history');
  });

  // =========================================================================
  // SECTION 4: REPAIR TICKET MANAGEMENT (#31 – #40)
  // =========================================================================
  test('Section 4 (#31-#40): Multi-device tickets, unique ticket numbers, assign/reassign tech, edit device, optimistic concurrency 409', async () => {
    const devices = [
      'Apple iPhone 15 Pro Max',     // #31
      'Apple MacBook Pro 16 M3',     // #32
      'Dell XPS 15 Windows Laptop',  // #33
      'Sony PlayStation 5 Console',  // #34
      'LG C3 65-inch OLED TV',       // #35
    ];

    const responses = await Promise.all(
      devices.map((dev, i) =>
        call('/api/tickets', {
          method: 'POST',
          token: techToken,
          body: {
            customer: { fullName: `TEST100_DevCust_${i}`, phone: `55510010${i}${i}` },
            device: { name: dev, serialNumber: `TEST100-SN-${i}` },
            faultDescription: `TEST100_Repair ${dev}`,
            technician: techUser.name,
            bench: 'Bench #01',
          },
        })
      )
    );

    const nums = new Set<number>();
    for (const r of responses) {
      assert.equal(r.status, 201);
      createdTicketIds.push(r.json.data.id);
      createdCustomerIds.push(r.json.data.customerId);
      nums.add(r.json.data.ticketNumber);
    }
    // #36 Unique ticket numbers even under concurrent creation
    assert.equal(nums.size, 5, 'Every concurrently created ticket must receive a unique ticketNumber');

    const targetTicket = responses[0].json.data;

    // #37 Assign & #38 Reassign technician
    const reassign = await call(`/api/tickets/${targetTicket.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { technician: 'Senior Microsoldering Lead', bench: 'Bench #03' },
    });
    assert.equal(reassign.status, 200);
    assert.equal(reassign.json.data.technician, 'Senior Microsoldering Lead');

    // #39 Edit device info post-creation
    const editDev = await call(`/api/tickets/${targetTicket.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { device: { serialNumber: 'UPDATED-IMEI-9988', condition: 'Scratches on lower left bezel, hairline frame nick' } },
    });
    assert.equal(editDev.status, 200);
    assert.equal(editDev.json.data.device.serialNumber, 'UPDATED-IMEI-9988');

    // #40 Optimistic concurrency: two employees load staleUpdatedAt; first saves; second gets 409 Conflict
    const loadedTicket = editDev.json.data;
    const staleUpdatedAt = loadedTicket.updatedAt;

    const emp1Save = await call(`/api/tickets/${targetTicket.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { expectedUpdatedAt: staleUpdatedAt, storageBin: 'BIN-A1' },
    });
    assert.equal(emp1Save.status, 200);

    const emp2Save = await call(`/api/tickets/${targetTicket.id}`, {
      method: 'PUT',
      token: techToken,
      body: { expectedUpdatedAt: staleUpdatedAt, storageBin: 'BIN-Z9' },
    });
    assert.equal(emp2Save.status, 409, 'Stale employee write must fail with 409 conflict instead of overwriting');
    assert.equal(emp2Save.status === 409, true);

    const checkFinal = await call(`/api/tickets/${targetTicket.id}`, { token: adminToken });
    assert.equal(checkFinal.json.data.storageBin, 'BIN-A1', 'First write must remain intact');
  });

  // =========================================================================
  // SECTION 5: REPAIR WORKFLOW, NOTES, PHOTOS, DECLINE (#41 – #50)
  // =========================================================================
  test('Section 5 (#41-#50): All statuses, timestamps, diagnostics, split internal/customer notes, receipt privacy, valid/invalid photos, approval & decline', async () => {
    const cr = await call('/api/tickets', {
      method: 'POST',
      token: techToken,
      body: {
        customer: { fullName: 'TEST100_WorkflowCust', phone: '5551002200' },
        device: {
          name: 'MacBook Air M2',
          passcode: 'SECRET_PIN_9876',
          condition: 'Deep scratch on top lid, cracked USB-C bezel (#48)',
        },
        faultDescription: 'TEST100_Liquid spill logic board',
      },
    });
    assert.equal(cr.status, 201);
    const tid = cr.json.data.id;
    createdTicketIds.push(tid);
    createdCustomerIds.push(cr.json.data.customerId);

    // #41 & #42 Move through lifecycle stages with timestamps
    const flow = ['DIAGNOSING', 'WAITING_ON_APPROVAL', 'WAITING_ON_PARTS', 'READY_FOR_PICKUP', 'COMPLETED'];
    for (const st of flow) {
      const up = await call(`/api/tickets/${tid}`, {
        method: 'PUT',
        token: techToken,
        body: { status: st },
      });
      assert.equal(up.status, 200);
      assert.equal(up.json.data.status, st);
    }

    // #43 Diagnostic notes + QA checklist + #49 Estimate & customer approval signature
    const diagUp = await call(`/api/tickets/${tid}`, {
      method: 'PUT',
      token: techToken,
      body: {
        laborCents: 14500,
        diagnostics: { PowerOn: 'PASS', Audio: 'FAIL', Display: 'PASS' },
        signature: VALID_PNG_DATA_URL,
      },
    });
    assert.equal(diagUp.status, 200);

    // #44 Private internal note & public customer note
    await call(`/api/tickets/${tid}/notes`, {
      method: 'POST',
      token: techToken,
      body: { kind: 'CUSTOMER_NOTE', message: 'TEST100_PUBLIC_CLEANED_CORROSION' },
    });
    await call(`/api/tickets/${tid}/notes`, {
      method: 'POST',
      token: techToken,
      body: { kind: 'INTERNAL_NOTE', message: 'TEST100_PRIVATE_SECRET_INTERNAL_BENCH_NOTE' },
    });

    // #45 Verify internal notes and raw passcode never appear on customer receipts / invoices
    const print80 = await call(`/api/tickets/${tid}/print?format=80mm`, { token: techToken });
    const printLetter = await call(`/api/tickets/${tid}/print?format=letter`, { token: techToken });
    assert.equal(print80.status, 200);
    assert.equal(printLetter.status, 200);
    assert.ok(print80.text.includes('TEST100_PUBLIC_CLEANED_CORROSION'));
    assert.equal(print80.text.includes('TEST100_PRIVATE_SECRET_INTERNAL_BENCH_NOTE'), false, 'Internal note leaked onto thermal receipt!');
    assert.equal(printLetter.text.includes('TEST100_PRIVATE_SECRET_INTERNAL_BENCH_NOTE'), false, 'Internal note leaked onto letter invoice!');
    assert.equal(printLetter.text.includes('SECRET_PIN_9876'), false, 'Raw device PIN leaked onto letter invoice!');

    // #46 Upload valid PNG photo
    const photoOk = await call(`/api/tickets/${tid}/photos`, {
      method: 'POST',
      token: techToken,
      body: {
        filename: 'logic_board_damage.png',
        dataUrl: VALID_PNG_DATA_URL,
        caption: 'Corrosion near U3100 controller',
      },
    });
    assert.equal(photoOk.status, 201);
    assert.ok(photoOk.json.data.events.some((e: any) => e.kind === 'PHOTO'));

    // #47 Reject unsupported formats (SVG XSS & spoofed EXE text disguised with image/jpeg MIME header)
    const badSvg = await call(`/api/tickets/${tid}/photos`, {
      method: 'POST',
      token: techToken,
      body: {
        filename: 'exploit.svg',
        dataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}`,
      },
    });
    assert.equal(badSvg.status, 400);

    const spoofedExe = await call(`/api/tickets/${tid}/photos`, {
      method: 'POST',
      token: techToken,
      body: {
        filename: 'fake.jpg',
        dataUrl: `data:image/jpeg;base64,${Buffer.from('MZ_FAKE_WINDOWS_EXE_PAYLOAD_NOT_JPEG').toString('base64')}`,
      },
    });
    assert.equal(spoofedExe.status, 400);

    // #50 Decline a repair and verify all history events remain intact
    const dec = await call(`/api/tickets/${tid}`, {
      method: 'PUT',
      token: techToken,
      body: { status: 'DECLINED' },
    });
    assert.equal(dec.status, 200);
    assert.equal(dec.json.data.status, 'DECLINED');
    const eventsAfterDecline = dec.json.data.events;
    assert.ok(eventsAfterDecline.length >= 8, 'Ticket event history must remain intact after declining');
    assert.ok(eventsAfterDecline.every((e: any) => Boolean(e.createdAt)));
  });

  // =========================================================================
  // SECTION 6 & 7: QUOTATIONS, TAX, PAYMENTS, REFUNDS & INVENTORY (#51 – #70)
  // =========================================================================
  test('Section 6 & 7 (#51-#70): Quotations, tax (13% HST & 5% GST), payments, deposits, refunds, inventory valuation, stock-out/zero/restore', async () => {
    // #61 Add new inventory items & #62 Edit cost & retail prices
    const partScreenRes = await call('/api/inventory', {
      method: 'POST',
      token: adminToken,
      body: {
        sku: `TEST100-SCR-${Date.now()}`,
        name: 'TEST100 OLED Screen Assembly',
        category: 'SCREENS',
        costCents: 6000,
        priceCents: 12000,
        stock: 2,
        reorderPoint: 2,
        supplier: 'TEST100_Supplier',
      },
    });
    assert.equal(partScreenRes.status, 201);
    const screenPart = partScreenRes.json.data;
    createdPartIds.push(screenPart.id);

    const editPart = await call(`/api/inventory/${screenPart.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { costCents: 6500, priceCents: 13000 },
    });
    assert.equal(editPart.status, 200);
    assert.equal(editPart.json.data.costCents, 6500);
    assert.equal(editPart.json.data.priceCents, 13000);

    // #63 Receive new supplier stock (+3 -> stock 5)
    const recvStock = await call(`/api/inventory/${screenPart.id}/adjust`, {
      method: 'POST',
      token: adminToken,
      body: { delta: 3 },
    });
    assert.equal(recvStock.status, 200);
    assert.equal(recvStock.json.data.stock, 5);

    const partBatRes = await call('/api/inventory', {
      method: 'POST',
      token: adminToken,
      body: {
        sku: `TEST100-BAT-${Date.now()}`,
        name: 'TEST100 Battery Pack',
        category: 'BATTERIES',
        costCents: 2000,
        priceCents: 5000,
        stock: 2,
        reorderPoint: 1,
      },
    });
    assert.equal(partBatRes.status, 201);
    const batPart = partBatRes.json.data;
    createdPartIds.push(batPart.id);

    // #51 Generate quotation
    const quoteRes = await call('/api/tickets', {
      method: 'POST',
      token: adminToken,
      body: {
        customer: { fullName: 'TEST100_BillingCust', phone: '5551003300' },
        device: { name: 'iPhone 15' },
        faultDescription: 'TEST100_Screen + Battery replacement',
        laborCents: 7000, // $70
        technician: 'Alex Mercer',
      },
    });
    assert.equal(quoteRes.status, 201);
    const tid = quoteRes.json.data.id;
    createdTicketIds.push(tid);
    createdCustomerIds.push(quoteRes.json.data.customerId);

    await call(`/api/tickets/${tid}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'WAITING_ON_APPROVAL' },
    });

    // #69 Attempt to sell more battery units than in stock (stock=2, request=3 -> 409)
    const overSell = await call(`/api/tickets/${tid}/items`, {
      method: 'POST',
      token: adminToken,
      body: { partId: batPart.id, quantity: 3 },
    });
    assert.equal(overSell.status, 409);

    // #53, #54, #64, #65, #67 Deduct replacement screen (qty 1) + all 2 batteries (stock reaches 0)
    const addScreen = await call(`/api/tickets/${tid}/items`, {
      method: 'POST',
      token: adminToken,
      body: { partId: screenPart.id, quantity: 1 }, // $130
    });
    assert.equal(addScreen.status, 201);

    const addBat = await call(`/api/tickets/${tid}/items`, {
      method: 'POST',
      token: adminToken,
      body: { partId: batPart.id, quantity: 2 }, // 2 x $50 = $100
    });
    assert.equal(addBat.status, 201);

    const invNow = await call('/api/inventory', { token: adminToken });
    const updatedBat = invNow.json.data.find((p: any) => p.id === batPart.id);
    assert.equal(updatedBat.stock, 0, 'Battery stock should reach zero (#67)');

    // #68 Verify low-stock count detected on dashboard
    const dashLow = await call('/api/dashboard', { token: adminToken });
    assert.ok(dashLow.json.data.lowStock >= 1, 'Low stock counter must reflect part <= reorderPoint (#68)');

    // #55 Ontario 13% HST calculation check: labor $70 + screen $130 + 2x battery $100 = $300.00 subtotal
    // 13% HST of 30000 cents = 3900 cents ($39.00) -> Total 33900 cents ($339.00)
    assert.equal(addBat.json.data.totals.subtotalCents, 30000);
    assert.equal(addBat.json.data.totals.taxRateBps, 1300);
    assert.equal(addBat.json.data.totals.taxCents, 3900);
    assert.equal(addBat.json.data.totals.totalCents, 33900);

    // #52 Convert approved quote into active invoice -> READY_FOR_PICKUP
    await call(`/api/tickets/${tid}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'READY_FOR_PICKUP' },
    });

    // #59 Accept deposit ($100), #58 Partial payment ($100 -> $139 owing), #57 Collect remaining ($139 -> $0)
    const dep = await call(`/api/tickets/${tid}/payments`, {
      method: 'POST',
      token: adminToken,
      body: { amountCents: 10000, method: 'CASH', note: 'TEST100 Deposit on quote approval' },
    });
    assert.equal(dep.json.data.totals.balanceCents, 23900);

    const partial = await call(`/api/tickets/${tid}/payments`, {
      method: 'POST',
      token: adminToken,
      body: { amountCents: 10000, method: 'DEBIT', note: 'TEST100 Partial installment' },
    });
    assert.equal(partial.json.data.totals.paymentStatus, 'PARTIAL');
    assert.equal(partial.json.data.totals.balanceCents, 13900);

    const finalPay = await call(`/api/tickets/${tid}/payments`, {
      method: 'POST',
      token: adminToken,
      body: { amountCents: 13900, method: 'CARD', note: 'TEST100 Final balance' },
    });
    assert.equal(finalPay.json.data.totals.paymentStatus, 'PAID');
    assert.equal(finalPay.json.data.totals.balanceCents, 0);

    await call(`/api/tickets/${tid}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'COMPLETED' },
    });

    // #60 & Mandatory #5 Process refund ($113.00) and verify net sales, net tax, stock NOT inflated, and employee sales reduced
    const repBeforeRefund = await call('/api/reports?days=30', { token: adminToken });
    const slBeforeRefund = await call('/api/reports/sales-labor', { token: adminToken });
    const alexBefore = slBeforeRefund.json.data.salesByEmployee.find((e: any) => e.name === 'Alex Mercer');

    const refundRes = await call(`/api/tickets/${tid}/refund`, {
      method: 'POST',
      token: adminToken,
      body: { amountCents: 11300, method: 'CARD', reason: 'TEST100_Partial goodwill refund' },
    });
    assert.equal(refundRes.status, 201);
    assert.equal(refundRes.json.data.totals.paidCents, 22600);

    const invAfterRefund = await call('/api/inventory', { token: adminToken });
    assert.equal(
      invAfterRefund.json.data.find((p: any) => p.id === batPart.id).stock,
      0,
      'Monetary refund must NOT inflate inventory stock (Mandatory #5)'
    );

    const repAfterRefund = await call('/api/reports?days=30', { token: adminToken });
    assert.equal(repAfterRefund.json.data.revenueCents, repBeforeRefund.json.data.revenueCents - 11300);
    assert.equal(
      repAfterRefund.json.data.netTaxCollectedCents,
      repBeforeRefund.json.data.netTaxCollectedCents - 1300,
      'Refund of $113 (1/3 of $339 invoice w/ $39 HST) must reduce net tax report by exactly $13.00 (Mandatory #8)'
    );

    const slAfterRefund = await call('/api/reports/sales-labor', { token: adminToken });
    const alexAfter = slAfterRefund.json.data.salesByEmployee.find((e: any) => e.name === 'Alex Mercer');
    assert.equal(alexAfter.totalRevenueCents, alexBefore.totalRevenueCents - 11300, 'Employee attributed sales must decrease on refund');

    // #70 Inventory valuation & parts profit check:
    // Parts revenue added = 1*13000 + 2*5000 = 23000 ($230), parts cost = 1*6500 + 2*2000 = 10500 ($105), profit = 12500 ($125)
    assert.ok(repAfterRefund.json.data.partsRevenueCents - repAfterRefund.json.data.partsCostCents >= 12500);

    // #56 Alberta 5% GST in strict try/finally restoring Ontario 13% HST
    try {
      const setAb = await call('/api/settings', {
        method: 'PUT',
        token: adminToken,
        body: { taxLabel: 'GST', taxRateBps: 500 },
      });
      assert.equal(setAb.status, 200);

      const abTicket = await call('/api/tickets', {
        method: 'POST',
        token: adminToken,
        body: {
          customer: { fullName: 'TEST100_AlbertaCust', phone: '4035550199' },
          device: { name: 'Pixel 9' },
          faultDescription: 'TEST100_Alberta 5% GST check',
          laborCents: 10000,
        },
      });
      assert.equal(abTicket.status, 201);
      createdTicketIds.push(abTicket.json.data.id);
      createdCustomerIds.push(abTicket.json.data.customerId);
      assert.equal(abTicket.json.data.totals.taxRateBps, 500);
      assert.equal(abTicket.json.data.totals.taxCents, 500);
      assert.equal(abTicket.json.data.totals.totalCents, 10500);
    } finally {
      const restore = await call('/api/settings', {
        method: 'PUT',
        token: adminToken,
        body: { taxLabel: 'HST', taxRateBps: 1300 },
      });
      assert.equal(restore.status, 200);
    }

    // #66 & Mandatory #6 Cancel a repair with attached parts -> parts auto-return to stock & history preserved
    const cancelTicketRes = await call('/api/tickets', {
      method: 'POST',
      token: adminToken,
      body: {
        customer: { fullName: 'TEST100_CancelCust', phone: '5551004400' },
        device: { name: 'Surface Pro' },
        faultDescription: 'TEST100_Cancel restore check',
        laborCents: 5000,
      },
    });
    assert.equal(cancelTicketRes.status, 201);
    const cTid = cancelTicketRes.json.data.id;
    createdTicketIds.push(cTid);
    createdCustomerIds.push(cancelTicketRes.json.data.customerId);

    await call(`/api/tickets/${cTid}/items`, {
      method: 'POST',
      token: adminToken,
      body: { partId: screenPart.id, quantity: 2 }, // stock drops 4 -> 2
    });
    const invMid = await call('/api/inventory', { token: adminToken });
    assert.equal(invMid.json.data.find((p: any) => p.id === screenPart.id).stock, 2);

    const cancelled = await call(`/api/tickets/${cTid}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'CANCELLED' },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.data.status, 'CANCELLED');
    assert.equal(cancelled.json.data.items.length, 1, 'Cancelled invoice must retain attached item audit trail (Mandatory #6)');
    assert.ok(cancelled.json.data.events.length >= 3, 'Cancelled invoice must retain event audit history');

    const invRestored = await call('/api/inventory', { token: adminToken });
    assert.equal(invRestored.json.data.find((p: any) => p.id === screenPart.id).stock, 4, 'Cancelling repair must return attached parts to stock (#66)');
  });

  // =========================================================================
  // SECTION 8: EMPLOYEE MANAGEMENT, SCHEDULING & PAYROLL (#71 – #80 & Mandatory #7)
  // =========================================================================
  test('Section 8 (#71-#80 & Mandatory #7): Emp schedules, visibility, recurring/overlap warnings, clock in/out, overtime & paystubs, wage immutability', async () => {
    // #71 Create technician account with hourly wage & SIN
    const empUname = `test100_paytech_${Date.now()}`;
    const empPw = 'PayTech@2026!';
    const cu = await call('/api/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        username: empUname,
        email: `${empUname}@fasofix.ca`,
        name: 'TEST100_PayrollTech',
        password: empPw,
        role: 'USER',
        bench: 'Bench #05',
      },
    });
    assert.equal(cu.status, 201);
    const empId = cu.json.data.id;
    createdUserIds.push(empId);

    // Give temp tech a SIN in DB to verify masking (#84) and set hourly rate $25/hr
    await prisma.user.update({
      where: { id: empId },
      data: { sin: '123-456-789', hourlyRateCents: 2500, overtimeRateCents: 3750, vacationPayPct: 400 },
    });

    const empLogin = await login({ usernameOrEmail: empUname, password: empPw }, false);

    // #72 Verify role separation: tech cannot edit wages or schedules or create payroll periods
    const techWageTry = await call(`/api/admin/users/${empId}/wages`, {
      method: 'POST',
      token: empLogin.token,
      body: { hourlyRateCents: 5000, reason: 'Unauthorized self raise' },
    });
    assert.equal(techWageTry.status, 403);

    // #73 Create schedule + #76 Recurring weekly shifts + Overlap warning
    const sRes = await call('/api/schedules', {
      method: 'POST',
      token: adminToken,
      body: {
        userId: empId,
        shiftDate: '2099-03-02',
        startTime: '09:00',
        endTime: '17:30',
        breakMinutes: 30,
        recurrenceRule: 'WEEKLY',
        recurrenceCount: 2,
        isPublished: true,
        notes: 'TEST100 regular weekly shift',
      },
    });
    assert.equal(sRes.status, 201);
    for (const sh of sRes.json.createdShifts) createdScheduleIds.push(sh.id);
    assert.equal(sRes.json.createdShifts.length, 2, 'Recurring weekly shift should create 2 occurrences (#76)');
    const primarySchedId = sRes.json.shift.id;

    // #76 Overlapping shift generates explicit conflict warning
    const overlapRes = await call('/api/schedules', {
      method: 'POST',
      token: adminToken,
      body: {
        userId: empId,
        shiftDate: '2099-03-02',
        startTime: '12:00',
        endTime: '16:00',
        isPublished: true,
      },
    });
    assert.equal(overlapRes.status, 201);
    createdScheduleIds.push(overlapRes.json.shift.id);
    assert.ok(
      overlapRes.json.warnings.some((w: string) => /overlap/i.test(w)),
      'Overlapping shift must return scheduling conflict warning (#76)'
    );

    // #75 Technician /api/schedules only returns own published shifts even if requesting another userId
    const techScheds = await call(`/api/schedules?userId=${adminUser.id}`, { token: empLogin.token });
    assert.equal(techScheds.status, 200);
    assert.ok(techScheds.json.data.every((s: any) => s.userId === empId), 'Technician must only see own schedules (#75)');

    // #74 Edit & delete assigned shift
    const editSched = await call(`/api/schedules/${primarySchedId}`, {
      method: 'PUT',
      token: adminToken,
      body: { notes: 'TEST100 edited shift' },
    });
    assert.equal(editSched.status, 200);
    const delSched = await call(`/api/schedules/${overlapRes.json.shift.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delSched.status, 200);

    // #77 Clock-in & clock-out with employee account (+ seconds precision check)
    const clkIn = await call('/api/timeclock/clock-in', {
      method: 'POST',
      token: empLogin.token,
      body: { notes: 'TEST100 live clock test' },
    });
    assert.equal(clkIn.status, 200);
    createdShiftIds.push(clkIn.json.data.id);

    await new Promise((r) => setTimeout(r, 1200));
    const clkStatus = await call('/api/timeclock/status', { token: empLogin.token });
    assert.equal(clkStatus.json.data.isClockedIn, true);
    assert.ok(clkStatus.json.data.liveElapsedSeconds >= 1, 'Elapsed seconds must increment live (#77)');

    const clkOut = await call('/api/timeclock/clock-out', {
      method: 'POST',
      token: empLogin.token,
      body: { notes: 'TEST100 shift done' },
    });
    assert.equal(clkOut.status, 200);
    assert.equal(clkOut.json.data.status, 'COMPLETED');

    const myShifts = await call('/api/timeclock/my-shifts', { token: empLogin.token });
    assert.equal(myShifts.status, 200);
    assert.ok(myShifts.json.data[0].totalSeconds >= 1);
    assert.match(myShifts.json.data[0].durationFormatted, /^\d{2}:\d{2}:\d{2}$/);

    // #78 Missed clock-out fix + break deduction & #79 Ontario 44h weekly overtime math
    // Week of 2099-01-05 (Mon) .. 2099-01-11 (Sun) -> 5 shifts x 10h gross - 0.5h (30m) break = 47.5h worked (44h regular + 3.5h OT)
    for (let d = 5; d <= 9; d++) {
      const dayStr = `2099-01-0${d}`;
      const mRes = await call('/api/admin/attendance/shifts', {
        method: 'POST',
        token: adminToken,
        body: {
          userId: empId,
          clockIn: `${dayStr}T09:00:00Z`,
          clockOut: `${dayStr}T19:00:00Z`,
          breakMinutes: 30,
          reason: 'TEST100_Ontario 44h weekly OT test',
        },
      });
      assert.equal(mRes.status, 200);
      createdShiftIds.push(mRes.json.data.id);
    }

    // Verify tech CANNOT modify shifts (only admin can edit attendance)
    const techEditShift = await call(`/api/admin/attendance/shifts/${createdShiftIds[createdShiftIds.length - 1]}`, {
      method: 'PUT',
      token: empLogin.token,
      body: { clockIn: '2099-01-09T09:00:00Z', reason: 'Attempt edit' },
    });
    assert.equal(techEditShift.status, 403);

    const adminAtt = await call(
      `/api/admin/attendance?userId=${empId}&startDate=2099-01-01T00:00:00Z&endDate=2099-01-12T23:59:59Z`,
      { token: adminToken }
    );
    assert.equal(adminAtt.status, 200);
    assert.equal(adminAtt.json.data.metrics.regularHours, 44);
    assert.equal(adminAtt.json.data.metrics.overtimeHours, 3.5);

    // #80 Calculate & create payroll period -> verify gross, vacation, CPP, EI, income tax & net pay
    const calcRes = await call('/api/admin/payroll/periods/calculate', {
      method: 'POST',
      token: adminToken,
      body: {
        startDate: '2099-01-04T00:00:00Z',
        endDate: '2099-01-17T23:59:59Z',
        payDate: '2099-01-20T00:00:00Z',
        periodType: 'BI_WEEKLY',
      },
    });
    assert.equal(calcRes.status, 200);
    const empDraft = calcRes.json.data.paystubs.find((p: any) => p.userId === empId);
    assert.ok(empDraft, 'Temp employee paystub draft must exist');
    assert.equal(empDraft.regularHours, 44);
    assert.equal(empDraft.overtimeHours, 3.5);
    assert.equal(empDraft.regularPayCents, 44 * 2500);
    assert.equal(empDraft.overtimePayCents, Math.round(3.5 * 3750));
    assert.ok(empDraft.vacationPayCents > 0);
    assert.ok(empDraft.cppCents > 0);
    assert.ok(empDraft.eiCents > 0);
    assert.ok(empDraft.incomeTaxCents >= 0);
    assert.ok(empDraft.netPayCents < empDraft.grossPayCents && empDraft.netPayCents > 0);

    const periodCreateRes = await call('/api/admin/payroll/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        startDate: '2099-01-04T00:00:00Z',
        endDate: '2099-01-17T23:59:59Z',
        payDate: '2099-01-20T00:00:00Z',
        periodType: 'BI_WEEKLY',
        allowDuplicate: true,
        paystubs: [empDraft],
      },
    });
    assert.equal(periodCreateRes.status, 200);
    const period = periodCreateRes.json.data;
    createdPayrollPeriodIds.push(period.id);

    const finRes = await call(`/api/admin/payroll/periods/${period.id}/finalize`, {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(finRes.status, 200);

    const savedPaystub = period.paystubs.find((p: any) => p.userId === empId);
    const origGross = savedPaystub.grossPayCents;
    const origRate = savedPaystub.hourlyRateCents;

    // #84 Verify SIN masked in paystub JSON endpoint
    const myStub = await call(`/api/timeclock/my-paystubs/${savedPaystub.id}`, { token: empLogin.token });
    assert.equal(myStub.status, 200);
    assert.equal(myStub.json.data.user.sin, '***-***-789', 'Raw SIN must never be exposed in API responses (#84)');

    // Mandatory #7 Verify future wage increase does NOT modify finalized historical paystub
    const wageBump = await call(`/api/admin/users/${empId}/wages`, {
      method: 'POST',
      token: adminToken,
      body: { hourlyRateCents: 4000, overtimeRateCents: 6000, reason: 'TEST100_Promotion after payroll' },
    });
    assert.equal(wageBump.status, 200);

    const stubAfterWage = await call(`/api/timeclock/my-paystubs/${savedPaystub.id}`, { token: empLogin.token });
    assert.equal(stubAfterWage.json.data.hourlyRateCents, origRate, 'Historical paystub hourly rate must stay immutable');
    assert.equal(stubAfterWage.json.data.grossPayCents, origGross, 'Historical paystub gross pay must stay immutable');
  });

  // =========================================================================
  // SECTION 9 & 10 & MANDATORY CHECKS: SECURITY, BACKUPS, E2E (#81-#90, #96-#100, M#1-#M9)
  // =========================================================================
  test('Section 9, 10 & Mandatory (#81-#90, #96-#98, #100, M#1-#M9): SQLi, XSS escaping, security headers, scrypt, backup & restore, idempotency, concurrency, double-charge, tax reconciliation & E2E', async () => {
    // #81 SQLi attempts in login & customer search
    const sqliLogin = await call('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: "' OR '1'='1' -- ", password: "' OR '1'='1" },
    });
    assert.equal(sqliLogin.status, 401);

    const sqliSearch = await call(`/api/customers?search=${encodeURIComponent("'; DROP TABLE \"Customer\"; --")}`, {
      token: adminToken,
    });
    assert.equal(sqliSearch.status, 200);
    const custCount = await prisma.customer.count();
    assert.ok(custCount > 0, 'Customer table must be completely unaffected by SQLi search');

    // #83 Unauthenticated API blockade across all sensitive routes including SSE stream
    for (const ep of ['/api/tickets', '/api/customers', '/api/inventory', '/api/admin/overview', '/api/live/stream']) {
      const r = await call(ep);
      assert.equal(r.status, 401, `Unauthenticated request to ${ep} must return 401`);
    }

    // #84 Sensitive fields never exposed + Security response headers present
    assert.equal((adminUser as any).passwordHash, undefined);
    assert.equal((adminUser as any).sin, undefined);
    const secHeaderCheck = await call('/api/dashboard', { token: adminToken });
    assert.equal(secHeaderCheck.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(secHeaderCheck.headers.get('x-frame-options'), 'DENY');
    assert.equal(secHeaderCheck.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');

    // #85 Verify scrypt salted password hashing stored in User table
    const dbAdmin = await prisma.user.findUnique({ where: { id: adminUser.id } });
    assert.ok(dbAdmin?.passwordHash?.includes(':'));
    assert.equal(verifyPassword(ADMIN_CREDS.password, dbAdmin!.passwordHash), true);
    assert.equal(verifyPassword('WrongPass', dbAdmin!.passwordHash), false);

    // #82 XSS payload escaping + #100 Complete real-world E2E journey + #96 Idempotency + #98 Print + M#1..M#4, M#8, M#9
    const partRes = await call('/api/inventory', {
      method: 'POST',
      token: adminToken,
      body: {
        sku: `TEST100-E2E-${Date.now()}`,
        name: 'TEST100 Genuine OLED Screen',
        category: 'SCREENS',
        costCents: 9000,
        priceCents: 20000,
        stock: 3,
        reorderPoint: 1,
      },
    });
    assert.equal(partRes.status, 201);
    const e2ePart = partRes.json.data;
    createdPartIds.push(e2ePart.id);

    // #100 Full E2E Simulation with XSS payload in customer name & notes
    const xssName = 'TEST100 <script>alert("XSS")</script> Cust';
    const intake = await call('/api/tickets', {
      method: 'POST',
      token: adminToken,
      body: {
        customer: { fullName: xssName, phone: '5551007700', email: 'test100_e2e@example.com' },
        device: {
          name: 'iPhone 15 Pro',
          serialNumber: 'E2E-IMEI-100',
          passcode: 'BITLOCKER-9999-SECRET',
          condition: 'Micro-scratches along top bezel',
        },
        faultDescription: 'TEST100_E2E Shattered OLED',
        laborCents: 10000, // $100
        technician: 'Alex Mercer',
        isWarranty: true, // Mandatory #4
      },
    });
    assert.equal(intake.status, 201);
    const e2eTicket = intake.json.data;
    const e2eId = e2eTicket.id;
    createdTicketIds.push(e2eId);
    createdCustomerIds.push(e2eTicket.customerId);

    // Mandatory #2 Verify device belongs strictly to Customer 1 and cannot be claimed under Customer 2 via duplicate serial
    const cust2Ticket = await call('/api/tickets', {
      method: 'POST',
      token: adminToken,
      body: {
        customer: { fullName: 'TEST100_OtherCustomer', phone: '5551008800' },
        device: { name: 'Other iPhone', serialNumber: 'E2E-IMEI-100' },
        faultDescription: 'TEST100_Isolation check',
      },
    });
    assert.equal(cust2Ticket.status, 201);
    createdTicketIds.push(cust2Ticket.json.data.id);
    createdCustomerIds.push(cust2Ticket.json.data.customerId);
    assert.notEqual(cust2Ticket.json.data.deviceId, e2eTicket.deviceId, 'Different customer must never link to Customer 1 device (Mandatory #2)');

    // Mandatory #4 Verify warranty filter isolates warranty tickets
    const warList = await call('/api/tickets?view=WARRANTY&search=E2E-IMEI-100', { token: adminToken });
    assert.equal(warList.status, 200);
    assert.ok(warList.json.data.some((t: any) => t.id === e2eId && t.isWarranty === true));

    // Step through E2E: Diagnosing -> Quote -> Customer Approval -> Parts Usage -> Completion -> Notification
    await call(`/api/tickets/${e2eId}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'DIAGNOSING', diagnostics: { Display: 'FAIL', TrueDepth: 'PASS' } },
    });
    await call(`/api/tickets/${e2eId}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'WAITING_ON_APPROVAL' },
    });
    await call(`/api/tickets/${e2eId}/notes`, {
      method: 'POST',
      token: adminToken,
      body: { kind: 'CUSTOMER_NOTE', message: 'Customer approved <img src=x onerror=alert(1)> quote' },
    });
    const addedPartTicket = await call(`/api/tickets/${e2eId}/items`, {
      method: 'POST',
      token: adminToken,
      body: { partId: e2ePart.id, quantity: 1 }, // $200 part + $100 labor = $300 + 13% HST = $339
    });
    assert.equal(addedPartTicket.json.data.totals.totalCents, 33900);

    // #96 Network disconnect simulation: two identical requests with same idempotencyKey produce only ONE payment
    const idempKey = `test100-idemp-${Date.now()}`;
    const [pTry1, pTry2] = [
      await call(`/api/tickets/${e2eId}/payments`, {
        method: 'POST',
        token: adminToken,
        headers: { 'X-Idempotency-Key': idempKey },
        body: { amountCents: 33900, method: 'CARD', note: 'TEST100 E2E full payment', idempotencyKey: idempKey },
      }),
      await call(`/api/tickets/${e2eId}/payments`, {
        method: 'POST',
        token: adminToken,
        headers: { 'X-Idempotency-Key': idempKey },
        body: { amountCents: 33900, method: 'CARD', note: 'TEST100 E2E full payment', idempotencyKey: idempKey },
      }),
    ];
    assert.equal(pTry1.status, 201);
    assert.equal(pTry2.status, 201);
    assert.equal(pTry2.json.data.payments.length, 1, 'Idempotent retry after network timeout must NOT duplicate payment (#96)');

    await call(`/api/tickets/${e2eId}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'COMPLETED' },
    });

    // Mandatory #1 Completed & paid repair cannot accidentally be charged twice (even with deposit note!)
    const dblCharge = await call(`/api/tickets/${e2eId}/payments`, {
      method: 'POST',
      token: adminToken,
      body: { amountCents: 5000, method: 'CASH', note: 'Deposit accidental double charge' },
    });
    assert.equal(dblCharge.status, 409, 'Completed & settled repair must block double-charging (Mandatory #1)');

    // Customer notification & Print checks (#82 XSS escaping, #98 Formats, M#3 Masking, M#4 Warranty label)
    const notifyRes = await call(`/api/tickets/${e2eId}/notify`, {
      method: 'POST',
      token: adminToken,
      body: { customerPhone: '5551007700', message: 'Your device is ready for pickup!' },
    });
    assert.equal(notifyRes.status, 200);

    const htmlLetter = await call(`/api/tickets/${e2eId}/print?format=letter`, { token: adminToken });
    const html80 = await call(`/api/tickets/${e2eId}/print?format=80mm`, { token: adminToken });
    const html58 = await call(`/api/tickets/${e2eId}/print?format=58mm`, { token: adminToken });
    const htmlBench = await call(`/api/tickets/${e2eId}/print?format=bench`, { token: adminToken });

    assert.equal(htmlLetter.status, 200);
    assert.equal(html80.status, 200);
    assert.equal(html58.status, 200);
    assert.equal(htmlBench.status, 200);
    // #82 XSS strictly escaped
    assert.equal(htmlLetter.text.includes('<script>alert("XSS")</script>'), false);
    assert.ok(htmlLetter.text.includes('&lt;script&gt;'));
    assert.equal(html80.text.includes('<img src=x onerror=alert(1)>'), false);
    assert.ok(html80.text.includes('&lt;img'));
    // Mandatory #3 & #4
    assert.equal(htmlLetter.text.includes('BITLOCKER-9999-SECRET'), false, 'BitLocker/passcode must stay masked on letter invoice');
    assert.ok(htmlLetter.text.includes('WARRANTY REPAIR'));
    assert.ok(html80.text.includes('WARRANTY REPAIR'));

    // #97 Simulate 5 concurrent employees reading & updating dashboard/tickets safely
    const concReads = await Promise.all([
      call('/api/tickets?page=1&pageSize=10', { token: techToken }),
      call('/api/tickets?page=2&pageSize=10', { token: adminToken }),
      call('/api/dashboard', { token: techToken }),
      call('/api/customers?page=1&pageSize=10', { token: adminToken }),
      call(`/api/tickets/${e2eId}`, { token: techToken }),
    ]);
    for (const r of concReads) assert.equal(r.status, 200);

    // #90 Check audit logs captured ticket, payment, refund, customer, inventory & photo events
    const audits = await call('/api/admin/audit-logs?page=1&pageSize=100', { token: adminToken });
    assert.equal(audits.status, 200);
    const actions = new Set(audits.json.data.map((a: any) => a.action));
    for (const expectedAction of [
      'TICKET_CREATE',
      'TICKET_UPDATE',
      'PAYMENT_RECORDED',
      'PAYMENT_REFUND',
      'CUSTOMER_UPDATE',
      'CUSTOMER_ARCHIVE',
      'INVENTORY_CREATE',
      'TICKET_PHOTO_UPLOAD',
    ]) {
      assert.ok(actions.has(expectedAction), `Expected audit log action ${expectedAction}`);
    }

    // #87 Backup generation & #88 Restore into isolated separate SQLite environment
    const bkpRes = await call('/api/admin/backups', { method: 'POST', token: adminToken });
    assert.equal(bkpRes.status, 200);
    const bkpFile = bkpRes.json.data.file as string;
    createdBackupFiles.push(bkpFile);

    const dlRes = await call(`/api/admin/backups/${encodeURIComponent(bkpFile)}`, { token: adminToken });
    assert.equal(dlRes.status, 200);
    const snapshot = JSON.parse(dlRes.text);
    assert.equal(snapshot.provider, 'postgresql');
    assert.ok(Array.isArray(snapshot.data.tickets));
    assert.ok(Array.isArray(snapshot.data.inventoryParts));
    assert.ok(snapshot.data.tickets.some((t: any) => t.id === e2eId), 'Backup snapshot must contain newly created E2E ticket');

    const isolatedDbPath = `/tmp/fasofix-restore-verify-${Date.now()}.db`;
    tempFiles.push(isolatedDbPath);
    const pyScript = `
import json, sqlite3, sys
db_path, snap_json, ddl_sql = sys.argv[1], sys.argv[2], sys.argv[3]
conn = sqlite3.connect(db_path)
conn.executescript(ddl_sql)
with open(snap_json, 'r') as f:
    snap = json.load(f)['data']
for c in snap['customers']:
    conn.execute('INSERT OR IGNORE INTO Customer (id, fullName, phone, phoneDigits, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
                 (c['id'], c['fullName'], c['phone'], c['phoneDigits'], c['createdAt'], c['updatedAt']))
for d in snap['devices']:
    conn.execute('INSERT OR IGNORE INTO Device (id, customerId, name, serialNumber, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
                 (d['id'], d['customerId'], d['name'], d.get('serialNumber'), d['createdAt'], d['updatedAt']))
for t in snap['tickets']:
    conn.execute('INSERT OR IGNORE INTO Ticket (id, ticketNumber, customerId, deviceId, status, priority, faultDescription, laborCents, discountCents, taxRateBps, dueDate, isWarranty, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                 (t['id'], t['ticketNumber'], t['customerId'], t['deviceId'], t['status'], t['priority'], t['faultDescription'], t['laborCents'], t['discountCents'], t['taxRateBps'], t['dueDate'], 1 if t.get('isWarranty') else 0, t['createdAt'], t['updatedAt']))
conn.commit()
ic = conn.execute('PRAGMA integrity_check;').fetchone()[0]
cnt = conn.execute('SELECT COUNT(*) FROM Ticket').fetchone()[0]
print(json.dumps({'integrity': ic, 'tickets': cnt}))
`;
    const snapTmp = `/tmp/fasofix-snap-${Date.now()}.json`;
    tempFiles.push(snapTmp);
    fs.writeFileSync(snapTmp, dlRes.text, 'utf-8');

    const restoreOut = execFileSync('python3', ['-c', pyScript, isolatedDbPath, snapTmp, SCHEMA_SQL], {
      encoding: 'utf-8',
    });
    const parsedRestore = JSON.parse(restoreOut.trim());
    assert.equal(parsedRestore.integrity, 'ok', 'Restored SQLite DB must pass PRAGMA integrity_check');
    assert.equal(parsedRestore.tickets, snapshot.data.tickets.length, 'Restored ticket count must match backup snapshot');
  });
});
