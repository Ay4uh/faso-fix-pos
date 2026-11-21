import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/server/prisma';
import {
  calculatePayroll,
  calculateShiftHours,
  CRA_2026,
} from '../src/server/payrollMath';
import {
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  getTimeClockStatus,
  getMyShifts,
  getLiveRoster,
  manualAddShift,
  manualEditShift,
  deleteShift,
  updateUserWage,
  getUserWageHistory,
  calculatePeriodPayroll,
  createPayrollPeriod,
  getPayrollPeriod,
  updatePaystubDraft,
  finalizePayrollPeriod,
  buildPaystubHtml,
  getMyPaystub,
} from '../src/server/payrollService';

describe('Employee Time Tracking & Canadian CRA Payroll System', async () => {
  let testAdmin: any;
  let testTech1: any;
  let testTech2: any;

  test('Setup test employees and wage rates', async () => {
    // Find or create test admin
    testAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!testAdmin) {
      testAdmin = await prisma.user.create({
        data: {
          username: 'test_admin_pt',
          email: 'admin_pt@fasofix.ca',
          name: 'Admin Test Lead',
          role: 'ADMIN',
          passwordHash: 'dummy',
          employeeNumber: 'FF-001',
          hourlyRateCents: 3500, // $35.00/hr
        },
      });
    }

    // Create 2 test technicians
    testTech1 = await prisma.user.upsert({
      where: { username: 'test_tech_bob' },
      update: {
        hourlyRateCents: 2500, // $25.00/hr
        overtimeRateCents: 3750, // $37.50/hr (1.5x)
        vacationPayPct: 400, // 4.0%
        employeeNumber: 'FF-002',
      },
      create: {
        username: 'test_tech_bob',
        email: 'bob@fasofix.ca',
        name: 'Bob Technician',
        role: 'USER',
        passwordHash: 'dummy',
        employeeNumber: 'FF-002',
        hourlyRateCents: 2500,
        overtimeRateCents: 3750,
        vacationPayPct: 400,
        bench: 'Bench #01',
      },
    });

    testTech2 = await prisma.user.upsert({
      where: { username: 'test_tech_alice' },
      update: {
        hourlyRateCents: 2800, // $28.00/hr
        overtimeRateCents: 4200, // 1.5x
        vacationPayPct: 400,
        employeeNumber: 'FF-003',
      },
      create: {
        username: 'test_tech_alice',
        email: 'alice@fasofix.ca',
        name: 'Alice Senior Tech',
        role: 'USER',
        passwordHash: 'dummy',
        employeeNumber: 'FF-003',
        hourlyRateCents: 2800,
        overtimeRateCents: 4200,
        vacationPayPct: 400,
        bench: 'Bench #02',
      },
    });

    assert.ok(testAdmin);
    assert.ok(testTech1);
    assert.ok(testTech2);
  });

  test('1. Time Clock Flow: Clock-In, Break, Clock-Out & Deductions', async () => {
    // Clean up any existing active shifts for testTech1
    await prisma.shift.deleteMany({ where: { userId: testTech1.id } });

    // 1. Clock In
    const shift = await clockIn(testTech1.id, 'Starting morning shift at bench #01');
    assert.equal(shift.status, 'ACTIVE');
    assert.equal(shift.userId, testTech1.id);

    // 2. Prevent duplicate clock in
    await assert.rejects(
      async () => await clockIn(testTech1.id),
      (err: any) => err.status === 409 && err.message.includes('already clocked in')
    );

    // 3. Start Unpaid Break
    const brk = await startBreak(testTech1.id, 'UNPAID_MEAL');
    assert.ok(brk.startTime);
    assert.equal(brk.type, 'UNPAID_MEAL');

    // 4. Prevent duplicate break
    await assert.rejects(
      async () => await startBreak(testTech1.id),
      (err: any) => err.status === 400
    );

    // 5. End Break
    const resumedShift = await endBreak(testTech1.id);
    assert.equal(resumedShift.status, 'ACTIVE');

    // 6. Check Time Clock Status
    const status = await getTimeClockStatus(testTech1.id);
    assert.equal(status.isClockedIn, true);
    assert.equal(status.isOnBreak, false);

    // 7. Clock Out
    const completedShift = await clockOut(testTech1.id, 'Finished repairs and cleaned bench');
    assert.equal(completedShift.status, 'COMPLETED');
    assert.ok(completedShift.clockOut);

    // 8. Prevent clocking out without an active shift
    await assert.rejects(
      async () => await clockOut(testTech1.id),
      (err: any) => err.status === 400 && err.message.includes('No active shift')
    );
  });

  test('2. Ontario Overtime Calculation Logic (>44 Hours Weekly Threshold)', () => {
    // Regular 40 hour work week
    const regResult = calculateShiftHours(40 * 60, 0);
    assert.equal(regResult.regularMinutes, 40 * 60);
    assert.equal(regResult.overtimeMinutes, 0);

    // Shift that pushes employee past the 44-hour Ontario ESA threshold
    // e.g. Prior hours in week = 42h (2520m). New shift = 8h (480m).
    // Total week = 50h. First 2 hours are regular, remaining 6 hours are Overtime!
    const otResult = calculateShiftHours(8 * 60, 42 * 60);
    assert.equal(otResult.regularMinutes, 2 * 60);
    assert.equal(otResult.overtimeMinutes, 6 * 60);
  });

  test('3. CRA 2026 & Ontario Statutory Payroll Engine Accuracy', () => {
    // Bi-weekly pay calculation (26 periods/year)
    // 80 regular hours @ $25/hr = $2,000.00
    // 5 overtime hours @ $37.50/hr = $187.50
    // 4% statutory vacation pay on earnings = ($2187.50 * 0.04) = $87.50
    // Total Gross = $2,275.00
    const calc = calculatePayroll({
      regularHours: 80,
      overtimeHours: 5,
      periodType: 'BI_WEEKLY',
      employee: {
        hourlyRateCents: 2500,
        overtimeRateCents: 3750,
        vacationPayPct: 400,
        td1FederalClaimCents: CRA_2026.DEFAULT_TD1_FEDERAL_CENTS,
        td1OntarioClaimCents: CRA_2026.DEFAULT_TD1_ONTARIO_CENTS,
      },
    });

    assert.equal(calc.regularPayCents, 200000); // $2,000.00
    assert.equal(calc.overtimePayCents, 18750); // $187.50
    assert.equal(calc.vacationPayCents, 8750); // $87.50
    assert.equal(calc.grossPayCents, 227500); // $2,275.00

    // CPP: 5.95% above prorated exemption ($3,500 / 26 = $134.62)
    // Insurable = $2,275.00 - $134.62 = $2,140.38
    // CPP = $2,140.38 * 0.0595 = $127.35 (12735 cents)
    assert.equal(calc.cppCents, 12735);

    // EI: 1.63% of insurable earnings ($2,275.00 * 0.0163 = $37.08)
    assert.equal(calc.eiCents, 3708);

    // Income taxes: positive deductions
    assert.ok(calc.incomeTaxCents > 0);
    assert.equal(
      calc.totalDeductionsCents,
      calc.cppCents + calc.eiCents + calc.incomeTaxCents
    );

    // Final Net Pay must equal Gross - Total Deductions
    assert.equal(
      calc.netPayCents,
      calc.grossPayCents - calc.totalDeductionsCents
    );
  });

  test('4. Admin Attendance Management: Manual Shift Entry, Edit & Audit Logging', async () => {
    const adminActor = { id: testAdmin.id, name: testAdmin.name };

    // 1. Admin manually adds shift for testTech2
    const clockInDate = new Date();
    clockInDate.setHours(9, 0, 0, 0);
    const clockOutDate = new Date();
    clockOutDate.setHours(17, 30, 0, 0); // 8.5 hours total

    const manualShift = await manualAddShift(
      {
        userId: testTech2.id,
        clockIn: clockInDate.toISOString(),
        clockOut: clockOutDate.toISOString(),
        breakMinutes: 30, // 30m unpaid meal break -> 8.0h net
        reason: 'Technician was dispatching customer repair at off-site event',
        notes: 'Off-site pickup service',
      },
      adminActor
    );

    assert.equal(manualShift.totalMinutes, 480); // 8 hours net
    assert.equal(manualShift.regularMinutes, 480);
    assert.ok(manualShift.editReason?.includes('Technician was dispatching customer repair at off-site event'));

    // 2. Admin edits shift
    const updatedShift = await manualEditShift(
      manualShift.id,
      {
        clockIn: clockInDate.toISOString(),
        clockOut: clockOutDate.toISOString(),
        breakMinutes: 60, // 60m break -> 7.5h net (450 minutes)
        reason: 'Adjusted break duration per technician request',
      },
      adminActor
    );

    assert.equal(updatedShift.breakMinutes, 60);
    assert.equal(updatedShift.totalMinutes, 450);
    assert.equal(updatedShift.originalClockIn?.toISOString(), clockInDate.toISOString());

    // 3. Admin deletes shift with audit record
    const delResult = await deleteShift(manualShift.id, adminActor);
    assert.equal(delResult.success, true);
  });

  test('4b. ClockOut Resilience: Duplicate ID or Already-Completed Shift Never Crashes', async () => {
    // 1. Clock in
    const shift = await clockIn(testTech1.id, 'Resilience test shift');
    assert.ok(shift.id);

    // 2. Clock out normally
    const closed = await clockOut(testTech1.id, 'Clock out 1', { id: shift.id, clockIn: shift.clockIn });
    assert.equal(closed.status, 'COMPLETED');

    // 3. Second clock-out attempt with same shiftData (simulating double-click or stale localStorage)
    // MUST NOT crash with "Unique constraint failed on the fields: (id)"
    const duplicateOut = await clockOut(testTech1.id, 'Clock out retry', { id: shift.id, clockIn: shift.clockIn });
    assert.equal(duplicateOut.status, 'COMPLETED');
    assert.equal(duplicateOut.id, shift.id);
  });

  test('5. Employee Wage Rate History & Effective Dates', async () => {
    const adminActor = { id: testAdmin.id, name: testAdmin.name };

    // Update technician wage from $25 to $27
    const result = await updateUserWage(
      testTech1.id,
      {
        hourlyRateCents: 2700, // $27.00
        overtimeRateCents: 4050, // 1.5x
        vacationPayPct: 400,
        reason: 'Promoted to Level 2 Micro-soldering Specialist',
      },
      adminActor
    );

    assert.equal(result.wageRecord.hourlyRateCents, 2700);

    // Verify wage history is preserved
    const history = await getUserWageHistory(testTech1.id);
    assert.ok(history.history.length >= 1);
    assert.equal(history.history[0].hourlyRateCents, 2700);
    assert.equal(history.history[0].reason, 'Promoted to Level 2 Micro-soldering Specialist');
  });

  test('6. Complete End-to-End Payroll Period: Calculate, Draft, Adjust, Finalize & Lock', async () => {
    const adminActor = { id: testAdmin.id, name: testAdmin.name };

    // Create a 8-hour completed shift for testTech1 in period
    const shiftStart = new Date();
    shiftStart.setDate(shiftStart.getDate() - 3);
    shiftStart.setHours(9, 0, 0, 0);

    const shiftEnd = new Date(shiftStart.getTime() + 8 * 3600000); // 8 hours

    await prisma.shift.create({
      data: {
        userId: testTech1.id,
        clockIn: shiftStart,
        clockOut: shiftEnd,
        status: 'COMPLETED',
        totalMinutes: 480,
        regularMinutes: 480,
        overtimeMinutes: 0,
        breakMinutes: 0,
      },
    });

    const periodStart = new Date(shiftStart.getTime() - 86400000);
    const periodEnd = new Date(shiftEnd.getTime() + 86400000);
    const payDate = new Date(periodEnd.getTime() + 3 * 86400000);

    // 1. Calculate Period Draft
    const calc = await calculatePeriodPayroll({
      startDate: periodStart.toISOString(),
      endDate: periodEnd.toISOString(),
      payDate: payDate.toISOString(),
      periodType: 'BI_WEEKLY',
    });

    assert.ok(calc.paystubs.length >= 1);
    const tech1PaystubDraft = calc.paystubs.find((p: any) => p.userId === testTech1.id);
    assert.ok(tech1PaystubDraft);
    assert.equal(tech1PaystubDraft.regularHours, 8);

    // 2. Commit as DRAFT Period
    const createdPeriod = await createPayrollPeriod(
      {
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
        payDate: payDate.toISOString(),
        periodType: 'BI_WEEKLY',
        paystubs: calc.paystubs,
      },
      adminActor
    );

    assert.equal(createdPeriod.status, 'DRAFT');

    const createdPaystub = createdPeriod.paystubs.find((p: any) => p.userId === testTech1.id);
    assert.ok(createdPaystub);

    // 3. Admin modifies draft paystub (e.g. $50 bonus for high repair volume)
    const updatedPaystub = await updatePaystubDraft(
      createdPaystub.id,
      {
        bonusCents: 5000, // $50.00
        notes: 'Customer satisfaction bonus',
      },
      adminActor
    );

    assert.equal(updatedPaystub.bonusCents, 5000);
    // Gross increases by bonus ($50.00) + 4% vacation pay on bonus ($2.00) = $52.00 (5200 cents)
    assert.equal(updatedPaystub.grossPayCents, createdPaystub.grossPayCents + 5200);

    // 4. Finalize & Lock Payroll Period
    const finalized = await finalizePayrollPeriod(createdPeriod.id, adminActor);
    assert.equal(finalized.status, 'FINALIZED');
    assert.ok(finalized.finalizedAt);

    // 5. Verify Period is LOCKED against subsequent edits
    await assert.rejects(
      async () =>
        await updatePaystubDraft(
          createdPaystub.id,
          { bonusCents: 10000 },
          adminActor
        ),
      (err: any) => err.status === 403 && err.message.includes('FINALIZED and locked')
    );

    // 6. Generate Official Printable HTML Paystub
    const html = await buildPaystubHtml(createdPaystub.id, true);
    assert.ok(html.includes('EMPLOYEE EARNINGS STATEMENT'));
    assert.ok(html.includes('Canada Pension Plan'));
    assert.ok(html.includes('Employment Insurance'));
    assert.ok(html.includes('Ontario Employment Standards Act'));
  });

  test('7. Privacy & Security: Prevent Cross-Employee Paystub Leaks', async () => {
    // Find a paystub belonging to testTech1
    const tech1Stub = await prisma.paystub.findFirst({
      where: { userId: testTech1.id },
    });
    assert.ok(tech1Stub);

    // Technicians cannot access another employee's paystub
    await assert.rejects(
      async () => await getMyPaystub(testTech2.id, tech1Stub.id, false),
      (err: any) => err.status === 403 && err.message.includes('Unauthorized access')
    );

    // Technician CAN access their own paystub
    const ownStub = await getMyPaystub(testTech1.id, tech1Stub.id, false);
    assert.equal(ownStub.id, tech1Stub.id);
  });
});
