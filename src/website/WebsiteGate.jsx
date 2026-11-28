import { useCallback, useEffect, useState } from 'react';
import App from '../App.jsx';
import './website.css';
import MarketingHome from './MarketingHome.jsx';

const URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
const SESSION = 'tradepast-auth-session';
// Confirmation links must return to the deployed site, never localhost.
const EMAIL_REDIRECT = 'https://omaxi.github.io/omaxfx/';
const configured = Boolean(URL && KEY);

async function auth(path, options = {}) {
  const response = await fetch(URL + '/auth/v1/' + path, {
    method: options.method || 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json', ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || 'Authentication failed.');
  return data;
}
const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch { return null; } };
const saveSession = (value) => { try { localStorage.setItem(SESSION, JSON.stringify(value)); } catch {} };
const clearSession = () => { try { localStorage.removeItem(SESSION); } catch {} };

function Brand() {
  return <a className="tp-brand" href="#/" aria-label="TradePast home"><img className="tp-brand-logo" src={`${import.meta.env.BASE_URL}tradepast-logo.svg?v=3`} alt="" /><span>TradePast</span></a>;
}

function AuthForm({ mode, changeMode, authenticated, notice = '' }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      if (!configured) throw new Error('Account service setup is pending. The site owner must connect the free authentication project.');
      if (mode === 'signup') {
        const result = await auth('signup?redirect_to=' + encodeURIComponent(EMAIL_REDIRECT), { body: { email: email.trim(), password, data: { display_name: name.trim() } } });
        if (result.access_token) authenticated(result);
        else setMessage('Account created. Check your email to confirm your address, then log in.');
      } else {
        authenticated(await auth('token?grant_type=password', { body: { email: email.trim(), password } }));
      }
    } catch (err) { setError(err.message || 'Please try again.'); }
    finally { setBusy(false); }
  };
  const resendConfirmation = async () => {
    if (!email.trim()) { setError('Enter the email address you used to register first.'); return; }
    setResending(true); setError(''); setMessage('');
    try {
      await auth('resend?redirect_to=' + encodeURIComponent(EMAIL_REDIRECT), { body: { type: 'signup', email: email.trim() } });
      setMessage('A fresh confirmation email has been requested. Check your inbox and spam folder, and use the newest email link.');
    } catch (err) { setError(err.message || 'Could not resend the confirmation email. Please wait a few minutes and try again.'); }
    finally { setResending(false); }
  };
  return <section className="tp-auth-card">
    <span className="tp-kicker">{mode === 'signup' ? 'CREATE YOUR FREE ACCOUNT' : 'WELCOME BACK'}</span>
    <h2>{mode === 'signup' ? 'Start backtesting for free.' : 'Log in to TradePast.'}</h2>
    <p className="tp-muted">No credit card. No paid plan required.</p>
    {notice && <div className="tp-alert tp-error" role="alert">{notice}</div>}
    <form onSubmit={submit}>
      {mode === 'signup' && <label>Your name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Omar Ali" autoComplete="name" required maxLength={70}/></label>}
      <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required/></label>
      {error && <div className="tp-alert tp-error" role="alert">{error}</div>}
      {message && <div className="tp-alert tp-success" role="status">{message}</div>}
      <button className="tp-button tp-primary tp-wide" disabled={busy || !configured}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create free account →' : 'Log in →'}</button>
      {mode === 'signup' && configured && <button type="button" className="tp-resend-link" onClick={resendConfirmation} disabled={resending}>{resending ? 'Sending…' : 'Resend confirmation email'}</button>}
      {!configured && <small className="tp-config-note">Free account registration will activate when the Supabase project is connected.</small>}
    </form>
    <div className="tp-switch">{mode === 'signup' ? 'Already registered?' : 'New to TradePast?'} <button onClick={() => changeMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Log in' : 'Create an account'}</button></div>
  </section>;
}

function AdToast() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = window.setTimeout(() => setVisible(true), 1800);
    const hide = window.setTimeout(() => setVisible(false), 5800);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);
  return <div className={'tp-ad-toast ' + (visible ? 'visible' : '')} aria-live="polite" aria-hidden={!visible}><i/>Advertising</div>;
}

