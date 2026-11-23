const TOKEN_KEY = 'apexfix_session_token';
const EXPIRY_KEY = 'apexfix_session_expiry';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionExpiry(): number | null {
  const exp = localStorage.getItem(EXPIRY_KEY);
  return exp ? parseInt(exp, 10) : null;
}

export function setToken(token: string, expiresAtMs?: number): void {
  localStorage.setItem(TOKEN_KEY, token);
  let exp = expiresAtMs;
  if (!exp && token.startsWith('s.')) {
    try {
      const parts = token.slice(2).split('.');
      if (parts[0]) {
        const decoded = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
        if (decoded.exp) exp = decoded.exp;
      }
    } catch {}
  }
  if (!exp) {
    exp = Date.now() + 24 * 60 * 60 * 1000;
  }
  localStorage.setItem(EXPIRY_KEY, String(exp));
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem('apexfix_cached_user');
}

export function isSessionExpired(): boolean {
  const token = getToken();
  if (!token) return true;
  const exp = getSessionExpiry();
  if (exp && Date.now() >= exp) {
    return true;
  }
  return false;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-session-token'] = token;
  }
  try {
    const raw = localStorage.getItem('apexfix_cached_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u.id) headers['x-user-id'] = u.id;
      if (u.username) headers['x-user-name'] = u.username;
      if (u.role) headers['x-user-role'] = u.role;
    }
  } catch {}
  return headers;
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  if (isSessionExpired() && getToken()) {
    removeToken();
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

  const sentToken = getToken();
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    // Ignore stale in-flight 401s after the user already logged out or re-authenticated with a new token
    if (!sentToken || getToken() !== sentToken) {
      return res;
    }
    const clone = res.clone();
    try {
      const body = await clone.json();
      if (body.code === 'SESSION_EXPIRED' || body.error?.includes('expired')) {
        removeToken();
        window.dispatchEvent(
          new CustomEvent('session-expired', {
            detail: { reason: 'Your 24-hour session has expired for security. Please sign in again.' },
          })
        );
      } else {
        removeToken();
        window.dispatchEvent(new CustomEvent('apexfix_auth_unauthorized'));
      }
    } catch {}
  }
  return res;
}
