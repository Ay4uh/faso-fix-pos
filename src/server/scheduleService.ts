import { prisma } from './prisma';
import { HttpError } from './service';
import { recordAudit } from './auth';

export interface CreateScheduledShiftInput {
  userId: string;
  shiftDate: string; // ISO string e.g. "2026-11-23" or full ISO
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  breakMinutes?: number;
  breakType?: 'UNPAID_MEAL' | 'PAID_REST';
  roleOrStation?: string;
  notes?: string;
}

export interface UpdateScheduledShiftInput {
  shiftDate?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  breakType?: 'UNPAID_MEAL' | 'PAID_REST';
  roleOrStation?: string;
  notes?: string;
  status?: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
}

function parseShiftDates(shiftDateStr: string, startTime: string, endTime: string) {
  const d = new Date(shiftDateStr);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  const [startH, startM] = startTime.split(':').map((n) => parseInt(n, 10));
  const [endH, endM] = endTime.split(':').map((n) => parseInt(n, 10));

  const startDateTime = new Date(Date.UTC(year, month, day, startH || 0, startM || 0, 0));
  let endDateTime = new Date(Date.UTC(year, month, day, endH || 0, endM || 0, 0));

  // Overnight shift handling
  if (endDateTime.getTime() <= startDateTime.getTime()) {
    endDateTime = new Date(endDateTime.getTime() + 86_400_000);
  }

  const shiftDate = new Date(Date.UTC(year, month, day, 0, 0, 0));
  return { shiftDate, startDateTime, endDateTime };
}

export async function listScheduledShifts(filters: {
  startDate?: string;
  endDate?: string;
  userId?: string;
  status?: string;
}) {
  const where: any = {};

  if (filters.userId && filters.userId !== 'ALL') {
    where.userId = filters.userId;
  }

  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status;
  }

  if (filters.startDate || filters.endDate) {
    where.shiftDate = {};
    if (filters.startDate) {
      where.shiftDate.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      where.shiftDate.lte = new Date(filters.endDate);
    }
  }

  return await prisma.scheduledShift.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          employeeNumber: true,
          role: true,
          bench: true,
          hourlyRateCents: true,
        },
      },
    },
    orderBy: { startDateTime: 'asc' },
  });
}

export async function getScheduledShiftById(id: string) {
  const shift = await prisma.scheduledShift.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          employeeNumber: true,
          role: true,
          bench: true,
        },
      },
    },
  });
  if (!shift) throw new HttpError(404, 'Scheduled shift not found');
  return shift;
}

