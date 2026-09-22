import { useStore, INITIAL_BALANCE } from '../store';
import { fmtMoney } from '../utils/format';
import { X, TrendingUp, TrendingDown, Award, Target, Activity, BarChart3 } from 'lucide-react';

export default function AnalyticsModal() {
  const { isAnalyticsOpen, closeAnalytics, tradeHistory, balance, rules } = useStore();
  if (!isAnalyticsOpen) return null;

  const startBalance = rules?.startingBalance ?? INITIAL_BALANCE;

  // ============================================================
  // CORE STATS
  // ============================================================
  const total = tradeHistory.length;
  const wins = tradeHistory.filter(t => t.pnl > 0);
  const losses = tradeHistory.filter(t => t.pnl < 0);
  const breakeven = tradeHistory.filter(t => t.pnl === 0);

  const totalPnl = tradeHistory.reduce((sum, t) => sum + t.pnl, 0);
  const returnPct = (totalPnl / startBalance) * 100;

  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgTrade = total > 0 ? totalPnl / total : 0;

  const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0;

  const winRate = total > 0 ? (wins.length / total) * 100 : 0;
  const lossRate = total > 0 ? (losses.length / total) * 100 : 0;

  // Expected value per trade (in $)
  const expectancy = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss;

  // Risk-reward ratio achieved
  const achievedRR = avgLoss > 0 ? avgWin / avgLoss : 0;

  // ============================================================
  // CONSECUTIVE WINS / LOSSES
  // ============================================================
  let maxConsecWins = 0, maxConsecLosses = 0, curWins = 0, curLosses = 0;
  tradeHistory.forEach(t => {
    if (t.pnl > 0) { curWins++; curLosses = 0; maxConsecWins = Math.max(maxConsecWins, curWins); }
    else if (t.pnl < 0) { curLosses++; curWins = 0; maxConsecLosses = Math.max(maxConsecLosses, curLosses); }
    else { curWins = 0; curLosses = 0; }
  });

  // ============================================================
  // LONG vs SHORT
  // ============================================================
  const longs = tradeHistory.filter(t => t.type === 'buy');
  const shorts = tradeHistory.filter(t => t.type === 'sell');
  const longWins = longs.filter(t => t.pnl > 0).length;
  const shortWins = shorts.filter(t => t.pnl > 0).length;
  const longPnl = longs.reduce((s, t) => s + t.pnl, 0);
  const shortPnl = shorts.reduce((s, t) => s + t.pnl, 0);

  // ============================================================
  // SHARPE RATIO (simplified — using trade-level returns)
  // ============================================================
  let sharpe = 0;
  if (tradeHistory.length > 1) {
    const returns = tradeHistory.map(t => t.pnl / startBalance);
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(returns.length) : 0;
  }

  // ============================================================
  // MAX DRAWDOWN
  // ============================================================
  let peak = startBalance, maxDD = 0, running = startBalance;
  tradeHistory.forEach(t => {
    running += t.pnl;
    if (running > peak) peak = running;
    const dd = ((peak - running) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  });

  // ============================================================
  // HOLDING TIME (avg in minutes)
  // ============================================================
  const validDurations = tradeHistory
    .filter(t => t.openTime && t.closeTime && t.closeTime > t.openTime)
    .map(t => (t.closeTime - t.openTime) / 60);
  const avgHoldMin = validDurations.length > 0
    ? validDurations.reduce((s, d) => s + d, 0) / validDurations.length
    : 0;

  const fmtDuration = (min) => {
    if (min < 60) return `${min.toFixed(0)}m`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${h}h ${m}m`;
  };

  // ============================================================
  // TRADE EXIT REASONS
  // ============================================================
  const tpCount = tradeHistory.filter(t => t.reason === 'TP').length;
  const slCount = tradeHistory.filter(t => t.reason === 'SL').length;
  const manualCount = tradeHistory.filter(t => t.reason === 'MANUAL').length;

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[60] p-2" onClick={closeAnalytics}>
      <div 
        className="bg-[#131722] rounded-lg w-full max-w-3xl border border-[#2a2e39] overflow-hidden flex flex-col max-h-[96vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-3 py-2 border-b border-[#2a2e39] flex-shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-400" />
            <h2 className="text-sm font-bold">Advanced Analytics</h2>
          </div>
          <button onClick={closeAnalytics} className="p-1 hover:bg-[#2a2e39] rounded">
            <X size={16}/>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-3">
          {tradeHistory.length === 0 ? (
            <div className="text-center py-16 text-gray-500 text-sm">
              No trades yet. Close a trade to see analytics.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              {/* PERFORMANCE OVERVIEW */}
              <Section title="Performance" icon={<TrendingUp size={12}/>}>
                <Row label="Total Trades" value={total} />
                <Row label="Wins" value={`${wins.length} (${winRate.toFixed(1)}%)`} color="#22c55e" />
                <Row label="Losses" value={`${losses.length} (${lossRate.toFixed(1)}%)`} color="#ef4444" />
                {breakeven.length > 0 && (
                  <Row label="Breakeven" value={breakeven.length} color="#9ca3af" />
                )}
                <Row 
                  label="Total P&L" 
                  value={`$${fmtMoney(totalPnl)}`}
                  color={totalPnl >= 0 ? '#22c55e' : '#ef4444'} 
                />
                <Row 
                  label="Return" 
                  value={`${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`}
                  color={returnPct >= 0 ? '#22c55e' : '#ef4444'} 
                />
                <Row label="Final Balance" value={`$${fmtMoney(balance, 0)}`} />
              </Section>

              {/* RISK METRICS */}
              <Section title="Risk & Reward" icon={<Target size={12}/>}>
                <Row label="Profit Factor" value={profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)} color={profitFactor >= 1.5 ? '#22c55e' : profitFactor >= 1 ? '#eab308' : '#ef4444'} />
                <Row label="Sharpe Ratio" value={sharpe.toFixed(2)} color={sharpe >= 1 ? '#22c55e' : sharpe >= 0.5 ? '#eab308' : '#ef4444'} />
                <Row label="Avg Win" value={`$${fmtMoney(avgWin)}`} color="#22c55e" />
                <Row label="Avg Loss" value={`-$${fmtMoney(avgLoss)}`} color="#ef4444" />
                <Row label="Achieved RR" value={`${achievedRR.toFixed(2)} : 1`} color={achievedRR >= 1.5 ? '#22c55e' : '#eab308'} />
                <Row label="Expectancy" value={`$${fmtMoney(expectancy)}`} color={expectancy >= 0 ? '#22c55e' : '#ef4444'} />
                <Row label="Max Drawdown" value={`-${maxDD.toFixed(2)}%`} color="#ef4444" />
              </Section>

              {/* BEST / WORST */}
              <Section title="Extremes" icon={<Award size={12}/>}>
                <Row label="Largest Win" value={`+$${fmtMoney(largestWin)}`} color="#22c55e" />
                <Row label="Largest Loss" value={`-$${fmtMoney(Math.abs(largestLoss))}`} color="#ef4444" />
                <Row label="Avg Trade" value={`${avgTrade >= 0 ? '+' : ''}$${fmtMoney(avgTrade)}`} color={avgTrade >= 0 ? '#22c55e' : '#ef4444'} />
                <Row label="Max Consec. Wins" value={maxConsecWins} color="#22c55e" />
                <Row label="Max Consec. Losses" value={maxConsecLosses} color="#ef4444" />
                <Row label="Avg Hold Time" value={fmtDuration(avgHoldMin)} />
              </Section>

              {/* DIRECTION & EXITS */}
              <Section title="Directions & Exits" icon={<Activity size={12}/>}>
                <Row 
                  label="Long Trades" 
                  value={`${longs.length} (${longs.length > 0 ? ((longWins / longs.length) * 100).toFixed(0) : 0}% win)`}
                  color="#22c55e"
                />
                <Row 
                  label="Long P&L" 
                  value={`${longPnl >= 0 ? '+' : ''}$${fmtMoney(longPnl)}`}
                  color={longPnl >= 0 ? '#22c55e' : '#ef4444'}
                />
                <Row 
                  label="Short Trades" 
                  value={`${shorts.length} (${shorts.length > 0 ? ((shortWins / shorts.length) * 100).toFixed(0) : 0}% win)`}
                  color="#ef4444"
                />
                <Row 
                  label="Short P&L" 
                  value={`${shortPnl >= 0 ? '+' : ''}$${fmtMoney(shortPnl)}`}
                  color={shortPnl >= 0 ? '#22c55e' : '#ef4444'}
                />
                <div className="border-t border-[#2a2e39] my-1.5" />
                <Row label="TP Hits" value={tpCount} color="#22c55e" />
                <Row label="SL Hits" value={slCount} color="#ef4444" />
                <Row label="Manual Closes" value={manualCount} color="#9ca3af" />
              </Section>

              {/* SUMMARY VERDICT */}
              <div className="md:col-span-2 bg-[#1e222d] rounded-lg p-3">
                <div className="text-[10px] text-gray-400 uppercase font-bold mb-2 flex items-center gap-1.5">
                  <TrendingUp size={11} /> Verdict
                </div>
                <VerdictLine
                  label="Overall"
                  value={totalPnl > 0 ? 'Profitable' : totalPnl < 0 ? 'Losing' : 'Breakeven'}
                  color={totalPnl > 0 ? '#22c55e' : totalPnl < 0 ? '#ef4444' : '#9ca3af'}
                />
                <VerdictLine
                  label="Edge Quality"
                  value={
                    profitFactor >= 2 ? 'Excellent' :
                    profitFactor >= 1.5 ? 'Strong' :
                    profitFactor >= 1 ? 'Modest' :
                    'Negative'
                  }
                  color={
                    profitFactor >= 1.5 ? '#22c55e' :
                    profitFactor >= 1 ? '#eab308' :
                    '#ef4444'
                  }
                />
                <VerdictLine
                  label="Risk Management"
                  value={
                    maxDD < 5 ? 'Excellent' :
                    maxDD < 10 ? 'Good' :
                    maxDD < 20 ? 'Acceptable' :
                    'Poor'
                  }
                  color={
                    maxDD < 10 ? '#22c55e' :
                    maxDD < 20 ? '#eab308' :
                    '#ef4444'
                  }
                />
                <VerdictLine
                  label="Direction Bias"
                  value={
                    longs.length === 0 && shorts.length === 0 ? '—' :
                    longs.length > shorts.length * 1.5 ? 'Long-biased' :
                    shorts.length > longs.length * 1.5 ? 'Short-biased' :
                    'Balanced'
                  }
                  color="#9ca3af"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div className="bg-[#1e222d] rounded-lg p-3">
      <div className="text-[10px] text-gray-400 uppercase font-bold mb-2 flex items-center gap-1.5">
        {icon} {title}
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div className="flex justify-between items-baseline text-[11px] py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className="font-bold font-mono" style={{ color: color || '#ffffff' }}>{value}</span>
    </div>
  );
}

function VerdictLine({ label, value, color }) {
  return (
    <div className="flex justify-between items-baseline text-[11px] py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-bold" style={{ color }}>{value}</span>
    </div>
  );
}