import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPnlMultiplier,
  getPricePrecision,
  getPriceTickSize,
  calculateIntrabarUnrealizedPnl,
} from '../src/utils/instrument.js';

test('EURUSD uses five decimal places and a 0.00001 tick', () => {
  assert.equal(getPricePrecision('EURUSD'), 5);
  assert.equal(getPriceTickSize('EURUSD'), 0.00001);
  assert.equal(getPricePrecision('EURUSD', { EURUSD: { precision: 4 } }), 5);
  assert.equal(getPriceTickSize('EURUSD', { EURUSD: { tickSize: 0.0001 } }), 0.00001);
});

test('Gold uses two decimal places and a 0.01 tick', () => {
  assert.equal(getPricePrecision('XAUUSD'), 2);
  assert.equal(getPriceTickSize('XAUUSD'), 0.01);
});

test('floating EURUSD PnL uses the correct contract multiplier and adverse candle price', () => {
  const positions = [{ type: 'buy', symbol: 'EURUSD', entryPrice: 1.1, size: 1 }];
  const candle = { low: 1.099, high: 1.102 };
  assert.equal(getPnlMultiplier('EURUSD'), 100000);
  assert.equal(calculateIntrabarUnrealizedPnl(positions, candle, 'EURUSD'), -100);
});

test('floating Gold PnL uses contract specs', () => {
  const positions = [{ type: 'sell', symbol: 'XAUUSD', entryPrice: 4325.8, size: 0.1 }];
  const candle = { low: 4324.8, high: 4326.3 };
  assert.equal(calculateIntrabarUnrealizedPnl(positions, candle, 'XAUUSD'), -5);
});
