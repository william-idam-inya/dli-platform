import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, KeyRound, LockKeyhole } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { PasswordInput } from './PasswordInput';
import { deploymentIdentity } from '../lib/deploymentIdentity';
import OfficialDliLogo from '../components/OfficialDliLogo';
import { isRecoveryEmailRateLimited, recoveryRateLimitMessage } from './recoveryRateLimit';

function AuthLayout({ title, intro, children }: {
  title: string; intro: string; children: ReactNode;
}) {
  return (
    <main className="auth-frame">
      <div className="auth-panel">
        <div className="auth-mark"><OfficialDliLogo /></div>
        <p className="auth-eyebrow">DETAILED LEARNING INSTITUTE</p>
        <h1>{title}</h1>
        <p className="auth-intro">{intro}</p>
        {children}
      </div>
    </main>
  );
}

function Feedback({ message, error = false }: { message: string | null; error?: boolean }) {
  if (!message) return null;
  return <p role={error ? 'alert' : 'status'} className={`auth-feedback ${error ? 'error' : 'success'}`}>{message}</p>;
}

export function AuthChecking() {
  // Presentation only. AuthProvider still verifies Supabase session, member status
  // and the permitted role before any protected workspace can render.
  return <main className="auth-frame dli-welcome-loading">
    <section className="dli-welcome-loading-card" aria-label="Detailed Learning Institute">
      <div className="dli-welcome-loading-logo"><OfficialDliLogo /></div>
      <h1>Detailed Learning Institute</h1>
      <p className="dli-welcome-loading-tagline">DLI-ONLINE · Learn • Improve • Excel</p>
      <div className="dli-welcome-loading-status" role="status" aria-live="polite">
        <span className="dli-welcome-loading-spinner" aria-hidden="true"/>
        <span>Opening your learning space…</span>
      </div>
    </section>
  </main>;
}

export function AuthTemporarilyUnavailable() {
  const { refresh } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const signInAgain = async () => {
    if (!supabase || resetting) return;
    setResetting(true);
    setResetError(null);
    try {
      // User-initiated local recovery: leave sessions on other devices untouched.
      // Supabase clears browser session even if server revocation is unavailable.
      await supabase.auth.signOut({ scope: 'local' });
      window.location.assign('/login');
    } catch {
      setResetError('Could not reset this browser session. Open the site in a private browser window and sign in there.');
      setResetting(false);
    }
  };
  return <AuthLayout title="Access check temporarily unavailable"
    intro="We could not confirm your DLI membership. Please retry before continuing.">
    <p role="alert" className="auth-feedback error">
      Your saved session or the account verification service could not be verified.
      This does not necessarily mean your account was removed.
    </p>
    <button type="button" className="auth-submit" disabled={resetting}
      onClick={() => { void refresh(); }}>
      Retry secure access check
    </button>
    <button type="button" className="auth-submit" disabled={resetting}
      onClick={() => { void signInAgain(); }}>
      {resetting ? 'Preparing secure sign-in…' : 'Sign in again on this device'}
    </button>
    <Feedback error message={resetError} />
    <p className="auth-helper">Signing in again clears only this browser's saved DLI session;
      your account and sessions on other devices remain unchanged. If verification still
      fails, check your connection or try a private browser window. Never share passwords
      or invitation links.</p>
  </AuthLayout>;
}

export function MissingConfiguration() {
  if (deploymentIdentity.mismatch) return <AuthLayout
    title="Deployment configuration mismatch"
    intro="This Cloudflare address is connected to the wrong DLI environment. Secure sign-in is blocked until DLI administration corrects the deployment.">
    <p role="alert" className="auth-feedback error">
      Changing your account password will not correct a database mismatch.
    </p>
  </AuthLayout>;
  return <AuthLayout title="Setup required" intro="This deployment does not yet have the public Supabase connection settings.">
    <Feedback error message="Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to a local .env.local file, then restart Vite. Never add a service-role or secret key." />
  </AuthLayout>;
}

