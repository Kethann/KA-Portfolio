// Sign-in screens: first-time owner setup (needs the setup code), sign in, and the 2FA code step.
// Errors are announced (aria-live); lockouts show when to try again.
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError, setCsrf } from '../api';
import { Icon } from '../icons';
import { Spinner } from '../ui';
import logo from '../assets/ka-logo.png';

export type Session = { email: string; csrf: string };

export function AuthScreen({ mode, onSignedIn, overlay }: { mode: 'setup' | 'login'; onSignedIn: (s: Session) => void; overlay?: boolean }){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (needCode) codeRef.current?.focus(); }, [needCode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const body = mode === 'setup' ? { email, password, token } : { email, password, code: needCode ? code : undefined };
      const r = await api<{ csrf: string; email: string }>('POST', mode === 'setup' ? '/setup' : '/login', body);
      setCsrf(r.csrf);
      setPassword(''); setCode('');
      onSignedIn({ email: r.email, csrf: r.csrf });
    } catch (err){
      const e2 = err as ApiError;
      if (e2.code === 'totp_required'){ setNeedCode(true); setError(''); }
      else if (e2.code === 'locked' && e2.data?.retryAfter){ setError(`Too many attempts. Try again in about ${Math.ceil(e2.data.retryAfter / 60)} minutes.`); }
      else { setError(e2.message); if (e2.code === 'totp_wrong') setCode(''); }
    } finally { setBusy(false); }
  };

  return (
    <div className={'auth' + (overlay ? ' overlay' : '')} role={overlay ? 'dialog' : 'main'} aria-modal={overlay || undefined} aria-labelledby="auth-title">
      <form className="auth-card" onSubmit={submit} noValidate>
        <img className="auth-logo" src={logo} alt="" width={84} height={84} />
        <h1 id="auth-title">{mode === 'setup' ? 'Create the owner account' : overlay ? 'Your session ended' : 'KA Portal'}</h1>
        <p className="auth-sub">{mode === 'setup' ? 'This only works once. Use the setup code from your ADMIN_SETUP_TOKEN setting.' : overlay ? 'Sign in again to continue where you left off.' : 'Sign in to manage your store.'}</p>
        {!needCode ? <>
          <label className="field"><span className="field-label">Email</span>
            <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus inputMode="email" /></label>
          <label className="field"><span className="field-label">Password</span>
            <span className="input-with-btn">
              <input type={show ? 'text' : 'password'} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'setup' ? 12 : undefined} />
              <button type="button" className="icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}><Icon name={show ? 'eyeOff' : 'eye'} /></button>
            </span>
            {mode === 'setup' && <span className="field-hint">At least 12 characters. A short sentence works well.</span>}
          </label>
          {mode === 'setup' && <label className="field"><span className="field-label">Setup code</span><input value={token} onChange={e => setToken(e.target.value)} autoComplete="off" required /></label>}
        </> : (
          <label className="field"><span className="field-label">6-digit code from your authenticator app</span>
            <input ref={codeRef} value={code} onChange={e => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required className="code-input" /></label>
        )}
        <div className="auth-error" role="alert" aria-live="assertive">{error}</div>
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? <Spinner /> : <Icon name={mode === 'setup' ? 'shield' : 'lock'} />} {mode === 'setup' ? 'Create account' : needCode ? 'Verify' : 'Sign in'}</button>
        {needCode && <button type="button" className="btn ghost block" onClick={() => { setNeedCode(false); setCode(''); setError(''); }}>Use a different account</button>}
        <p className="auth-foot"><Icon name="shield" size={13} /> Private area · not indexed by search engines</p>
      </form>
    </div>
  );
}
