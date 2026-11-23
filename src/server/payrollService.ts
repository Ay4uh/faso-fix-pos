import { prisma } from './prisma';
import { HttpError, getSettings } from './service';
import { recordAudit } from './auth';
import { calculatePayroll, calculateShiftHours, CRA_2026 } from './payrollMath';
import { createNotification, notifyAdmins } from './notificationService';

function getOpenUnpaidBreakMinutes(
  breaks: Array<{ startTime: Date; endTime: Date | null; type: string }> | undefined,
  now: Date
): number {
  if (!breaks || breaks.length === 0) return 0;
  const openBreak = breaks.find((b) => b.endTime === null);
  if (!openBreak || openBreak.type === 'PAID_REST') return 0;
  return Math.max(0, Math.round((now.getTime() - openBreak.startTime.getTime()) / 60000));
}

async function getPriorWeeklyCompletedMinutes(
  userId: string,
  referenceClockIn: Date,
  excludeShiftId?: string
): Promise<number> {
  const dayOfWeek = (referenceClockIn.getDay() + 6) % 7; // Monday = 0
  const startOfDay = new Date(
    referenceClockIn.getFullYear(),
    referenceClockIn.getMonth(),
    referenceClockIn.getDate()
  );
  const weekStart = new Date(startOfDay.getTime() - dayOfWeek * 86_400_000);

  const priorCompleted = await prisma.shift.findMany({
    where: {
      userId,
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
      clockIn: { gte: weekStart, lt: referenceClockIn },
      status: 'COMPLETED',
    },
    select: { totalMinutes: true },
  });

  return priorCompleted.reduce((sum, p) => sum + p.totalMinutes, 0);
}

// ---------------------------------------------------------------------------
// Employee Time Clock Operations
// ---------------------------------------------------------------------------

export async function getTimeClockStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
      employeeNumber: true,
      hourlyRateCents: true,
      overtimeRateCents: true,
      vacationPayPct: true,
      bench: true,
    },
  });
  if (!user) throw new HttpError(404, 'User not found');

  // Check for currently active or on-break shift
  const activeShift = await prisma.shift.findFirst({
    where: {
      userId,
      status: { in: ['ACTIVE', 'ON_BREAK'] },
    },
    include: {
      breaks: { orderBy: { startTime: 'desc' } },
    },
    orderBy: { clockIn: 'desc' },
  });

  const activeBreak = activeShift?.breaks.find((b) => b.endTime === null) || null;

  // Calculate today's working hours (since 00:00:00 local time)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const todayShifts = await prisma.shift.findMany({
    where: {
      userId,
      clockIn: { gte: todayStart },
    },
    include: {
      breaks: { where: { endTime: null } },
    },
  });

  let todayMinutes = 0;
  for (const s of todayShifts) {
    if (s.status === 'COMPLETED') {
      todayMinutes += s.totalMinutes;
    } else {
      // Shift in progress: subtract recorded unpaid breaks AND ongoing unpaid break elapsed time
      const elapsed = Math.round((now.getTime() - s.clockIn.getTime()) / 60000);
      const openUnpaid = getOpenUnpaidBreakMinutes(s.breaks, now);
      todayMinutes += Math.max(0, elapsed - s.breakMinutes - openUnpaid);
    }
  }

  // Calculate this week's working hours (Monday to Sunday)
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(todayStart.getTime() - dayOfWeek * 86_400_000);

  const weekShifts = await prisma.shift.findMany({
    where: {
      userId,
      clockIn: { gte: weekStart },
    },
    include: {
      breaks: { where: { endTime: null } },
    },
  });

  let weekMinutes = 0;
  for (const s of weekShifts) {
    if (s.status === 'COMPLETED') {
      weekMinutes += s.totalMinutes;
    } else {
      const elapsed = Math.round((now.getTime() - s.clockIn.getTime()) / 60000);
      const openUnpaid = getOpenUnpaidBreakMinutes(s.breaks, now);
      weekMinutes += Math.max(0, elapsed - s.breakMinutes - openUnpaid);
    }
  }

  const activeOpenUnpaid = activeShift ? getOpenUnpaidBreakMinutes(activeShift.breaks, now) : 0;

  return {
    user,
    isClockedIn: Boolean(activeShift),
    clockedIn: Boolean(activeShift),
    isOnBreak: activeShift?.status === 'ON_BREAK',
    onBreak: activeShift?.status === 'ON_BREAK',
    activeShift: activeShift
      ? {
          id: activeShift.id,
          clockIn: activeShift.clockIn,
          status: activeShift.status,
          breakMinutes: activeShift.breakMinutes + activeOpenUnpaid,
          activeDurationMinutes: Math.max(
            0,
            Math.round((now.getTime() - activeShift.clockIn.getTime()) / 60000) -
              activeShift.breakMinutes -
              activeOpenUnpaid
          ),
          activeBreak,
        }
      : null,
    todayMinutes,
    todayHours: Number((todayMinutes / 60).toFixed(2)),
    weekMinutes,
    weekHours: Number((weekMinutes / 60).toFixed(2)),
    weeklyHours: Number((weekMinutes / 60).toFixed(2)),
    hourlyRateCents: user.hourlyRateCents,
    isApproachingOvertime: weekMinutes / 60 >= 40,
    isOvertime: weekMinutes / 60 > CRA_2026.ONTARIO_OVERTIME_WEEKLY_HOURS,
  };
}

export async function clockIn(userId: string, notes?: string) {
  // Prevent duplicate clock-ins
  const existing = await prisma.shift.findFirst({
    where: {
      userId,
      status: { in: ['ACTIVE', 'ON_BREAK'] },
    },
  });
  if (existing) {
    throw new HttpError(
      409,
      `You are already clocked in to a shift started at ${existing.clockIn.toLocaleTimeString()}`,
      { activeShift: existing }
    );
  }

  const shift = await prisma.shift.create({
    data: {
      userId,
      clockIn: new Date(),
      status: 'ACTIVE',
      notes: notes?.trim() || null,
    },
    include: {
      user: { select: { name: true, employeeNumber: true } },
    },
  });

  await recordAudit({
    userId,
    actorName: shift.user.name,
    action: 'CLOCK_IN',
    details: `Employee ${shift.user.name} clocked in at ${shift.clockIn.toISOString()}`,
  });

  return shift;
}

