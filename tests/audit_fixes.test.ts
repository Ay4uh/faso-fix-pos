/**
 * Regression Test Suite for Full-Stack POS & Workforce Audit Fixes
 */
import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/server/prisma';
import {
  authenticateSession,
  createSession,
  destroySession,
  ensureAdminProvisioning,
  hashPassword,
} from '../src/server/auth';
import { ensureDatabaseSchema } from '../src/server/initDb';
import { computeTotals } from '../src/server/money';
import { getPeriodsPerYear } from '../src/server/payrollMath';
import * as payrollService from '../src/server/payrollService';
import * as scheduleService from '../src/server/scheduleService';
import { getSalesLaborAnalytics } from '../src/server/service';

const API = process.env.API_URL || 'http://localhost:4000';

async function apiCall(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}

describe('POS & Workforce Logic Audit Regression Suite', () => {
  let adminUser: any;
  let stdUser: any;
  let disabledUser: any;
  let adminToken = '';
  let stdToken = '';

  before(async () => {
    await ensureDatabaseSchema();
    await ensureAdminProvisioning();

    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    assert.ok(adminUser, 'Active admin must exist');

    stdUser = await prisma.user.upsert({
      where: { username: 'audit_std_tech' },
      update: { status: 'ACTIVE', role: 'USER', hourlyRateCents: 2400 },
      create: {
        username: 'audit_std_tech',
        email: 'audit_std_tech@fasofix.ca',
        name: 'Audit Std Tech',
        role: 'USER',
        status: 'ACTIVE',
        passwordHash: hashPassword('TechPass123!'),
        employeeNumber: 'FF-901',
        hourlyRateCents: 2400,
      },
    });

    disabledUser = await prisma.user.upsert({
      where: { username: 'audit_disabled_tech' },
      update: { status: 'DISABLED', role: 'USER' },
      create: {
        username: 'audit_disabled_tech',
        email: 'audit_disabled_tech@fasofix.ca',
        name: 'Disabled Account',
        role: 'USER',
        status: 'DISABLED',
        passwordHash: hashPassword('TechPass123!'),
        employeeNumber: 'FF-902',
      },
    });

    adminToken = await createSession(adminUser.id);
    stdToken = await createSession(stdUser.id);
  });

  test('1. Disabled user token is strictly rejected by authenticateSession', async () => {
    const token = await createSession(disabledUser.id);
    const authed = await authenticateSession(token);
    assert.equal(authed, null, 'Disabled user must never authenticate via stateless fallback');
  });

  test('2. Logged-out session token is rejected after destroySession', async () => {
    const tempToken = await createSession(stdUser.id);
    assert.ok(await authenticateSession(tempToken), 'Fresh session must authenticate');
    await destroySession(tempToken);
    assert.equal(await authenticateSession(tempToken), null, 'Destroyed session must not authenticate');
  });

  test('3. PUT /api/auth/profile blocks role & status escalation', async () => {
    const res = await apiCall('/api/auth/profile', {
      method: 'PUT',
      token: stdToken,
      body: { name: 'Audit Std Tech', role: 'ADMIN', status: 'DISABLED' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.role, 'USER', 'Standard user must not self-promote to ADMIN');
    assert.equal(res.json.user.status, 'ACTIVE', 'Profile update must ignore status changes');
  });

  test('4. GET /api/users omits passwordHash syncPayload; POST /api/sync/* requires ADMIN', async () => {
    const usersRes = await apiCall('/api/users', { token: stdToken });
    assert.equal(usersRes.status, 200);
    assert.ok(Array.isArray(usersRes.json.data) && usersRes.json.data.length > 0);
    for (const u of usersRes.json.data) {
      assert.equal(u.syncPayload, undefined, 'GET /api/users must never expose passwordHash syncPayload');
      assert.equal(u.passwordHash, undefined, 'GET /api/users must never expose passwordHash');
    }

    const unauthSyncUsers = await apiCall('/api/sync/users', { method: 'POST', body: {} });
    assert.equal(unauthSyncUsers.status, 401);

    const techSyncUsers = await apiCall('/api/sync/users', {
      method: 'POST',
      token: stdToken,
      body: { deletedUserIds: [adminUser.id] },
    });
    assert.equal(techSyncUsers.status, 403);

    const techSyncTickets = await apiCall('/api/sync/tickets', {
      method: 'POST',
      token: stdToken,
      body: { deletedIds: ['nonexistent'] },
    });
    assert.equal(techSyncTickets.status, 403);
  });

  test('5. Paid rest breaks are NOT deducted from worked hours, while unpaid meal breaks ARE deducted', async () => {
    await prisma.shift.deleteMany({ where: { userId: stdUser.id } });

    const clockInTime = new Date(Date.now() - 60 * 60000); // 60 mins ago
    const shift = await prisma.shift.create({
      data: {
        userId: stdUser.id,
        clockIn: clockInTime,
        status: 'ACTIVE',
      },
    });

    // Simulate a 15m PAID_REST break
    await prisma.shiftBreak.create({
      data: {
        shiftId: shift.id,
        startTime: new Date(Date.now() - 20 * 60000),
        endTime: null,
        type: 'PAID_REST',
      },
    });
    await prisma.shift.update({ where: { id: shift.id }, data: { status: 'ON_BREAK' } });

    const afterPaidBreak = await payrollService.endBreak(stdUser.id);
    assert.equal(afterPaidBreak.breakMinutes, 0, 'PAID_REST must not increment unpaid breakMinutes deduction');

    // Simulate an UNPAID_MEAL break of ~30 mins
    await prisma.shiftBreak.create({
      data: {
        shiftId: shift.id,
        startTime: new Date(Date.now() - 30 * 60000),
        endTime: null,
        type: 'UNPAID_MEAL',
      },
    });
    await prisma.shift.update({ where: { id: shift.id }, data: { status: 'ON_BREAK' } });

    const afterUnpaidBreak = await payrollService.endBreak(stdUser.id);
    assert.ok(afterUnpaidBreak.breakMinutes >= 29 && afterUnpaidBreak.breakMinutes <= 31, 'UNPAID_MEAL must increment breakMinutes');

    const closed = await payrollService.clockOut(stdUser.id, 'Finished test shift');
    assert.ok(closed.totalMinutes >= 28 && closed.totalMinutes <= 32, 'Paid break preserved; unpaid 30m meal deducted from 60m shift');
  });

  test('6. manualAddShift applies Ontario ESA 44h weekly OT instead of 8h daily OT', async () => {
    await prisma.shift.deleteMany({ where: { userId: stdUser.id } });
    const adminActor = { id: adminUser.id, name: adminUser.name };

    // Pick a Monday cleanly in the past (previous week's Monday) at 08:00 local time
    const mon = new Date();
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - 7);
    mon.setHours(8, 0, 0, 0);

    // 10h shift on Monday (0 prior weekly hours) -> all 10h (600 mins) must be REGULAR, 0 OT
    const s1 = await payrollService.manualAddShift(
      {
        userId: stdUser.id,
        clockIn: mon.toISOString(),
        clockOut: new Date(mon.getTime() + 10 * 3600_000).toISOString(),
        breakMinutes: 0,
        reason: 'Audit 10h regular day test',
      },
      adminActor
    );
    assert.equal(s1.regularMinutes, 600);
    assert.equal(s1.overtimeMinutes, 0);

    // Add 34 more hours Tue-Thu so priorWeekly = 44h? Actually add 32h -> prior = 42h, then 6h Fri shift = 2h reg + 4h OT
    const tue = new Date(mon.getTime() + 86_400_000);
    await prisma.shift.create({
      data: {
        userId: stdUser.id,
        clockIn: tue,
        clockOut: new Date(tue.getTime() + 32 * 3600_000),
        status: 'COMPLETED',
        totalMinutes: 32 * 60,
        regularMinutes: 32 * 60,
        overtimeMinutes: 0,
      },
    });

    const fri = new Date(mon.getTime() + 4 * 86_400_000);
    const s2 = await payrollService.manualAddShift(
      {
        userId: stdUser.id,
        clockIn: fri.toISOString(),
        clockOut: new Date(fri.getTime() + 6 * 3600_000).toISOString(),
        breakMinutes: 0,
        reason: 'Audit 44h weekly threshold test',
      },
      adminActor
    );
    assert.equal(s2.regularMinutes, 120, 'First 2h up to 44h must be regular');
    assert.equal(s2.overtimeMinutes, 240, 'Remaining 4h past 44h must be overtime');
  });

  test('7. getPeriodsPerYear supports SEMI_MONTHLY = 24', () => {
    assert.equal(getPeriodsPerYear('SEMI_MONTHLY'), 24);
    assert.equal(getPeriodsPerYear('BI_WEEKLY'), 26);
    assert.equal(getPeriodsPerYear('WEEKLY'), 52);
    assert.equal(getPeriodsPerYear('MONTHLY'), 12);
  });

  test('8. Admin data contracts: getLiveRoster, getPayrollDashboardOverview, getSalesLaborAnalytics, computeTotals', async () => {
    const roster = await payrollService.getLiveRoster();
    assert.ok(roster.length > 0);
    const first = roster[0];
    assert.equal(typeof first.id, 'string');
    assert.equal(typeof first.name, 'string');
    assert.equal(typeof first.isClockedIn, 'boolean');
    assert.equal(typeof first.isOnBreak, 'boolean');

    const overview = await payrollService.getPayrollDashboardOverview();
    assert.ok(overview.kpis, 'Overview must include kpis alongside metrics');
    assert.equal(typeof overview.kpis.totalRegularHours, 'number');
    assert.equal(typeof overview.kpis.estimatedGrossPayrollCents, 'number');

    const analytics = await getSalesLaborAnalytics(
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
      new Date().toISOString()
    );
    assert.equal(typeof analytics.salesBreakdown.byPaymentMethod.cashCents, 'number');
    assert.equal(typeof analytics.salesBreakdown.byPaymentMethod.cardCents, 'number');
    assert.equal(typeof analytics.salesBreakdown.byPaymentMethod.debitCents, 'number');
    if (analytics.byShift.length > 0) {
      const sh = analytics.byShift[0];
      assert.equal(typeof sh.durationHours, 'number');
      assert.equal(typeof sh.ticketsCount, 'number');
      assert.equal(typeof sh.shiftRevenueCents, 'number');
      assert.equal(typeof sh.shiftLaborCostCents, 'number');
      assert.equal(typeof sh.shiftLaborCostPct, 'number');
    }
    if (analytics.byEmployee.length > 0) {
      const emp = analytics.byEmployee[0];
      assert.equal(typeof emp.userId, 'string');
      assert.equal(typeof emp.hourlyWageCents, 'number');
    }

    const totals = computeTotals({
      laborCents: 10000,
      discountCents: 1000,
      taxRateBps: 1300,
      items: [],
      payments: [],
    });
    assert.equal(totals.taxableCents, 9000);
    assert.equal(totals.taxRateBps, 1300);
    assert.equal(totals.taxCents, 1170);
  });

  test('9. Schedule timezone accuracy (America/Toronto) & /api/schedules/my-schedule', async () => {
    await prisma.scheduledShift.deleteMany({ where: { userId: stdUser.id } });
    await prisma.shift.deleteMany({ where: { userId: stdUser.id } });

    // Schedule 09:00-17:00 on 2026-11-23 (EST = UTC-5, so 09:00 EST is 14:00:00Z)
    const created = await scheduleService.createScheduledShift(
      {
        userId: stdUser.id,
        shiftDate: '2026-11-23',
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 30,
      },
      { id: adminUser.id, name: adminUser.name }
    );
    assert.equal(created.shift.startDateTime.toISOString(), '2026-11-23T14:00:00.000Z');

    // Simulate actual clock-in at 09:02 AM Toronto time (14:02:00Z) -> must be ON_TIME (not 5h late!)
    await prisma.shift.create({
      data: {
        userId: stdUser.id,
        clockIn: new Date('2026-11-23T14:02:00.000Z'),
        clockOut: new Date('2026-11-23T22:02:00.000Z'),
        status: 'COMPLETED',
        totalMinutes: 450,
        regularMinutes: 450,
        overtimeMinutes: 0,
      },
    });

    const cmp = await scheduleService.compareScheduleVsActual('2026-11-23T00:00:00.000Z', '2026-11-23T23:59:59.000Z');
    const detail = cmp.details.find((d) => d.shiftId === created.shift.id);
    assert.ok(detail, 'Comparison entry must exist for Toronto scheduled shift');
    assert.equal(detail.status, 'ON_TIME', '09:02 Toronto clock-in for 09:00 Toronto shift must be ON_TIME');

    // Verify GET /api/schedules/my-schedule returns 200 with user's shifts
    const myRes = await apiCall('/api/schedules/my-schedule', { token: stdToken });
    assert.equal(myRes.status, 200);
    assert.ok(Array.isArray(myRes.json.data));
    assert.ok(myRes.json.data.some((s: any) => s.id === created.shift.id));
  });

  test('10. Cleanup temporary audit test records cleanly', async () => {
    await prisma.scheduledShift.deleteMany({ where: { userId: stdUser.id } });
    await prisma.shift.deleteMany({ where: { userId: stdUser.id } });
    await prisma.session.deleteMany({ where: { userId: { in: [stdUser.id, disabledUser.id] } } });
    await destroySession(adminToken);
    assert.ok(true);
  });
});
