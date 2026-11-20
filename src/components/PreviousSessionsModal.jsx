import { useEffect, useMemo, useState } from 'react';
import { X, History, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { useStore } from '../store';
import { fmtMoney } from '../utils/format';

const money = value => `$${fmtMoney(Math.abs(Number(value) || 0), 0)}`;
const dateText = value => value ? new Date(value).toLocaleString() : '—';

export default function PreviousSessionsModal() {
  const { isPreviousSessionsOpen, closePreviousSessions, openAnalyticsForSession, readSessions } = useStore();
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (isPreviousSessionsOpen) setSessions(readSessions());
  }, [isPreviousSessionsOpen, readSessions]);

  const rows = useMemo(() => sessions.map(session => {
    const trades = Array.isArray(session.tradeHistory) ? session.tradeHistory : [];
    const pnl = trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
    const wins = trades.filter(trade => Number(trade.pnl) > 0).length;
    const losses = trades.filter(trade => Number(trade.pnl) < 0).length;
    const startingBalance = Number(session.rules?.startingBalance) || 100000;
    return { ...session, trades, pnl, wins, losses, winRate: trades.length ? wins / trades.length * 100 : 0, returnPct: startingBalance ? pnl / startingBalance * 100 : 0 };
  }).sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)), [sessions]);

  if (!isPreviousSessionsOpen) return null;

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" onClick={closePreviousSessions}>
      <section role="dialog" aria-modal="true" aria-labelledby="previous-sessions-title" className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#303846] bg-[#131722] text-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-[#2a2e39] px-4 py-3">
          <div className="flex items-center gap-2">
            <History size={17} className="text-blue-400"/>
            <div>
              <h2 id="previous-sessions-title" className="text-sm font-bold">Previous sessions</h2>
              <p className="text-[11px] text-gray-500">Performance archive · Read-only review</p>
            </div>
          </div>
          <button onClick={closePreviousSessions} className="rounded-md p-1.5 text-gray-400 hover:bg-[#2a2e39] hover:text-white" aria-label="Close previous sessions"><X size={16}/></button>
        </header>
        <div className="min-h-0 space-y-2 overflow-y-auto p-3">
          {rows.length === 0 ? <div className="py-12 text-center"><History size={28} className="mx-auto mb-2 text-gray-600"/><p className="text-sm text-gray-300">No previous sessions yet</p><p className="mt-1 text-xs text-gray-500">Sessions are added here automatically as OmaxFX saves your progress.</p></div> : rows.map(session => (
            <button key={session.sessionId} onClick={() => openAnalyticsForSession(session)} className="w-full rounded-lg border border-[#2a2e39] bg-[#1b202b] p-3 text-left transition-colors hover:border-blue-500/70 hover:bg-[#202a3a] focus:outline-none focus:ring-1 focus:ring-blue-500">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">{session.sessionName || 'Untitled session'} <span className="font-normal text-gray-500">· {session.symbol || 'Unknown symbol'}</span></div>
                  <div className="mt-1 text-[10px] text-gray-500">Saved {dateText(session.savedAt)} · {session.gameState?.isOver ? 'Completed' : 'Saved session'}</div>
                </div>
                <div className="flex items-center gap-1 rounded-md bg-blue-600/15 px-2 py-1 text-[10px] font-semibold text-blue-300"><BarChart3 size={12}/> View analytics</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div><div className="text-[9px] uppercase text-gray-500">Net P&L</div><div className={`mt-0.5 text-sm font-bold ${session.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{session.pnl >= 0 ? '+' : '-'}{money(session.pnl)}</div></div>
                <div><div className="text-[9px] uppercase text-gray-500">Return</div><div className={`mt-0.5 text-sm font-bold ${session.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{session.returnPct >= 0 ? '+' : ''}{session.returnPct.toFixed(2)}%</div></div>
                <div><div className="text-[9px] uppercase text-gray-500">Closed trades</div><div className="mt-0.5 text-sm font-bold text-gray-200">{session.trades.length}</div></div>
                <div><div className="text-[9px] uppercase text-gray-500">Win rate</div><div className="mt-0.5 flex items-center gap-1 text-sm font-bold text-gray-200"><TrendingUp size={12} className="text-emerald-400"/>{session.winRate.toFixed(1)}% <span className="text-[9px] font-normal text-gray-500">({session.wins}W / {session.losses}L)</span></div></div>
              </div>
            </button>
          ))}
        </div>
        <footer className="border-t border-[#2a2e39] px-4 py-2 text-[10px] text-gray-500">Opening a session displays its saved analytics only. It does not resume or modify the backtest.</footer>
      </section>
    </div>
  );
}
