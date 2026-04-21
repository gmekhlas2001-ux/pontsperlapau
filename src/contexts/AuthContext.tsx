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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role, profile_picture_url, status')
        .eq('email', email.toLowerCase())
        .eq('status', 'active')
        .maybeSingle();

      if (error || !data) {
        console.error('Login error:', error);
        return false;
      }

      // Students do not have site access
      if (data.role === 'student') {
        return false;
      }

      const { data: isValidPassword, error: pwError } = await supabase.rpc('verify_password', {
        user_email: email.toLowerCase(),
        user_password: password
      });

      if (pwError || !isValidPassword) {
        return false;
      }

      const userData: User = {
        id: data.id,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        role: data.role as UserRole,
        avatar: data.profile_picture_url,
      };

      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));

      await supabase.rpc('update_last_login', { p_user_id: data.id });

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('user');
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