export async function clockOut(
  userId: string,
  notes?: string,
  shiftData?: { id?: string; clockIn?: string | Date; breakMinutes?: number }
) {
  // 1. Try to find active or on-break shift for this user
  let shift = await prisma.shift.findFirst({
    where: {
      userId,
      status: { in: ['ACTIVE', 'ON_BREAK'] },
    },
    include: {
      breaks: true,
      user: { select: { name: true } },
    },
  });

  // 2. If no active shift found, check if shiftData.id exists in the database
  if (!shift && shiftData?.id) {
    const existingById = await prisma.shift.findUnique({
      where: { id: shiftData.id },
      include: {
        breaks: true,
        user: { select: { name: true } },
      },
    });
    if (existingById) {
      if (existingById.status === 'COMPLETED') {
        // Shift was already clocked out successfully (e.g. rapid double-click or stale state)
        return existingById;
      }
      shift = existingById;
    }
  }

  // 3. Fallback: if active shift was started on another container and not in DB yet
  if (!shift && shiftData?.clockIn) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (user) {
      try {
        if (shiftData.id && !shiftData.id.startsWith('local-') && !shiftData.id.startsWith('shift_')) {
          shift = await prisma.shift.upsert({
            where: { id: shiftData.id },
            update: {},
            create: {
              id: shiftData.id,
              userId,
              clockIn: new Date(shiftData.clockIn),
              status: 'ACTIVE',
              breakMinutes: shiftData.breakMinutes || 0,
              notes: notes?.trim() || null,
            },
            include: {
              breaks: true,
              user: { select: { name: true } },
            },
          });
        } else {
          shift = await prisma.shift.create({
            data: {
              userId,
              clockIn: new Date(shiftData.clockIn),
              status: 'ACTIVE',
              breakMinutes: shiftData.breakMinutes || 0,
              notes: notes?.trim() || null,
            },
            include: {
              breaks: true,
              user: { select: { name: true } },
            },
          });
        }
      } catch {
        // Fallback: if upsert/create had an ID collision, fetch the existing record
        if (shiftData.id) {
          shift = await prisma.shift.findUnique({
            where: { id: shiftData.id },
            include: {
              breaks: true,
              user: { select: { name: true } },
            },
          });
        }
      }
    }
  }

  if (!shift) {
    throw new HttpError(400, 'No active shift found. You must clock in before clocking out.');
  }

  if (shift.status === 'COMPLETED') {
    return shift;
  }

  const clockOutTime = new Date();

  // If employee is on break, close open break (only deduct unpaid meal breaks from payable hours)
  if (shift.status === 'ON_BREAK') {
    const openBreak = shift.breaks.find((b) => b.endTime === null);
    if (openBreak) {
      const dur = Math.max(1, Math.round((clockOutTime.getTime() - openBreak.startTime.getTime()) / 60000));
      await prisma.shiftBreak.update({
        where: { id: openBreak.id },
        data: { endTime: clockOutTime, durationMinutes: dur },
      });
      if (openBreak.type !== 'PAID_REST') {
        shift.breakMinutes += dur;
      }
    }
  }

  // Calculate payable seconds and minutes (ensuring every second worked counts)
  const grossSeconds = Math.max(0, Math.floor((clockOutTime.getTime() - shift.clockIn.getTime()) / 1000));
  const unpaidBreakSeconds = (shift.breakMinutes || 0) * 60;
  const netSeconds = Math.max(0, grossSeconds - unpaidBreakSeconds);
  const totalMinutes = netSeconds > 0 ? Math.max(1, Math.round(netSeconds / 60)) : 0;

  // Weekly overtime calculation (Ontario ESA: > 44 hours per week)
  const priorWeekMinutes = await getPriorWeeklyCompletedMinutes(userId, shift.clockIn, shift.id);
  const { regularMinutes, overtimeMinutes } = calculateShiftHours(totalMinutes, priorWeekMinutes);

  const updated = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      clockOut: clockOutTime,
      status: 'COMPLETED',
      breakMinutes: shift.breakMinutes,
      totalMinutes,
      regularMinutes,
      overtimeMinutes,
      notes: notes?.trim() || shift.notes,
    },
  });

  const pad = (n: number) => String(n).padStart(2, '0');
  const exactDuration = `${pad(Math.floor(netSeconds / 3600))}:${pad(Math.floor((netSeconds % 3600) / 60))}:${pad(netSeconds % 60)}`;
  const hoursDecimal = (netSeconds / 3600).toFixed(2);

  await recordAudit({
    userId,
    actorName: shift.user.name,
    action: 'CLOCK_OUT',
    details: `Employee ${shift.user.name} clocked out. Duration: ${exactDuration} (${hoursDecimal}h, Regular: ${(regularMinutes / 60).toFixed(2)}h, Overtime: ${(overtimeMinutes / 60).toFixed(2)}h)`,
  });

  if (overtimeMinutes > 0) {
    await notifyAdmins({
      type: 'OVERTIME_ALERT',
      title: 'Overtime Worked',
      message: `${shift.user.name} clocked out with ${(overtimeMinutes / 60).toFixed(2)}h overtime today.`,
      linkTab: 'admin:attendance',
      excludeUserId: userId,
    });
  }

  return updated;
}

export async function startBreak(userId: string, type = 'UNPAID_MEAL') {
  const shift = await prisma.shift.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { user: { select: { name: true } } },
  });
  if (!shift) {
    throw new HttpError(400, 'You must have an active shift to start a break.');
  }

  const brk = await prisma.shiftBreak.create({
    data: {
      shiftId: shift.id,
      startTime: new Date(),
      type,
    },
  });

  await prisma.shift.update({
    where: { id: shift.id },
    data: { status: 'ON_BREAK' },
  });

  await recordAudit({
    userId,
    actorName: shift.user.name,
    action: 'BREAK_START',
    details: `Employee ${shift.user.name} started ${type.toLowerCase().replace('_', ' ')} break`,
  });

  return brk;
}

export async function endBreak(userId: string) {
  const shift = await prisma.shift.findFirst({
    where: { userId, status: 'ON_BREAK' },
    include: {
      breaks: { where: { endTime: null }, orderBy: { startTime: 'desc' } },
      user: { select: { name: true } },
    },
  });
  if (!shift || !shift.breaks.length) {
    throw new HttpError(400, 'No active break found to end.');
  }

  const now = new Date();
  const openBreak = shift.breaks[0];
  const durationMinutes = Math.max(1, Math.round((now.getTime() - openBreak.startTime.getTime()) / 60000));

  await prisma.shiftBreak.update({
    where: { id: openBreak.id },
    data: { endTime: now, durationMinutes },
  });

  const isPaidBreak = openBreak.type === 'PAID_REST';
  const updatedShift = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: 'ACTIVE',
      ...(isPaidBreak ? {} : { breakMinutes: { increment: durationMinutes } }),
    },
  });

  await recordAudit({
    userId,
    actorName: shift.user.name,
    action: 'BREAK_END',
    details: `Employee ${shift.user.name} ended ${isPaidBreak ? 'paid rest ' : 'unpaid meal '}break after ${durationMinutes} minutes`,
  });

  return updatedShift;
}

