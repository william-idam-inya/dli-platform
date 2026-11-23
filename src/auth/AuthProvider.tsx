import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { sessionPresence } from './sessionPresence';
import { isDliRole, type Account } from './permissions';

export type AuthState = 'checking' | 'guest' | 'active' | 'unavailable' | 'config-error';
export type AuthContextValue = {
  state: AuthState;
  account: Account | null;
  authUserId: string | null;
  hasCompletedProfile: boolean | null;
  preferredTheme: 'system' | 'light' | 'dark';
  notice: string | null;
  refresh: () => Promise<void>;
  clearNotice: () => void;
  updatePreferredTheme: (next: 'light' | 'dark') => Promise<{ok:boolean;warning?:string}>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(supabase ? 'checking' : 'config-error');
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authUserId,setAuthUserId]=useState<string|null>(null);
  const [hasCompletedProfile,setHasCompletedProfile]=useState<boolean|null>(null);
  const [preferredTheme,setPreferredTheme]=useState<'system'|'light'|'dark'>('system');
  const verification = useRef(0);

  const refresh = useCallback(async () => {
    const run = ++verification.current;
    // A failed or revoked identity may never retain a cached profile gate.
    const clearIdentity=()=>{
      setAuthUserId(null);setHasCompletedProfile(null);setPreferredTheme('system');
    };
    if (!supabase) {clearIdentity();
      setState('config-error');
      setAccount(null);
      return;
    }
    // A verification triggered by token refresh must never unmount the active
    // workspace, close a focus overlay or discard a draft.
    setState(current=>current==='active'?'active':'checking');

    // No stored session is the normal, anonymous state, not an outage.
    // Only check presence here; this local data is NEVER used to grant access.
    // A real session still requires server getUser(), registry and RLS checks.
    const presence = await sessionPresence(supabase.auth);
    if (run !== verification.current) return;
    if (presence === 'guest') {
      setAccount(null);clearIdentity();
      setState('guest');
      return;
    }
    if (presence === 'unavailable') {
      setAccount(null);clearIdentity();
      setState('unavailable');
      return;
    }

    // Always revalidate the session and role before exposing the workspace.
    // Temporary network/API errors are NOT proof of revoked DLI membership.
    // Fail closed until verification succeeds, but do not destroy the local
    // session solely because Supabase was unreachable.
    let user;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (run !== verification.current) return;

      if (authError) {
        setAccount(null);clearIdentity();
        setState('unavailable');
        return;
      }
      user = authData.user;
      if (!user) {
        setAccount(null);clearIdentity();
        setState('guest');
        return;
      }
    } catch {
      if (run !== verification.current) return;
      setAccount(null);clearIdentity();
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
        setAccount(null);clearIdentity();
        setState('unavailable');
        return;
      }
      record = data;
    } catch {
      if (run !== verification.current) return;
      setAccount(null);clearIdentity();
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
      setAccount(null);clearIdentity();
      setState('guest');
      // Sign out locally; an existing Auth account does not constitute DLI authorisation.
      setNotice('This account is not authorised for DLI access. Contact your administrator.');
      await supabase.auth.signOut({ scope: 'local' });
      return;
    }

    // One authoritative identity verification drives the profile gate, theme,
    // and Student entitlement. No extra getUser() call in child dashboards.
    const checks=await Promise.allSettled([
      supabase.from('dli_member_profiles')
        .select('user_id,preferred_theme').eq('user_id',user.id).maybeSingle(),
      record?.role==='student'
        ?supabase.from('dli_student_entitlements')
          .select('tier').eq('student_id',user.id).maybeSingle()
        :Promise.resolve({data:null,error:null}),
    ]);
    if(run!==verification.current)return;
    if(checks[0].status==='rejected'||checks[1].status==='rejected'){
      setAccount(null);clearIdentity();setState('unavailable');return;
    }
    const profile=checks[0].value,entitlement=checks[1].value;
    if(entitlement.error){setAccount(null);clearIdentity();setState('unavailable');return;}
    const studentTier: 'free'|'paid'|undefined=record?.role==='student'
      ?entitlement.data?.tier==='paid'?'paid':'free':undefined;
    setAuthUserId(user.id);
    // null is deliberately NOT "complete": an unavailable read fails closed.
    setHasCompletedProfile(profile.error?null:Boolean(profile.data));
    const theme=profile.data?.preferred_theme;
    setPreferredTheme(theme==='dark'||theme==='light'?theme:'system');
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
        setAuthUserId(null);setHasCompletedProfile(null);setPreferredTheme('system');
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

    // No focus or visibilitychange listener: browser tab switching, OS file
    // pickers and screenshots are NOT authentication events. Supabase silently
    // handles token refresh and the subscriptions below still verify changes.
    return () => {
      ++verification.current;
      subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(()=>{
    // A successful profile edit asks the provider to re-read the verified row;
    // the event alone never grants profile completion or changes role access.
    const onChanged=()=>{void refresh();};
    window.addEventListener('dli-profile-changed',onChanged);
    return()=>window.removeEventListener('dli-profile-changed',onChanged);
  },[refresh]);

  const updatePreferredTheme=useCallback(async(next:'light'|'dark')=>{
    if(!supabase||!authUserId||!account)
      return {ok:false,warning:'Please sign in to save your theme.'};
    try{
      const response=await supabase.from('dli_member_profiles')
        .update({preferred_theme:next})
        .eq('user_id',authUserId).select('user_id').maybeSingle();
      if(response.error||!response.data)
        return {ok:false,warning:'Theme changed locally, but your cloud preference was not saved.'};
      setPreferredTheme(next);
      return {ok:true};
    }catch{
      return {ok:false,warning:'Theme changed on this device, but could not be synced to your account.'};
    }
  },[authUserId,account?.id]);

  useEffect(() => {
    if (!supabase || account?.role !== 'student' ||
        account.studentTier !== 'free' || !authUserId)return;
    // The verified provider identity is sufficient; Realtime authorization
    // still enforces RLS, and every entitlement event triggers a new check.
    const client=supabase;
    const channel=client.channel('dli-entitlement-'+authUserId)
      .on('postgres_changes',{
        event:'*',schema:'public',table:'dli_student_entitlements',
        filter:'student_id=eq.'+authUserId,
      },()=>{void refresh();})
      .subscribe();
    return()=>{void client.removeChannel(channel);};
  },[account?.id,account?.role,account?.studentTier,authUserId,refresh]);

  return (
    <AuthContext.Provider value={{
      state, account, authUserId, hasCompletedProfile, preferredTheme,
      notice, refresh, clearNotice: () => setNotice(null), updatePreferredTheme,
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
