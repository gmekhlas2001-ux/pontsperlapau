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

// Restricted/private browser storage can throw even while reading. Keep a
// nonpersistent in-memory session as a last resort; it disappears on reload.
let volatileSession: { token: string; user: StoredSessionUser } | null = null;
function storageFor(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try { return typeof window === 'undefined' ? null : window[kind]; } catch { return null; }
}
function read(storage: Storage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function write(storage: Storage | null, token: string, user: StoredSessionUser): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    storage.setItem(SESSION_TOKEN_KEY, token);
    return true;
  } catch { return false; }
}
export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return volatileSession?.token ?? read(storageFor('sessionStorage'), SESSION_TOKEN_KEY)
    ?? read(storageFor('localStorage'), SESSION_TOKEN_KEY);
}

export function getStoredSessionUser(): StoredSessionUser | null {
  if (typeof window === 'undefined') return null;
  if (volatileSession) return volatileSession.user;
  const storage = read(storageFor('sessionStorage'), SESSION_TOKEN_KEY)
    ? storageFor('sessionStorage') : storageFor('localStorage');
  const raw = read(storage, SESSION_USER_KEY);
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
  if (persistent && write(storageFor('localStorage'), token, user)) return;
  if (write(storageFor('sessionStorage'), token, user)) return;
  volatileSession = { token, user };
}

export function storeSessionUser(user: StoredSessionUser): void {
  if (volatileSession) { volatileSession.user = user; return; }
  const storage = read(storageFor('sessionStorage'), SESSION_TOKEN_KEY)
    ? storageFor('sessionStorage') : storageFor('localStorage');
  try { storage?.setItem(SESSION_USER_KEY, JSON.stringify(user)); } catch {
    const token = getSessionToken();
    if (token) volatileSession = { token, user };
  }
}

export function clearSession(): void {
  volatileSession = null;
  for (const storage of [storageFor('localStorage'), storageFor('sessionStorage')]) {
    for (const key of [SESSION_TOKEN_KEY, SESSION_USER_KEY]) {
      try { storage?.removeItem(key); } catch { /* Restricted browser storage. */ }
    }
  }
}
