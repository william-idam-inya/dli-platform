import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { isDliRole, type Account } from './permissions';

export type AuthState = 'checking' | 'guest' | 'active' | 'config-error';
type AuthContextValue = {
  state: AuthState;
  account: Account | null;
  notice: string | null;
  refresh: () => Promise<void>;
  clearNotice: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(supabase ? 'checking' : 'config-error');
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const verification = useRef(0);

  const refresh = useCallback(async () => {
    const run = ++verification.current;
    if (!supabase) {
      setState('config-error');
      setAccount(null);
      return;
    }
    setState('checking');

    // getUser revalidates the session with Supabase Auth. Do not trust local session storage as an authority.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (run !== verification.current) return;

    const user = authData.user;
    if (authError || !user) {
      setAccount(null);
      setState('guest');
      return;
    }

    const { data: record, error: recordError } = await supabase
      .from('authorised_users')
      .select('id,email,full_name,role,status')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (run !== verification.current) return;

    const authorised = !recordError && record &&
      record.status === 'active' &&
      isDliRole(record.role) &&
      !!user.email_confirmed_at &&
      !!user.email &&
      record.email === user.email.toLowerCase();

    if (!authorised) {
      setAccount(null);
      setState('guest');
      // Sign out locally; an existing Auth account does not constitute DLI authorisation.
      setNotice('This account is not authorised for DLI access. Contact your administrator.');
      await supabase.auth.signOut({ scope: 'local' });
      return;
    }

    setAccount(record as Account);
    setNotice(null);
    setState('active');
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void refresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        ++verification.current;
        setAccount(null);
        setState('guest');
      } else if (
        event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY' ||
        event === 'INITIAL_SESSION'
      ) {
        // Defer calls that use Supabase Auth until after the auth-event callback returns.
        void Promise.resolve().then(refresh);
      }
    });

    const recheck = () => { void refresh(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      ++verification.current;
      subscription.unsubscribe();
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  return (
    <AuthContext.Provider value={{
      state, account, notice, refresh, clearNotice: () => setNotice(null),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
