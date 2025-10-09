import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, role: string, formData: any) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
  isStudent: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('AuthContext initializing');
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session:', session);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        console.log('Auth state change:', event, session);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    try {
      console.log('Loading profile for user:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Profile query error:', error);
        throw error;
      }

      console.log('Profile loaded:', data);
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email: string, password: string, role: string, formData: any) {
    console.log('Starting signup process for:', email, 'role:', role);

    const roleMapping: Record<string, string> = {
      'student': 'student',
      'staff': 'teacher',
    };

    const actualRole = roleMapping[role] || role;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: actualRole,
          ...formData,
        },
      },
    });

    if (error) {
      console.error('Auth signup error:', error);
      return { error };
    }

    console.log('Auth user created:', data.user?.id);

    if (data.user && data.session) {
      await new Promise(resolve => setTimeout(resolve, 100));

      const profileInsert = {
        auth_user_id: data.user.id,
        email,
        full_name: formData.full_name || `${formData.first_name || ''} ${formData.last_name || ''}`.trim(),
        role_id: actualRole,
        status: 'pending',
      };

      console.log('Inserting profile:', profileInsert);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .insert(profileInsert)
        .select()
        .single();

      if (profileError) {
        console.error('Profile creation error:', profileError);
        return { error: profileError };
      }

      console.log('Profile created:', profileData);

      const approvalInsert = {
        requester_profile_id: profileData.id,
        target_role: actualRole,
        status: 'pending',
        submitted_payload: formData,
      };

      console.log('Inserting approval:', approvalInsert);

      const { error: approvalError } = await supabase.from('approvals').insert(approvalInsert);

      if (approvalError) {
        console.error('Approval creation error:', approvalError);
        return { error: approvalError };
      }

      console.log('Signup complete!');
    }

    return { error: null };
  }

  async function signOut() {
    setUser(null);
    setProfile(null);
    setSession(null);

    try {
      await supabase.auth.signOut();
    } catch (error: any) {
      console.error('Error signing out:', error);
    }

    localStorage.removeItem('supabase.auth.token');
    const keysToRemove = Object.keys(localStorage).filter(key =>
      key.startsWith('sb-') && key.includes('-auth-token')
    );
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin: profile?.role_id === 'admin',
    isSuperAdmin: profile?.role_id === 'admin' && (profile as any)?.is_super_admin === true,
    isStaff: profile?.role_id === 'teacher' || profile?.role_id === 'librarian',
    isStudent: profile?.role_id === 'student',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
