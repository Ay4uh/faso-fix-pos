import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/server/prisma';
import * as scheduleService from '../src/server/scheduleService';
import { ensureDatabaseSchema } from '../src/server/initDb';
import { ensureAdminProvisioning } from '../src/server/auth';

test.before(async () => {
  await ensureDatabaseSchema();
  await ensureAdminProvisioning();
});

test('Workforce Scheduling Enhancements Suite', async (t) => {
  // Find or create test users
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert.ok(admin, 'Admin must exist');

  let tech1 = await prisma.user.findFirst({ where: { username: 'tech1_sched_test' } });
  if (!tech1) {
    tech1 = await prisma.user.create({
      data: {
        username: 'tech1_sched_test',
        email: 'tech1_sched@example.com',
        name: 'Alex Technician',
        passwordHash: 'dummy',
        role: 'USER',
        bench: 'Bench #01',
      },
    });
  }

  let tech2 = await prisma.user.findFirst({ where: { username: 'tech2_sched_test' } });
  if (!tech2) {
    tech2 = await prisma.user.create({
      data: {
        username: 'tech2_sched_test',
        email: 'tech2_sched@example.com',
        name: 'Sam Technician',
        passwordHash: 'dummy',
        role: 'USER',
        bench: 'Bench #02',
      },
    });
  }

  await t.test('1. Create recurring shifts (Weekly for 3 weeks)', async () => {
    const todayStr = '2026-11-23';
    const result = await scheduleService.createScheduledShift(
      {
        userId: tech1.id,
        shiftDate: todayStr,
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 30,
        breakType: 'UNPAID_MEAL',
        roleOrStation: 'Bench #01',
        branchLocation: 'Main Shop - Toronto',
        recurrenceRule: 'WEEKLY',
        recurrenceCount: 3,
        notes: 'Recurring weekly shift test',
      },
      { id: admin.id, name: admin.name }
    );

    assert.ok(result.shift, 'Primary shift created');
    assert.strictEqual(result.createdShifts.length, 3, 'Must create exactly 3 recurring shifts');
    assert.strictEqual(result.shift.branchLocation, 'Main Shop - Toronto');
    assert.strictEqual(result.shift.scheduledHours, 7.5);
  });

  await t.test('2. Duplicate shift to another date', async () => {
    const list = await scheduleService.listScheduledShifts({ userId: tech1.id });
    assert.ok(list.length > 0, 'Must have at least one shift to duplicate');

    const original = list[0];
    const duplicated = await scheduleService.duplicateScheduledShift(
      original.id,
      '2026-12-15',
      undefined,
      { id: admin.id, name: admin.name }
    );

    assert.ok(duplicated.shift, 'Shift duplicated');
    assert.strictEqual(duplicated.shift.shiftDate.toISOString().slice(0, 10), '2026-12-15');
    assert.strictEqual(duplicated.shift.startTime, original.startTime);
    assert.strictEqual(duplicated.shift.endTime, original.endTime);
  });

  await t.test('3. Time-Off Request: Create, List, and Approve', async () => {
    const req = await scheduleService.createTimeOffRequest({
      userId: tech1.id,
      requestType: 'VACATION',
      startDate: '2026-12-24',
      endDate: '2026-12-28',
      reason: 'Holiday break with family',
    });

    assert.ok(req.id, 'Time off request created');
    assert.strictEqual(req.status, 'PENDING');
    assert.strictEqual(req.requestType, 'VACATION');

    const list = await scheduleService.listTimeOffRequests({ userId: tech1.id });
    assert.ok(list.some((r) => r.id === req.id), 'Request must appear in list');

    const reviewed = await scheduleService.reviewTimeOffRequest(
      req.id,
      { status: 'APPROVED', reviewNotes: 'Approved per company policy' },
      { id: admin.id, name: admin.name }
    );

    assert.strictEqual(reviewed.status, 'APPROVED');
    assert.strictEqual(reviewed.reviewedByName, admin.name);
  });

  await t.test('4. Shift-Swap Request: Create and Approve with Shift Reassignment', async () => {
    const tech1Shifts = await scheduleService.listScheduledShifts({ userId: tech1.id });
    assert.ok(tech1Shifts.length > 0);
    const targetShift = tech1Shifts[0];

    const swap = await scheduleService.createShiftSwapRequest({
      requesterId: tech1.id,
      requesterShiftId: targetShift.id,
      targetUserId: tech2.id,
      reason: 'Need appointment coverage',
    });

    assert.ok(swap.id);
    assert.strictEqual(swap.status, 'PENDING');

    const reviewed = await scheduleService.reviewShiftSwapRequest(
      swap.id,
      { status: 'APPROVED', reviewNotes: 'Manager confirmed' },
      { id: admin.id, name: admin.name }
    );

    assert.strictEqual(reviewed.status, 'APPROVED');

    // Confirm that the shift is now assigned to tech2!
    const updatedShift = await scheduleService.getScheduledShiftById(targetShift.id);
    assert.strictEqual(updatedShift.userId, tech2.id, 'Shift must now be assigned to peer technician');
  });

  await t.test('5. CSV Schedule Export', async () => {
    const csv = await scheduleService.exportSchedulesCsv();
    assert.ok(typeof csv === 'string');
    assert.ok(csv.includes('Shift ID,Employee Name,Employee ID'));
    assert.ok(csv.includes('Alex Technician') || csv.includes('Sam Technician'));
  });
});
