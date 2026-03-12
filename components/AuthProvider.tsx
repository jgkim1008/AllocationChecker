'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isPremium: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    // 타임아웃: 3초 후에도 로딩 중이면 강제 해제
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      clearTimeout(timeout);
      setUser(user);

      if (user) {
        // 유료 구독 여부 확인
        try {
          const { data } = await supabase
            .from('premium_users')
            .select('is_active, expires_at')
            .eq('user_id', user.id)
            .single();

          if (data) {
            const isActive = data.is_active;
            const notExpired = !data.expires_at || new Date(data.expires_at) > new Date();
            setIsPremium(isActive && notExpired);
          }
        } catch (e) {
          console.error('Failed to check premium status:', e);
        }
      }

      setLoading(false);
    }).catch((e) => {
      clearTimeout(timeout);
      console.error('Failed to get user:', e);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        try {
          const { data } = await supabase
            .from('premium_users')
            .select('is_active, expires_at')
            .eq('user_id', currentUser.id)
            .single();

          if (data) {
            const isActive = data.is_active;
            const notExpired = !data.expires_at || new Date(data.expires_at) > new Date();
            setIsPremium(isActive && notExpired);
          } else {
            setIsPremium(false);
          }
        } catch (e) {
          setIsPremium(false);
        }
      } else {
        setIsPremium(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isPremium, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