export async function getMyShifts(userId: string, options: { startDate?: string; endDate?: string; limit?: number }) {
  const where: any = { userId };
  if (options.startDate || options.endDate) {
    where.clockIn = {};
    if (options.startDate) where.clockIn.gte = new Date(options.startDate);
    if (options.endDate) where.clockIn.lte = new Date(options.endDate);
  }

  const shifts = await prisma.shift.findMany({
    where,
    include: {
      breaks: { orderBy: { startTime: 'asc' } },
    },
    orderBy: { clockIn: 'desc' },
    take: options.limit || 50,
  });

  return shifts.map((s) => {
    const startMs = new Date(s.clockIn).getTime();
    const endMs = s.clockOut ? new Date(s.clockOut).getTime() : Date.now();
    const unpaidSec = (s.breakMinutes || 0) * 60;
    const workedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000) - unpaidSec);
    const hrs = Math.floor(workedSeconds / 3600);
    const mins = Math.floor((workedSeconds % 3600) / 60);
    const secs = workedSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      ...s,
      totalSeconds: workedSeconds,
      durationFormatted: `${pad(hrs)}:${pad(mins)}:${pad(secs)}`,
      totalHours: Number((workedSeconds / 3600).toFixed(2)),
      regularHours: Number((s.regularMinutes / 60).toFixed(2)),
      overtimeHours: Number((s.overtimeMinutes / 60).toFixed(2)),
      breakHours: Number((s.breakMinutes / 60).toFixed(2)),
    };
  });
}

export async function getMyPaystubs(userId: string) {
  const paystubs = await prisma.paystub.findMany({
    where: { userId },
    include: {
      payrollPeriod: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return paystubs;
}

export async function getMyPaystub(userId: string, paystubId: string, isAdmin = false) {
  const paystub = await prisma.paystub.findUnique({
    where: { id: paystubId },
    include: {
      payrollPeriod: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          employeeNumber: true,
          hourlyRateCents: true,
          sin: true,
        },
      },
    },
  });

  if (!paystub) throw new HttpError(404, 'Paystub not found');
  if (!isAdmin && paystub.userId !== userId) {
    throw new HttpError(403, 'Unauthorized access to confidential paystub');
  }

  return paystub;
}

// ---------------------------------------------------------------------------
// Admin Time & Attendance Dashboard Operations
// ---------------------------------------------------------------------------

export async function getAttendanceOverview(filters: {
  userId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}) {
  const where: any = {};
  if (filters.userId && filters.userId !== 'ALL') where.userId = filters.userId;
  if (filters.status && filters.status !== 'ALL') {
    if (filters.status === 'MODIFIED') {
      where.editedByAdminId = { not: null };
    } else {
      where.status = filters.status;
    }
  }

  if (filters.startDate || filters.endDate) {
    where.clockIn = {};
    if (filters.startDate) where.clockIn.gte = new Date(filters.startDate);
    if (filters.endDate) where.clockIn.lte = new Date(filters.endDate);
  }

  const [shifts, users, currentlyClockedInCount] = await Promise.all([
    prisma.shift.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, employeeNumber: true, role: true, bench: true } },
        breaks: { orderBy: { startTime: 'asc' } },
      },
      orderBy: { clockIn: 'desc' },
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, employeeNumber: true, role: true, hourlyRateCents: true },
      orderBy: { name: 'asc' },
    }),
    prisma.shift.count({
      where: { status: { in: ['ACTIVE', 'ON_BREAK'] } },
    }),
  ]);

  const totalMinutes = shifts.reduce((acc, s) => acc + s.totalMinutes, 0);
  const regularMinutes = shifts.reduce((acc, s) => acc + s.regularMinutes, 0);
  const overtimeMinutes = shifts.reduce((acc, s) => acc + s.overtimeMinutes, 0);

  return {
    shifts: shifts.map((s) => {
      const startMs = new Date(s.clockIn).getTime();
      const endMs = s.clockOut ? new Date(s.clockOut).getTime() : Date.now();
      const unpaidSec = (s.breakMinutes || 0) * 60;
      const workedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000) - unpaidSec);
      const hrs = Math.floor(workedSeconds / 3600);
      const mins = Math.floor((workedSeconds % 3600) / 60);
      const secs = workedSeconds % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        ...s,
        totalSeconds: workedSeconds,
        durationFormatted: `${pad(hrs)}:${pad(mins)}:${pad(secs)}`,
        totalHours: Number((workedSeconds / 3600).toFixed(2)),
        regularHours: Number((s.regularMinutes / 60).toFixed(2)),
        overtimeHours: Number((s.overtimeMinutes / 60).toFixed(2)),
        breakHours: Number((s.breakMinutes / 60).toFixed(2)),
      };
    }),
    users,
    metrics: {
      totalShifts: shifts.length,
      currentlyClockedIn: currentlyClockedInCount,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
      regularHours: Number((regularMinutes / 60).toFixed(2)),
      overtimeHours: Number((overtimeMinutes / 60).toFixed(2)),
    },
  };
}

export async function getLiveRoster() {
  const now = new Date();
  const [activeUsers, activeShifts] = await Promise.all([
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, employeeNumber: true, role: true, bench: true },
      orderBy: { name: 'asc' },
    }),
    prisma.shift.findMany({
      where: { status: { in: ['ACTIVE', 'ON_BREAK'] } },
      include: {
        user: {
          select: { id: true, name: true, employeeNumber: true, role: true, bench: true },
        },
        breaks: { where: { endTime: null } },
      },
      orderBy: { clockIn: 'asc' },
    }),
  ]);

  const shiftByUserId = new Map<string, (typeof activeShifts)[number]>();
  for (const s of activeShifts) {
    if (!shiftByUserId.has(s.userId)) {
      shiftByUserId.set(s.userId, s);
    }
  }

  return activeUsers
    .map((u) => {
      const s = shiftByUserId.get(u.id);
      if (s) {
        const elapsedMinutes = Math.max(0, Math.round((now.getTime() - s.clockIn.getTime()) / 60000));
        const openUnpaid = getOpenUnpaidBreakMinutes(s.breaks, now);
        const activeWorkedMinutes = Math.max(0, elapsedMinutes - s.breakMinutes - openUnpaid);
        return {
          id: u.id,
          name: u.name,
          employeeNumber: u.employeeNumber,
          role: u.role,
          bench: u.bench,
          isClockedIn: true,
          isOnBreak: s.status === 'ON_BREAK',
          shiftId: s.id,
          user: s.user,
          clockIn: s.clockIn,
          status: s.status,
          activeBreak: s.breaks[0] || null,
          breakMinutes: s.breakMinutes + openUnpaid,
          activeWorkedMinutes,
          activeWorkedHours: Number((activeWorkedMinutes / 60).toFixed(2)),
        };
      }
      return {
        id: u.id,
        name: u.name,
        employeeNumber: u.employeeNumber,
        role: u.role,
        bench: u.bench,
        isClockedIn: false,
        isOnBreak: false,
        shiftId: null,
        user: u,
        clockIn: null,
        status: 'CLOCKED_OUT',
        activeBreak: null,
        breakMinutes: 0,
        activeWorkedMinutes: 0,
        activeWorkedHours: 0,
      };
    })
    .sort((a, b) => Number(b.isClockedIn) - Number(a.isClockedIn));
}

