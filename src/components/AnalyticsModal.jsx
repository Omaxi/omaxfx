import { useState, useEffect, useRef } from 'react';
import { useStore, INITIAL_BALANCE } from '../store';
import { fmtMoney } from '../utils/format';
import { X, TrendingUp, TrendingDown, CalendarDays, ChevronLeft, ChevronRight, BarChart3, Target, Activity, Award, Download } from 'lucide-react';
import TradeDayModal from './TradeDayModal';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getTradeScreenshot, renderTradeScreenshot, saveTradeScreenshot } from '../utils/tradeScreenshots';
import { buildAnalyticsPrintHtml, writeAnalyticsPrintWindow } from '../utils/analyticsPdf';

const money = (value) => `$${fmtMoney(Math.abs(value), 0)}`;
const MARKET_TZ_OFFSET_SECONDS = 3 * 60 * 60;
const marketDate = (unix) => {
  const value = Number(unix);
  const seconds = Math.abs(value) > 1e12 ? value / 1000 : value;
  return new Date((seconds + MARKET_TZ_OFFSET_SECONDS) * 1000);
};
const marketMonth = (unix) => {
  const date = marketDate(unix);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), 1);
};
const dateKey = (unix) => {
  if (!unix) return '';
  const d = marketDate(unix);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const dayLabel = (key) => Number(key.slice(-2));
const fmtPct = (value) => `${value.toFixed(1)}%`;

export default function AnalyticsModal() {
  const store = useStore();
  const { isAnalyticsOpen, closeAnalytics, analyticsSnapshot } = store;
  const tradeHistory = analyticsSnapshot?.tradeHistory || store.tradeHistory;
  const balance = analyticsSnapshot?.balance ?? store.balance;
  const rules = analyticsSnapshot?.rules || store.rules;
  const rawData = analyticsSnapshot ? [] : store.rawData;
  const currentIndex = analyticsSnapshot ? 0 : store.currentIndex;
  const sessionId = analyticsSnapshot?.sessionId || store.sessionId;
  const timeframe = analyticsSnapshot?.timeframe || store.timeframe;
  const reviewName = analyticsSnapshot?.sessionName || '';\n  const screenshotCandles = rawData.length ? rawData : (store.allRawDataBySymbol?.[analyticsSnapshot?.symbol || store.symbol] || []);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => {
    const marketTime = rawData?.[currentIndex]?.time;
    const latest = tradeHistory.reduce((value, trade) => Math.max(value, Number(trade.closeTime || trade.openTime || 0)), 0);
    return marketMonth(marketTime || latest || Date.now() / 1000);
  });
  const initializedMonthForOpen = useRef(false);
  useEffect(() => {
    if (!isAnalyticsOpen) {
      initializedMonthForOpen.current = false;
      return;
    }
    // Wait for the selected market dataset to finish loading. Initialize once
    // per open so later manual calendar navigation is not overwritten.
    if (initializedMonthForOpen.current) return;
    const marketTime = rawData?.[currentIndex]?.time;
    const latestTradeTime = tradeHistory.reduce((latest, trade) => Math.max(latest, Number(trade.closeTime || trade.openTime || 0)), 0);
    const timestamp = marketTime || latestTradeTime;
    if (!timestamp) return;
    setMonthCursor(marketMonth(timestamp));
    setSelectedDate(null);
    initializedMonthForOpen.current = true;
  }, [isAnalyticsOpen, rawData, currentIndex, tradeHistory]);

  if (!isAnalyticsOpen) return null;

  const startBalance = rules?.startingBalance ?? INITIAL_BALANCE;
  const trades = [...tradeHistory].sort((a, b) => (a.closeTime || a.openTime || 0) - (b.closeTime || b.openTime || 0));
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const breakeven = trades.filter(t => t.pnl === 0);
  const netPnl = trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const winRate = trades.length ? wins.length / trades.length * 100 : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const avgRatio = avgLoss ? avgWin / avgLoss : 0;
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0;
  const largestWin = wins.length ? Math.max(...wins.map(t => t.pnl)) : 0;
  const largestLoss = losses.length ? Math.min(...losses.map(t => t.pnl)) : 0;

  let maxWins = 0, maxLosses = 0, streakWins = 0, streakLosses = 0;
  trades.forEach(t => {
    if (t.pnl > 0) { streakWins++; streakLosses = 0; maxWins = Math.max(maxWins, streakWins); }
    else if (t.pnl < 0) { streakLosses++; streakWins = 0; maxLosses = Math.max(maxLosses, streakLosses); }
    else { streakWins = 0; streakLosses = 0; }
  });
  const latestTrade = trades[trades.length - 1];
  let currentTradeStreak = 0;
  if (latestTrade) {
    const sign = Math.sign(latestTrade.pnl);
    for (let i = trades.length - 1; i >= 0 && Math.sign(trades[i].pnl) === sign && sign !== 0; i--) currentTradeStreak++;
  }

  const daily = {};
  trades.forEach(t => {
    const key = dateKey(t.closeTime || t.openTime);
    if (!key) return;
    if (!daily[key]) daily[key] = { pnl: 0, trades: 0, wins: 0 };
    daily[key].pnl += Number(t.pnl) || 0;
    daily[key].trades++;
    if (t.pnl > 0) daily[key].wins++;
  });
  const dailyEntries = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b));
  let cumulative = 0;
  const curve = dailyEntries.map(([date, d]) => {
    cumulative += d.pnl;
    return { date, pnl: cumulative, label: date.slice(5) };
  });

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const monthName = monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) return null;
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { day, key, ...(daily[key] || { pnl: 0, trades: 0, wins: 0 }) };
  });
  const weeks = Array.from({ length: 6 }, (_, week) => {
    const row = cells.slice(week * 7, week * 7 + 7).filter(Boolean);
    return { pnl: row.reduce((s, d) => s + d.pnl, 0), trades: row.reduce((s, d) => s + d.trades, 0), days: row.filter(d => d.trades).length };
  });
  const monthlyTrades = cells.filter(Boolean).reduce((s, d) => s + d.trades, 0);
  const monthlyPnl = cells.filter(Boolean).reduce((s, d) => s + d.pnl, 0);
  const activeDays = cells.filter(d => d?.trades).length;

  const longTrades = trades.filter(t => t.type === 'buy');
  const shortTrades = trades.filter(t => t.type === 'sell');
  const longWins = longTrades.filter(t => t.pnl > 0).length;
  const shortWins = shortTrades.filter(t => t.pnl > 0).length;
  let maxBalance = startBalance;
  let runningBalance = startBalance;
  let maxClosedDrawdown = 0;
  trades.forEach(t => {
    runningBalance += t.pnl;
    maxBalance = Math.max(maxBalance, runningBalance);
    if (maxBalance > 0) maxClosedDrawdown = Math.max(maxClosedDrawdown, (maxBalance - runningBalance) / maxBalance * 100);
  });
  const rTrades = trades.filter(t => Number.isFinite(Number(t.riskAmount)) && Number(t.riskAmount) > 0);
  const averageR = rTrades.length
    ? rTrades.reduce((sum, trade) => sum + Number(trade.pnl) / Number(trade.riskAmount), 0) / rTrades.length
    : 0;
  const returnPct = startBalance ? netPnl / startBalance * 100 : 0;
  const monthChange = (offset) => setMonthCursor(new Date(year, month + offset, 1));
  const selectedDayTrades = selectedDate ? trades.filter(t => dateKey(t.closeTime || t.openTime) === selectedDate) : [];
  const goToMarketMonth = () => {
    const marketTime = rawData?.[currentIndex]?.time;
    const latestTradeTime = trades.reduce((latest, trade) => Math.max(latest, trade.closeTime || trade.openTime || 0), 0);
    const timestamp = marketTime || latestTradeTime;
    if (timestamp) setMonthCursor(marketMonth(timestamp));
  };
  const streakText = latestTrade ? (latestTrade.pnl > 0 ? 'Winning' : latestTrade.pnl < 0 ? 'Losing' : 'Flat') : 'No streak';

  const exportAnalyticsPdf = async () => {
    // Open synchronously in the click handler to avoid popup blockers while
    // screenshot images are being loaded from IndexedDB.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.alert('Please allow pop-ups for OmaxFX to export the analytics PDF.');
      return;
    }
    printWindow.document.write('<!doctype html><title>Preparing OmaxFX report</title><body style="font:14px Arial;padding:32px;background:#131722;color:white">Preparing your analytics report and loading trade screenshots…</body>');
    setIsExportingPdf(true);
    try {
      const screenshots = {};
      await Promise.all(trades.map(async trade => {
        const key = String(trade.id);
        let image = await getTradeScreenshot(trade.id, sessionId || 'unsaved-session');
        if (!image) {
          image = renderTradeScreenshot(trade, screenshotCandles, timeframe);
          if (image) await saveTradeScreenshot(trade.id, image, sessionId || 'unsaved-session').catch(() => false);
        }
        if (image) screenshots[key] = image;
      }));
      const metrics = {
        netPnl, returnPct, totalTrades: trades.length, wins: wins.length, losses: losses.length,
        breakeven: breakeven.length, winRate, grossProfit, grossLoss, avgWin, avgLoss, avgRatio,
        profitFactor, averageR, maxClosedDrawdown, largestWin, largestLoss, maxWins, maxLosses,
        currentStreak: `${currentTradeStreak} ${streakText.toLowerCase()}`,
        longTrades: longTrades.length, longWinRate: longTrades.length ? longWins / longTrades.length * 100 : 0,
        shortTrades: shortTrades.length, shortWinRate: shortTrades.length ? shortWins / shortTrades.length * 100 : 0,
        maxBalance,
      };
      const html = buildAnalyticsPrintHtml({
        sessionName: reviewName || store.sessionName || 'Trading session',
        symbol: analyticsSnapshot?.symbol || store.symbol,
        sessionId,
        startBalance,
        balance,
        timezone: analyticsSnapshot?.timezone || store.timezone || 'UTC+3',
        trades,
        metrics,
        dailyEntries,
        curve,
        screenshots,
      });
      writeAnalyticsPrintWindow(printWindow, html);
    } catch (error) {
      printWindow.close();
      window.alert('The analytics PDF could not be prepared. Please try again.');
      console.error('Analytics PDF export failed:', error);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-[#0b0e11] p-1.5 sm:p-2" onClick={closeAnalytics}>
      <div className="h-full w-full overflow-hidden rounded-lg border border-[#2a2e39] bg-[#131722] text-white flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="h-8 shrink-0 flex items-center justify-between px-3 border-b border-[#2a2e39]">
          <div className="flex items-center gap-2 text-xs font-bold"><BarChart3 size={14} className="text-blue-400"/> OmaxFX <span className="text-gray-400 font-medium">Performance analytics</span>{reviewName && <span className="text-blue-300 font-medium">· {reviewName} · Read-only review</span>}</div>
          <div className="flex items-center gap-2">
            <button onClick={exportAnalyticsPdf} disabled={isExportingPdf} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"><Download size={12}/>{isExportingPdf ? 'Preparing PDF…' : 'Export PDF'}</button>
            <button onClick={closeAnalytics} className="rounded p-1 text-gray-400 hover:bg-[#2a2e39] hover:text-white" aria-label="Close analytics"><X size={15}/></button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-1.5 p-1.5 shrink-0">
          <Metric title="Net P&L" value={`${netPnl >= 0 ? '+' : '-'}${money(netPnl)}`} color={netPnl >= 0 ? '#21c58b' : '#f05252'} detail={`${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}% return`}/>
          <Metric title="Trade win %" value={fmtPct(winRate)} color="#f4f4f5" detail={`${wins.length} wins · ${losses.length} losses`} gauge={winRate}/>
          <Metric title="Avg win/loss trade" value={avgRatio.toFixed(2)} color="#f4f4f5" detail={`${money(avgWin)} avg win / -${money(avgLoss)} avg loss`}/>
          <Metric title="Profit factor" value={profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)} color="#f4f4f5" detail={`${trades.length} closed trades`} ring={profitFactor}/>
          <Metric title="Average R" value={`${averageR >= 0 ? '+' : ''}${averageR.toFixed(2)}R`} color={averageR >= 0 ? '#21c58b' : '#f05252'} detail="Average realized R multiple"/>
          <Metric title="Closed DD" value={`${maxClosedDrawdown.toFixed(2)}%`} color="#f05252" detail="Closed-trade equity curve"/>
          <Metric title="Current streak" value={`${currentTradeStreak} trades`} color="#f4f4f5" detail={streakText} streak/>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[minmax(220px,34%)_minmax(0,1fr)] gap-1.5 px-1.5 pb-1.5">
          <div className="min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
            <section className="min-h-0 rounded-md border border-[#2a2e39] bg-[#131722] flex flex-col overflow-hidden">
              <div className="h-7 shrink-0 flex items-center justify-between px-2 border-b border-[#2a2e39]">
                <span className="text-[10px] font-semibold text-gray-200">Daily net cumulative P&L</span>
                <span className={`text-[10px] font-bold ${cumulative >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(cumulative)}</span>
              </div>
              <div className="flex-1 min-h-0 p-1">
                {curve.length ? <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={curve} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="analyticsPnlFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#20bd89" stopOpacity={0.65}/><stop offset="100%" stopColor="#20bd89" stopOpacity={0.03}/></linearGradient></defs>
                    <CartesianGrid stroke="#2a2e39" strokeDasharray="2 3" vertical={false}/>
                    <XAxis dataKey="label" tick={{ fill: '#777d84', fontSize: 8 }} axisLine={false} tickLine={false} minTickGap={20}/>
                    <YAxis tick={{ fill: '#777d84', fontSize: 8 }} axisLine={false} tickLine={false} width={38} tickFormatter={v => v === 0 ? '$0' : `$${(v / 1000).toFixed(0)}k`}/>
                    <Tooltip contentStyle={{ background: '#131722', border: '1px solid #2a2e39', borderRadius: 5, fontSize: 10 }} labelStyle={{ color: '#aab0b6' }} formatter={v => [money(v), 'Cumulative P&L']}/>
                    <Area type="monotone" dataKey="pnl" stroke="#20bd89" strokeWidth={2} fill="url(#analyticsPnlFill)" isAnimationActive={false}/>
                  </AreaChart>
                </ResponsiveContainer> : <Empty text="Close trades to build your P&L curve"/>}
              </div>
            </section>

            <section className="min-h-0 rounded-md border border-[#2a2e39] bg-[#131722] overflow-hidden flex flex-col">
              <div className="h-7 shrink-0 flex items-center gap-1.5 px-2 border-b border-[#2a2e39] text-[10px] font-semibold text-gray-200"><Award size={12} className="text-amber-400"/> Trading statistics</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 content-start">
                <Stat label="Largest win" value={`+${money(largestWin)}`} color="text-emerald-400"/>
                <Stat label="Largest loss" value={`-${money(largestLoss)}`} color="text-red-400"/>
                <Stat label="Max consecutive wins" value={maxWins}/>
                <Stat label="Max consecutive losses" value={maxLosses}/>
                <Stat label="Total trades" value={trades.length}/>
                <Stat label="Breakeven" value={breakeven.length}/>
                <Stat label="Long trades" value={`${longTrades.length} · ${longTrades.length ? Math.round(longWins / longTrades.length * 100) : 0}% win`} color="text-emerald-400"/>
                <Stat label="Short trades" value={`${shortTrades.length} · ${shortTrades.length ? Math.round(shortWins / shortTrades.length * 100) : 0}% win`} color="text-red-400"/>
                <Stat label="Final balance" value={money(balance)}/>
                <Stat label="Max balance" value={money(maxBalance)}/>
              </div>
              <div className="mt-auto px-2 pb-2">
                <div className="h-1.5 rounded-full bg-[#2a2e39] overflow-hidden flex">
                  <div className="bg-emerald-500" style={{ width: `${trades.length ? wins.length / trades.length * 100 : 0}%` }}/>
                  <div className="bg-red-500" style={{ width: `${trades.length ? losses.length / trades.length * 100 : 0}%` }}/>
                  <div className="bg-gray-500 flex-1"/>
                </div>
                <div className="mt-1 flex justify-between text-[8px] text-gray-500"><span>{wins.length} wins</span><span>{losses.length} losses</span><span>{breakeven.length} breakeven</span></div>
              </div>
            </section>
          </div>

          <section className="min-h-0 rounded-md border border-[#2a2e39] bg-[#131722] flex flex-col overflow-hidden">
            <div className="h-8 shrink-0 flex items-center justify-between gap-2 px-2 border-b border-[#2a2e39]">
              <div className="flex items-center gap-1.5">
                <button onClick={() => monthChange(-1)} className="p-1 rounded hover:bg-[#2a2e39]" aria-label="Previous month"><ChevronLeft size={13}/></button>
                <span className="w-28 text-center text-[10px] font-bold">{monthName}</span>
                <button onClick={() => monthChange(1)} className="p-1 rounded hover:bg-[#2a2e39]" aria-label="Next month"><ChevronRight size={13}/></button>
                <button onClick={goToMarketMonth} className="ml-1 px-2 py-0.5 rounded border border-[#2a2e39] text-[9px] text-gray-300 hover:bg-[#2a2e39]">Market month</button>
              </div>
              <div className="flex items-center gap-2 text-[9px]"><span className="text-gray-400">Monthly stats:</span><b className={monthlyPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>{monthlyPnl >= 0 ? '+' : '-'}{money(monthlyPnl)}</b><span className="rounded-full bg-[#1e222d] px-2 py-0.5 text-violet-300">{activeDays} days</span></div>
            </div>
            <div className="flex-1 min-h-0 p-1.5 flex flex-col">
              <div className="grid grid-cols-[minmax(0,1fr)_74px] gap-1.5 h-full min-h-0">
                <div className="min-w-0 min-h-0 flex flex-col">
                  <div className="grid grid-cols-7 gap-1 h-5 shrink-0 mb-1">
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="rounded bg-[#1e222d] text-center text-[9px] leading-5 font-semibold text-gray-400">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 grid-rows-6 gap-1 flex-1 min-h-0">
                    {cells.map((d, i) => <CalendarDay key={d?.key || `empty-${i}`} day={d} selected={selectedDate === d?.key} onClick={() => d && setSelectedDate(d.key)}/>)}
                  </div>
                </div>
                <div className="min-h-0 flex flex-col pt-6 gap-1">
                  {weeks.map((w, i) => <div key={i} className="flex-1 min-h-0 rounded border border-[#2a2e39] bg-[#1e222d] px-1.5 py-1 flex flex-col justify-center">
                    <span className="text-[8px] text-gray-500">Week {i + 1}</span>
                    <b className={`text-[11px] leading-tight ${w.pnl > 0 ? 'text-emerald-400' : w.pnl < 0 ? 'text-red-400' : 'text-gray-300'}`}>{money(w.pnl)}</b>
                    <span className="text-[8px] text-gray-500">{w.trades} trades · {w.days} days</span>
                  </div>)}
                </div>
              </div>
            </div>
            <div className="h-6 shrink-0 px-2 border-t border-[#2a2e39] flex items-center justify-between text-[9px] text-gray-500">
              <span>{monthlyTrades} trades in {monthName}</span>
              <span>{activeDays} active trading days</span>
            </div>
          </section>
        </div>
      </div>
      {selectedDate && <TradeDayModal date={selectedDate} trades={selectedDayTrades} sessionId={sessionId} candles={rawData} timeframe={timeframe} onClose={() => setSelectedDate(null)} />}
    </div>
  );
}

function Metric({ title, value, color, detail, gauge, ring, streak }) {
  return <div className="h-[58px] min-w-0 rounded-md bg-[#1e222d] border border-[#2a2e39] px-2.5 py-1.5 flex items-center justify-between gap-1">
    <div className="min-w-0">
      <div className="text-[8px] text-gray-500 truncate">{title}</div>
      <div className="text-[15px] font-bold leading-5 truncate" style={{ color }}>{value}</div>
      <div className="text-[8px] text-gray-500 truncate">{detail}</div>
    </div>
    {gauge != null && <div className="w-8 h-8 rounded-full shrink-0 grid place-items-center" style={{ background: `conic-gradient(#20bd89 ${gauge}%, #ef5350 0)` }}><div className="w-6 h-6 rounded-full bg-[#1e222d]"/></div>}
    {ring != null && <div className="w-8 h-8 rounded-full shrink-0 border-[3px]" style={{ borderColor: ring >= 1 ? '#20bd89' : '#ef5350', opacity: 0.9 }}/>}
    {streak && <Activity size={20} className="shrink-0 text-emerald-400"/>}
  </div>;
}
function Stat({ label, value, color = 'text-gray-200' }) {
  return <div className="flex items-center justify-between gap-1 text-[9px] border-b border-[#2a2e39]/70 py-0.5"><span className="text-gray-500 truncate">{label}</span><b className={`font-mono ${color}`}>{value}</b></div>;
}
function CalendarDay({ day, selected, onClick }) {
  if (!day) return <div className="rounded bg-[#131722] border border-[#1e2225]"/>;
  const positive = day.pnl > 0, negative = day.pnl < 0;
  const active = day.trades > 0;
  const background = !active ? '#1e222d' : positive ? '#003a2b' : negative ? '#551b1b' : '#1d2d4b';
  const border = selected ? '#60a5fa' : !active ? '#2a2e39' : positive ? '#087b5a' : negative ? '#a33b3b' : '#4268ad';
  return <button type="button" onClick={onClick} title={day.trades + ' trades · click to open day journal'} className="rounded border min-w-0 p-1 flex flex-col items-end overflow-hidden text-left hover:brightness-125 focus:outline-none focus:ring-1 focus:ring-blue-400" style={{ background, borderColor: border }}>
    <span className="text-[8px] text-gray-400">{day.day}</span>
    {active && <div className="mt-auto mb-auto w-full text-center min-w-0">
      <b className={`block text-[10px] leading-3 truncate ${positive ? 'text-emerald-300' : negative ? 'text-red-300' : 'text-blue-200'}`}>{day.pnl >= 0 ? '' : '-'}{money(day.pnl)}</b>
      <span className="block text-[8px] text-gray-300">{day.trades} {day.trades === 1 ? 'trade' : 'trades'}</span>
      <span className="block text-[7px] text-gray-500">{Math.round(day.wins / day.trades * 100)}% win</span>
    </div>}
  </button>;
}
function Empty({ text }) {
  return <div className="h-full grid place-items-center text-[10px] text-gray-500">{text}</div>;
}
