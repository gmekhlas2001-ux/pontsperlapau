export const SESSION_TOKEN_KEY = 'session_token';
export const SESSION_USER_KEY = 'user';

export interface StoredSessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'superadmin' | 'admin' | 'teacher' | 'librarian' | 'student' | 'parent';
  avatar?: string;
  department?: string;
  branchId?: string | null;
}

const SESSION_ROLES = new Set<StoredSessionUser['role']>([
  'superadmin', 'admin', 'teacher', 'librarian', 'student', 'parent',
]);

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(SESSION_TOKEN_KEY)
    ?? window.localStorage.getItem(SESSION_TOKEN_KEY);
}

export function getStoredSessionUser(): StoredSessionUser | null {
  if (typeof window === 'undefined') return null;
  const storage = window.sessionStorage.getItem(SESSION_TOKEN_KEY)
    ? window.sessionStorage
    : window.localStorage;
  const raw = storage.getItem(SESSION_USER_KEY);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<StoredSessionUser>;
    if (
      typeof value.id !== 'string' ||
      typeof value.email !== 'string' ||
      typeof value.firstName !== 'string' ||
      typeof value.lastName !== 'string' ||
      !value.role || !SESSION_ROLES.has(value.role) ||
      (value.branchId !== undefined && value.branchId !== null && typeof value.branchId !== 'string')
    ) {
      return null;
    }
    return value as StoredSessionUser;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: StoredSessionUser, persistent: boolean): void {
  clearSession();
  const storage = persistent ? window.localStorage : window.sessionStorage;
  storage.setItem(SESSION_TOKEN_KEY, token);
  storage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function storeSessionUser(user: StoredSessionUser): void {
  const storage = window.sessionStorage.getItem(SESSION_TOKEN_KEY)
    ? window.sessionStorage
    : window.localStorage;
  storage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_TOKEN_KEY);
  window.localStorage.removeItem(SESSION_USER_KEY);
  window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(SESSION_USER_KEY);
}
