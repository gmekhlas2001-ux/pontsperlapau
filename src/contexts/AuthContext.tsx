import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export type UserRole = 'superadmin' | 'admin' | 'teacher' | 'librarian' | 'student';

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
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'session_token';
const USER_KEY = 'user';
const LOGIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login`;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedUser = localStorage.getItem(USER_KEY);
      const storedToken = localStorage.getItem(TOKEN_KEY);

      // If we have a cached user but no session token (e.g. the session
      // pre-dates the token-based auth deploy), wipe the stale user so
      // the user is bounced to /login and re-authenticated cleanly.
      if (storedUser && !storedToken) {
        localStorage.removeItem(USER_KEY);
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (!storedUser || !storedToken) {
        setIsLoading(false);
        return;
      }

      const cached = JSON.parse(storedUser) as User;
      setUser(cached);

      // Refresh user record from DB so role/branch/status stay current.
      // Selects from users_public to avoid pulling password_hash.
      const { data } = await supabase
        .from('users_public')
        .select('id, email, first_name, last_name, role, profile_picture_url, status, branch_id')
        .eq('id', cached.id)
        .maybeSingle();

      if (data && data.status === 'active') {
        const refreshed: User = {
          id: data.id,
          email: data.email,
          firstName: data.first_name,
          lastName: data.last_name,
          role: data.role as UserRole,
          avatar: data.profile_picture_url,
          branchId: data.branch_id ?? null,
        };
        setUser(refreshed);
        localStorage.setItem(USER_KEY, JSON.stringify(refreshed));
      } else if (data && data.status !== 'active') {
        // User got deactivated since last login.
        setUser(null);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
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
        return false;
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
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      localStorage.setItem(TOKEN_KEY, result.token);
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
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

/** Read the stored session token (for X-Session-Token header). */
export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