export async function manualAddShift(
  data: {
    userId: string;
    clockIn: string;
    clockOut: string;
    breakMinutes?: number;
    notes?: string;
    reason: string;
  },
  adminUser: { id: string; name: string }
) {
  if (!data.reason?.trim()) {
    throw new HttpError(400, 'A modification reason is required for manual shift addition.');
  }

  const start = new Date(data.clockIn);
  const end = new Date(data.clockOut);
  if (end <= start) {
    throw new HttpError(400, 'Clock out time must be later than clock in time.');
  }

  const breakMins = Math.max(0, data.breakMinutes || 0);
  const grossMins = Math.round((end.getTime() - start.getTime()) / 60000);
  const totalMinutes = Math.max(0, grossMins - breakMins);

  // Use Ontario ESA 44-hour weekly overtime calculation
  const priorWeekMinutes = await getPriorWeeklyCompletedMinutes(data.userId, start);
  const { regularMinutes, overtimeMinutes } = calculateShiftHours(totalMinutes, priorWeekMinutes);

  const shift = await prisma.shift.create({
    data: {
      userId: data.userId,
      clockIn: start,
      clockOut: end,
      status: 'COMPLETED',
      breakMinutes: breakMins,
      totalMinutes,
      regularMinutes,
      overtimeMinutes,
      notes: data.notes?.trim() || null,
      editedByAdminId: adminUser.id,
      editedAt: new Date(),
      editReason: `Manual Shift Addition: ${data.reason.trim()}`,
      originalClockIn: start,
      originalClockOut: end,
    },
    include: {
      user: { select: { name: true } },
    },
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'SHIFT_MANUAL_ADD',
    details: `Admin ${adminUser.name} manually added shift for ${shift.user.name} (${(totalMinutes / 60).toFixed(2)}h). Reason: ${data.reason.trim()}`,
  });

  return shift;
}

export async function manualEditShift(
  shiftId: string,
  data: {
    clockIn: string;
    clockOut?: string;
    breakMinutes?: number;
    notes?: string;
    reason: string;
  },
  adminUser: { id: string; name: string }
) {
  if (!data.reason?.trim()) {
    throw new HttpError(400, 'A modification reason is required to edit attendance records.');
  }

  const existing = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { user: { select: { name: true } } },
  });
  if (!existing) throw new HttpError(404, 'Shift not found');

  const newClockIn = new Date(data.clockIn);
  const newClockOut = data.clockOut ? new Date(data.clockOut) : existing.clockOut;

  let totalMinutes = existing.totalMinutes;
  let regularMinutes = existing.regularMinutes;
  let overtimeMinutes = existing.overtimeMinutes;
  const breakMinutes = data.breakMinutes !== undefined ? Math.max(0, data.breakMinutes) : existing.breakMinutes;

  if (newClockOut) {
    if (newClockOut <= newClockIn) {
      throw new HttpError(400, 'Clock out time must be later than clock in time.');
    }
    const grossMins = Math.round((newClockOut.getTime() - newClockIn.getTime()) / 60000);
    totalMinutes = Math.max(0, grossMins - breakMinutes);
    const priorWeekMinutes = await getPriorWeeklyCompletedMinutes(existing.userId, newClockIn, shiftId);
    const split = calculateShiftHours(totalMinutes, priorWeekMinutes);
    regularMinutes = split.regularMinutes;
    overtimeMinutes = split.overtimeMinutes;
  }

  const updated = await prisma.shift.update({
    where: { id: shiftId },
    data: {
      clockIn: newClockIn,
      clockOut: newClockOut,
      breakMinutes,
      totalMinutes,
      regularMinutes,
      overtimeMinutes,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      editedByAdminId: adminUser.id,
      editedAt: new Date(),
      editReason: data.reason.trim(),
      originalClockIn: existing.originalClockIn || existing.clockIn,
      originalClockOut: existing.originalClockOut || existing.clockOut,
    },
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'SHIFT_MODIFIED',
    details: `Admin ${adminUser.name} edited shift for ${existing.user.name}. Reason: ${data.reason.trim()}`,
  });

  return updated;
}

export async function deleteShift(
  shiftId: string,
  adminUser: { id: string; name: string },
  reason?: string
) {
  const existing = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { user: { select: { name: true } } },
  });
  if (!existing) throw new HttpError(404, 'Shift not found');

  await prisma.shift.delete({ where: { id: shiftId } });

  const reasonSuffix = reason?.trim() ? ` Reason: ${reason.trim()}` : '';
  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'SHIFT_DELETED',
    details: `Admin ${adminUser.name} deleted shift #${shiftId} for ${existing.user.name}.${reasonSuffix}`,
  });

  return { success: true };
}

export async function exportAttendanceCsv(filters: {
  userId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const where: any = {};
  if (filters.userId && filters.userId !== 'ALL') where.userId = filters.userId;
  if (filters.startDate || filters.endDate) {
    where.clockIn = {};
    if (filters.startDate) where.clockIn.gte = new Date(filters.startDate);
    if (filters.endDate) where.clockIn.lte = new Date(filters.endDate);
  }

  const shifts = await prisma.shift.findMany({
    where,
    include: { user: true },
    orderBy: { clockIn: 'desc' },
  });

  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    [
      'Shift ID',
      'Employee Name',
      'Employee Number',
      'Clock In',
      'Clock Out',
      'Status',
      'Break (Minutes)',
      'Total Hours',
      'Regular Hours',
      'Overtime Hours',
      'Edited By Admin',
      'Edit Reason',
      'Original Clock In',
      'Original Clock Out',
    ],
  ];

  for (const s of shifts) {
    rows.push([
      s.id,
      s.user.name,
      s.user.employeeNumber || '',
      s.clockIn.toISOString(),
      s.clockOut ? s.clockOut.toISOString() : 'Active Shift',
      s.status,
      String(s.breakMinutes),
      (s.totalMinutes / 60).toFixed(2),
      (s.regularMinutes / 60).toFixed(2),
      (s.overtimeMinutes / 60).toFixed(2),
      s.editedByAdminId ? 'Yes' : 'No',
      s.editReason || '',
      s.originalClockIn ? s.originalClockIn.toISOString() : '',
      s.originalClockOut ? s.originalClockOut.toISOString() : '',
    ]);
  }

  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

// ---------------------------------------------------------------------------
// Admin Wage & Compensation Operations
// ---------------------------------------------------------------------------

export async function getUserWageHistory(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      employeeNumber: true,
      hourlyRateCents: true,
      overtimeRateCents: true,
      vacationPayPct: true,
      td1FederalClaimCents: true,
      td1OntarioClaimCents: true,
    },
  });
  if (!user) throw new HttpError(404, 'User not found');

  const history = await prisma.wageRate.findMany({
    where: { userId },
    orderBy: { effectiveDate: 'desc' },
  });

  return { user, history };
}

