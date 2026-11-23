const EPOCH_KEY = 'apexfix_session_epoch';
const EXPIRY_KEY = 'apexfix_session_expiry';
const CACHED_USER_KEY = 'apexfix_cached_user';

// Purge legacy sensitive client-storage keys immediately on module load
try {
  localStorage.removeItem('apexfix_session_token');
  localStorage.removeItem('apexfix_registered_users');
  localStorage.removeItem('apexfix_deleted_user_ids');
} catch {}

function newEpochNonce(): string {
  try {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function getSessionEpoch(): string | null {
  try {
    return localStorage.getItem(EPOCH_KEY);
  } catch {
    return null;
  }
}

export function getSessionExpiry(): number | null {
  try {
    const exp = localStorage.getItem(EXPIRY_KEY);
    return exp ? parseInt(exp, 10) : null;
  } catch {
    return null;
  }
}

export function hasActiveSession(): boolean {
  return Boolean(getSessionEpoch()) && !isSessionExpired();
}

export function markSessionActive(expiresAtMs?: number): string {
  const epoch = newEpochNonce();
  const exp = expiresAtMs || Date.now() + 24 * 60 * 60 * 1000;
  try {
    localStorage.setItem(EPOCH_KEY, epoch);
    localStorage.setItem(EXPIRY_KEY, String(exp));
    localStorage.removeItem('apexfix_session_token');
  } catch {}
  return epoch;
}

export function clearSessionState(): void {
  try {
    localStorage.removeItem(EPOCH_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem(CACHED_USER_KEY);
    localStorage.removeItem('apexfix_session_token');
  } catch {}
}

// Legacy non-secret aliases for UI guards (never stores any raw bearer secret in localStorage)
export function getToken(): string | null {
  return getSessionEpoch();
}

export function setToken(_tokenOrUnused: string, expiresAtMs?: number): void {
  markSessionActive(expiresAtMs);
}

export function removeToken(): void {
  clearSessionState();
}

export function isSessionExpired(): boolean {
  const epoch = getSessionEpoch();
  if (!epoch) return true;
  const exp = getSessionExpiry();
  if (exp && Date.now() >= exp) {
    return true;
  }
  return false;
}

export function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Requested-With': 'FasoFixPOS',
  };
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  if (getSessionEpoch() && isSessionExpired()) {
    clearSessionState();
    window.dispatchEvent(
      new CustomEvent('session-expired', {
        detail: { reason: 'Your 24-hour session has expired for security. Please sign in again.' },
      })
    );
    return new Response(
      JSON.stringify({ success: false, code: 'SESSION_EXPIRED', error: 'Session expired after 24 hours.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sentEpoch = getSessionEpoch();
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };
  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  if (res.status === 401) {
    // Ignore stale in-flight 401s after the user already logged out or re-authenticated
    if (!sentEpoch || getSessionEpoch() !== sentEpoch) {
      return res;
    }
    const clone = res.clone();
    try {
      const body = await clone.json();
      if (body.code === 'SESSION_EXPIRED' || body.error?.includes('expired')) {
        clearSessionState();
        window.dispatchEvent(
          new CustomEvent('session-expired', {
            detail: { reason: 'Your 24-hour session has expired for security. Please sign in again.' },
          })
        );
      } else {
        clearSessionState();
        window.dispatchEvent(new CustomEvent('apexfix_auth_unauthorized'));
      }
    } catch {}
  }
  return res;
}