export function LoginPage() {
  const { state, notice, clearNotice } = useAuth();
  const location=useLocation();
  const from=(location.state as {from?:unknown}|null)?.from;
  const afterLogin=typeof from==='string'&&from.startsWith('/')&&
    !from.startsWith('//')&&!from.includes('\\')&&from.length<=350&&
    !from.startsWith('/login')?from:'/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (state === 'active') return <Navigate replace to={afterLogin} />;
  if (state === 'config-error') return <MissingConfiguration />;
  if (state === 'checking') return <AuthChecking />;
  if (state === 'unavailable') return <AuthTemporarilyUnavailable />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || pending) return;
    setPending(true);
    setError(null);
    clearNotice();
    // Password managers can fill the native inputs without dispatching
    // React change events. Read current form values at submit time so a
    // visible autofill is never silently replaced by stale component state.
    const formValues = new FormData(event.currentTarget);
    const submittedEmail = String(formValues.get('username') ?? email).trim().toLowerCase();
    const submittedPassword = String(formValues.get('password') ?? password);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: submittedEmail, password: submittedPassword,
    });
    if (signInError) setError('Sign-in failed. Check your credentials and account verification.');
    setPending(false);
  };

  return <AuthLayout title="Sign in to DLI" intro="Only authorised students and staff can access this workspace.">
    <Feedback error message={error || notice} />
    <form className="auth-form" onSubmit={submit} autoComplete="on">
      <label htmlFor="login-email">Email address</label>
      <input id="login-email" name="username" type="email" required autoComplete="username"
        autoCapitalize="none" spellCheck={false}
        value={email} onChange={event => setEmail(event.target.value)}
        onInput={event => setEmail(event.currentTarget.value)} />
      <label htmlFor="login-password">Password</label>
      <PasswordInput id="login-password" name="password" label="password"
        autoComplete="current-password" value={password} onChange={setPassword} />
      <button className="auth-submit" type="submit" disabled={pending}>
        <LockKeyhole size={16} /> {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
    <div className="auth-links"><Link to="/forgot-password">Forgot your password?</Link></div>
    <p className="auth-helper">There is no public registration. Contact DLI administration to request access.</p>
    {deploymentIdentity.kind==='qa'&&<p className="auth-helper">
      <strong>QA testing:</strong> This site uses a separate account directory and password
      from production. If your production password does not work here,
      select <Link to="/forgot-password">Forgot your password?</Link> to
      recover this QA account. Resetting it will not change your production password.
    </p>}

  </AuthLayout>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  if (!supabase) return <MissingConfiguration />;

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || pending || rateLimited) return;
    setPending(true);
    setError(null);
    try {
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/set-password` },
      );
      if (sendError) {
        if (isRecoveryEmailRateLimited(sendError)) {
          setRateLimited(true);
          setError(recoveryRateLimitMessage);
        } else {
          setError('Password recovery could not be completed. Check with DLI administration if this continues.');
        }
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('The recovery service could not be reached. Check your connection before trying again.');
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
          <button className="auth-submit" type="submit" disabled={pending || rateLimited}>
            <KeyRound size={16} /> {pending ? 'Submitting…' : rateLimited ? 'Email limit reached' : 'Request recovery'}
          </button>
        </form>}
    <p className="auth-helper">If the email doesn't arrive, check your spam folder or contact DLI support.</p>
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
      const { error: verifyError } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!live) return;
      if (verifyError) setError('This link is invalid or expired. Request a new one from DLI administration.');
      else navigate('/set-password', { replace: true });
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
    if (password.length < 12 || password !== repeat) {
      setError('Use at least 12 characters and make sure both passwords match.');
      return;
    }
    setPending(true);
    setError(null);
    const { error: saveError } = await supabase.auth.updateUser({ password });
    if (saveError) setError('Could not set the password. Please request another secure link.');
    else navigate('/', { replace: true });
    setPending(false);
  };

  return <AuthLayout title="Set your password" intro="Complete your invitation or account recovery.">
    <form className="auth-form" onSubmit={save}>
      <Feedback error message={error} />
      <label htmlFor="set-password">New password</label>
      <PasswordInput id="set-password" label="new password" minLength={12}
        autoComplete="new-password" value={password} onChange={setPassword} />
      <label htmlFor="set-password-again">Confirm new password</label>
      <PasswordInput id="set-password-again" label="confirmed password" minLength={12}
        autoComplete="new-password" value={repeat} onChange={setRepeat} />
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
    if (password.length < 12 || password !== repeat) {
      setError('Use at least 12 characters and ensure passwords match.');
      return;
    }
    setPending(true);
    setMessage(null);
    setError(null);
    const { error: changeError } = await supabase.auth.updateUser({
      password, current_password: current,
    });
    if (changeError) setError('Password change failed. Check your current password.');
    else {
      setMessage('Your password was changed.');
      setCurrent(''); setPassword(''); setRepeat('');
    }
    setPending(false);
  };

  return <div className="module-page">
    <Link className="back-link" to="/"><ArrowLeft size={16}/> Back to overview</Link>
    <h1>Account security</h1>
    <p className="auth-intro">Change the password of your authorised DLI account.</p>
    <form className="auth-form security-form" onSubmit={save}>
      <Feedback error message={error} />
      <Feedback message={message} />
      <label htmlFor="current-password">Current password</label>
      <PasswordInput id="current-password" label="current password" autoComplete="current-password"
        value={current} onChange={setCurrent} />
      <label htmlFor="change-password">New password</label>
      <PasswordInput id="change-password" label="new password" minLength={12}
        autoComplete="new-password" value={password} onChange={setPassword} />
      <label htmlFor="change-repeat">Confirm new password</label>
      <PasswordInput id="change-repeat" label="confirmed password" minLength={12}
        autoComplete="new-password" value={repeat} onChange={setRepeat} />
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