export async function createScheduledShift(
  input: CreateScheduledShiftInput,
  adminUser: { id: string; name: string }
) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new HttpError(404, 'Employee user not found');

  const { shiftDate, startDateTime, endDateTime } = parseShiftDates(
    input.shiftDate,
    input.startTime,
    input.endTime
  );

  const breakMinutes = Number.isInteger(input.breakMinutes) ? Math.max(0, input.breakMinutes!) : 30;
  const breakType = input.breakType || 'UNPAID_MEAL';
  const totalMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000);
  const workedMinutes = breakType === 'UNPAID_MEAL' ? Math.max(0, totalMinutes - breakMinutes) : totalMinutes;
  const scheduledHours = Number((workedMinutes / 60).toFixed(2));

  const warnings: string[] = [];

  // 1. Conflict / Overlap Detection for this Employee
  const overlapping = await prisma.scheduledShift.findFirst({
    where: {
      userId: input.userId,
      status: { not: 'CANCELLED' },
      startDateTime: { lt: endDateTime },
      endDateTime: { gt: startDateTime },
    },
  });

  if (overlapping) {
    warnings.push(
      `⚠️ Scheduling Conflict: Employee already has an overlapping shift scheduled from ${overlapping.startTime} to ${overlapping.endTime} on this date.`
    );
  }

  // 2. Ontario ESA Section 18 Compliance: Daily Rest Period (Minimum 11 consecutive hours free from work)
  const elevenHoursMs = 11 * 3600 * 1000;
  const prevShift = await prisma.scheduledShift.findFirst({
    where: {
      userId: input.userId,
      status: { not: 'CANCELLED' },
      endDateTime: { lte: startDateTime },
    },
    orderBy: { endDateTime: 'desc' },
  });

  if (prevShift && startDateTime.getTime() - prevShift.endDateTime.getTime() < elevenHoursMs) {
    const restHours = ((startDateTime.getTime() - prevShift.endDateTime.getTime()) / 3600000).toFixed(1);
    warnings.push(
      `⚠️ Ontario ESA Rest Notice: Only ${restHours} hours rest between previous shift (${prevShift.endTime}) and this shift (ESA minimum is 11 consecutive hours).`
    );
  }

  const nextShift = await prisma.scheduledShift.findFirst({
    where: {
      userId: input.userId,
      status: { not: 'CANCELLED' },
      startDateTime: { gte: endDateTime },
    },
    orderBy: { startDateTime: 'asc' },
  });

  if (nextShift && nextShift.startDateTime.getTime() - endDateTime.getTime() < elevenHoursMs) {
    const restHours = ((nextShift.startDateTime.getTime() - endDateTime.getTime()) / 3600000).toFixed(1);
    warnings.push(
      `⚠️ Ontario ESA Rest Notice: Only ${restHours} hours rest between this shift and next scheduled shift (${nextShift.startTime}) on ${nextShift.shiftDate.toISOString().slice(0, 10)}.`
    );
  }

  // 3. Ontario ESA Section 20 Compliance: Eating periods (at least 30 minutes for work > 5 consecutive hours)
  if (workedMinutes > 5 * 60 && breakMinutes < 30) {
    warnings.push(
      `⚠️ Ontario ESA Meal Break Notice: Shifts exceeding 5 consecutive hours require at least a 30-minute eating period.`
    );
  }

  // 4. Weekly Overtime Risk (> 44 hours / week threshold)
  const dayOfWeek = (startDateTime.getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(startDateTime.getTime() - dayOfWeek * 86_400_000);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  const weekShifts = await prisma.scheduledShift.findMany({
    where: {
      userId: input.userId,
      status: { not: 'CANCELLED' },
      shiftDate: { gte: weekStart, lt: weekEnd },
    },
  });

  const currentWeeklyHours = weekShifts.reduce((sum, s) => sum + s.scheduledHours, 0);
  const totalProjectedHours = currentWeeklyHours + scheduledHours;

  if (totalProjectedHours > 44) {
    warnings.push(
      `⚠️ Overtime Risk: Employee is scheduled for ${totalProjectedHours.toFixed(1)} hours this week (>44h threshold, Ontario 1.5x overtime rate applies).`
    );
  }

  if (totalProjectedHours > 48) {
    warnings.push(
      `⚠️ Ontario ESA Maximum Hours Alert: Weekly hours exceed 48 hours (requires employee written excess hours agreement).`
    );
  }

  const shift = await prisma.scheduledShift.create({
    data: {
      userId: input.userId,
      shiftDate,
      startTime: input.startTime,
      endTime: input.endTime,
      startDateTime,
      endDateTime,
      breakMinutes,
      breakType,
      scheduledHours,
      roleOrStation: input.roleOrStation || user.bench || 'Technician',
      notes: input.notes,
      createdById: adminUser.id,
      createdByName: adminUser.name,
      status: 'SCHEDULED',
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          employeeNumber: true,
          role: true,
          bench: true,
        },
      },
    },
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'SHIFT_SCHEDULE_CREATE',
    details: `Created shift schedule for ${user.name} (${input.startTime} - ${input.endTime} on ${shiftDate.toISOString().slice(0, 10)})`,
  });

  return { shift, warnings };
}

export async function updateScheduledShift(
  id: string,
  input: UpdateScheduledShiftInput,
  adminUser: { id: string; name: string }
) {
  const existing = await prisma.scheduledShift.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!existing) throw new HttpError(404, 'Scheduled shift not found');

  const shiftDateStr = input.shiftDate || existing.shiftDate.toISOString();
  const startTime = input.startTime || existing.startTime;
  const endTime = input.endTime || existing.endTime;

  const { shiftDate, startDateTime, endDateTime } = parseShiftDates(shiftDateStr, startTime, endTime);

  const breakMinutes = input.breakMinutes !== undefined ? input.breakMinutes : existing.breakMinutes;
  const breakType = input.breakType || existing.breakType;
  const totalMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000);
  const workedMinutes = breakType === 'UNPAID_MEAL' ? Math.max(0, totalMinutes - breakMinutes) : totalMinutes;
  const scheduledHours = Number((workedMinutes / 60).toFixed(2));

  const updated = await prisma.scheduledShift.update({
    where: { id },
    data: {
      shiftDate,
      startTime,
      endTime,
      startDateTime,
      endDateTime,
      breakMinutes,
      breakType,
      scheduledHours,
      roleOrStation: input.roleOrStation !== undefined ? input.roleOrStation : existing.roleOrStation,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      status: input.status || existing.status,
      updatedById: adminUser.id,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          employeeNumber: true,
          role: true,
          bench: true,
        },
      },
    },
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'SHIFT_SCHEDULE_UPDATE',
    details: `Updated scheduled shift #${id} for ${existing.user.name}`,
  });

  return updated;
}

export async function deleteScheduledShift(id: string, adminUser: { id: string; name: string }) {
  const existing = await prisma.scheduledShift.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!existing) throw new HttpError(404, 'Scheduled shift not found');

  await prisma.scheduledShift.delete({ where: { id } });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'SHIFT_SCHEDULE_DELETE',
    details: `Deleted scheduled shift #${id} for ${existing.user.name}`,
  });

  return { success: true, id };
}