export async function updateUserWage(
  userId: string,
  data: {
    hourlyRateCents: number;
    overtimeRateCents?: number;
    effectiveDate?: string;
    reason?: string;
    vacationPayPct?: number;
  },
  adminUser: { id: string; name: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');

  const hourly = Math.max(0, data.hourlyRateCents);
  const overtime = data.overtimeRateCents && data.overtimeRateCents > 0
    ? data.overtimeRateCents
    : Math.round(hourly * 1.5);
  const effective = data.effectiveDate ? new Date(data.effectiveDate) : new Date();

  // Create historical record
  const wageRecord = await prisma.wageRate.create({
    data: {
      userId,
      hourlyRateCents: hourly,
      overtimeRateCents: overtime,
      effectiveDate: effective,
      reason: data.reason?.trim() || 'Wage update',
      createdById: adminUser.id,
    },
  });

  // Update active rate on User only when effective date has arrived
  const shouldActivateNow = effective.getTime() <= Date.now() + 60_000;
  const userUpdateData: any = {};
  if (shouldActivateNow) {
    userUpdateData.hourlyRateCents = hourly;
    userUpdateData.overtimeRateCents = overtime;
  }
  if (data.vacationPayPct !== undefined) {
    userUpdateData.vacationPayPct = data.vacationPayPct;
  }

  const updatedUser = Object.keys(userUpdateData).length
    ? await prisma.user.update({ where: { id: userId }, data: userUpdateData })
    : user;

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'WAGE_UPDATE',
    details: `Admin ${adminUser.name} updated wage for ${user.name} to $${(hourly / 100).toFixed(2)}/hr (effective ${effective.toISOString().slice(0, 10)}). Reason: ${data.reason || 'Not specified'}`,
  });

  return { wageRecord, user: updatedUser };
}

// ---------------------------------------------------------------------------
// Admin Payroll Management Operations
// ---------------------------------------------------------------------------

export async function getPayrollDashboardOverview() {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(startOfDay.getTime() - dayOfWeek * 86_400_000);

  const [shiftsThisWeek, clockedInCount, periods, recentPaystubs, activeEmployees] = await Promise.all([
    prisma.shift.findMany({
      where: { clockIn: { gte: weekStart } },
      include: { user: true },
    }),
    prisma.shift.count({
      where: { status: { in: ['ACTIVE', 'ON_BREAK'] } },
    }),
    prisma.payrollPeriod.findMany({
      orderBy: { startDate: 'desc' },
      take: 6,
    }),
    prisma.paystub.findMany({
      include: { user: { select: { name: true, employeeNumber: true } }, payrollPeriod: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, hourlyRateCents: true, overtimeRateCents: true },
    }),
  ]);

  const totalMinutes = shiftsThisWeek.reduce((s, x) => s + x.totalMinutes, 0);
  const regularMinutes = shiftsThisWeek.reduce((s, x) => s + x.regularMinutes, 0);
  const overtimeMinutes = shiftsThisWeek.reduce((s, x) => s + x.overtimeMinutes, 0);

  // Approximate gross run-rate for this week (including employee vacation pay %)
  let estimatedGrossCents = 0;
  for (const s of shiftsThisWeek) {
    const rate = s.user.hourlyRateCents || 2200;
    const otRate = s.user.overtimeRateCents || Math.round(rate * 1.5);
    const vacBps = s.user.vacationPayPct ?? 400;
    const regPay = Math.round((s.regularMinutes / 60) * rate);
    const otPay = Math.round((s.overtimeMinutes / 60) * otRate);
    const base = regPay + otPay;
    const vac = Math.round((base * vacBps) / 10000);
    estimatedGrossCents += base + vac;
  }

  // Estimated statutory deductions (~24% average for Canadian entry-to-mid retail/tech bracket)
  const estimatedDeductionsCents = Math.round(estimatedGrossCents * 0.2395);
  const estimatedNetCents = Math.max(0, estimatedGrossCents - estimatedDeductionsCents);

  const regularHoursThisWeek = Number((regularMinutes / 60).toFixed(2));
  const overtimeHoursThisWeek = Number((overtimeMinutes / 60).toFixed(2));
  const totalHoursThisWeek = Number((totalMinutes / 60).toFixed(2));

  return {
    metrics: {
      totalHoursThisWeek,
      regularHoursThisWeek,
      overtimeHoursThisWeek,
      estimatedGrossCents,
      estimatedDeductionsCents,
      estimatedNetCents,
      clockedInCount,
      activeEmployeeCount: activeEmployees.length,
    },
    kpis: {
      totalHours: totalHoursThisWeek,
      totalRegularHours: regularHoursThisWeek,
      totalOvertimeHours: overtimeHoursThisWeek,
      estimatedGrossPayrollCents: estimatedGrossCents,
      estimatedDeductionsCents,
      estimatedNetPayrollCents: estimatedNetCents,
      clockedInCount,
      activeEmployeeCount: activeEmployees.length,
    },
    recentPeriods: periods,
    recentPaystubs,
  };
}

