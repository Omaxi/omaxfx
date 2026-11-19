import test from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './store.js';

function configureStore(overrides = {}) {
  const original = useStore.getState();
  useStore.setState({
    rawData: [{ time: 60, open: 100, high: 101, low: 99, close: 100 }],
    currentIndex: 0,
    gameState: { isOver: false, reason: null, message: '', startTime: null },
    rules: { maxRiskPerTrade: 1, maxDailyLoss: 5, maxDrawdown: 10, propFirmEnabled: true },
    balance: 10000,
    peakBalance: 10000,
    positions: [],
    pendingOrders: [],
    tradeHistory: [],
    symbol: 'EURUSD',
    contractSpecs: { EURUSD: { contractSize: 100000, quoteToAccountRate: 1 } },
    soundEnabled: false,
    ...overrides,
  });
  return () => useStore.setState(original, true);
}

test('market order risk sizing uses the actual market fill price', () => {
  const restore = configureStore();
  try {
    useStore.getState().placeOrder({
      side: 'buy', type: 'market', riskPercent: 1,
      entryPrice: 101, slPrice: 99, tpPrice: 102, riskAmount: 100,
    });
    const position = useStore.getState().positions[0];
    assert.ok(position);
    assert.equal(position.entryPrice, 100);
    assert.equal(position.initialRiskDistance, 1);
    assert.equal(position.size, 0.001);
  } finally { restore(); }
});

test('prop-firm OFF bypasses the configured maximum risk percentage', () => {
  const restore = configureStore({ rules: { maxRiskPerTrade: 1, maxDailyLoss: 5, maxDrawdown: 10, propFirmEnabled: false } });
  try {
    useStore.getState().placeOrder({
      side: 'buy', type: 'market', riskPercent: 3,
      entryPrice: 100, slPrice: 99, tpPrice: 103, riskAmount: 300,
    });
    assert.equal(useStore.getState().positions.length, 1);
    assert.equal(useStore.getState().positions[0].riskPercent, 3);
  } finally { restore(); }
});

test('invalid order prices are rejected without mutating positions or pending orders', () => {
  const restore = configureStore();
  try {
    useStore.getState().placeOrder({
      side: 'buy', type: 'market', riskPercent: 1,
      entryPrice: 100, slPrice: 100, tpPrice: 102, riskAmount: 100,
    });
    assert.equal(useStore.getState().positions.length, 0);
    assert.equal(useStore.getState().pendingOrders.length, 0);
  } finally { restore(); }
});

test('stepForward fills a buy limit at the requested price and removes it from pending orders', () => {
  const restore = configureStore({
    gameStarted: true,
    rawData: [
      { time: 60, open: 100, high: 101, low: 99, close: 100 },
      { time: 120, open: 100, high: 101, low: 98.5, close: 100 },
      { time: 180, open: 100, high: 101, low: 99, close: 100 },
    ],
    pendingOrders: [{
      id: 'limit-1', type: 'buy', orderType: 'limit', entryPrice: 99,
      sl: 98, tp: 102, size: 0.001, riskAmount: 100, symbol: 'EURUSD',
    }],
  });
  try {
    useStore.getState().stepForward();
    const state = useStore.getState();
    assert.equal(state.pendingOrders.length, 0);
    assert.equal(state.positions.length, 1);
    assert.equal(state.positions[0].entryPrice, 99);
    assert.equal(state.positions[0].isPending, false);
  } finally { restore(); }
});

test('stepForward fills a buy stop only on an upward trigger', () => {
  const restore = configureStore({
    gameStarted: true,
    rawData: [
      { time: 60, open: 100, high: 100.5, low: 99.5, close: 100 },
      { time: 120, open: 100, high: 102, low: 100.5, close: 101 },
      { time: 180, open: 101, high: 102, low: 100, close: 101 },
    ],
    pendingOrders: [{
      id: 'stop-1', type: 'buy', orderType: 'stop', entryPrice: 101,
      sl: 100, tp: 103, size: 0.001, riskAmount: 100, symbol: 'EURUSD',
    }],
  });
  try {
    useStore.getState().stepForward();
    const state = useStore.getState();
    assert.equal(state.pendingOrders.length, 0);
    assert.equal(state.positions.length, 1);
    assert.equal(state.positions[0].entryPrice, 101);
  } finally { restore(); }
});

test('resolves same-bar pending entry exits with stop-loss priority', () => {
  const restore = configureStore({
    gameStarted: true,
    rawData: [
      { time: 60, open: 100, high: 101, low: 99, close: 100 },
      { time: 120, open: 100, high: 101, low: 97, close: 99 },
      { time: 180, open: 99, high: 100, low: 98.5, close: 99 },
    ],
    pendingOrders: [{
      id: 'limit-same-bar', type: 'buy', orderType: 'limit', entryPrice: 99,
      sl: 98, tp: 100, size: 0.001, riskAmount: 100, symbol: 'EURUSD',
    }],
  });
  try {
    useStore.getState().stepForward();
    const state = useStore.getState();
    assert.equal(state.pendingOrders.length, 0);
    assert.equal(state.positions.length, 0);
    assert.equal(state.tradeHistory.length, 1);
    assert.equal(state.tradeHistory[0].reason, 'SL');
    assert.equal(state.tradeHistory[0].exitPrice, 98);
    assert.equal(state.tradeHistory[0].pnl, -100);
  } finally { restore(); }
});

test('open buy positions exit at the candle open when price gaps below stop loss', () => {
  const restore = configureStore({
    gameStarted: true,
    rawData: [
      { time: 60, open: 100, high: 101, low: 99, close: 100 },
      { time: 120, open: 96, high: 99, low: 95, close: 97 },
      { time: 180, open: 97, high: 98, low: 96, close: 97 },
    ],
    positions: [{
      id: 'gap-sl', type: 'buy', entryPrice: 100, sl: 98, tp: 105,
      size: 0.001, symbol: 'EURUSD',
    }],
  });
  try {
    useStore.getState().stepForward();
    const state = useStore.getState();
    assert.equal(state.positions.length, 0);
    assert.equal(state.tradeHistory[0].exitPrice, 96);
    assert.equal(state.tradeHistory[0].pnl, -400);
  } finally { restore(); }
});

test('open buy positions receive the opening price when market gaps above take profit', () => {
  const restore = configureStore({
    gameStarted: true,
    rawData: [
      { time: 60, open: 100, high: 101, low: 99, close: 100 },
      { time: 120, open: 106, high: 107, low: 104, close: 106 },
      { time: 180, open: 106, high: 107, low: 105, close: 106 },
    ],
    positions: [{
      id: 'gap-tp', type: 'buy', entryPrice: 100, sl: 98, tp: 105,
      size: 0.001, symbol: 'EURUSD',
    }],
  });
  try {
    useStore.getState().stepForward();
    const state = useStore.getState();
    assert.equal(state.positions.length, 0);
    assert.equal(state.tradeHistory[0].exitPrice, 106);
    assert.equal(state.tradeHistory[0].pnl, 600);
  } finally { restore(); }
});