/**
 * Compare Scheduled Hours vs Actual Clock-In Hours, Late Arrivals & Missed Shifts
 */
export async function compareScheduleVsActual(startDateStr: string, endDateStr: string) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  const scheduled = await prisma.scheduledShift.findMany({
    where: {
      shiftDate: { gte: start, lte: end },
      status: { not: 'CANCELLED' },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          employeeNumber: true,
          role: true,
        },
      },
    },
    orderBy: { startDateTime: 'asc' },
  });

  const actualShifts = await prisma.shift.findMany({
    where: {
      clockIn: { gte: start, lte: new Date(end.getTime() + 86_400_000) },
    },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { clockIn: 'asc' },
  });

  const now = new Date();
  let totalScheduledHours = 0;
  let totalActualHours = 0;
  let lateCount = 0;
  let missedCount = 0;

  const comparison = scheduled.map((sc) => {
    totalScheduledHours += sc.scheduledHours;

    // Find actual clock-in on same day for this employee
    const dayStart = new Date(sc.shiftDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const match = actualShifts.find(
      (a) => a.userId === sc.userId && a.clockIn >= dayStart && a.clockIn < dayEnd
    );

    let actualHours = 0;
    let lateMinutes = 0;
    let attendanceStatus: 'ON_TIME' | 'LATE' | 'MISSED' | 'PENDING' = 'PENDING';

    if (match) {
      actualHours = Number((match.totalMinutes / 60).toFixed(2));
      totalActualHours += actualHours;

      // Check late arrival (> 10 minutes past scheduled start)
      const diffMs = match.clockIn.getTime() - sc.startDateTime.getTime();
      if (diffMs > 10 * 60 * 1000) {
        lateMinutes = Math.round(diffMs / 60000);
        attendanceStatus = 'LATE';
        lateCount++;
      } else {
        attendanceStatus = 'ON_TIME';
      }
    } else {
      // If the scheduled start time is in the past, it's missed
      if (sc.endDateTime < now) {
        attendanceStatus = 'MISSED';
        missedCount++;
      }
    }

    const varianceHours = Number((actualHours - sc.scheduledHours).toFixed(2));

    return {
      scheduledShiftId: sc.id,
      employee: sc.user,
      shiftDate: sc.shiftDate,
      scheduledTime: `${sc.startTime} - ${sc.endTime}`,
      scheduledHours: sc.scheduledHours,
      actualShiftId: match ? match.id : null,
      actualClockIn: match ? match.clockIn : null,
      actualClockOut: match ? match.clockOut : null,
      actualHours,
      varianceHours,
      lateMinutes,
      attendanceStatus,
    };
  });

  const onTimeCount = comparison.filter((c) => c.attendanceStatus === 'ON_TIME').length;
  const completedOrPastCount = lateCount + missedCount + onTimeCount;
  const onTimeRatePct = completedOrPastCount > 0 ? Number(((onTimeCount / completedOrPastCount) * 100).toFixed(1)) : 100;

  const summary = {
    totalScheduledShifts: scheduled.length,
    totalScheduledHours: Number(totalScheduledHours.toFixed(2)),
    totalActualHours: Number(totalActualHours.toFixed(2)),
    netVarianceHours: Number((totalActualHours - totalScheduledHours).toFixed(2)),
    totalLateArrivals: lateCount,
    totalMissedShifts: missedCount,
    onTimeRatePct,
  };

  const details = comparison.map((c) => ({
    shiftId: c.scheduledShiftId,
    userId: c.employee?.id || '',
    userName: c.employee?.name || 'Staff',
    userRole: c.employee?.role || 'TECHNICIAN',
    shiftDate: c.shiftDate.toISOString(),
    scheduledStart: c.scheduledTime.split(' - ')[0] || '',
    scheduledEnd: c.scheduledTime.split(' - ')[1] || '',
    scheduledHours: c.scheduledHours,
    actualClockIn: c.actualClockIn ? c.actualClockIn.toISOString() : null,
    actualClockOut: c.actualClockOut ? c.actualClockOut.toISOString() : null,
    actualHoursWorked: c.actualHours,
    varianceHours: c.varianceHours,
    isLate: c.attendanceStatus === 'LATE',
    isMissed: c.attendanceStatus === 'MISSED',
    status: c.attendanceStatus,
  }));

  return {
    summary,
    details,
    totalScheduledShifts: scheduled.length,
    totalScheduledHours: Number(totalScheduledHours.toFixed(2)),
    totalActualHours: Number(totalActualHours.toFixed(2)),
    onTimeRatePct,
    lateCount,
    missedCount,
    comparison,
  };
}
