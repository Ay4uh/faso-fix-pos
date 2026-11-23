import { prisma } from './prisma';
import { HttpError } from './service';
import { recordAudit } from './auth';
import { csvCell } from './csvSafe';
import { createNotification, notifyAdmins } from './notificationService';

export interface CreateScheduledShiftInput {
  userId: string;
  shiftDate: string; // ISO string e.g. "2026-11-23" or full ISO
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  breakMinutes?: number;
  breakType?: 'UNPAID_MEAL' | 'PAID_REST';
  roleOrStation?: string;
  branchLocation?: string;
  recurrenceRule?: 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY';
  recurrenceCount?: number;
  isPublished?: boolean;
  notes?: string;
}

export interface UpdateScheduledShiftInput {
  userId?: string;
  shiftDate?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  breakType?: 'UNPAID_MEAL' | 'PAID_REST';
  roleOrStation?: string;
  branchLocation?: string;
  isPublished?: boolean;
  notes?: string;
  status?: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
}

const BUSINESS_TIMEZONE = 'America/Toronto';

function getTimeZoneOffsetMs(utcDate: Date, timeZone = BUSINESS_TIMEZONE): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(utcDate);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = parseInt(p.value, 10);
    }
  }
  const hour = map.hour === 24 ? 0 : map.hour;
  const tzAsUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return tzAsUtc - utcDate.getTime();
}

function zonedLocalToUtc(
  year: number,
  month0: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = BUSINESS_TIMEZONE
): Date {
  const approxUtc = new Date(Date.UTC(year, month0, day, hour, minute, 0));
  const offset1 = getTimeZoneOffsetMs(approxUtc, timeZone);
  const pass1 = new Date(approxUtc.getTime() - offset1);
  // Second pass handles exact DST spring-forward / fall-back boundaries cleanly
  const offset2 = getTimeZoneOffsetMs(pass1, timeZone);
  if (offset2 !== offset1) {
    return new Date(approxUtc.getTime() - offset2);
  }
  return pass1;
}

function toBusinessDateStr(date: Date, timeZone = BUSINESS_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function parseShiftDates(shiftDateStr: string, startTime: string, endTime: string) {
  let year: number;
  let month: number;
  let day: number;

  const isoPrefix = shiftDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) {
    year = parseInt(isoPrefix[1], 10);
    month = parseInt(isoPrefix[2], 10) - 1;
    day = parseInt(isoPrefix[3], 10);
  } else {
    const d = new Date(shiftDateStr);
    year = d.getUTCFullYear();
    month = d.getUTCMonth();
    day = d.getUTCDate();
  }

  const [startH, startM] = startTime.split(':').map((n) => parseInt(n, 10));
  const [endH, endM] = endTime.split(':').map((n) => parseInt(n, 10));

  const startDateTime = zonedLocalToUtc(year, month, day, startH || 0, startM || 0);
  let endDateTime = zonedLocalToUtc(year, month, day, endH || 0, endM || 0);

  // Overnight shift handling
  if (endDateTime.getTime() <= startDateTime.getTime()) {
    endDateTime = zonedLocalToUtc(year, month, day + 1, endH || 0, endM || 0);
  }

  const shiftDate = new Date(Date.UTC(year, month, day, 0, 0, 0));
  return { shiftDate, startDateTime, endDateTime };
}

