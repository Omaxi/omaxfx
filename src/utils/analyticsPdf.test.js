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
      { timestamp: 1793600400, label: '11-02 02:00', pnl: 100 },
      { timestamp: 1793601000, label: '11-02 02:10', pnl: -50 },
      { timestamp: 1793601600, label: '11-02 02:20', pnl: 20 },
    ],
  });

  assert.match(html, /Max DD/);
  assert.match(html, /Trade-by-trade cumulative realized P&amp;L/);
});

test('builds the analytics PDF when no drawdown exists', () => {
  const html = buildAnalyticsPrintHtml({
    ...base,
    curve: [
      { timestamp: 1793600400, label: '11-02 02:00', pnl: 10 },
      { timestamp: 1793601000, label: '11-02 02:10', pnl: 20 },
    ],
  });

  assert.match(html, /Trade-by-trade cumulative realized P&amp;L/);
});
