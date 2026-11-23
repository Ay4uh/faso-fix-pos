import { hasActiveSession } from './auth';

export interface QueuedAction {
  id: string;
  url: string;
  method: string;
  body?: any;
  label: string;
  createdAt: string;
}

const STORAGE_KEY = 'apexfix_offline_queue';

export function getOfflineQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedAction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {}
}

export function queueOfflineAction(action: Omit<QueuedAction, 'id' | 'createdAt'>): QueuedAction {
  const queue = getOfflineQueue();
  const item: QueuedAction = {
    ...action,
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  queue.push(item);
  saveOfflineQueue(queue);
  window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: queue.length } }));
  return item;
}

export async function flushOfflineQueue(
  onSuccess?: (syncedItem: QueuedAction) => void
): Promise<{ success: number; failed: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  const remaining: QueuedAction[] = [];
  let successCount = 0;
  let failCount = 0;

  if (!hasActiveSession()) return { success: 0, failed: queue.length };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'FasoFixPOS',
  };

  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        credentials: 'same-origin',
        headers,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });

      if (res.ok) {
        successCount++;
        if (onSuccess) onSuccess(item);
      } else {
        remaining.push(item);
        failCount++;
      }
    } catch {
      remaining.push(item);
      failCount++;
    }
  }

  saveOfflineQueue(remaining);
  window.dispatchEvent(
    new CustomEvent('offline-queue-updated', { detail: { count: remaining.length } })
  );
  return { success: successCount, failed: failCount };
}
