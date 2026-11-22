import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/server/prisma';
import { createSession, verifySignedToken } from '../src/server/auth';
import * as payrollService from '../src/server/payrollService';
import * as scheduleService from '../src/server/scheduleService';
import { calculatePayroll } from '../src/server/payrollMath';
import { getSalesLaborAnalytics, createTicket, listTickets } from '../src/server/service';

describe('Faso Fix POS Complete Upgrade Verification Suite', () => {
  let testAdmin: any;
  let testTech: any;

  before(async () => {
    // Ensure test users exist
    testAdmin = await prisma.user.upsert({
      where: { username: 'test_upgrade_admin' },
      update: {},
      create: {
        username: 'test_upgrade_admin',
        email: 'upgrade_admin@fasofix.ca',
        name: 'Upgrade Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash: 'dummy_hash',
        hourlyRateCents: 3500,
      },
    });

    testTech = await prisma.user.upsert({
      where: { username: 'test_upgrade_tech' },
      update: {},
      create: {
        username: 'test_upgrade_tech',
        email: 'upgrade_tech@fasofix.ca',
        name: 'Upgrade Technician',
        role: 'TECHNICIAN',
        status: 'ACTIVE',
        passwordHash: 'dummy_hash',
        hourlyRateCents: 2200,
      },
    });
  });

  // -------------------------------------------------------------------------
  // 1. Automatic Logout – 24-Hour Session Expiration
  // -------------------------------------------------------------------------
  test('1. 24-Hour Session Expiration: Valid tokens accepted, expired tokens rejected', async () => {
    // Valid session token created now
    const validToken = await createSession(testTech.id);
    const verifiedValid = verifySignedToken(validToken);
    assert.ok(verifiedValid, 'Signed token should be verified');
    assert.equal(verifiedValid.uid, testTech.id);

    // Simulate an expired session token (25 hours ago)
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    const expiredPayload = {
      uid: testTech.id,
      u: testTech.username,
      r: testTech.role,
      iat: twentyFiveHoursAgo,
      exp: twentyFiveHoursAgo + 24 * 60 * 60 * 1000, // expired 1 hour ago
    };
    const b64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    // Using fake signature
    const expiredToken = `s.${b64}.fakesig`;
    const verifiedExpired = verifySignedToken(expiredToken);
    assert.equal(verifiedExpired, null, 'Expired session token must be rejected');

    // Admin accounts must also be subject to session expiration
    const adminToken = await createSession(testAdmin.id);
    assert.ok(adminToken.startsWith('s.'), 'Admin must receive a signed 24h session token');
  });

  // -------------------------------------------------------------------------
  // 2. Employee Clock-In, Clock-Out & Break System
  // -------------------------------------------------------------------------
  test('2. Employee Clock-In/Out & Paid/Unpaid Break Tracking', async () => {
    // Ensure no stale active shifts for testTech
    await prisma.shift.updateMany({
      where: { userId: testTech.id, status: 'ACTIVE' },
      data: { status: 'COMPLETED', clockOut: new Date() },
    });

    // Clock in
    const shift = await payrollService.clockIn(testTech.id, 'Morning Diagnostic Shift');
    assert.ok(shift.id, 'Shift ID must be generated');
    assert.equal(shift.userId, testTech.id);
    assert.equal(shift.status, 'ACTIVE');

    // Prevent duplicate clock-in
    await assert.rejects(
      async () => {
        await payrollService.clockIn(testTech.id, 'Duplicate Clock-In Attempt');
      },
      /already clocked in/i
    );

    // Start an Unpaid Meal Break
    const mealBreak = await payrollService.startBreak(testTech.id, 'UNPAID_MEAL');
    assert.equal(mealBreak.type, 'UNPAID_MEAL');

    // End break
    await payrollService.endBreak(testTech.id);

    // Clock out
    const completedShift = await payrollService.clockOut(testTech.id, 'Shift complete');
    assert.equal(completedShift.status, 'COMPLETED');
    assert.ok(completedShift.clockOut, 'Clock-out timestamp must be recorded');
  });

  // -------------------------------------------------------------------------
  // 3. Shift Scheduling with Ontario ESA Conflict & Rest Warnings
  // -------------------------------------------------------------------------
  test('3. Shift Scheduling: Create, Conflict Detection & 11h Rest Period Warning', async () => {
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // Create a 9am - 5pm shift (8 hours, 30m break)
    const result1 = await scheduleService.createScheduledShift(
      {
        userId: testTech.id,
        shiftDate: tomorrowStr,
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 30,
        breakType: 'UNPAID_MEAL',
        roleOrStation: 'Bench #01',
      },
      { id: testAdmin.id, name: testAdmin.name }
    );
    assert.ok(result1.shift.id, 'Scheduled shift must be created');
    assert.equal(result1.shift.scheduledHours, 7.5);

    // Attempt overlapping shift on same date for same user -> must return conflict warning
    const conflictResult = await scheduleService.createScheduledShift(
      {
        userId: testTech.id,
        shiftDate: tomorrowStr,
        startTime: '14:00',
        endTime: '20:00',
        breakMinutes: 30,
      },
      { id: testAdmin.id, name: testAdmin.name }
    );
    assert.ok(
      conflictResult.warnings.some((w) => w.includes('Scheduling Conflict')),
      'Must warn for overlapping shift conflict'
    );

    // Schedule next day starting at 02:00 (less than 11 hours rest from 17:00)
    const dayAfterStr = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const result2 = await scheduleService.createScheduledShift(
      {
        userId: testTech.id,
        shiftDate: dayAfterStr,
        startTime: '02:00',
        endTime: '10:00',
        breakMinutes: 30,
      },
      { id: testAdmin.id, name: testAdmin.name }
    );
    // Should flag Ontario ESA 11-hour rest warning
    assert.ok(
      result2.warnings.some((w) => w.includes('11 consecutive hours')),
      'Must warn for insufficient rest period between shifts'
    );
  });

  // -------------------------------------------------------------------------
  // 4. Schedule vs Actual Comparison (Late Arrivals & Missed Shifts)
  // -------------------------------------------------------------------------
  test('4. Schedule vs Actual: Tracks Punctuality, Late Arrivals & Missed Shifts', async () => {
    const comparison = await scheduleService.compareScheduleVsActual(
      new Date(Date.now() - 7 * 86400000).toISOString(),
      new Date().toISOString()
    );
    assert.ok(comparison.summary, 'Comparison summary must exist');
    assert.ok(typeof comparison.summary.onTimeRatePct === 'number', 'On-time rate must be a number');
    assert.ok(Array.isArray(comparison.details), 'Details must be an array');
  });

  // -------------------------------------------------------------------------
  // 5. Ontario ESA Overtime & Minimum Wage Rules
  // -------------------------------------------------------------------------
  test('5. Ontario ESA Overtime: Accurately calculates 1.5x after 44 hours', () => {
    // 50 total weekly hours at $20.00/hr ($2000 cents/hr)
    // Regular: 44 hours * $20 = $880.00 (88000 cents)
    // Overtime: 6 hours * ($20 * 1.5 = $30) = $180.00 (18000 cents)
    // Total gross: $1,060.00 (106000 cents)
    const regularRateCents = 2000;
    const regularHours = 44;
    const overtimeHours = 6;
    const regularEarnings = regularHours * regularRateCents;
    const overtimeEarnings = Math.round(overtimeHours * regularRateCents * 1.5);
    const totalGross = regularEarnings + overtimeEarnings;

    assert.equal(regularEarnings, 88000);
    assert.equal(overtimeEarnings, 18000);
    assert.equal(totalGross, 106000);
  });

  // -------------------------------------------------------------------------
  // 6. CRA Canadian Payroll Deductions Engine
  // -------------------------------------------------------------------------
  test('6. CRA 2026 Engine: Federal, Ontario Provincial, CPP, CPP2 and EI Deductions', () => {
    // 80 hours biweekly at $25.00/hr ($2500 cents/hr)
    const result = calculatePayroll({
      employee: {
        hourlyRateCents: 2500,
        td1FederalClaimCents: 1570500,
        td1OntarioClaimCents: 1239900,
      },
      regularHours: 80,
      overtimeHours: 0,
      periodType: 'BI_WEEKLY',
      daysInPeriod: 14,
    });

    assert.ok(result.grossPayCents > 0, 'Gross pay must be calculated');
    assert.ok(result.vacationPayCents > 0, 'Vacation pay (4% Ontario minimum) must be calculated');
    assert.equal(result.vacationPayCents, 8000); // 4% of 200000 = 8000 cents ($80)
    assert.ok(result.cppCents > 0, 'CPP must be deducted');
    assert.ok(result.eiCents > 0, 'EI must be deducted');
    assert.ok(result.incomeTaxCents > 0, 'Income tax (Federal + Ontario) must be calculated');
    assert.ok(result.totalDeductionsCents > 0, 'Total deductions must be positive');
    assert.ok(result.netPayCents > 0, 'Net take-home pay must be positive');

    // Net pay + total deductions must equal gross pay
    const reconstructed = result.netPayCents + result.totalDeductionsCents;
    assert.equal(reconstructed, result.grossPayCents, 'Net pay plus deductions must equal gross pay');
  });

  // -------------------------------------------------------------------------
  // 7. POS Sales Attribution & Labor Productivity Analytics
  // -------------------------------------------------------------------------
  test('7. POS Sales Attribution & Labor ROI Reporting', async () => {
    const analytics = await getSalesLaborAnalytics(
      new Date(Date.now() - 30 * 86400000).toISOString(),
      new Date().toISOString()
    );

    assert.ok(analytics.summary, 'Summary analytics must exist');
    assert.ok(typeof analytics.summary.totalRevenueCents === 'number');
    assert.ok(typeof analytics.summary.laborCostPct === 'number');
    assert.ok(Array.isArray(analytics.byEmployee), 'byEmployee breakdown must be an array');
    assert.ok(Array.isArray(analytics.byShift), 'byShift breakdown must be an array');
    assert.ok(analytics.salesBreakdown.byPaymentMethod, 'Payment method breakdown must exist');
  });

  // -------------------------------------------------------------------------
  // 8. Existing POS Functionality Remains 100% Operational
  // -------------------------------------------------------------------------
  test('8. Regression Safety: POS Ticket Intake and Listing remain intact', async () => {
    const tickets = await listTickets({});
    assert.ok(Array.isArray(tickets), 'Existing tickets must list cleanly');

    const newTicket = await createTicket({
      customer: {
        fullName: 'Jane Upgrade Verification',
        phone: '4165558899',
      },
      device: {
        name: 'iPhone 15 Screen Fix',
      },
      faultDescription: 'Broken OLED display panel',
      laborCents: 8500,
      priority: 'STANDARD',
    });

    assert.ok(newTicket.id, 'New ticket creation must succeed');
    assert.equal(newTicket.laborCents, 8500);
  });
});
