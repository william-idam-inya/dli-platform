import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { isPasswordPolicyRejection, passwordPolicyError, passwordRequirementText } from './passwordPolicy';

function AuthLayout({ title, intro, children }: {
  title: string; intro: string; children: ReactNode;
}) {
  return (
    <main className="auth-frame">
      <div className="auth-panel">
        <div className="auth-mark">DLI</div>
        <p className="auth-eyebrow">DETAILED LEARNING INSTITUTE</p>
        <h1>{title}</h1>
        <p className="auth-intro">{intro}</p>
        {children}
        <p className="auth-note"><ShieldCheck size={14} /> Invite-only, role-controlled institutional access</p>
      </div>
    </main>
  );
}

function Feedback({ message, error = false }: { message: string | null; error?: boolean }) {
  if (!message) return null;
  return <p role={error ? 'alert' : 'status'} className={`auth-feedback ${error ? 'error' : 'success'}`}>{message}</p>;
}

export function AuthChecking() {
  return <AuthLayout title="Checking access…" intro="Verifying your session and DLI authorisation.">
    <p role="status" className="auth-feedback">Contacting Supabase Auth and checking your DLI role.</p>
  </AuthLayout>;
}

export function AuthTemporarilyUnavailable() {
  const { refresh } = useAuth();
  return <AuthLayout title="Access check temporarily unavailable"
    intro="We could not confirm your current DLI membership. Your workspace remains restricted until verification succeeds.">
    <p role="alert" className="auth-feedback error">
      The authentication service or account registry could not be reached.
      This does not necessarily mean your account was removed.
    </p>
    <button type="button" className="auth-submit"
      onClick={() => { void refresh(); }}>
      Retry secure access check
    </button>
    <p className="auth-helper">Check your internet connection. If the problem persists,
      contact DLI administration. Do not share passwords or invitation links.</p>
  </AuthLayout>;
}

export function MissingConfiguration() {
  return <AuthLayout title="Setup required" intro="This deployment does not yet have the public Supabase connection settings.">
    <Feedback error message="Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to a local .env.local file, then restart Vite. Never add a service-role or secret key." />
  </AuthLayout>;
}

