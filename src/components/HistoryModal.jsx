import { useStore } from '../store';
import { X } from 'lucide-react';

export default function HistoryModal() {
  const { isHistoryOpen, closeHistory, tradeHistory } = useStore();

  if (!isHistoryOpen) return null;

  const formatTime = (t) => t ? new Date(t * 1000).toLocaleString() : '-';

  const totalTrades = tradeHistory.length;
  const wins = tradeHistory.filter(t => t.pnl > 0).length;
  const losses = tradeHistory.filter(t => t.pnl < 0).length;
  const totalPnl = tradeHistory.reduce((sum, t) => sum + t.pnl, 0);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#131722] rounded-2xl w-full max-w-4xl border border-[#2a2e39] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-[#2a2e39]">
          <h2 className="text-xl font-bold">Trade History</h2>
          <button onClick={closeHistory} className="p-1 hover:bg-[#2a2e39] rounded"><X size={20}/></button>
        </div>

        <div className="grid grid-cols-4 gap-3 p-4 border-b border-[#2a2e39]">
          <div className="bg-[#1e222d] p-3 rounded-lg">
            <p className="text-xs text-gray-400">Total Trades</p>
            <p className="text-lg font-bold">{totalTrades}</p>
          </div>
          <div className="bg-[#1e222d] p-3 rounded-lg">
            <p className="text-xs text-gray-400">Wins / Losses</p>
            <p className="text-lg font-bold"><span className="text-green-400">{wins}</span> / <span className="text-red-400">{losses}</span></p>
          </div>
          <div className="bg-[#1e222d] p-3 rounded-lg">
            <p className="text-xs text-gray-400">Win Rate</p>
            <p className="text-lg font-bold">{totalTrades ? ((wins / totalTrades) * 100).toFixed(1) : 0}%</p>
          </div>
          <div className="bg-[#1e222d] p-3 rounded-lg">
            <p className="text-xs text-gray-400">Total PnL</p>
            <p className={`text-lg font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${totalPnl.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {tradeHistory.length === 0 ? (
            <div className="p-10 text-center text-gray-500">No trades yet. Start trading to see your history!</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#1e222d] text-gray-400 sticky top-0">
                <tr>
                  <th className="p-3 text-left">#</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-right">Entry</th>
                  <th className="p-3 text-right">Exit</th>
                  <th className="p-3 text-right">SL</th>
                  <th className="p-3 text-right">TP</th>
                  <th className="p-3 text-right">Lots</th>
                  <th className="p-3 text-right">PnL</th>
                  <th className="p-3 text-left">Reason</th>
                  <th className="p-3 text-left">Opened</th>
                  <th className="p-3 text-left">Closed</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.map((t, i) => (
                  <tr key={i} className="border-b border-[#2a2e39] hover:bg-[#1e222d]">
                    <td className="p-3">{i + 1}</td>
                    <td className={`p-3 font-bold ${t.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                      {t.type.toUpperCase()}
                    </td>
                    <td className="p-3 text-right font-mono">{t.entryPrice.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono">{t.exitPrice.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono text-red-400">{t.sl?.toFixed(2) || '-'}</td>
                    <td className="p-3 text-right font-mono text-green-400">{t.tp?.toFixed(2) || '-'}</td>
                    <td className="p-3 text-right">{t.size}</td>
                    <td className={`p-3 text-right font-bold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${t.pnl.toFixed(2)}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded ${
                        t.reason === 'TP' ? 'bg-green-900/50 text-green-400' :
                        t.reason === 'SL' ? 'bg-red-900/50 text-red-400' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {t.reason}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-400 font-mono">{formatTime(t.openTime)}</td>
                    <td className="p-3 text-xs text-gray-400 font-mono">{formatTime(t.closeTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}