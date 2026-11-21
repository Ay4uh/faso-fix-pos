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
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };
  return await fetch(url, { ...options, headers });
}
