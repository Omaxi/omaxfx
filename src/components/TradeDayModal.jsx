import { useEffect, useState } from 'react';
import { X, Camera, Download } from 'lucide-react';
import { getTradeScreenshot, renderTradeScreenshot, saveTradeScreenshot } from '../utils/tradeScreenshots';
import { fmtMoney } from '../utils/format';
import TradeScreenshotChart from './TradeScreenshotChart';

const stamp = (unix) => unix ? new Date((unix + 3 * 3600) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '—';
const duration = (trade) => {
  const total = Number(trade.closeTime) - Number(trade.openTime);
  if (!Number.isFinite(total) || total < 0) return '—';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

export default function TradeDayModal({ date, trades, onClose, sessionId, candles, timeframe = 1 }) {
  const [images, setImages] = useState({});
  const [savingId, setSavingId] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.all(trades.map(async trade => {
      let image = await getTradeScreenshot(trade.id, sessionId || 'unsaved-session');
      // Rebuild missing or legacy screenshots from this trade's own market window.
      if (!image) {
        image = renderTradeScreenshot(trade, candles, timeframe);
        if (image) await saveTradeScreenshot(trade.id, image, sessionId || 'unsaved-session').catch(() => false);
      }
      return [String(trade.id), image];
    })).then(entries => { if (active) setImages(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [date, trades, sessionId, candles, timeframe]);

  const captureForTrade = async (trade) => {
    setSavingId(String(trade.id));
    const image = renderTradeScreenshot(trade, candles, timeframe);
    if (image) {
      const saved = await saveTradeScreenshot(trade.id, image, sessionId || 'unsaved-session').catch(() => false);
      if (saved) setImages(current => ({ ...current, [String(trade.id)]: image }));
    }
    setSavingId(null);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/75 flex items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden rounded-xl border border-[#343a40] bg-[#131722] text-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#2a2e39]">
          <div>
            <h2 className="text-base font-bold">Trade journal · {new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h2>
            <p className="text-xs text-gray-400">{trades.length} {trades.length === 1 ? 'trade' : 'trades'} closed</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#2a2e39]" aria-label="Close trade journal"><X size={18}/></button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {!trades.length && <div className="py-12 text-center text-sm text-gray-500">No trades were closed on this day.</div>}
          {trades.map((trade, index) => {
            const image = images[String(trade.id)];
            const isBuy = trade.type === 'buy';
            const pnl = Number(trade.pnl) || 0;
            return (
              <article key={trade.id ?? index} className="grid grid-cols-1 lg:grid-cols-[minmax(210px,0.65fr)_minmax(0,1.35fr)] gap-3 rounded-lg border border-[#2a2e39] bg-[#191e29] p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <b className="text-sm">Trade #{index + 1}</b>
                    <span className={'rounded px-2 py-0.5 text-[10px] font-bold ' + (isBuy ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300')}>{isBuy ? 'BUY' : 'SELL'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Info label="Symbol" value={trade.symbol || '—'}/>
                    <Info label="Result" value={pnl >= 0 ? 'WIN / BREAKEVEN' : 'LOSS'} color={pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}/>
                    <Info label="Entry time" value={stamp(trade.openTime)}/>
                    <Info label="Close time" value={stamp(trade.closeTime)}/>
                    <Info label="Trade duration" value={duration(trade)} color="text-blue-300"/>
                    <Info label="Entry" value={trade.entryPrice}/>
                    <Info label="Exit" value={trade.exitPrice}/>
                    <Info label="Stop Loss" value={trade.sl}/>
                    <Info label="Take Profit" value={trade.tp ?? 'NONE'}/>
                  </div>
                  <div className="border-t border-[#303744] pt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Net P&L</span>
                    <b className={'text-base font-bold ' + (pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>{pnl >= 0 ? '+' : '-'}{'$' + fmtMoney(Math.abs(pnl))}</b>
                  </div>
                  <div className="text-[10px] text-gray-500">Close reason: {trade.reason || '—'} · Trade ID: {trade.id}</div>
                </div>
                <div className="min-h-[240px] rounded-md border border-[#303744] bg-[#0d1117] overflow-hidden flex flex-col">
                  <div className="min-h-[220px] flex-1">
                    <TradeScreenshotChart trade={trade} candles={candles} timeframe={timeframe}/>
                  </div>
                  <div className="shrink-0 flex justify-end border-t border-[#303744] p-1.5">
                    {image ? (
                      <a href={image} download={'omaxfx-trade-' + trade.id + '.jpg'} className="inline-flex items-center gap-1 rounded bg-[#2a2e39] px-2 py-1 text-[10px] hover:bg-[#394253]"><Download size={12}/> Download screenshot</a>
                    ) : (
                      <button disabled={savingId === String(trade.id)} onClick={() => captureForTrade(trade)} className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold hover:bg-blue-500 disabled:opacity-50"><Camera size={13}/>{savingId === String(trade.id) ? 'Saving screenshot…' : 'Save screenshot'}</button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, color = 'text-gray-200' }) {
  return <div className="rounded bg-[#202633] px-2 py-1"><div className="text-[9px] text-gray-500">{label}</div><div className={'font-mono text-[11px] ' + color}>{value ?? '—'}</div></div>;
}
