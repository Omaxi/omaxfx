import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { fmtMoney } from '../utils/format';
import { getPricePrecision } from '../utils/instrument';
import { X } from 'lucide-react';

export default function HistoryModal() {
  const { isHistoryOpen, closeHistory, tradeHistory, symbol: activeSymbol, contractSpecs } = useStore();
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const sortedTrades = [...tradeHistory].sort((a, b) =>
    (Number(b.closeTime || b.openTime) || 0) - (Number(a.closeTime || a.openTime) || 0)
  );
  const pageCount = Math.max(1, Math.ceil(sortedTrades.length / pageSize));
  const visibleTrades = sortedTrades.slice(Math.min(page, pageCount - 1) * pageSize, (Math.min(page, pageCount - 1) + 1) * pageSize);
  useEffect(() => setPage(current => Math.min(current, pageCount - 1)), [pageCount]);

  if (!isHistoryOpen) return null;

  const formatTime = (t) => t ? new Date((t + 3 * 3600) * 1000).toLocaleString(undefined, { timeZone: 'UTC' }) : '-';
  const formatDuration = (trade) => {
    const seconds = Number(trade.closeTime) - Number(trade.openTime);
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = Math.floor(seconds % 60);
    if (days) return `${days}d ${hours}h ${minutes}m`;
    if (hours) return `${hours}h ${minutes}m ${remainder}s`;
    if (minutes) return `${minutes}m ${remainder}s`;
    return `${remainder}s`;
  };

  // Symbol-aware price formatter: EURUSD gets 5 decimals, Gold gets 2.
  const fmtPrice = (value, symbol) => {
    if (value == null || Number.isNaN(value)) return '-';
    const precision = getPricePrecision(symbol, contractSpecs);
    return value.toFixed(precision);
  };

  const totalTrades = tradeHistory.length;
  const wins = tradeHistory.filter(t => t.pnl > 0).length;
  const losses = tradeHistory.filter(t => t.pnl < 0).length;
  const totalPnl = tradeHistory.reduce((sum, t) => sum + t.pnl, 0);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#131722] rounded-2xl w-full max-w-7xl border border-[#2a2e39] overflow-hidden flex flex-col h-[min(92dvh,850px)]">
        <div className="flex justify-between items-center p-3 border-b border-[#2a2e39]">
          <h2 className="text-lg font-bold">Trade History</h2>
          <button onClick={closeHistory} className="p-1 hover:bg-[#2a2e39] rounded"><X size={18}/></button>
        </div>

        <div className="grid grid-cols-4 gap-2 p-3 border-b border-[#2a2e39]">
          <div className="bg-[#1e222d] p-2 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase">Total Trades</p>
            <p className="text-base font-bold">{totalTrades}</p>
          </div>
          <div className="bg-[#1e222d] p-2 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase">Wins / Losses</p>
            <p className="text-base font-bold"><span className="text-green-400">{wins}</span> / <span className="text-red-400">{losses}</span></p>
          </div>
          <div className="bg-[#1e222d] p-2 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase">Win Rate</p>
            <p className="text-base font-bold">{totalTrades ? ((wins / totalTrades) * 100).toFixed(1) : 0}%</p>
          </div>
          <div className="bg-[#1e222d] p-2 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase">Total PnL</p>
            <p className={`text-base font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${fmtMoney(totalPnl)}
            </p>
          </div>
        </div>

        <div className="overflow-hidden flex-1 min-h-0">
          {tradeHistory.length === 0 ? (
            <div className="p-10 text-center text-gray-500">No trades yet. Start trading to see your history!</div>
          ) : (
            <table className="w-full table-fixed text-[10px]">
              <thead className="bg-[#1e222d] text-gray-400 sticky top-0">
                <tr>
                  <th className="p-1 text-left">#</th>
                  <th className="p-1 text-left hidden sm:table-cell">Symbol</th>
                  <th className="p-1 text-left">Side</th>
                  <th className="p-1 text-right">Entry</th>
                  <th className="p-1 text-right">Exit</th>
                  <th className="p-1 text-right hidden xl:table-cell">SL</th>
                  <th className="p-1 text-right hidden xl:table-cell">TP</th>
                  <th className="p-1 text-right">Lots</th>
                  <th className="p-1 text-right hidden lg:table-cell">Risk</th>
                  <th className="p-1 text-right">PnL</th>
                  <th className="p-1 text-left hidden lg:table-cell">Exit</th>
                  <th className="p-1 text-left hidden xl:table-cell">Opened</th>
                  <th className="p-1 text-left hidden xl:table-cell">Closed</th>
                  <th className="p-1 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {visibleTrades.map((t, i) => {
                  // Fallback to the currently active symbol for legacy trades
                  // that don't have a `symbol` field (saved before this update).
                  const sym = t.symbol || activeSymbol || 'XAUUSD';
                  return (
                    <tr key={t.id ?? `${t.openTime}-${i}`} className="border-b border-[#2a2e39] hover:bg-[#1e222d]">
                      <td className="p-1">{page * pageSize + i + 1}</td>
                      <td className="p-1 font-bold text-white hidden sm:table-cell">{sym}</td>
                      <td className={`p-1 font-bold ${t.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                        {t.type.toUpperCase()}
                      </td>
                      <td className="p-1 text-right font-mono">{fmtPrice(t.entryPrice, sym)}</td>
                      <td className="p-1 text-right font-mono">{fmtPrice(t.exitPrice, sym)}</td>
                      <td className="p-1 text-right font-mono text-red-400 hidden xl:table-cell">{fmtPrice(t.sl, sym)}</td>
                      <td className="p-1 text-right font-mono text-green-400 hidden xl:table-cell">{fmtPrice(t.tp, sym)}</td>
                      <td className="p-1 text-right">{t.size}</td>
                      <td className="p-1 text-right font-mono text-yellow-400 hidden lg:table-cell">
                        {t.riskAmount ? `$${fmtMoney(t.riskAmount, 0)}` : '-'}
                        {t.riskPercent != null && (
                          <span className="text-gray-500 text-[10px] ml-1">({Number.isFinite(Number(t.riskPercent)) ? Number(t.riskPercent).toFixed(2) : '—'}%)</span>
                        )}
                      </td>
                      <td className={`p-1 text-right font-bold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${fmtMoney(t.pnl)}
                      </td>
                      <td className="p-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          t.reason === 'TP' ? 'bg-green-900/50 text-green-400' :
                          t.reason === 'SL' ? 'bg-red-900/50 text-red-400' :
                          'bg-gray-700 text-gray-300'
                        }`}>
                          {t.reason}
                        </span>
                      </td>
                      <td className="p-1 text-[9px] text-gray-400 font-mono hidden xl:table-cell">{formatTime(t.openTime)}</td>
                      <td className="p-1 text-[9px] text-gray-400 font-mono hidden xl:table-cell">{formatTime(t.closeTime)}</td>
                      <td className="p-1 text-right text-[9px] text-gray-300 font-mono">{formatDuration(t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-[#2a2e39] shrink-0">
          <span className="text-[10px] text-gray-500">Page {Math.min(page + 1, pageCount)} of {pageCount} · {totalTrades} trades</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))} className="px-3 py-1 rounded bg-[#2a2e39] text-xs disabled:opacity-40">Previous</button>
            <button disabled={page + 1 >= pageCount} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} className="px-3 py-1 rounded bg-[#2a2e39] text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}