async function evaluateShiftComplianceWarnings(params: {
  userId: string;
  shiftDate: Date;
  startDateTime: Date;
  endDateTime: Date;
  breakMinutes: number;
  workedMinutes: number;
  scheduledHours: number;
  excludeShiftId?: string;
}): Promise<string[]> {
  const { userId, startDateTime, endDateTime, breakMinutes, workedMinutes, scheduledHours, excludeShiftId } = params;
  const warnings: string[] = [];
  const notSelf = excludeShiftId ? { id: { not: excludeShiftId } } : {};

  // 1. Conflict / Overlap Detection for this Employee
  const overlapping = await prisma.scheduledShift.findFirst({
    where: {
      userId,
      ...notSelf,
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
      userId,
      ...notSelf,
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
      userId,
      ...notSelf,
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
  const localDayStr = toBusinessDateStr(startDateTime);
  const [y, m, d] = localDayStr.split('-').map((n) => parseInt(n, 10));
  const localRef = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = (localRef.getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(localRef.getTime() - dayOfWeek * 86_400_000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  const weekShifts = await prisma.scheduledShift.findMany({
    where: {
      userId,
      ...notSelf,
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

  return warnings;
}

export async function listScheduledShifts(filters: {
  startDate?: string;
  endDate?: string;
  userId?: string;
  status?: string;
  publishedOnly?: boolean;
  isPublished?: boolean;
}) {
  const where: any = {};

  if (filters.userId && filters.userId !== 'ALL') {
    where.userId = filters.userId;
  }

  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status;
  }

  if (filters.publishedOnly) {
    where.isPublished = true;
  } else if (filters.isPublished !== undefined) {
    where.isPublished = filters.isPublished;
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

  const warnings = await evaluateShiftComplianceWarnings({
    userId: input.userId,
    shiftDate,
    startDateTime,
    endDateTime,
    breakMinutes,
    workedMinutes,
    scheduledHours,
  });

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
      branchLocation: input.branchLocation || 'Main Shop',
      recurrenceRule: input.recurrenceRule || 'NONE',
      isPublished: input.isPublished !== false,
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

  const recurrenceRule = input.recurrenceRule || 'NONE';
  const recurrenceCount = Math.min(Math.max(1, input.recurrenceCount || 1), 12);
  const createdShifts = [shift];

  if (recurrenceRule !== 'NONE' && recurrenceCount > 1) {
    const daysInterval = recurrenceRule === 'DAILY' ? 1 : recurrenceRule === 'WEEKLY' ? 7 : 14;
    for (let i = 1; i < recurrenceCount; i++) {
      const nextDate = new Date(shiftDate.getTime() + i * daysInterval * 86_400_000);
      const nextDateStr = nextDate.toISOString().slice(0, 10);
      const nextParsed = parseShiftDates(nextDateStr, input.startTime, input.endTime);
      try {
        const nextShift = await prisma.scheduledShift.create({
          data: {
            userId: input.userId,
            shiftDate: nextParsed.shiftDate,
            startTime: input.startTime,
            endTime: input.endTime,
            startDateTime: nextParsed.startDateTime,
            endDateTime: nextParsed.endDateTime,
            breakMinutes,
            breakType,
            scheduledHours,
            roleOrStation: input.roleOrStation || user.bench || 'Technician',
            branchLocation: input.branchLocation || 'Main Shop',
            recurrenceRule,
            isPublished: input.isPublished !== false,
            notes: input.notes,
            createdById: adminUser.id,
            createdByName: adminUser.name,
            status: 'SCHEDULED',
          },
        });
        createdShifts.push(nextShift as any);
      } catch {}
    }
  }

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'SHIFT_SCHEDULE_CREATE',
    details: `Created shift schedule for ${user.name} (${input.startTime} - ${input.endTime} on ${shiftDate.toISOString().slice(0, 10)})${recurrenceCount > 1 ? ` repeated ${recurrenceCount} times` : ''}`,
  });

  if (shift.isPublished) {
    const dateLabel = shiftDate.toISOString().slice(0, 10);
    await createNotification({
      userId: input.userId,
      type: 'SHIFT_ASSIGNED',
      title: 'New Shift Assigned',
      message: `Scheduled on ${dateLabel} (${input.startTime} - ${input.endTime})${recurrenceCount > 1 ? ` + ${recurrenceCount - 1} recurring` : ''}.`,
      linkTab: 'timeclock:schedule',
    });
  }

  return { shift, createdShifts, warnings };
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

  const targetUserId = input.userId || existing.userId;
  if (input.userId && input.userId !== existing.userId) {
    const nextUser = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!nextUser) throw new HttpError(404, 'Assigned employee user not found');
  }

  const shiftDateStr = input.shiftDate || existing.shiftDate.toISOString();
  const startTime = input.startTime || existing.startTime;
  const endTime = input.endTime || existing.endTime;

  const { shiftDate, startDateTime, endDateTime } = parseShiftDates(shiftDateStr, startTime, endTime);

  const breakMinutes = input.breakMinutes !== undefined ? Math.max(0, input.breakMinutes) : existing.breakMinutes;
  const breakType = input.breakType || (existing.breakType as 'UNPAID_MEAL' | 'PAID_REST');
  const totalMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000);
  const workedMinutes = breakType === 'UNPAID_MEAL' ? Math.max(0, totalMinutes - breakMinutes) : totalMinutes;
  const scheduledHours = Number((workedMinutes / 60).toFixed(2));

  const warnings = await evaluateShiftComplianceWarnings({
    userId: targetUserId,
    shiftDate,
    startDateTime,
    endDateTime,
    breakMinutes,
    workedMinutes,
    scheduledHours,
    excludeShiftId: id,
  });

  const updated = await prisma.scheduledShift.update({
    where: { id },
    data: {
      userId: targetUserId,
      shiftDate,
      startTime,
      endTime,
      startDateTime,
      endDateTime,
      breakMinutes,
      breakType,
      scheduledHours,
      roleOrStation: input.roleOrStation !== undefined ? input.roleOrStation : existing.roleOrStation,
      branchLocation: input.branchLocation !== undefined ? input.branchLocation : existing.branchLocation,
      isPublished: input.isPublished !== undefined ? input.isPublished : existing.isPublished,
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
    details: `Updated scheduled shift #${id} for ${updated.user.name}`,
  });

  const dateLabel = updated.shiftDate.toISOString().slice(0, 10);
  if (!existing.isPublished && updated.isPublished) {
    await createNotification({
      userId: updated.userId,
      type: 'SHIFT_PUBLISHED',
      title: 'Shift Published',
      message: `Your shift on ${dateLabel} (${updated.startTime} - ${updated.endTime}) is now published.`,
      linkTab: 'timeclock:schedule',
    });
  } else if (updated.isPublished) {
    if (updated.status === 'CANCELLED' && existing.status !== 'CANCELLED') {
      await createNotification({
        userId: updated.userId,
        type: 'SHIFT_CANCELLED',
        title: 'Shift Cancelled',
        message: `Your shift on ${dateLabel} (${updated.startTime} - ${updated.endTime}) was cancelled.`,
        linkTab: 'timeclock:schedule',
      });
    } else if (updated.userId !== existing.userId) {
      await createNotification({
        userId: updated.userId,
        type: 'SHIFT_ASSIGNED',
        title: 'Shift Assigned to You',
        message: `You were assigned a shift on ${dateLabel} (${updated.startTime} - ${updated.endTime}).`,
        linkTab: 'timeclock:schedule',
      });
      await createNotification({
        userId: existing.userId,
        type: 'SHIFT_UPDATED',
        title: 'Shift Reassigned',
        message: `Your shift on ${existing.shiftDate.toISOString().slice(0, 10)} (${existing.startTime} - ${existing.endTime}) was reassigned.`,
        linkTab: 'timeclock:schedule',
      });
    } else {
      await createNotification({
        userId: updated.userId,
        type: 'SHIFT_UPDATED',
        title: 'Shift Updated',
        message: `Your shift on ${dateLabel} (${updated.startTime} - ${updated.endTime}) was updated.`,
        linkTab: 'timeclock:schedule',
      });
    }
  }

  return { ...updated, shift: updated, warnings };
}

export async function publishDraftShifts(
  filters: { startDate?: string; endDate?: string; userId?: string } | undefined,
  adminUser: { id: string; name: string }
) {
  const where: any = { isPublished: false, status: { not: 'CANCELLED' } };
  if (filters?.userId && filters.userId !== 'ALL') {
    where.userId = filters.userId;
  }
  if (filters?.startDate || filters?.endDate) {
    where.shiftDate = {};
    if (filters.startDate) where.shiftDate.gte = new Date(filters.startDate);
    if (filters.endDate) where.shiftDate.lte = new Date(filters.endDate);
  }

  const drafts = await prisma.scheduledShift.findMany({
    where,
    include: { user: { select: { id: true, name: true } } },
  });

  if (drafts.length === 0) {
    return { count: 0, publishedIds: [] as string[] };
  }

  const ids = drafts.map((d) => d.id);
  await prisma.scheduledShift.updateMany({
    where: { id: { in: ids } },
    data: { isPublished: true, updatedById: adminUser.id },
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'SHIFT_SCHEDULE_PUBLISH',
    details: `Published ${drafts.length} draft shift(s) to staff schedules`,
  });

  // Group notifications per employee
  const byUser = new Map<string, typeof drafts>();
  for (const d of drafts) {
    const arr = byUser.get(d.userId) || [];
    arr.push(d);
    byUser.set(d.userId, arr);
  }

  for (const [userId, userDrafts] of byUser.entries()) {
    const first = userDrafts[0];
    const firstDate = first.shiftDate.toISOString().slice(0, 10);
    const msg =
      userDrafts.length === 1
        ? `Shift on ${firstDate} (${first.startTime} - ${first.endTime}) is now published.`
        : `${userDrafts.length} upcoming shifts starting ${firstDate} are now published.`;
    await createNotification({
      userId,
      type: 'SHIFT_PUBLISHED',
      title: userDrafts.length === 1 ? 'Shift Published' : `${userDrafts.length} Shifts Published`,
      message: msg,
      linkTab: 'timeclock:schedule',
    });
  }

  return { count: drafts.length, publishedIds: ids };
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

  if (existing.isPublished) {
    await createNotification({
      userId: existing.userId,
      type: 'SHIFT_CANCELLED',
      title: 'Shift Removed',
      message: `Your shift on ${existing.shiftDate.toISOString().slice(0, 10)} (${existing.startTime} - ${existing.endTime}) was removed from the schedule.`,
      linkTab: 'timeclock:schedule',
    });
  }

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
      clockIn: {
        gte: new Date(start.getTime() - 6 * 3600_000),
        lte: new Date(end.getTime() + 30 * 3600_000),
      },
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

    // Match actual clock-in on same business day (America/Toronto) or within +/- 6h of scheduled start
    const scDateStr = sc.shiftDate.toISOString().slice(0, 10);
    const match = actualShifts.find(
      (a) =>
        a.userId === sc.userId &&
        (toBusinessDateStr(a.clockIn) === scDateStr ||
          Math.abs(a.clockIn.getTime() - sc.startDateTime.getTime()) <= 6 * 3600_000)
    );

    let actualHours = 0;
    let lateMinutes = 0;
    let attendanceStatus: 'ON_TIME' | 'LATE' | 'MISSED' | 'PENDING' = 'PENDING';

    if (match) {
      if (match.status === 'COMPLETED') {
        actualHours = Number((match.totalMinutes / 60).toFixed(2));
      } else {
        const elapsedMins = Math.max(0, Math.round((now.getTime() - match.clockIn.getTime()) / 60000));
        actualHours = Number((Math.max(0, elapsedMins - match.breakMinutes) / 60).toFixed(2));
      }
      totalActualHours += actualHours;

      // Check late arrival (> 10 minutes past scheduled start in America/Toronto)
      const diffMs = match.clockIn.getTime() - sc.startDateTime.getTime();
      if (diffMs > 10 * 60 * 1000) {
        lateMinutes = Math.round(diffMs / 60000);
        attendanceStatus = 'LATE';
        lateCount++;
      } else {
        attendanceStatus = 'ON_TIME';
      }
    } else {
      // If the scheduled shift end time is in the past, it's missed
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

// ---------------------------------------------------------------------------
// Duplicate Shift
// ---------------------------------------------------------------------------
export async function duplicateScheduledShift(
  id: string,
  targetDate: string,
  targetUserId?: string,
  adminUser?: { id: string; name: string }
) {
  const original = await prisma.scheduledShift.findUnique({ where: { id } });
  if (!original) throw new HttpError(404, 'Shift not found');

  const userId = targetUserId || original.userId;
  return await createScheduledShift(
    {
      userId,
      shiftDate: targetDate,
      startTime: original.startTime,
      endTime: original.endTime,
      breakMinutes: original.breakMinutes,
      breakType: original.breakType as any,
      roleOrStation: original.roleOrStation || undefined,
      branchLocation: original.branchLocation || undefined,
      notes: original.notes ? `Copy of shift: ${original.notes}` : undefined,
    },
    adminUser || { id: 'system', name: 'Administrator' }
  );
}

// ---------------------------------------------------------------------------
// Time-Off Requests
// ---------------------------------------------------------------------------
export async function createTimeOffRequest(input: {
  userId: string;
  requestType?: string;
  startDate: string;
  endDate: string;
  reason?: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new HttpError(404, 'User not found');

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new HttpError(400, 'Valid startDate and endDate are required.');
  }
  if (endDate < startDate) {
    throw new HttpError(400, 'Time-off end date cannot be earlier than start date.');
  }

  const created = await prisma.timeOffRequest.create({
    data: {
      userId: input.userId,
      requestType: input.requestType || 'VACATION',
      startDate,
      endDate,
      reason: input.reason || null,
      status: 'PENDING',
    },
    include: {
      user: {
        select: { id: true, name: true, username: true, role: true },
      },
    },
  });

  await notifyAdmins({
    type: 'TIME_OFF_REQUEST',
    title: 'New Time-Off Request',
    message: `${created.user.name} requested ${created.requestType} (${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}).`,
    linkTab: 'admin:schedule',
    excludeUserId: input.userId,
  });

  return created;
}

export async function listTimeOffRequests(filters?: { userId?: string; status?: string }) {
  const where: any = {};
  if (filters?.userId && filters.userId !== 'ALL') where.userId = filters.userId;
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;

  return await prisma.timeOffRequest.findMany({
    where,
    include: {
      user: {
        select: { id: true, name: true, username: true, role: true, employeeNumber: true },
      },
    },
    orderBy: { startDate: 'desc' },
  });
}

export async function reviewTimeOffRequest(
  id: string,
  review: { status: 'APPROVED' | 'REJECTED'; reviewNotes?: string },
  adminUser: { id: string; name: string }
) {
  const existing = await prisma.timeOffRequest.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Time-off request not found');

  const updated = await prisma.timeOffRequest.update({
    where: { id },
    data: {
      status: review.status,
      reviewedById: adminUser.id,
      reviewedByName: adminUser.name,
      reviewNotes: review.reviewNotes,
    },
    include: {
      user: { select: { id: true, name: true, username: true } },
    },
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'TIME_OFF_REVIEW',
    details: `${review.status} time-off request for ${updated.user.name} (${updated.startDate.toISOString().slice(0, 10)} to ${updated.endDate.toISOString().slice(0, 10)})`,
  });

  await createNotification({
    userId: updated.userId,
    type: 'TIME_OFF_REVIEWED',
    title: `Time-Off ${review.status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
    message: `Your ${updated.requestType} request (${updated.startDate.toISOString().slice(0, 10)} to ${updated.endDate.toISOString().slice(0, 10)}) was ${review.status.toLowerCase()}.`,
    linkTab: 'timeclock:schedule',
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Shift-Swap Requests
// ---------------------------------------------------------------------------
export async function createShiftSwapRequest(input: {
  requesterId: string;
  requesterShiftId: string;
  targetUserId: string;
  targetShiftId?: string;
  reason?: string;
}) {
  if (input.targetUserId === input.requesterId) {
    throw new HttpError(400, 'Cannot request a shift swap with yourself.');
  }

  const requesterShift = await prisma.scheduledShift.findUnique({
    where: { id: input.requesterShiftId },
  });
  if (!requesterShift) {
    throw new HttpError(404, 'Selected shift was not found.');
  }
  if (requesterShift.userId !== input.requesterId) {
    throw new HttpError(403, 'You can only request swaps for your own assigned shifts.');
  }

  const created = await prisma.shiftSwapRequest.create({
    data: {
      requesterId: input.requesterId,
      requesterShiftId: input.requesterShiftId,
      targetUserId: input.targetUserId,
      targetShiftId: input.targetShiftId || null,
      reason: input.reason || null,
      status: 'PENDING',
    },
    include: {
      requester: { select: { id: true, name: true, username: true } },
      targetUser: { select: { id: true, name: true, username: true } },
    },
  });

  await createNotification({
    userId: input.targetUserId,
    type: 'SHIFT_SWAP_REQUEST',
    title: 'Shift Swap Requested',
    message: `${created.requester.name} requested a shift swap with you (${requesterShift.shiftDate.toISOString().slice(0, 10)} ${requesterShift.startTime}-${requesterShift.endTime}).`,
    linkTab: 'timeclock:schedule',
  });

  await notifyAdmins({
    type: 'SHIFT_SWAP_REQUEST',
    title: 'Shift Swap Pending Approval',
    message: `${created.requester.name} requested to swap a shift with ${created.targetUser.name}.`,
    linkTab: 'admin:schedule',
    excludeUserId: input.requesterId,
  });

  return created;
}

export async function listShiftSwapRequests(filters?: { userId?: string; status?: string }) {
  const where: any = {};
  if (filters?.userId && filters.userId !== 'ALL') {
    where.OR = [{ requesterId: filters.userId }, { targetUserId: filters.userId }];
  }
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;

  return await prisma.shiftSwapRequest.findMany({
    where,
    include: {
      requester: { select: { id: true, name: true, username: true } },
      targetUser: { select: { id: true, name: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function reviewShiftSwapRequest(
  id: string,
  review: { status: 'APPROVED' | 'REJECTED'; reviewNotes?: string },
  adminUser: { id: string; name: string }
) {
  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!swap) throw new HttpError(404, 'Shift swap request not found');
  if (swap.status !== 'PENDING') {
    throw new HttpError(409, `This shift swap request has already been ${swap.status.toLowerCase()}.`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (review.status === 'APPROVED') {
      // Perform shift swap on requester shift
      await tx.scheduledShift.update({
        where: { id: swap.requesterShiftId },
        data: { userId: swap.targetUserId },
      });

      // If target had a shift assigned, assign to requester
      if (swap.targetShiftId) {
        await tx.scheduledShift.update({
          where: { id: swap.targetShiftId },
          data: { userId: swap.requesterId },
        });
      }
    }

    return tx.shiftSwapRequest.update({
      where: { id },
      data: {
        status: review.status,
        reviewedById: adminUser.id,
        reviewedByName: adminUser.name,
        reviewNotes: review.reviewNotes,
      },
      include: {
        requester: { select: { id: true, name: true } },
        targetUser: { select: { id: true, name: true } },
      },
    });
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'SHIFT_SWAP_REVIEW',
    details: `${review.status} shift swap between ${updated.requester.name} and ${updated.targetUser.name}`,
  });

  const decisionText = review.status === 'APPROVED' ? 'approved' : 'rejected';
  await createNotification({
    userId: updated.requesterId,
    type: 'SHIFT_SWAP_REVIEWED',
    title: `Shift Swap ${review.status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
    message: `Your shift swap request with ${updated.targetUser.name} was ${decisionText}.`,
    linkTab: 'timeclock:schedule',
  });
  await createNotification({
    userId: updated.targetUserId,
    type: 'SHIFT_SWAP_REVIEWED',
    title: `Shift Swap ${review.status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
    message: `The shift swap request from ${updated.requester.name} was ${decisionText}.`,
    linkTab: 'timeclock:schedule',
  });

  return updated;
}

// ---------------------------------------------------------------------------
// CSV Schedule Export
// ---------------------------------------------------------------------------
export async function exportSchedulesCsv(filters?: {
  startDate?: string;
  endDate?: string;
  userId?: string;
}) {
  const shifts = await listScheduledShifts(filters || {});
  const headers = [
    'Shift ID',
    'Employee Name',
    'Employee ID',
    'Role / Bench',
    'Branch',
    'Shift Date',
    'Start Time',
    'End Time',
    'Scheduled Hours',
    'Break Duration (min)',
    'Break Type',
    'Status',
    'Notes',
    'Created By',
  ];

  const rows = shifts.map((s) => [
    s.id,
    s.user?.name || '',
    s.user?.employeeNumber || '',
    s.roleOrStation || s.user?.role || '',
    s.branchLocation || 'Main Shop',
    s.shiftDate.toISOString().slice(0, 10),
    s.startTime,
    s.endTime,
    s.scheduledHours.toFixed(2),
    s.breakMinutes,
    s.breakType,
    s.status,
    s.notes || '',
    s.createdByName || '',
  ]);

  return [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
}