function Home({ go }) {
  return <div className="tp-site">
    <header className="tp-nav"><Brand/><nav><a href="#features">Features</a><a href="#how">How it works</a><a href="#free">Free access</a></nav><div><button className="tp-button tp-ghost" onClick={() => go('login')}>Log in</button><button className="tp-button tp-primary" onClick={() => go('signup')}>Get started free →</button></div></header>
    <main>
      <section className="tp-hero"><div className="tp-copy"><span className="tp-kicker">THE MARKET REPLAY WORKSPACE</span><h1>Build your edge.<br/><em>One replay at a time.</em></h1><p>Practice on historical markets with TradePast. Replay price action, test your ideas, manage simulated trades and understand your performance — without risking real capital.</p><div className="tp-actions"><button className="tp-button tp-primary tp-large" onClick={() => go('signup')}>Start for free →</button><button className="tp-button tp-outline tp-large" onClick={() => go('login')}>I already have an account</button></div><div className="tp-checks"><span>✓ Free account</span><span>✓ No credit card</span><span>✓ Browser based</span></div></div>
      <div className="tp-preview"><div className="tp-preview-head"><b>● XAUUSD</b><span>1m　5m　1H</span><small>MARKET REPLAY</small></div><div className="tp-chart"><div className="tp-chart-lines"></div><svg viewBox="0 0 600 280" aria-label="Illustrative trading candlestick chart"><path d="M0 220 L45 190 L80 210 L115 150 L150 174 L190 120 L225 145 L260 95 L300 120 L340 70 L380 105 L420 52 L460 80 L500 38 L550 62 L600 25" fill="none" stroke="#3978ed" strokeWidth="2" opacity=".75"/>{Array.from({length:27},(_,i)=>{const x=12+i*22;const y=220-Math.sin(i*.55)*48-i*5;const up=i%4!==1;const h=12+(i*7)%27;return <g key={i} stroke={up?'#19b6a4':'#f05d68'}><path d={'M'+(x+5)+' '+(y-13)+'V'+(y+h+9)} strokeWidth="1.5"/><rect x={x} y={up?y:y-h} width="10" height={h} fill={up?'#19b6a4':'#f05d68'}/></g>})}<path d="M0 184H600" stroke="#3b82f6" strokeDasharray="4 5"/></svg><div className="tp-time-axis"><span>23:00</span><span>23:15</span><span>23:30</span><span>23:45</span><span>00:00</span></div></div><div className="tp-result"><small>BACKTEST RESULT</small><strong>+12.84%</strong><span>Illustrative performance</span></div></div></section>
      <section className="tp-highlights"><div><b>Replay</b><span>Move through historical candles</span></div><div><b>Practice</b><span>Place and manage simulated trades</span></div><div><b>Analyze</b><span>Review results and performance</span></div></section>
      <section className="tp-section" id="features"><div className="tp-section-title"><span className="tp-kicker">YOUR TRADING WORKSPACE</span><h2>Everything you need to<br/>practice with purpose.</h2><p>A focused toolkit for traders who want to learn from the chart, not guess what happens next.</p></div><div className="tp-features"><article><b>01</b><i>⌁</i><h3>Historical market replay</h3><p>Step through market data candle by candle and work with multiple timeframes.</p></article><article><b>02</b><i>↗</i><h3>Manual trade execution</h3><p>Practice entries, stop losses, take profits and pending orders in a simulated environment.</p></article><article><b>03</b><i>▤</i><h3>Charting and drawings</h3><p>Use chart tools, indicators, sessions and multi-chart layouts to study price action.</p></article><article><b>04</b><i>◫</i><h3>Performance analytics</h3><p>Review your equity curve, trade history, win rate, drawdown and statistics.</p></article><article><b>05</b><i>◷</i><h3>Practice at your pace</h3><p>Pause, step forward, change replay speed and revisit your decisions.</p></article><article><b>06</b><i>◇</i><h3>Built for learning</h3><p>Build consistency through repetition, review and deliberate practice.</p></article></div></section>
      <section className="tp-how" id="how"><div><span className="tp-kicker">SIMPLE BY DESIGN</span><h2>From idea to insight<br/>in three steps.</h2></div><div className="tp-steps"><p><b>1</b><span><strong>Create your free account</strong><small>Register with your email. No payment details required.</small></span></p><p><b>2</b><span><strong>Open the backtesting engine</strong><small>Choose a market and historical period, then start replaying.</small></span></p><p><b>3</b><span><strong>Review and improve</strong><small>Analyze your trades and refine your process.</small></span></p></div></section>
      <section className="tp-free" id="free"><span className="tp-kicker">STRAIGHTFORWARD ACCESS</span><h2>Start free. Stay focused.</h2><p>Get access to the TradePast web backtesting engine with a free account.</p><div className="tp-plan"><span className="tp-kicker">TRADEPAST FREE</span><h3>$0 <small>/ forever</small></h3><p>No credit card. No trial countdown.</p><ul><li>Full web backtesting engine</li><li>Charting, replay and trade simulation</li><li>Analytics and trade history</li><li>Free account registration</li><li>Advertising-supported access</li></ul><button className="tp-button tp-primary tp-wide" onClick={() => go('signup')}>Create free account →</button><small className="tp-muted">An optional ad-free purchase is planned for a later release.</small></div></section>
    </main><footer className="tp-footer"><Brand/><span>© {new Date().getFullYear()} TradePast. Practice with purpose.</span><a href="mailto:support@tradepast.com">Contact</a></footer>
  </div>;
}

