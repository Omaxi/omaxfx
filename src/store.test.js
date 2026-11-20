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


test('rejects a second order while a position or pending order already exists', () => {
  const restore = configureStore({
    positions: [{ id: 'already-open', type: 'buy', entryPrice: 100, sl: 99, tp: 102, size: 0.01 }],
  });
  try {
    useStore.getState().placeOrder({
      side: 'sell', type: 'market', riskPercent: 1,
      entryPrice: 100, slPrice: 101, tpPrice: 98, riskAmount: 100,
    });
    assert.equal(useStore.getState().positions.length, 1);
    assert.equal(useStore.getState().positions[0].id, 'already-open');
    assert.equal(useStore.getState().pendingOrders.length, 0);
  } finally { restore(); }
});

test('rejects a new position while a pending order already exists', () => {
  const restore = configureStore({
    pendingOrders: [{ id: 'pending-one', type: 'buy', orderType: 'limit', entryPrice: 99, sl: 98, tp: 101 }],
  });
  try {
    useStore.getState().placeOrder({
      side: 'sell', type: 'market', riskPercent: 1,
      entryPrice: 100, slPrice: 101, tpPrice: 98, riskAmount: 100,
    });
    assert.equal(useStore.getState().pendingOrders.length, 1);
    assert.equal(useStore.getState().positions.length, 0);
  } finally { restore(); }
});

test('market execution on 15m uses the completed 15m close, not the next 1m candle', () => {
  const rawData = Array.from({ length: 31 }, (_, i) => ({
    time: i * 60, open: 1 + i / 10000, high: 1.01 + i / 10000,
    low: 0.99 + i / 10000, close: 1 + i / 10000,
  }));
  const restore = configureStore({
    rawData,
    displayData: [],
    currentIndex: 15,
    timeframe: 15,
    contractSpecs: { EURUSD: { contractSize: 100000, quoteToAccountRate: 1 } },
  });
  try {
    useStore.setState({ displayData: rawData.reduce((acc, candle, i) => {
      const bucket = Math.floor(candle.time / 900) * 900;
      const last = acc[acc.length - 1];
      if (!last || last.time !== bucket) acc.push({ time: bucket, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: 0 });
      else { last.high = Math.max(last.high, candle.high); last.low = Math.min(last.low, candle.low); last.close = candle.close; }
      return acc;
    }, []) });
    useStore.getState().placeOrder({
      side: 'buy', type: 'market', riskPercent: 1,
      entryPrice: 999, slPrice: 0.99, tpPrice: 1.1, riskAmount: 100,
    });
    const position = useStore.getState().positions[0];
    assert.ok(position);
    assert.equal(position.entryPrice, rawData[14].close);
    assert.equal(position.openTime, rawData[14].time);
  } finally { restore(); }
});


test('15m replay evaluates the first minute after the prior completed 15m candle', () => {
  const rawData = Array.from({ length: 31 }, (_, i) => ({
    time: i * 60,
    open: 100,
    high: 101,
    low: i === 15 ? 98 : 99.5,
    close: 100,
  }));
  const restore = configureStore({
    gameStarted: true,
    timeframe: 15,
    currentIndex: 15,
    rawData,
    positions: [{
      id: '15m-position', type: 'buy', entryPrice: 100, sl: 99, tp: 105,
      size: 0.001, symbol: 'EURUSD',
    }],
  });
  try {
    useStore.getState().stepForward();
    const state = useStore.getState();
    assert.equal(state.tradeHistory.length, 1);
    assert.equal(state.tradeHistory[0].reason, 'SL');
    assert.equal(state.tradeHistory[0].closeTime, rawData[15].time);
    assert.equal(state.currentIndex, 30);
  } finally { restore(); }
});

test('switching between 1m and 15m preserves the last closed-bar boundary', () => {
  const rawData = Array.from({ length: 46 }, (_, i) => ({
    time: i * 60, open: 1, high: 2, low: 0.5, close: 1.5,
  }));
  const restore = configureStore({ rawData, currentIndex: 14, timeframe: 1 });
  try {
    useStore.getState().setTimeframe(15);
    assert.equal(useStore.getState().currentIndex, 15);
    useStore.getState().setTimeframe(1);
    assert.equal(useStore.getState().currentIndex, 14);
  } finally { restore(); }
});


test('1m replay advances exactly one source candle even when timestamps cross a large date gap', () => {
  const rawData = [
    { time: 60, open: 100, high: 101, low: 99, close: 100 },
    { time: 60 + 30 * 86400, open: 200, high: 201, low: 199, close: 200 },
    { time: 60 + 30 * 86400 + 60, open: 201, high: 202, low: 200, close: 201 },
  ];
  const restore = configureStore({ gameStarted: true, timeframe: 1, currentIndex: 0, rawData });
  try {
    useStore.getState().stepForward();
    assert.equal(useStore.getState().currentIndex, 1);
    assert.equal(useStore.getState().rawData[useStore.getState().currentIndex].close, 200);
  } finally { restore(); }
});

test('5m replay advances one timestamp-aligned candle bucket across missing-minute gaps', () => {
  const rawData = [
    { time: 60, open: 100, high: 101, low: 99, close: 100 },
    { time: 120, open: 100, high: 102, low: 99, close: 101 },
    { time: 180, open: 101, high: 103, low: 100, close: 102 },
    { time: 300, open: 102, high: 104, low: 101, close: 103 },
    { time: 900, open: 103, high: 105, low: 102, close: 104 },
    { time: 960, open: 104, high: 106, low: 103, close: 105 },
  ];
  const restore = configureStore({ gameStarted: true, timeframe: 5, currentIndex: 0, rawData });
  try {
    useStore.getState().stepForward();
    assert.equal(useStore.getState().currentIndex, 3);
    useStore.getState().stepForward();
    assert.equal(useStore.getState().currentIndex, 4);
  } finally { restore(); }
});
