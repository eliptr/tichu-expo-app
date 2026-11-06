import type { Session, User } from '@supabase/supabase-js';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  initializing: boolean;
  session: Session | null;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children, enabled = false }: PropsWithChildren<{ enabled?: boolean }>) {
  const [initializing, setInitializing] = useState(enabled);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!enabled) { setSession(null); setInitializing(false); return; }
    setInitializing(true);
    let mounted = true;

    supabase.auth.startAutoRefresh();
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      setInitializing(false);
    }).catch(() => { if (mounted) setInitializing(false); });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setInitializing(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      supabase.auth.stopAutoRefresh();
    };
  }, [enabled]);

  const value = useMemo(
    () => ({
      initializing,
      session,
      user: session?.user ?? null,
    }),
    [initializing, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
