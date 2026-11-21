import { fetchWithAuth } from './auth';

const USERS_STORAGE_KEY = 'apexfix_registered_users';
const DELETED_USERS_KEY = 'apexfix_deleted_user_ids';

export interface SyncedUserPayload {
  payload: string;
  signature: string;
  username?: string;
  id?: string;
}

const syncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('apexfix_user_sync')
  : null;

export function getCachedRegisteredUsers(): SyncedUserPayload[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getDeletedUserIds(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRegisteredUsers(users: any[]): void {
  try {
    const current = getCachedRegisteredUsers();
    const map = new Map<string, SyncedUserPayload>();

    for (const c of current) {
      if (c.username) map.set(c.username.toLowerCase(), c);
      else if (c.id) map.set(c.id, c);
    }

    for (const u of users) {
      if (u.syncPayload?.payload && u.syncPayload?.signature) {
        const item: SyncedUserPayload = {
          payload: u.syncPayload.payload,
          signature: u.syncPayload.signature,
          username: u.username?.toLowerCase(),
          id: u.id,
        };
        map.set(u.username.toLowerCase(), item);
      }
    }

    const next = Array.from(map.values());
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next));
    syncChannel?.postMessage({ type: 'USERS_UPDATED', count: next.length });
  } catch (err) {
    console.error('[UserSync Save Error]', err);
  }
}

export function recordDeletedUser(userId: string): void {
  try {
    const current = getCachedRegisteredUsers().filter((u) => u.id !== userId);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(current));

    const deleted = getDeletedUserIds();
    if (!deleted.includes(userId)) {
      deleted.push(userId);
      localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(deleted));
    }

    syncChannel?.postMessage({ type: 'USER_DELETED', userId });
  } catch (err) {
    console.error('[UserSync Delete Error]', err);
  }
}

export async function syncUsersWithServer(): Promise<any[]> {
  try {
    const clientUsers = getCachedRegisteredUsers();
    const deletedUserIds = getDeletedUserIds();

    const res = await fetchWithAuth('/api/sync/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientUsers, deletedUserIds }),
    });

    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data)) {
        saveRegisteredUsers(json.data);
        return json.data;
      }
    }
  } catch (err) {
    console.error('[UserSync Server Sync Error]', err);
  }
  return [];
}
