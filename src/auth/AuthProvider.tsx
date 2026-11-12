import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { isDliRole, type Account } from './permissions';

export type AuthState = 'checking' | 'guest' | 'active' | 'unavailable' | 'config-error';
export type AuthCheckFailure = 'identity-service' | 'identity-session' | 'account-registry' | null;
type AuthContextValue = {
  state: AuthState;
  account: Account | null;
  notice: string | null;
  failure: AuthCheckFailure;
  refresh: () => Promise<void>;
  clearNotice: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(supabase ? 'checking' : 'config-error');
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<AuthCheckFailure>(null);
  const verification = useRef(0);

  const refresh = useCallback(async () => {
    const run = ++verification.current;
    if (!supabase) {
      setState('config-error');
      setAccount(null);
      return;
    }
    setFailure(null);
    setState('checking');

    // Always revalidate the session and role before exposing the workspace.
    // Temporary network/API errors are NOT proof of revoked DLI membership.
    // Fail closed until verification succeeds, but do not destroy the local
    // session solely because Supabase was unreachable.
    let user;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (run !== verification.current) return;

      if (authError) {
        setAccount(null);
        // Only a safe category is exposed, never raw Auth error content,
        // credentials, session tokens, user IDs or API keys.
        setFailure('status' in authError && authError.status === 401
          ? 'identity-session' : 'identity-service');
        setState('unavailable');
        return;
      }
      user = authData.user;
      if (!user) {
        setAccount(null);
        setFailure(null);
        setState('guest');
        return;
      }
    } catch {
      if (run !== verification.current) return;
      setAccount(null);
      setFailure('identity-service');
      setState('unavailable');
      return;
    }

    let record;
    try {
      const { data, error: recordError } = await supabase
        .from('authorised_users')
        .select('id,email,full_name,role,status')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (run !== verification.current) return;

      if (recordError) {
        setAccount(null);
        setFailure('account-registry');
        setState('unavailable');
        return;
      }
      record = data;
    } catch {
      if (run !== verification.current) return;
      setAccount(null);
      setFailure('account-registry');
      setState('unavailable');
      return;
    }

    const authorised = record &&
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
    setFailure(null);
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
        setFailure(null);
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
      state, account, notice, failure, refresh, clearNotice: () => setNotice(null),
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
