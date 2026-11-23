// Legacy user credential localStorage cache has been retired now that Supabase PostgreSQL persists accounts.
try {
  localStorage.removeItem('apexfix_registered_users');
  localStorage.removeItem('apexfix_deleted_user_ids');
} catch {}

export interface SyncedUserPayload {
  payload: string;
  signature: string;
  username?: string;
  id?: string;
}

export function getCachedRegisteredUsers(): SyncedUserPayload[] {
  return [];
}

export function getDeletedUserIds(): string[] {
  return [];
}

export function saveRegisteredUsers(_users: any[]): void {
  // No-op: never store user password hashes or sync payloads in browser storage.
}

export function recordDeletedUser(_userId: string): void {
  // No-op: server PostgreSQL enforces deletions directly.
}

export async function syncUsersWithServer(): Promise<any[]> {
  return [];
}
