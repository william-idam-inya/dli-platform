import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { isFilePickerFocused } from './filePickerFocus';
import { classifyAuthVerificationError } from './authVerificationError';
import { isDliRole, type Account } from './permissions';

export type AuthState = 'checking' | 'guest' | 'active' | 'unavailable' | 'config-error';
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
        // getUser() reports AuthSessionMissingError for signed-out visitors.
        // This is NOT a registry outage: show the sign-in page instead.
        setState(classifyAuthVerificationError(authError));
        return;
      }
      user = authData.user;
      if (!user) {
        setAccount(null);
        setState('guest');
        return;
      }
    } catch (error) {
      if (run !== verification.current) return;
      setAccount(null);
      setState(classifyAuthVerificationError(error));
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
        setState('unavailable');
        return;
      }
      record = data;
    } catch {
      if (run !== verification.current) return;
      setAccount(null);
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

    let studentTier:'free'|'paid'|undefined;
    if(record?.role==='student'){
      const entitlement=await supabase.from('dli_student_entitlements')
        .select('tier').eq('student_id',user.id).maybeSingle();
      if(run!==verification.current)return;
      if(entitlement.error){setAccount(null);setState('unavailable');return;}
      studentTier=entitlement.data?.tier==='paid'?'paid':'free';
    }
    setAccount({...record,studentTier} as Account);
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

    const recheck = () => {
      // The OS file-selection dialog returns focus before React processes
      // the selected File. Do not unmount the editor at that instant.
      // All other focus checks, Auth events, and server RLS remain active.
      if (isFilePickerFocused(document.activeElement)) return;
      void refresh();
    };
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

  useEffect(() => {
    if (!supabase || account?.role !== 'student' || account.studentTier !== 'free') return;
    // Free-to-Paid approval is authoritative in the database. The Realtime
    // event only requests a fresh server-side role/entitlement verification.
    // This does not accept any client-supplied role or tier.
    let disposed = false;
    const client = supabase;
    let channel: ReturnType<typeof client.channel> | null = null;
    void (async () => {
      const result = await client.auth.getUser();
      if (disposed || result.error || !result.data.user) return;
      const userId = result.data.user.id;
      channel = client.channel('dli-entitlement-' + userId)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'dli_student_entitlements',
          filter: 'student_id=eq.' + userId,
        }, () => { if (!disposed) void refresh(); })
        .subscribe();
    })();
    return () => {
      disposed = true;
      if (channel) void client.removeChannel(channel);
    };
  }, [account?.id, account?.role, account?.studentTier, refresh]);

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
