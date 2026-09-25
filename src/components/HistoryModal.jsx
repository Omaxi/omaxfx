import { useStore } from '../store';
import { fmtMoney } from '../utils/format';
import { X } from 'lucide-react';

export default function HistoryModal() {
  const { isHistoryOpen, closeHistory, tradeHistory, symbol: activeSymbol } = useStore();

  if (!isHistoryOpen) return null;

  const formatTime = (t) => t ? new Date(t * 1000).toLocaleString() : '-';

  // Symbol-aware price formatter: EURUSD gets 4 decimals, others get 2.
  const fmtPrice = (value, symbol) => {
    if (value == null || Number.isNaN(value)) return '-';
    const precision = symbol === 'EURUSD' ? 4 : 2;
    return value.toFixed(precision);
  };

  const totalTrades = tradeHistory.length;
  const wins = tradeHistory.filter(t => t.pnl > 0).length;
  const losses = tradeHistory.filter(t => t.pnl < 0).length;
  const totalPnl = tradeHistory.reduce((sum, t) => sum + t.pnl, 0);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#131722] rounded-2xl w-full max-w-5xl border border-[#2a2e39] overflow-hidden flex flex-col max-h-[90vh]">
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

        <div className="overflow-y-auto flex-1">
          {tradeHistory.length === 0 ? (
            <div className="p-10 text-center text-gray-500">No trades yet. Start trading to see your history!</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#1e222d] text-gray-400 sticky top-0">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Symbol</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-right">Entry</th>
                  <th className="p-2 text-right">Exit</th>
                  <th className="p-2 text-right">SL</th>
                  <th className="p-2 text-right">TP</th>
                  <th className="p-2 text-right">Lots</th>
                  <th className="p-2 text-right text-yellow-400">Risk</th>
                  <th className="p-2 text-right">PnL</th>
                  <th className="p-2 text-left">Reason</th>
                  <th className="p-2 text-left">Opened</th>
                  <th className="p-2 text-left">Closed</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.map((t, i) => {
                  // Fallback to the currently active symbol for legacy trades
                  // that don't have a `symbol` field (saved before this update).
                  const sym = t.symbol || activeSymbol || 'XAUUSD';
                  return (
                    <tr key={i} className="border-b border-[#2a2e39] hover:bg-[#1e222d]">
                      <td className="p-2">{i + 1}</td>
                      <td className="p-2 font-bold text-white">{sym}</td>
                      <td className={`p-2 font-bold ${t.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                        {t.type.toUpperCase()}
                      </td>
                      <td className="p-2 text-right font-mono">{fmtPrice(t.entryPrice, sym)}</td>
                      <td className="p-2 text-right font-mono">{fmtPrice(t.exitPrice, sym)}</td>
                      <td className="p-2 text-right font-mono text-red-400">{fmtPrice(t.sl, sym)}</td>
                      <td className="p-2 text-right font-mono text-green-400">{fmtPrice(t.tp, sym)}</td>
                      <td className="p-2 text-right">{t.size}</td>
                      <td className="p-2 text-right font-mono text-yellow-400">
                        {t.riskAmount ? `$${fmtMoney(t.riskAmount, 0)}` : '-'}
                        {t.riskPercent != null && (
                          <span className="text-gray-500 text-[10px] ml-1">({t.riskPercent}%)</span>
                        )}
                      </td>
                      <td className={`p-2 text-right font-bold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
                      <td className="p-2 text-[10px] text-gray-400 font-mono">{formatTime(t.openTime)}</td>
                      <td className="p-2 text-[10px] text-gray-400 font-mono">{formatTime(t.closeTime)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}