export async function calculatePeriodPayroll(options: {
  startDate: string;
  endDate: string;
  periodType: 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY' | 'CUSTOM';
  payDate?: string;
}) {
  const start = new Date(options.startDate);
  const end = new Date(options.endDate);
  // Ensure start is at 00:00:00 and end is at 23:59:59.999
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const employees = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    include: {
      wageRates: { orderBy: { effectiveDate: 'desc' } },
    },
    orderBy: { name: 'asc' },
  });

  const shifts = await prisma.shift.findMany({
    where: {
      clockIn: { gte: start, lte: end },
      status: 'COMPLETED',
    },
  });

  const daysInPeriod = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

  const employeePaystubs = [];

  for (const emp of employees) {
    const empShifts = shifts.filter((s) => s.userId === emp.id);
    const regMinutes = empShifts.reduce((s, x) => s + x.regularMinutes, 0);
    const otMinutes = empShifts.reduce((s, x) => s + x.overtimeMinutes, 0);

    const regularHours = Number((regMinutes / 60).toFixed(2));
    const overtimeHours = Number((otMinutes / 60).toFixed(2));

    // Resolve wage rate effective as of period start (prevents retroactive alteration)
    const effectiveWage = emp.wageRates.find((w) => w.effectiveDate <= end) || null;
    const hourlyRateCents = effectiveWage ? effectiveWage.hourlyRateCents : emp.hourlyRateCents;
    const overtimeRateCents = effectiveWage
      ? effectiveWage.overtimeRateCents
      : (emp.overtimeRateCents || Math.round(hourlyRateCents * 1.5));

    const calc = calculatePayroll({
      regularHours,
      overtimeHours,
      periodType: options.periodType,
      daysInPeriod,
      employee: {
        hourlyRateCents,
        overtimeRateCents,
        vacationPayPct: emp.vacationPayPct,
        td1FederalClaimCents: emp.td1FederalClaimCents,
        td1OntarioClaimCents: emp.td1OntarioClaimCents,
      },
    });

    const userInfo = {
      id: emp.id,
      name: emp.name,
      employeeNumber: emp.employeeNumber,
      email: emp.email,
      role: emp.role,
    };

    employeePaystubs.push({
      userId: emp.id,
      user: userInfo,
      employee: userInfo,
      ...calc,
    });
  }

  const totalGrossCents = employeePaystubs.reduce((s, p) => s + p.grossPayCents, 0);
  const totalDeductionsCents = employeePaystubs.reduce((s, p) => s + p.totalDeductionsCents, 0);
  const totalNetCents = employeePaystubs.reduce((s, p) => s + p.netPayCents, 0);
  const totalHours = employeePaystubs.reduce((s, p) => s + p.regularHours + p.overtimeHours, 0);

  const periodPayDate = options.payDate || new Date(end.getTime() + 5 * 86_400_000).toISOString();

  return {
    periodType: options.periodType,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    payDate: periodPayDate,
    period: {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      payDate: periodPayDate,
      periodType: options.periodType,
    },
    daysInPeriod,
    employeePaystubs,
    paystubs: employeePaystubs,
    summary: {
      totalEmployees: employeePaystubs.length,
      totalHours: Number(totalHours.toFixed(2)),
      totalGrossCents,
      totalDeductionsCents,
      totalNetCents,
    },
  };
}

export async function createPayrollPeriod(
  data: {
    startDate: string;
    endDate: string;
    payDate: string;
    periodType?: string;
    notes?: string;
    paystubs: any[];
  },
  adminUser: { id: string; name: string }
) {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  const pay = new Date(data.payDate);

  // Find next period sequence number safely (max + 1 so deletions never collide)
  const lastPeriod = await prisma.payrollPeriod.findFirst({
    orderBy: { periodNumber: 'desc' },
    select: { periodNumber: true },
  });
  const periodNumber = (lastPeriod?.periodNumber || 0) + 1;

  // Deduplicate employee paystubs within the same payroll period
  const seenUserIds = new Set<string>();
  const uniquePaystubs: any[] = [];
  for (const p of data.paystubs || []) {
    if (p.userId && !seenUserIds.has(p.userId)) {
      seenUserIds.add(p.userId);
      uniquePaystubs.push(p);
    }
  }

  const totalGrossCents = uniquePaystubs.reduce((s, p) => s + (p.grossPayCents || 0), 0);
  const totalDeductionsCents = uniquePaystubs.reduce((s, p) => s + (p.totalDeductionsCents || 0), 0);
  const totalNetCents = uniquePaystubs.reduce((s, p) => s + (p.netPayCents || 0), 0);

  const period = await prisma.$transaction(async (tx) => {
    const createdPeriod = await tx.payrollPeriod.create({
      data: {
        periodNumber,
        periodType: data.periodType || 'BI_WEEKLY',
        startDate: start,
        endDate: end,
        payDate: pay,
        status: 'DRAFT',
        totalGrossCents,
        totalDeductionsCents,
        totalNetCents,
        notes: data.notes?.trim() || null,
      },
    });

    for (const p of uniquePaystubs) {
      await tx.paystub.create({
        data: {
          payrollPeriodId: createdPeriod.id,
          userId: p.userId,
          regularHours: p.regularHours || 0,
          overtimeHours: p.overtimeHours || 0,
          hourlyRateCents: p.hourlyRateCents || 2200,
          overtimeRateCents: p.overtimeRateCents || Math.round((p.hourlyRateCents || 2200) * 1.5),
          regularPayCents: p.regularPayCents || 0,
          overtimePayCents: p.overtimePayCents || 0,
          bonusCents: p.bonusCents || 0,
          vacationPayCents: p.vacationPayCents || 0,
          grossPayCents: p.grossPayCents || 0,
          cppCents: p.cppCents || 0,
          eiCents: p.eiCents || 0,
          incomeTaxCents: p.incomeTaxCents || 0,
          otherDeductionsCents: p.otherDeductionsCents || 0,
          totalDeductionsCents: p.totalDeductionsCents || 0,
          netPayCents: p.netPayCents || 0,
          status: 'DRAFT',
          notes: p.notes?.trim() || null,
        },
      });
    }

    return createdPeriod;
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'PAYROLL_PERIOD_CREATED',
    details: `Admin ${adminUser.name} created Payroll Period #${period.periodNumber} (${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}) with ${data.paystubs.length} paystubs`,
  });

  return getPayrollPeriod(period.id);
}

export async function listPayrollPeriods(limit = 50) {
  return prisma.payrollPeriod.findMany({
    orderBy: { startDate: 'desc' },
    take: limit,
    include: {
      _count: { select: { paystubs: true } },
    },
  });
}

export async function getPayrollPeriod(periodId: string) {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: {
      paystubs: {
        include: {
          user: {
            select: { id: true, name: true, employeeNumber: true, email: true, role: true, bench: true },
          },
        },
        orderBy: { user: { name: 'asc' } },
      },
    },
  });
  if (!period) throw new HttpError(404, 'Payroll period not found');
  return period;
}