export default function WebsiteGate() {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, '') || 'home');
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [callbackError, setCallbackError] = useState('');
  const go = useCallback((next) => { window.location.hash = next === 'home' ? '/' : '/' + next; setRoute(next); }, []);
  const accept = useCallback((next) => { saveSession(next); setSession(next); setUser(next.user || null); go('app'); }, [go]);
  const logout = useCallback(async () => {
    const current = session || readSession();
    try { if (current?.access_token && configured) await auth('logout', { token: current.access_token }); } catch {}
    clearSession(); setSession(null); setUser(null); go('home');
  }, [session, go]);
  useEffect(() => { const handler = () => setRoute(window.location.hash.replace(/^#\/?/, '') || 'home'); window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler); }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      // Supabase's implicit confirmation flow returns tokens/errors in the URL fragment.
      const fragment = window.location.hash.replace(/^#/, '');
      const callback = new URLSearchParams(fragment);
      const callbackCode = callback.get('error_code');
      if (callbackCode) {
        const description = (callback.get('error_description') || 'The confirmation link is invalid or has expired.').replace(/\+/g, ' ');
        if (active) { setCallbackError(callbackCode === 'otp_expired' ? 'This confirmation link has expired or has already been used. Enter your email below and request a fresh confirmation email.' : description); setRoute('auth-error'); }
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        if (active) setChecking(false);
        return;
      }
      const callbackAccessToken = callback.get('access_token');
      if (callbackAccessToken) {
        const callbackSession = {
          access_token: callbackAccessToken,
          refresh_token: callback.get('refresh_token') || '',
          token_type: callback.get('token_type') || 'bearer',
          expires_in: Number(callback.get('expires_in') || 3600),
          expires_at: Math.floor(Date.now() / 1000) + Number(callback.get('expires_in') || 3600),
        };
        saveSession(callbackSession);
        window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/app');
        try {
          const profile = await auth('user', { method: 'GET', token: callbackSession.access_token });
          if (active) { setSession(callbackSession); setUser(profile); setRoute('app'); }
        } catch {
          if (active) { setCallbackError('Your email was confirmed, but we could not start your session. Please log in.'); setRoute('login'); }
        }
        if (active) setChecking(false);
        return;
      }
      const saved = readSession();
      if (!saved?.access_token || !configured) { if (active) setChecking(false); return; }
      try {
        let current = saved;
        let profile;
        try { profile = await auth('user', { method: 'GET', token: current.access_token }); }
        catch {
          if (!current.refresh_token) throw new Error('Session expired');
          current = await auth('token?grant_type=refresh_token', { body: { refresh_token: current.refresh_token } });
          profile = await auth('user', { method: 'GET', token: current.access_token });
          saveSession(current);
        }
        if (active) { setSession(current); setUser(profile); }
      } catch { clearSession(); }
      finally { if (active) setChecking(false); }
    })();
    return () => { active = false; };
  }, []);
  if (window.tradePastDesktop?.isElectron) return <App/>;
  // Public guest entry: launch the backtesting engine directly without account UI.
  if (route === 'play') return <App/>;
  if (checking) return <div className="tp-boot"><Brand/><span>Preparing your workspace…</span></div>;
  if (route === 'app' && session?.access_token) return <div className="tp-engine-shell"><App/><div className="tp-account-chip"><span>{(user?.user_metadata?.display_name || user?.email || 'T').slice(0,1).toUpperCase()}</span><small>{user?.email || 'Account'}</small><button onClick={logout}>Log out</button></div><AdToast/></div>;
  if (route === 'app') return <div className="tp-boot"><Brand/><span>Please log in to continue.</span><button className="tp-button tp-primary" onClick={() => go('login')}>Log in</button></div>;
  if (route === 'auth-error') return <div className="tp-auth-page"><header className="tp-nav"><Brand/><button className="tp-button tp-ghost" onClick={() => go('home')}>← Home</button></header><div className="tp-auth-layout"><div><span className="tp-kicker">EMAIL CONFIRMATION</span><h1>One more<br/><em>step to go.</em></h1><p>Your email link needs to be current. Request a fresh confirmation email and open the newest message.</p><small>CHECK YOUR INBOX AND SPAM FOLDER</small></div><AuthForm mode="signup" changeMode={go} authenticated={accept} notice={callbackError}/></div></div>;
  if (route === 'login' || route === 'signup') return <div className="tp-auth-page"><header className="tp-nav"><Brand/><button className="tp-button tp-ghost" onClick={() => go('home')}>← Home</button></header><div className="tp-auth-layout"><div><span className="tp-kicker">TRADEPAST WEB</span><h1>Make every<br/><em>replay count.</em></h1><p>Learn from historical price action. Practice your plan. Measure your progress.</p><small>FREE ACCESS　•　NO CREDIT CARD</small></div><AuthForm mode={route} changeMode={go} authenticated={accept}/></div></div>;
  return <MarketingHome go={go}/>;
}
