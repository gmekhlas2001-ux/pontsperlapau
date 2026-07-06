import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  getSessionToken,
  getStoredSessionUser,
  SESSION_TOKEN_KEY,
  SESSION_USER_KEY,
  storeSession,
  storeSessionUser,
  type StoredSessionUser,
} from './session';
import { getCurrentScope, NO_BRANCH_SENTINEL, scopedBranchId } from './scope';

const user: StoredSessionUser = {
  id: 'user-1',
  email: 'person@example.com',
  firstName: 'Test',
  lastName: 'Person',
  role: 'teacher',
  branchId: 'branch-1',
};

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
  },
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('browser session storage', () => {
  it('stores non-persistent sessions in sessionStorage', () => {
    storeSession('session-token', user, false);

    expect(window.sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe('session-token');
    expect(window.localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(getSessionToken()).toBe('session-token');
    expect(getStoredSessionUser()).toEqual(user);
  });

  it('stores remembered sessions in localStorage and clears prior state', () => {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, 'old-session');
    window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));

    storeSession('remembered-token', user, true);

    expect(window.sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(SESSION_TOKEN_KEY)).toBe('remembered-token');
    expect(getStoredSessionUser()).toEqual(user);
  });

  it('prefers the active tab session and updates its cached user', () => {
    window.localStorage.setItem(SESSION_TOKEN_KEY, 'remembered-token');
    window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, 'tab-token');
    window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));

    const updated = { ...user, firstName: 'Updated' };
    storeSessionUser(updated);

    expect(getSessionToken()).toBe('tab-token');
    expect(JSON.parse(window.sessionStorage.getItem(SESSION_USER_KEY) ?? '{}')).toEqual(updated);
    expect(JSON.parse(window.localStorage.getItem(SESSION_USER_KEY) ?? '{}')).toEqual(user);
  });

  it('rejects malformed or incomplete cached identities', () => {
    window.localStorage.setItem(SESSION_TOKEN_KEY, 'token');
    window.localStorage.setItem(SESSION_USER_KEY, '{invalid');
    expect(getStoredSessionUser()).toBeNull();

    window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify({ id: 'user-1' }));
    expect(getStoredSessionUser()).toBeNull();

    window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify({ ...user, role: 'owner' }));
    expect(getStoredSessionUser()).toBeNull();
  });

  it('clears both persistent and tab-scoped session state', () => {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      storage.setItem(SESSION_TOKEN_KEY, 'token');
      storage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    }

    clearSession();

    expect(getSessionToken()).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('derives global and deny-by-default branch scopes', () => {
    storeSession('token', { ...user, role: 'superadmin', branchId: null }, false);
    expect(getCurrentScope()).toMatchObject({ userId: user.id, isGlobal: true, isBranchScoped: false });
    expect(scopedBranchId()).toBeNull();

    storeSession('token', { ...user, role: 'admin', branchId: null }, false);
    expect(getCurrentScope()).toMatchObject({ userId: user.id, isGlobal: false, isBranchScoped: false });
    expect(scopedBranchId()).toBe(NO_BRANCH_SENTINEL);
  });
});
