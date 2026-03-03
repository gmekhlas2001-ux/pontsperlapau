import React, { createContext, useContext, useState, useCallback } from 'react';

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users for demonstration
const MOCK_USERS: Record<string, { password: string; user: User }> = {
  'superadmin@pxpmanagement.es': {
    password: 'admin123',
    user: {
      id: '1',
      email: 'superadmin@pxpmanagement.es',
      firstName: 'Super',
      lastName: 'Admin',
      role: 'superadmin',
      department: 'Management',
    },
  },
  'admin@pxpmanagement.es': {
    password: 'admin123',
    user: {
      id: '2',
      email: 'admin@pxpmanagement.es',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      department: 'Management',
    },
  },
  'teacher@pxpmanagement.es': {
    password: 'teacher123',
    user: {
      id: '3',
      email: 'teacher@pxpmanagement.es',
      firstName: 'Maria',
      lastName: 'Garcia',
      role: 'teacher',
      department: 'Education',
    },
  },
  'librarian@pxpmanagement.es': {
    password: 'librarian123',
    user: {
      id: '4',
      email: 'librarian@pxpmanagement.es',
      firstName: 'John',
      lastName: 'Smith',
      role: 'librarian',
      department: 'Library',
    },
  },
  'student@pxpmanagement.es': {
    password: 'student123',
    user: {
      id: '5',
      email: 'student@pxpmanagement.es',
      firstName: 'Ahmed',
      lastName: 'Hassan',
      role: 'student',
    },
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const mockUser = MOCK_USERS[email.toLowerCase()];
    
    if (mockUser && mockUser.password === password) {
      setUser(mockUser.user);
      localStorage.setItem('user', JSON.stringify(mockUser.user));
      return true;
    }
    
    return false;
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