export function LoginPage() {
  const { state, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (state === 'active') return <Navigate replace to="/" />;
  if (state === 'config-error') return <MissingConfiguration />;
  if (state === 'checking') return <AuthChecking />;
  if (state === 'unavailable') return <AuthTemporarilyUnavailable />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || pending) return;
    setPending(true);
    setError(null);
    clearNotice();
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      });
      if (signInError) setError('Sign-in failed. Check your credentials and account verification.');
    } catch {
      setError('Sign-in service is temporarily unavailable. Check your connection and retry.');
    } finally {
      setPending(false);
    }
  };

  return <AuthLayout title="Sign in to DLI" intro="Only authorised students and staff can access this workspace.">
    <Feedback error message={error || notice} />
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="login-email">Email address</label>
      <input id="login-email" type="email" required autoComplete="username"
        value={email} onChange={event => setEmail(event.target.value)} />
      <label htmlFor="login-password">Password</label>
      <input id="login-password" type="password" required autoComplete="current-password"
        value={password} onChange={event => setPassword(event.target.value)} />
      <button className="auth-submit" type="submit" disabled={pending}>
        <LockKeyhole size={16} /> {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
    <div className="auth-links"><Link to="/forgot-password">Forgot your password?</Link></div>
    <p className="auth-helper">There is no public registration. Contact DLI administration to request access.</p>
  </AuthLayout>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  if (!supabase) return <MissingConfiguration />;

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || pending) return;
    setPending(true);
    setError(null);
    try {
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/set-password`,
      });
      if (sendError) setError('Password recovery is currently unavailable. Contact DLI administration.');
      else setSubmitted(true);
    } catch {
      setError('Password recovery service could not be reached. Check your connection and retry.');
    } finally {
      setPending(false);
    }
  };

  return <AuthLayout title="Password recovery" intro="Request a reset for an existing DLI account.">
    {submitted
      ? <Feedback message="If your account is eligible and email delivery is configured, recovery instructions will arrive in your inbox." />
      : <form className="auth-form" onSubmit={send}>
          <Feedback error message={error} />
          <label htmlFor="recovery-email">Email address</label>
          <input id="recovery-email" type="email" required autoComplete="email"
            value={email} onChange={event => setEmail(event.target.value)} />
          <button className="auth-submit" type="submit" disabled={pending}>
            <KeyRound size={16} /> {pending ? 'Submitting…' : 'Request recovery'}
          </button>
        </form>}
    <p className="auth-helper">On the Supabase Free default email sender, delivery may be limited to project-team addresses. Ask an administrator for assistance if no email arrives.</p>
    <div className="auth-links"><Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link></div>
  </AuthLayout>;
}

export function ConfirmLinkPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setError('Supabase is not configured.'); return; }
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (!tokenHash || (type !== 'invite' && type !== 'recovery')) {
      setError('Invalid or incomplete verification link.');
      return;
    }
    let live = true;
    const client = supabase;
    void (async () => {
      try {
        const { error: verifyError } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
        if (!live) return;
        if (verifyError) setError('This link is invalid or expired. Request a new one from DLI administration.');
        else navigate('/set-password', { replace: true });
      } catch {
        if (live) setError('Verification is temporarily unavailable. Check your connection and reopen the secure link.');
      }
    })();
    return () => { live = false; };
  }, [navigate]);

  return <AuthLayout title="Verifying your link" intro="Confirming your one-time invitation or recovery link.">
    <Feedback error={Boolean(error)} message={error || 'Checking the secure link…'} />
    <div className="auth-links"><Link to="/login">Back to sign in</Link></div>
  </AuthLayout>;
}

export function SetPasswordPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (state === 'checking') return <AuthChecking />;
  if (state === 'config-error') return <MissingConfiguration />;
  if (state === 'unavailable') return <AuthTemporarilyUnavailable />;
  if (state !== 'active') {
    return <AuthLayout title="Access verification required" intro="This password link must belong to a verified and authorised DLI account.">
      <Feedback error message="The session was not authorised. Contact the DLI administrator if this invitation was expected." />
      <div className="auth-links"><Link to="/login">Back to sign in</Link></div>
    </AuthLayout>;
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || pending) return;
    const policyError = passwordPolicyError(password);
    if (policyError || password !== repeat) {
      setError(policyError ?? 'The two passwords must match.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { error: saveError } = await supabase.auth.updateUser({ password });
      if (saveError) setError(isPasswordPolicyRejection(saveError)
        ? 'Supabase rejected that password. Choose a different strong password that meets every requirement.'
        : 'Password update could not be confirmed. Check that your secure link is valid and retry.');
      else navigate('/', { replace: true });
    } catch {
      setError('Password update service could not be reached. Check your connection and retry.');
    } finally {
      setPending(false);
    }
  };

  return <AuthLayout title="Set your password" intro="Complete your invitation or account recovery.">
    <form className="auth-form" onSubmit={save}>
      <Feedback error message={error} />
      <label htmlFor="set-password">New password</label>
      <p className="auth-helper">{passwordRequirementText}</p>
      <input id="set-password" type="password" required minLength={12}
        autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} />
      <label htmlFor="set-password-again">Confirm new password</label>
      <input id="set-password-again" type="password" required minLength={12}
        autoComplete="new-password" value={repeat} onChange={event => setRepeat(event.target.value)} />
      <button className="auth-submit" type="submit" disabled={pending}>
        <KeyRound size={16} /> {pending ? 'Saving…' : 'Set password'}
      </button>
    </form>
  </AuthLayout>;
}

export function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || pending) return;
    const policyError = passwordPolicyError(password);
    if (policyError || password !== repeat) {
      setError(policyError ?? 'The two passwords must match.');
      return;
    }
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const { error: changeError } = await supabase.auth.updateUser({
        password, current_password: current,
      });
      if (changeError) setError(isPasswordPolicyRejection(changeError)
        ? 'Supabase rejected that password. Choose a different strong password that meets every requirement.'
        : 'Password change failed. Verify your current password and session.');
      else {
        setMessage('Your password was changed.');
        setCurrent(''); setPassword(''); setRepeat('');
      }
    } catch {
      setError('Password change service could not be reached. Check your connection and retry.');
    } finally {
      setPending(false);
    }
  };

  return <div className="module-page">
    <Link className="back-link" to="/"><ArrowLeft size={16}/> Back to overview</Link>
    <h1>Account security</h1>
    <p className="auth-intro">Change the password of your authorised DLI account.</p>
    <form className="auth-form security-form" onSubmit={save}>
      <Feedback error message={error} />
      <Feedback message={message} />
      <label htmlFor="current-password">Current password</label>
      <input id="current-password" type="password" required autoComplete="current-password"
        value={current} onChange={event => setCurrent(event.target.value)} />
      <label htmlFor="change-password">New password</label>
      <p className="auth-helper">{passwordRequirementText}</p>
      <input id="change-password" type="password" required minLength={12} autoComplete="new-password"
        value={password} onChange={event => setPassword(event.target.value)} />
      <label htmlFor="change-repeat">Confirm new password</label>
      <input id="change-repeat" type="password" required minLength={12} autoComplete="new-password"
        value={repeat} onChange={event => setRepeat(event.target.value)} />
      <button type="submit" className="auth-submit" disabled={pending}>{pending ? 'Updating…' : 'Update password'}</button>
    </form>
  </div>;
}

export function AccessDeniedPage() {
  return <section className="auth-denied" role="alert">
    <LockKeyhole size={28} />
    <h1>Access restricted</h1>
    <p>Your current DLI role does not have permission to open this workspace area.</p>
    <Link className="primary-button" to="/">Return to your overview</Link>
  </section>;
}
