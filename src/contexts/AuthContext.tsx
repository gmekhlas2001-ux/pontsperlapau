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
  isLoading: boolean;
}

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

  useEffect(() => {
    const initAuth = async () => {
      if (!getSessionToken()) {
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
        clearSession();
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe = false): Promise<LoginResult> => {
    try {
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
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

      setUser(userData);
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
    clearSession();
  }, []);

  const hasPermission = useCallback((requiredRoles: UserRole[]): boolean => {
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    return requiredRoles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        hasPermission,
        isLoading,
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
