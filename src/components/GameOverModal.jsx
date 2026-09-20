import { useStore } from '../store';
import { Trophy, TrendingDown, TrendingUp, Target, Zap, RotateCcw } from 'lucide-react';

export default function GameOverModal() {
  const { 
    gameState, rules, balance, tradeHistory, restartGame, 
    openHistory, openEquity 
  } = useStore();

  if (!gameState.isOver) return null;

  const totalPnl = balance - rules.startingBalance;
  const pnlPercent = (totalPnl / rules.startingBalance) * 100;
  const wins = tradeHistory.filter(t => t.pnl > 0);
  const losses = tradeHistory.filter(t => t.pnl < 0);
  const winRate = tradeHistory.length > 0 ? (wins.length / tradeHistory.length) * 100 : 0;
  
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 999 : 0);

  let peak = rules.startingBalance;
  let maxDD = 0;
  let running = rules.startingBalance;
  tradeHistory.forEach(t => {
    running += t.pnl;
    if (running > peak) peak = running;
    const dd = ((peak - running) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  });

  const reasonInfo = {
    'daily_loss': { color: 'text-red-400', icon: <TrendingDown size={48} />, title: 'Daily Loss Limit Hit' },
    'daily_risk': { color: 'text-red-400', icon: <TrendingDown size={48} />, title: 'Daily Risk Limit Hit' },
    'drawdown': { color: 'text-red-400', icon: <TrendingDown size={48} />, title: 'Max Drawdown Hit' },
    'countdown': { color: 'text-blue-400', icon: <Zap size={48} />, title: "Time's Up!" },
    'period_end': { color: 'text-green-400', icon: <Trophy size={48} />, title: 'Period Completed!' },
  };
  const info = reasonInfo[gameState.reason] || reasonInfo.period_end;

  const isProfitable = totalPnl >= 0;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#131722] rounded-2xl w-full max-w-2xl border border-[#2a2e39] overflow-hidden shadow-2xl my-4">
        
        <div className="p-6 border-b border-[#2a2e39] text-center">
          <div className={`flex justify-center mb-3 ${info.color}`}>
            {info.icon}
          </div>
          <h1 className={`text-2xl font-bold ${info.color} mb-1`}>{info.title}</h1>
          <p className="text-sm text-gray-400">{gameState.message}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 p-5">
          <div className="bg-[#1e222d] p-4 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Final Balance</p>
            <p className="text-lg font-bold font-mono">${balance.toFixed(2)}</p>
          </div>
          <div className="bg-[#1e222d] p-4 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Total P&L</p>
            <p className={`text-lg font-bold font-mono flex items-center gap-1 ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
              {isProfitable ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
              {isProfitable ? '+' : ''}${totalPnl.toFixed(2)}
            </p>
          </div>
          <div className="bg-[#1e222d] p-4 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Return %</p>
            <p className={`text-lg font-bold font-mono ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
              {isProfitable ? '+' : ''}{pnlPercent.toFixed(2)}%
            </p>
          </div>

          <div className="bg-[#1e222d] p-4 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Trades</p>
            <p className="text-lg font-bold font-mono">{tradeHistory.length}</p>
          </div>
          <div className="bg-[#1e222d] p-4 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Win Rate</p>
            <p className="text-lg font-bold font-mono">
              <span className="text-green-400">{wins.length}</span>
              <span className="text-gray-500"> / </span>
              <span className="text-red-400">{losses.length}</span>
              <span className="text-gray-500 text-sm ml-1">({winRate.toFixed(0)}%)</span>
            </p>
          </div>
          <div className="bg-[#1e222d] p-4 rounded-lg">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Profit Factor</p>
            <p className={`text-lg font-bold font-mono ${profitFactor >= 1 ? 'text-green-400' : 'text-red-400'}`}>
              {profitFactor >= 999 ? '∞' : profitFactor.toFixed(2)}
            </p>
          </div>

          <div className="bg-[#1e222d] p-4 rounded-lg col-span-3">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Max Drawdown Observed</p>
            <p className="text-lg font-bold font-mono text-red-400">-{maxDD.toFixed(2)}%</p>
          </div>
        </div>

        <div className="p-5 border-t border-[#2a2e39] flex flex-wrap gap-3">
          <button 
            onClick={openEquity}
            className="flex-1 min-w-[140px] py-3 bg-[#1e222d] hover:bg-[#2a2e39] rounded-xl font-bold text-sm border border-[#2a2e39] flex items-center justify-center gap-2"
          >
            <TrendingUp size={16} /> View Equity Curve
          </button>
          <button 
            onClick={openHistory}
            className="flex-1 min-w-[140px] py-3 bg-[#1e222d] hover:bg-[#2a2e39] rounded-xl font-bold text-sm border border-[#2a2e39] flex items-center justify-center gap-2"
          >
            <Target size={16} /> View Trade History
          </button>
          <button 
            onClick={restartGame}
            className="flex-1 min-w-[140px] py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
          >
            <RotateCcw size={16} /> Play Again
          </button>
        </div>
      </div>
    </div>
  );
}