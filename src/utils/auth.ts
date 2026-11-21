const TOKEN_KEY = 'apexfix_session_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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
  return headers;
}

let isCheckingAuth = false;

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !url.includes('/api/auth/')) {
    // Double check with dedicated /api/auth/me before forcibly terminating session
    if (!isCheckingAuth) {
      isCheckingAuth = true;
      try {
        const verifyRes = await fetch('/api/auth/me', { headers: getAuthHeaders() });
        const verifyJson = await verifyRes.json().catch(() => ({ authenticated: false }));
        if (!verifyJson.authenticated) {
          removeToken();
          window.dispatchEvent(new CustomEvent('apexfix_auth_unauthorized'));
        }
      } catch {
        // Transient network issue, do not log user out
      } finally {
        setTimeout(() => {
          isCheckingAuth = false;
        }, 2000);
      }
    }
  }
  return res;
}
