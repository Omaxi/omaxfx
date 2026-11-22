import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyticsPrintHtml } from './analyticsPdf.js';

const base = {
  sessionName: 'PDF regression',
  symbol: 'XAUUSD',
  sessionId: 'session-test',
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
  assert.match(html, /OmaxFX Simulator · Performance report/);
  assert.match(html, /Trading statistics/);
  assert.match(html, /Trading calendar · All active months/);
  assert.match(html, /top-metrics/);
  assert.match(html, /size:A4 portrait/);
  assert.match(html, /equityBlueFill/);
  assert.match(html, /drawdownFill/);
  assert.match(html, /stop-color="#2c67c5"/);
  assert.match(html, /stroke="#2c67c5" stroke-width="3"/);
  // The annotation is rendered as a label centered vertically in the plot area.
  assert.match(html, /<rect x="491" y="147" width="170" height="22" rx="5"/);
  assert.match(html, /Buy &amp; Hold/);
  assert.doesNotMatch(html, /Use your browser's Print dialog/);
  assert.match(html, /Equity curve · Strategy vs Buy &amp; Hold/);
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
  assert.match(html, /metric-value gain/);
  assert.match(html, /metric-value loss/);
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

  assert.match(html, /Equity curve · Strategy vs Buy &amp; Hold/);
});
