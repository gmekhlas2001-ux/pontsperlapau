import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { callEdgeFunction } from '@/lib/edge';
import {
  clearSession,
  getSessionToken,
  storeSession,
  storeSessionUser,
} from '@/lib/session';

export type UserRole = 'superadmin' | 'admin' | 'teacher' | 'librarian' | 'student' | 'parent';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatar?: string;
  department?: string;
  branchId?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  logout: () => Promise<void>;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
  hasModuleAccess: (moduleId?: string, action?: ModuleAction) => boolean;
  accessLoading: boolean;
  isLoading: boolean;
  sessionError: boolean;
  retrySession: () => void;
}

export type ModuleAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'manage';
type ModuleAccessMap = Record<string, Record<ModuleAction, boolean>>;

interface LoginResult {
  success: boolean;
  code?: string;
  status?: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOGIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login`;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [sessionError, setSessionError] = useState(false);
  const [access, setAccess] = useState<ModuleAccessMap | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const retrySession = useCallback(() => setRetryKey(key => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    const token = getSessionToken();
    setIsLoading(true);
    setSessionError(false);
    const initAuth = async () => {
      if (!token) {
        clearSession();
        setIsLoading(false);
        return;
      }

      const result = await callEdgeFunction<{ success: boolean; user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: UserRole;
        avatar?: string;
        branchId?: string | null;
      } }>('app-actions', { operation: 'get-session' });

      if (cancelled) return;
      const currentToken = getSessionToken();
      // The HTTP client clears a rejected token before returning its 401.
      // Finish initialization in that case, but never overwrite a newer login.
      if (currentToken !== token && !(result.status === 401 && !currentToken)) return;
      if (result.ok && result.data?.user) {
        const data = result.data.user;
        const refreshed: User = {
          id: data.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          avatar: data.avatar,
          branchId: data.branchId ?? null,
        };
        setUser(refreshed);
        storeSessionUser(refreshed);
      } else {
        setUser(null);
        if (result.status === 401 || result.status === 403) clearSession();
        else setSessionError(true);
      }
      setIsLoading(false);
    };
    void initAuth();
    return () => { cancelled = true; };
  }, [retryKey]);

  useEffect(() => {
    if (!user) {
      setAccess(null);
      setAccessLoading(false);
      return;
    }
    let cancelled = false;
    setAccess(null);
    setAccessLoading(true);
    void callEdgeFunction<{ success: boolean; access: ModuleAccessMap }>('module-access', { operation: 'mine' })
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.data?.success && result.data.access) {
          setAccess(result.data.access);
          setSessionError(false);
        } else {
          setAccess(null);
          setSessionError(true);
        }
        setAccessLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id, retryKey]);

  // The backend checks every request. Refresh the visible menu promptly after
  // another admin changes a grant, including when the tab regains focus.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      const result = await callEdgeFunction<{ success: boolean; access: ModuleAccessMap }>('module-access', { operation: 'mine' });
      if (cancelled) return;
      if (result.ok && result.data?.access) setAccess(result.data.access);
      else { setAccess(null); setSessionError(true); }
    };
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string, rememberMe = false): Promise<LoginResult> => {
    try {
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        signal: AbortSignal.timeout(30_000),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        console.error('Login failed:', result?.error);
        return { success: false, code: result?.code, status: res.status };
      }

      const userData: User = {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role as UserRole,
        avatar: result.user.avatar,
        branchId: result.user.branchId ?? null,
      };

      setSessionError(false);
      setIsLoading(false);
      setUser(userData);
      setAccess(null);
      storeSession(result.token, userData, rememberMe);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false };
    }
  }, []);

  const logout = useCallback(async () => {
    if (getSessionToken()) {
      await callEdgeFunction('app-actions', { operation: 'logout' });
    }
    setUser(null);
    setAccess(null);
    setSessionError(false);
    setIsLoading(false);
    clearSession();
  }, []);

  const hasPermission = useCallback((requiredRoles: UserRole[]): boolean => {
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    return requiredRoles.includes(user.role);
  }, [user]);

  const hasModuleAccess = useCallback((moduleId?: string, action: ModuleAction = 'view'): boolean => {
    if (!moduleId) return true;
    return access?.[moduleId]?.[action] === true;
  }, [access]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        hasPermission,
        hasModuleAccess,
        accessLoading,
        isLoading,
        sessionError,
        retrySession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { getSessionToken } from '@/lib/session';
