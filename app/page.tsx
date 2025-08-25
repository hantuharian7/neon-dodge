'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy, useCrossAppAccounts, CrossAppAccountWithMetadata } from '@privy-io/react-auth';
import NeonDodge from './ui/NeonDodge';

const MGID = process.env.NEXT_PUBLIC_PROVIDER_APP_ID!;
const USERNAME_API = process.env.NEXT_PUBLIC_GAMES_ID_API!;
const USERNAME_SITE = 'https://monad-games-id-site.vercel.app/';

type SubmitState = { lastTx?: string; total: number; count: number; best: number; note?: string };

export default function Page() {
  const { ready, authenticated, user, logout } = usePrivy();
  const cross = useCrossAppAccounts() as any;

  const [addr, setAddr] = useState<`0x${string}` | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle'|'loading'|'ready'|'need-username'|'waiting-username'>('idle');
  const [dash, setDash] = useState<SubmitState>({ total: 0, count: 0, best: 0 });

  const pollId = useRef<number | null>(null);

  // MGID-only helpers
  function getMGIDWallet(u: any): `0x${string}` | null {
    const acc = (u?.linkedAccounts || [])
      .find((a: any) => a?.type === 'cross_app' && a?.providerApp?.id === MGID) as CrossAppAccountWithMetadata | undefined;
    const w = acc?.embeddedWallets?.[0]?.address as `0x${string}` | undefined;
    return w ?? null;
  }
  async function signInWithMGID() {
    setStatus('loading');
    try {
      await cross?.loginWithCrossAppAccount?.({ appId: MGID });
      await bootstrap();
    } catch { setStatus('idle'); }
  }
  async function ensureLinkedMGID() { try { await cross?.linkWithCrossAppAccount?.({ appId: MGID }); } catch {} }

  async function fetchUsername(a: `0x${string}`): Promise<string | null> {
    const r = await fetch(`${USERNAME_API}?wallet=${a}`);
    const d = await r.json();
    return d?.hasUsername && d?.user?.username ? d.user.username : null;
  }
  function startPollingUsername(a: `0x${string}`) {
    if (pollId.current) return;
    setStatus('waiting-username');
    pollId.current = window.setInterval(async () => {
      try {
        const u = await fetchUsername(a);
        if (u) { stopPollingUsername(); setUsername(u); setStatus('ready'); }
      } catch {}
    }, 2500);
  }
  function stopPollingUsername() { if (pollId.current) { clearInterval(pollId.current); pollId.current = null; } }
  function openUsernamePage(a: `0x${string}`) {
    const url = `${USERNAME_SITE}?wallet=${a}&ref=neon-dodge`;
    window.open(url, '_blank', 'noopener');
    startPollingUsername(a);
  }

  async function bootstrap() {
    setStatus('loading');
    await ensureLinkedMGID();
    const a = getMGIDWallet(user);
    if (!a) { setStatus('idle'); return; }
    setAddr(a);
    const uname = await fetchUsername(a).catch(() => null);
    if (uname) { setUsername(uname); setStatus('ready'); return; }
    setStatus('need-username');
  }
  useEffect(() => { if (ready && authenticated) bootstrap(); }, [ready, authenticated]); // eslint-disable-line
  useEffect(() => () => stopPollingUsername(), []);

  async function submitDelta(delta: number) {
    if (!addr || !username) return;
    if (delta <= 0) { setDash(s => ({ ...s, note: 'Collect at least one orb to submit a score.' })); return; }
    const body = JSON.stringify({ address: addr, delta, nonce: crypto.randomUUID() });
    let tries = 0, lastErr = '';
    while (tries < 3) {
      try {
        const r = await fetch('/actions/submitScore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const d = await r.json();
        if (d?.ok) {
          setDash(s => ({
            best: Math.max(s.best, delta),
            total: s.total + delta,
            count: s.count + 1,
            lastTx: d.txHash || s.lastTx,
            note: `Submitted +${delta}${d.txHash ? ' — tx ' + d.txHash.slice(0,6)+'…'+d.txHash.slice(-6) : ''}`,
          }));
          confetti(); return;
        }
        if (d?.skipped || d?.duplicate) {
          setDash(s => ({ ...s, count: s.count + 1, note: d.skipped ? 'Score was 0 — skipped.' : 'Duplicate ignored.' }));
          return;
        }
        lastErr = d?.error || 'Submit failed';
      } catch (e: any) { lastErr = e?.message || 'Network error'; }
      tries++; await new Promise(r => setTimeout(r, 420 * (2 ** tries)));
    }
    setDash(s => ({ ...s, note: `Retry failed: ${lastErr}` }));
  }

  // ——— UI

  // Loading / not authenticated
  if (!ready || !authenticated) {
    return (
      <main className="hero-center">
        <div className="ring-hero" aria-hidden="true" />
        <div className="hero-card">
          <div className="logo3d">
            <span className="dot" /><span className="word">NEON</span>
          </div>
          <p className="tagline">Dodge the grid. Precision or perish.</p>
          <button className="btn-cta" onClick={signInWithMGID}>Sign in with Monad Games ID</button>
          <p className="hint">MGID is required for identity and the shared leaderboard.</p>
        </div>
      </main>
    );
  }

  const canPlay = Boolean(addr && username);

  return (
    <main className="frame">
      {/* Dock (left) */}
      <aside className="dock">
        <div className="emblem">
          <i className="e1" /><i className="e2" /><i className="e3" />
          <span className="mark">ND</span>
        </div>

        <div className="dock-metrics">
          <MetricV title="Best" value={dash.best.toString()} />
          <MetricV title="Total" value={dash.total.toString()} />
          <MetricV title="Submits" value={dash.count.toString()} />
          <MetricVT title="Last Tx" value={dash.lastTx ? dash.lastTx.slice(0,6)+'…'+dash.lastTx.slice(-6) : '—'}
                    href={dash.lastTx ? `https://testnet.monadexplorer.com/tx/${dash.lastTx}` : undefined}/>
        </div>

        <div className="ticker">
          <span className="t-label">Status</span>
          <span className="t-dot" />
          <span className="t-text">{dash.note ?? 'Ready'}</span>
        </div>
      </aside>

      {/* Stage (right) */}
      <section className="stage">
        <header className="idbar">
          <div className="idrow">
            <span className="pill">Wallet</span>
            <span className="mono">{addr ?? '—'}</span>
          </div>
          <div className="idrow">
            <span className="pill">Username</span>
            <span className="mono">{username ?? '(not set)'}</span>
          </div>

          {!canPlay && status === 'need-username' && (
            <div className="idrow full">
              <span className="muted">Reserve your MGID username to continue.</span>
              <div className="grow" />
              <button className="btn-ghost" onClick={() => addr && openUsernamePage(addr)}>Open page</button>
              <button className="btn-ghost" onClick={() => addr && startPollingUsername(addr)}>Check again</button>
            </div>
          )}

          <div className="grow" />
          <button className="btn-ghost" onClick={() => logout()}>Logout</button>
        </header>

        <div className="canvas-wrap">
          <div className="canvas-hud">
            <span>WASD or Arrow Keys</span>
            <span>Score appears in-canvas</span>
          </div>
          <div className="canvas-card">
            <NeonDodge onGameOver={(score) => submitDelta(score)} />
          </div>
        </div>

        {dash.note && <div className="note"><span className="chip">{dash.note}</span></div>}
      </section>

      <div id="confetti-layer" aria-hidden="true" />
    </main>
  );
}

function MetricV({ title, value }: { title: string; value: string }) {
  return (
    <div className="mV">
      <div className="mV_t">{title}</div>
      <div className="mV_v">{value}</div>
    </div>
  );
}
function MetricVT({ title, value, href }: { title: string; value: string; href?: string }) {
  const inner = (
    <div className="mV">
      <div className="mV_t">{title}</div>
      <div className="mV_v">{value}</div>
    </div>
  );
  return href ? <a className="mLink" href={href} target="_blank" rel="noreferrer">{inner}</a> : inner;
}

function confetti() {
  const layer = document.getElementById('confetti-layer');
  if (!layer) return;
  const N = 100;
  for (let i = 0; i < N; i++) {
    const el = document.createElement('i');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + '%';
    el.style.setProperty('--tx', (Math.random() * 60 - 30) + 'px');
    el.style.setProperty('--rot', (Math.random() * 360) + 'deg');
    el.style.animationDelay = (Math.random() * 0.2) + 's';
    layer.appendChild(el);
    setTimeout(() => { try { layer.removeChild(el); } catch {} }, 1600);
  }
}