export async function updatePaystubDraft(
  paystubId: string,
  data: {
    regularHours?: number;
    overtimeHours?: number;
    bonusCents?: number;
    otherDeductionsCents?: number;
    notes?: string;
  },
  adminUser: { id: string; name: string }
) {
  const paystub = await prisma.paystub.findUnique({
    where: { id: paystubId },
    include: { payrollPeriod: true, user: true },
  });
  if (!paystub) throw new HttpError(404, 'Paystub not found');

  // Prevent modifying finalized periods
  if (paystub.payrollPeriod.status === 'FINALIZED') {
    throw new HttpError(
      403,
      'This payroll period has been FINALIZED and locked. Adjustments must be made via a supplementary adjustment.'
    );
  }

  const regularHours = data.regularHours !== undefined ? Math.max(0, data.regularHours) : paystub.regularHours;
  const overtimeHours = data.overtimeHours !== undefined ? Math.max(0, data.overtimeHours) : paystub.overtimeHours;
  const bonusCents = data.bonusCents !== undefined ? Math.max(0, data.bonusCents) : paystub.bonusCents;
  const otherDeductionsCents =
    data.otherDeductionsCents !== undefined ? Math.max(0, data.otherDeductionsCents) : paystub.otherDeductionsCents;

  const calc = calculatePayroll({
    regularHours,
    overtimeHours,
    bonusCents,
    otherDeductionsCents,
    periodType: paystub.payrollPeriod.periodType as any,
    employee: {
      hourlyRateCents: paystub.hourlyRateCents,
      overtimeRateCents: paystub.overtimeRateCents,
      vacationPayPct: paystub.user.vacationPayPct,
      td1FederalClaimCents: paystub.user.td1FederalClaimCents,
      td1OntarioClaimCents: paystub.user.td1OntarioClaimCents,
    },
  });

  const updatedPaystub = await prisma.$transaction(async (tx) => {
    const updated = await tx.paystub.update({
      where: { id: paystubId },
      data: {
        regularHours: calc.regularHours,
        overtimeHours: calc.overtimeHours,
        regularPayCents: calc.regularPayCents,
        overtimePayCents: calc.overtimePayCents,
        bonusCents: calc.bonusCents,
        vacationPayCents: calc.vacationPayCents,
        grossPayCents: calc.grossPayCents,
        cppCents: calc.cppCents,
        eiCents: calc.eiCents,
        incomeTaxCents: calc.incomeTaxCents,
        otherDeductionsCents: calc.otherDeductionsCents,
        totalDeductionsCents: calc.totalDeductionsCents,
        netPayCents: calc.netPayCents,
        notes: data.notes !== undefined ? data.notes : paystub.notes,
      },
    });

    // Recompute parent period totals
    const allPaystubs = await tx.paystub.findMany({ where: { payrollPeriodId: paystub.payrollPeriodId } });
    const totalGrossCents = allPaystubs.reduce((s, p) => s + p.grossPayCents, 0);
    const totalDeductionsCents = allPaystubs.reduce((s, p) => s + p.totalDeductionsCents, 0);
    const totalNetCents = allPaystubs.reduce((s, p) => s + p.netPayCents, 0);

    await tx.payrollPeriod.update({
      where: { id: paystub.payrollPeriodId },
      data: { totalGrossCents, totalDeductionsCents, totalNetCents },
    });

    return updated;
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'PAYSTUB_MODIFIED',
    details: `Admin ${adminUser.name} updated paystub #${paystubId} for ${paystub.user.name} (Gross: $${(calc.grossPayCents / 100).toFixed(2)}, Net: $${(calc.netPayCents / 100).toFixed(2)})`,
  });

  return updatedPaystub;
}

export async function finalizePayrollPeriod(periodId: string, adminUser: { id: string; name: string }) {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { paystubs: true },
  });
  if (!period) throw new HttpError(404, 'Payroll period not found');
  if (period.status === 'FINALIZED') {
    throw new HttpError(400, 'This payroll period is already finalized and locked.');
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: 'FINALIZED',
        finalizedAt: now,
        finalizedById: adminUser.id,
      },
    });

    await tx.paystub.updateMany({
      where: { payrollPeriodId: periodId },
      data: {
        status: 'APPROVED',
        paidAt: period.payDate,
      },
    });
  });

  await recordAudit({
    userId: adminUser.id,
    actorName: adminUser.name,
    action: 'PAYROLL_FINALIZED',
    details: `Admin ${adminUser.name} finalized & locked Payroll Period #${period.periodNumber}. Gross: $${(period.totalGrossCents / 100).toFixed(2)}, Net: $${(period.totalNetCents / 100).toFixed(2)}`,
  });

  for (const stub of period.paystubs) {
    await createNotification({
      userId: stub.userId,
      type: 'PAYSTUB_READY',
      title: 'New Paystub Available',
      message: `Pay Period #${period.periodNumber} is finalized. Net Pay: $${(stub.netPayCents / 100).toFixed(2)}.`,
      linkTab: 'timeclock:paystubs',
    });
  }

  return getPayrollPeriod(periodId);
}

