import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyticsPrintHtml } from './analyticsPdf.js';

const base = {
  traderName: 'PDF regression',
  symbol: 'XAUUSD',
  startBalance: 10000,
  balance: 10020,
  timezone: 'UTC+3',
  backtestRange: { from: '11/02, 02:00', to: '11/02, 03:00', elapsed: 'Elapsed: 1h' },
  trades: [],
  metrics: {
    netPnl: 20, returnPct: 0.2, totalTrades: 0, wins: 0, losses: 0, breakeven: 0,
    winRate: 0, grossProfit: 0, grossLoss: 0, avgWin: 0, avgLoss: 0, avgRatio: 0,
    profitFactor: 0, averageR: 0, maxClosedDrawdown: 0, largestWin: 0, largestLoss: 0,
    maxWins: 0, maxLosses: 0, currentStreak: '0 flat', longTrades: 0, longWinRate: 0,
    shortTrades: 0, shortWinRate: 0, maxBalance: 10020,
  },
  dailyEntries: [],
  screenshots: {},
};

test('builds the analytics PDF when the trade-by-trade curve contains a drawdown', () => {
  const html = buildAnalyticsPrintHtml({
    ...base,
    curve: [
      { timestamp: 1793600400, label: '11-02 02:00', pnl: 100, benchmarkPnl: 20 },
      { timestamp: 1793601000, label: '11-02 02:10', pnl: -50, benchmarkPnl: 35 },
      { timestamp: 1793601600, label: '11-02 02:20', pnl: 20, benchmarkPnl: 55 },
    ],
  });

  assert.match(html, /Max DD/);
  assert.match(html, /<title>PDF regression - Performance Reports<\/title>/);
  assert.doesNotMatch(html, /class="report-title"/);
  assert.match(html, /<header class="cover"><h1>PDF regression - Performance Reports<\/h1>/);
  assert.doesNotMatch(html, /Trading statistics|Full performance metrics|metric-value/);
  assert.match(html, /Trading calendar · All active months/);
  assert.match(html, /Expectancy &amp; Profit Factor/);
  assert.match(html, /Winners and Losers/);
  assert.match(html, /Performance by side/);
  assert.match(html, /Performance by day/);
  assert.match(html, /Performance by month/);
  assert.match(html, /month-histogram/);
  assert.match(html, /month-hist-bar/);
  assert.doesNotMatch(html, /month-grid|month-cell/);
  assert.match(html, /top-metrics/);
  assert.match(html, /summary-card b\.gain/);
  assert.match(html, /summary-card b\.loss/);
  assert.match(html, /size:A4 portrait/);
  assert.match(html, /equityBlueFill/);
  assert.match(html, /drawdownFill/);
  assert.match(html, /stop-color="#2563eb"/);
  assert.match(html, /stroke="#2563eb" stroke-width="3"/);
  // Max DD belongs beside the chart title, not inside the SVG plot.
  assert.match(html, /<div class="section-heading-row"><h2>Profit and loss · Over time<\/h2><span class="curve-dd-badge">Max DD \$150\.00 · 20m<\/span><\/div>/);
  const equitySvg = html.match(/<svg[\s\S]*?<\/svg>/)?.[0] || '';
  assert.doesNotMatch(equitySvg, /Max DD/);
  assert.match(html, /Buy &amp; Hold/);
  assert.doesNotMatch(html, /Use your browser's Print dialog/);
  assert.match(html, /Profit and loss · Over time/);
});



test('uses semantic colors for report metrics and the daily trade journal', () => {
  const html = buildAnalyticsPrintHtml({
    ...base,
    trades: [{
      id: 'trade-color-test', symbol: 'XAUUSD', type: 'buy', pnl: 50,
      openTime: 1793600400, closeTime: 1793601000,
      entryPrice: 3900, exitPrice: 3901, sl: 3898, tp: 3904,
      size: 0.1, riskAmount: 20, reason: 'TP',
    }],
    dailyEntries: [['2026-11-02', { pnl: 50, trades: 1, wins: 1 }]],
    curve: [{ timestamp: 1793601000, label: '11-02 02:10', pnl: 50 }],
  });

  assert.doesNotMatch(html, /class="eyebrow"/);
  assert.doesNotMatch(html, /Full performance metrics|Starting balance|Final balance|Peak closed balance/);
  assert.match(html, /summary-card b\.gain/);
  assert.match(html, /summary-card b\.loss/);
  assert.match(html, /journal-value gain/);
  assert.match(html, /journal-value loss/);
  assert.match(html, /journal-value warn/);
  assert.match(html, /trade-side buy/);
});

test('builds the analytics PDF when no drawdown exists', () => {
  const html = buildAnalyticsPrintHtml({
    ...base,
    curve: [
      { timestamp: 1793600400, label: '11-02 02:00', pnl: 10 },
      { timestamp: 1793601000, label: '11-02 02:10', pnl: 20 },
    ],
  });

  assert.match(html, /Profit and loss · Over time/);
});


test('exports a consistently dark report regardless of the application theme', () => {
  const html = buildAnalyticsPrintHtml({
    ...base,
    curve: [{ timestamp: 1793600400, label: '11-02 02:00', pnl: 0, benchmarkPnl: 0 }],
  });

  assert.match(html, /background:#0b0e11/);
  assert.match(html, /color:#d5d9e2/);
  assert.match(html, /background:#111722/);
  assert.match(html, /background:#1a2130/);
  assert.doesNotMatch(html, /background:#ffffff|background:#f2f4f7|color-scheme:light/);
});
