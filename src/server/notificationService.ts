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

export async function listUserNotifications(
  userId: string,
  params?: { unreadOnly?: boolean; limit?: number }
) {
  const limit = Math.min(Math.max(params?.limit ?? 30, 1), 100);
  const where = {
    userId,
    ...(params?.unreadOnly ? { isRead: false } : {}),
  };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId, isRead: false },
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
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { markedCount: res.count };
}