export async function exportPayrollCsv(periodId: string) {
  const period = await getPayrollPeriod(periodId);
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const rows = [
    [
      'Period #',
      'Period Start',
      'Period End',
      'Pay Date',
      'Employee Name',
      'Employee Number',
      'Hourly Rate ($)',
      'Regular Hours',
      'Overtime Hours',
      'Regular Pay ($)',
      'Overtime Pay ($)',
      'Bonus ($)',
      'Vacation Pay ($)',
      'Total Gross ($)',
      'CPP ($)',
      'EI ($)',
      'Income Tax ($)',
      'Other Deductions ($)',
      'Total Deductions ($)',
      'Net Pay ($)',
      'Status',
    ],
  ];

  for (const p of period.paystubs) {
    rows.push([
      String(period.periodNumber),
      period.startDate.toISOString().slice(0, 10),
      period.endDate.toISOString().slice(0, 10),
      period.payDate.toISOString().slice(0, 10),
      p.user.name,
      p.user.employeeNumber || '',
      (p.hourlyRateCents / 100).toFixed(2),
      p.regularHours.toFixed(2),
      p.overtimeHours.toFixed(2),
      (p.regularPayCents / 100).toFixed(2),
      (p.overtimePayCents / 100).toFixed(2),
      (p.bonusCents / 100).toFixed(2),
      (p.vacationPayCents / 100).toFixed(2),
      (p.grossPayCents / 100).toFixed(2),
      (p.cppCents / 100).toFixed(2),
      (p.eiCents / 100).toFixed(2),
      (p.incomeTaxCents / 100).toFixed(2),
      (p.otherDeductionsCents / 100).toFixed(2),
      (p.totalDeductionsCents / 100).toFixed(2),
      (p.netPayCents / 100).toFixed(2),
      p.status,
    ]);
  }

  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

/**
 * Generate standard CRA compliant Canadian Paystub HTML for printing & PDF export
 */
export async function buildPaystubHtml(paystubId: string, isAdmin = false, currentUserId?: string) {
  const paystub = await prisma.paystub.findUnique({
    where: { id: paystubId },
    include: {
      payrollPeriod: true,
      user: true,
    },
  });
  if (!paystub) throw new HttpError(404, 'Paystub not found');
  if (!isAdmin && currentUserId && paystub.userId !== currentUserId) {
    throw new HttpError(403, 'Unauthorized access to paystub');
  }

  const settings = await getSettings();
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Paystub - ${paystub.user.name} - Period #${paystub.payrollPeriod.periodNumber}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.4; padding: 20px; font-size: 13px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 16px; }
    .company h1 { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
    .company p { margin: 2px 0; font-size: 11px; color: #64748b; }
    .title { text-align: right; }
    .title h2 { margin: 0; font-size: 18px; font-weight: 700; color: #4f46e5; }
    .title p { margin: 2px 0; font-size: 11px; color: #64748b; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
    .meta-col p { margin: 4px 0; font-size: 12px; }
    .meta-col strong { color: #0f172a; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 700; color: #475569; border-bottom: 1px solid #cbd5e1; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }
    .total-box { background: #eef2ff; border: 1.5px solid #c7d2fe; border-radius: 8px; padding: 16px; text-align: center; margin-top: 20px; }
    .total-box h3 { margin: 0; font-size: 14px; color: #3730a3; text-transform: uppercase; letter-spacing: 0.5px; }
    .total-box .net-amount { font-size: 28px; font-weight: 800; color: #4338ca; margin: 4px 0; font-family: monospace; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">
      <h1>${settings.shopName || 'Faso Fix POS'}</h1>
      <p>${settings.address || 'Ontario, Canada'}</p>
      <p>Tel: ${settings.phone || '647-740-0566'} • Email: ${settings.email || 'support@fasofix.ca'}</p>
    </div>
    <div class="title">
      <h2>EMPLOYEE EARNINGS STATEMENT</h2>
      <p>Period #${paystub.payrollPeriod.periodNumber} • Status: ${paystub.status}</p>
      <p>Issued: ${paystub.payrollPeriod.payDate.toISOString().slice(0, 10)}</p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-col">
      <p><strong>Employee Name:</strong> ${paystub.user.name}</p>
      <p><strong>Employee ID:</strong> ${paystub.user.employeeNumber || 'EMP-' + paystub.user.id.slice(0, 6)}</p>
      <p><strong>Email:</strong> ${paystub.user.email}</p>
      <p><strong>Hourly Rate:</strong> ${money(paystub.hourlyRateCents)}/hr</p>
    </div>
    <div class="meta-col">
      <p><strong>Pay Period:</strong> ${paystub.payrollPeriod.startDate.toISOString().slice(0, 10)} to ${paystub.payrollPeriod.endDate.toISOString().slice(0, 10)}</p>
      <p><strong>Payment Date:</strong> ${paystub.payrollPeriod.payDate.toISOString().slice(0, 10)}</p>
      <p><strong>Payment Method:</strong> ${paystub.paymentMethod.replace(/_/g, ' ')}</p>
      <p><strong>Jurisdiction:</strong> Ontario (CRA T4127 Compliant)</p>
    </div>
  </div>

  <div class="summary-grid">
    <!-- Earnings Column -->
    <div>
      <h4 style="margin: 0 0 8px 0; color: #1e293b;">EARNINGS BREAKDOWN</h4>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Hours</th>
            <th class="text-right">Rate</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Regular Hours</td>
            <td class="text-right">${paystub.regularHours.toFixed(2)}</td>
            <td class="text-right">${money(paystub.hourlyRateCents)}</td>
            <td class="text-right">${money(paystub.regularPayCents)}</td>
          </tr>
          ${paystub.overtimeHours > 0 ? `
          <tr>
            <td>Overtime Hours (1.5x)</td>
            <td class="text-right">${paystub.overtimeHours.toFixed(2)}</td>
            <td class="text-right">${money(paystub.overtimeRateCents)}</td>
            <td class="text-right">${money(paystub.overtimePayCents)}</td>
          </tr>
          ` : ''}
          ${paystub.bonusCents > 0 ? `
          <tr>
            <td>Bonus / Commissions</td>
            <td class="text-right">—</td>
            <td class="text-right">—</td>
            <td class="text-right">${money(paystub.bonusCents)}</td>
          </tr>
          ` : ''}
          <tr>
            <td>Vacation Pay (4% ON Statutory)</td>
            <td class="text-right">—</td>
            <td class="text-right">4.0%</td>
            <td class="text-right">${money(paystub.vacationPayCents)}</td>
          </tr>
          <tr style="font-weight: 700; background: #f8fafc;">
            <td colspan="3">TOTAL GROSS PAY</td>
            <td class="text-right" style="color: #4f46e5;">${money(paystub.grossPayCents)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Deductions Column -->
    <div>
      <h4 style="margin: 0 0 8px 0; color: #1e293b;">STATUTORY DEDUCTIONS</h4>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Type</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Canada Pension Plan (CPP)</td>
            <td class="text-right">Statutory (5.95%)</td>
            <td class="text-right">${money(paystub.cppCents)}</td>
          </tr>
          <tr>
            <td>Employment Insurance (EI)</td>
            <td class="text-right">Statutory (1.63%)</td>
            <td class="text-right">${money(paystub.eiCents)}</td>
          </tr>
          <tr>
            <td>Federal & Ontario Income Tax</td>
            <td class="text-right">CRA TD1 Tiered</td>
            <td class="text-right">${money(paystub.incomeTaxCents)}</td>
          </tr>
          ${paystub.otherDeductionsCents > 0 ? `
          <tr>
            <td>Other Authorized Deductions</td>
            <td class="text-right">Company / Benefit</td>
            <td class="text-right">${money(paystub.otherDeductionsCents)}</td>
          </tr>
          ` : ''}
          <tr style="font-weight: 700; background: #f8fafc;">
            <td colspan="2">TOTAL DEDUCTIONS</td>
            <td class="text-right" style="color: #ef4444;">-${money(paystub.totalDeductionsCents)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="total-box">
    <h3>Net Pay Deposit</h3>
    <div class="net-amount">${money(paystub.netPayCents)}</div>
    <p style="margin: 0; font-size: 11px; color: #6366f1;">Total Gross Earnings: ${money(paystub.grossPayCents)} | Total Statutory Deductions: ${money(paystub.totalDeductionsCents)}</p>
  </div>

  <div class="footer">
    <p>This paystub was generated by Faso Fix POS Time & Payroll Management System. Compliant with Ontario Employment Standards Act (ESA) and Canada Revenue Agency (CRA) guidelines.</p>
    <p>Please retain this statement for income tax records.</p>
  </div>
</body>
</html>`;
}
