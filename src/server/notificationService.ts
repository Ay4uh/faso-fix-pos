import { prisma } from './prisma';
import { HttpError } from './service';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  linkTab?: string | null;
}

/**
 * Create a persistent in-app notification for a single user.
 * Fails silently if the notification write fails so core POS transactions are never blocked.
 */
export async function createNotification(input: NotificationInput) {
  try {
    return await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        linkTab: input.linkTab ?? null,
      },
    });
  } catch (err) {
    console.error('[Notification Error]', err);
    return null;
  }
}

/**
 * Send an in-app notification to all active administrators (optionally excluding the actor).
 */
export async function notifyAdmins(params: {
  type: string;
  title: string;
  message: string;
  linkTab?: string | null;
  excludeUserId?: string;
}) {
  try {
    const admins = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
        ...(params.excludeUserId ? { id: { not: params.excludeUserId } } : {}),
      },
      select: { id: true },
    });

    if (admins.length === 0) return;

    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: params.type,
        title: params.title,
        message: params.message,
        linkTab: params.linkTab ?? null,
      })),
    });
  } catch (err) {
    console.error('[NotifyAdmins Error]', err);
  }
}

/**
 * Automatically syncs missed promise date notifications for active repair tickets.
 * Checks for any tickets past their dueDate that are not completed/declined/cancelled.
 */
async function syncOverdueRepairNotifications(userId: string) {
  try {
    const now = new Date();
    // 1. Find all active tickets past their due date
    const overdueTickets = await prisma.ticket.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'DECLINED', 'CANCELLED'] },
        dueDate: { lt: now },
      },
      include: {
        customer: { select: { fullName: true } },
        device: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const activeOverdueLinkTabs = new Set(overdueTickets.map((t) => `repairs:${t.id}`));

    // 2. Remove overdue notifications for tickets that are no longer overdue (completed, cancelled, or dueDate extended)
    const existingOverdueNotifs = await prisma.notification.findMany({
      where: {
        userId,
        type: 'OVERDUE_REPAIR',
      },
      select: { id: true, linkTab: true },
    });

    for (const notif of existingOverdueNotifs) {
      if (notif.linkTab && !activeOverdueLinkTabs.has(notif.linkTab)) {
        await prisma.notification.delete({
          where: { id: notif.id },
        }).catch(() => {});
      }
    }

    // 3. For each overdue ticket, ensure an OVERDUE_REPAIR notification exists for this user
    for (const ticket of overdueTickets) {
      const linkTab = `repairs:${ticket.id}`;
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          type: 'OVERDUE_REPAIR',
          linkTab,
        },
      });

      if (!existing) {
        const formattedDate = new Date(ticket.dueDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const customerName = ticket.customer?.fullName || 'Customer';
        const deviceName = ticket.device?.name || 'Device';

        await prisma.notification.create({
          data: {
            userId,
            type: 'OVERDUE_REPAIR',
            title: `⚠️ Missed Promise Date: WO #${ticket.ticketNumber}`,
            message: `Work order #${ticket.ticketNumber} for ${customerName} (${deviceName}) missed its promised date (${formattedDate}).`,
            linkTab,
            isRead: false,
          },
        });
      }
    }
  } catch (err) {
    console.error('[SyncOverdueRepairs Error]', err);
  }
}

export async function listUserNotifications(
  userId: string,
  params?: { unreadOnly?: boolean; limit?: number }
) {
  await syncOverdueRepairNotifications(userId);

  const limit = Math.min(Math.max(params?.limit ?? 30, 1), 100);
  const where = {
    userId,
    type: 'OVERDUE_REPAIR',
    ...(params?.unreadOnly ? { isRead: false } : {}),
  };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId, type: 'OVERDUE_REPAIR', isRead: false },
    }),
  ]);

  return { notifications, unreadCount };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const existing = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  if (!existing || existing.userId !== userId) {
    throw new HttpError(404, 'Notification not found');
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}

export async function markAllNotificationsRead(userId: string) {
  const res = await prisma.notification.updateMany({
    where: { userId, type: 'OVERDUE_REPAIR', isRead: false },
    data: { isRead: true },
  });
  return { markedCount: res.count };
}
