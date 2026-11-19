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
