// KA Portal entry: decides between setup, sign-in and the desktop, and re-shows sign-in over the
// desktop (keeping open windows and unsaved edits) if the session ends.
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import './portal.css';
import './apps.css';
import { api, onSignedOut, setCsrf } from './api';
import { AuthScreen, ChoosePassword } from './shell/Auth';
import type { Session } from './shell/Auth';
import { DeskProvider, useDesk } from './shell/desk';
import { Window } from './shell/Window';
import { Dock, HomeScreen, useChrome } from './shell/Chrome';
import { ConfirmProvider, ToastProvider, Spinner } from './ui';
import { useMedia } from './hooks';
import logo from './assets/ka-logo.png';

type Boot = { state: 'loading' } | { state: 'error'; message: string } | { state: 'setup' } | { state: 'login' } | { state: 'in'; session: Session };

function App(){
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [expired, setExpired] = useState(false);
  const start = useCallback(async () => {
    setBoot({ state: 'loading' });
    try {
      const st = await api<{ needsSetup: boolean; signedIn: boolean }>('GET', '/setup-status');
      if (st.signedIn){
        const s = await api<{ email: string; csrf: string; role: 'owner' | 'admin'; name: string; mustChangePassword: boolean }>('GET', '/session');
        setCsrf(s.csrf); setBoot({ state: 'in', session: { email: s.email, csrf: s.csrf, role: s.role, name: s.name, mustChangePassword: s.mustChangePassword } }); return;
      }
      setBoot({ state: st.needsSetup ? 'setup' : 'login' });
    } catch (e: any){
      setBoot({ state: 'error', message: e?.message || 'Couldn’t reach the server.' });
    }
  }, []);
  useEffect(() => { void start(); }, [start]);
  useEffect(() => onSignedOut(() => setExpired(true)), []);

  if (boot.state === 'loading') return <div className="boot" role="status" aria-label="Loading"><img src={logo} alt="" width={64} height={64} /><Spinner size={18} /></div>;
  if (boot.state === 'error') return (
    <div className="boot" role="alert"><img src={logo} alt="" width={64} height={64} /><p>{boot.message}</p><button type="button" className="btn" onClick={start}>Try again</button></div>
  );
  if (boot.state === 'setup' || boot.state === 'login') return <AuthScreen mode={boot.state} onSignedIn={(s) => setBoot({ state: 'in', session: s })} />;
  if (boot.session.mustChangePassword) return <ChoosePassword session={boot.session}
    onDone={() => setBoot({ state: 'in', session: { ...boot.session, mustChangePassword: false } })}
    onSignOut={() => { void api('POST', '/logout').catch(() => {}); setCsrf(''); setBoot({ state: 'login' }); }} />;
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Desktop session={boot.session} onSignedOut={() => { setCsrf(''); setExpired(false); setBoot({ state: 'login' }); }} />
        {expired && <AuthScreen mode="login" overlay onSignedIn={(s) => { setExpired(false); setBoot({ state: 'in', session: s }); }} />}
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Desktop({ session, onSignedOut }: { session: Session; onSignedOut: () => void }){
  const area = useRef<HTMLDivElement>(null);
  return (
    <DeskProvider areaRef={area}>
      <DesktopInner session={session} onSignedOut={onSignedOut} areaRef={area} />
    </DeskProvider>
  );
}
function DesktopInner({ session, onSignedOut, areaRef }: { session: Session; onSignedOut: () => void; areaRef: React.RefObject<HTMLDivElement> }){
  const desk = useDesk();
  const compact = useMedia('(max-width: 760px), (max-height: 520px) and (pointer: coarse)');
  const { menubar, overlays, pulse } = useChrome({ email: session.email, onSignedOut });
  const visible = desk.wins.filter(w => !w.min);
  useEffect(() => { document.body.classList.toggle('is-compact', compact); }, [compact]);
  return (
    <div className={'desktop' + (compact ? ' compact' : '')}>
      <a className="skip" href="#desk-area" onClick={(e) => { e.preventDefault(); (document.querySelector('.win.focused .win-body') as HTMLElement | null)?.focus(); }}>Skip to the front window</a>
      {menubar}
      <main id="desk-area" ref={areaRef} className="desk-area" aria-label="Desktop">
        <div className="wallpaper-mark" aria-hidden="true"><img src={logo} alt="" /></div>
        {compact && !visible.length && <HomeScreen />}
        {desk.wins.map(w => <Window key={w.id} win={w} compact={compact} />)}
      </main>
      <Dock pulse={pulse} compact={compact} />
      {overlays}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
