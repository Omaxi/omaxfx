import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPnlMultiplier,
  getPricePrecision,
  getPriceTickSize,
  getDefaultMarketStopDistance,
  calculateIntrabarUnrealizedPnl,
  calculateFavorableIntrabarPnl,
} from '../src/utils/instrument.js';

test('EURUSD uses five decimal places and a 0.00001 tick', () => {
  assert.equal(getPricePrecision('EURUSD'), 5);
  assert.equal(getPriceTickSize('EURUSD'), 0.00001);
  assert.equal(getPricePrecision('EURUSD', { EURUSD: { precision: 4 } }), 5);
  assert.equal(getPriceTickSize('EURUSD', { EURUSD: { tickSize: 0.0001 } }), 0.00001);
});

test('CUSTOM data displays five decimals and uses a five-decimal tick', () => {
  assert.equal(getPricePrecision('CUSTOM', { CUSTOM: { precision: 2 } }), 5);
  assert.equal(getPriceTickSize('CUSTOM', { CUSTOM: { tickSize: 0.01 } }), 0.00001);
});

test('all five-decimal pairs default to a 5-pip stop; the 1:2 target is 10 pips', () => {
  assert.equal(getDefaultMarketStopDistance('EURUSD', 0.00001, 5), 0.0005);
  assert.equal(getDefaultMarketStopDistance('GBPUSD', 0.00001, 5), 0.0005);
  assert.equal(getDefaultMarketStopDistance('AUDUSD', 0.00001, 5), 0.0005);
  assert.equal(getDefaultMarketStopDistance('XAUUSD', 0.001, 3), 0.1);
});

test('Gold uses three decimal places and a 0.001 tick to match the CSV', () => {
  assert.equal(getPricePrecision('XAUUSD'), 3);
  assert.equal(getPriceTickSize('XAUUSD'), 0.001);
});

test('floating EURUSD PnL uses the correct contract multiplier and adverse candle price', () => {
  const positions = [{ type: 'buy', symbol: 'EURUSD', entryPrice: 1.1, size: 1 }];
  const candle = { low: 1.099, high: 1.102 };
  assert.equal(getPnlMultiplier('EURUSD'), 100000);
  assert.ok(Math.abs(calculateIntrabarUnrealizedPnl(positions, candle, 'EURUSD') + 100) < 1e-8);
});

test('floating Gold PnL uses contract specs', () => {
  const positions = [{ type: 'sell', symbol: 'XAUUSD', entryPrice: 4325.8, size: 0.1 }];
  const candle = { low: 4324.8, high: 4326.3 };
  assert.ok(Math.abs(calculateIntrabarUnrealizedPnl(positions, candle, 'XAUUSD') + 5) < 1e-8);
});

test('floating equity peak uses the favorable intrabar extreme', () => {
  const positions = [{ type: 'buy', symbol: 'EURUSD', entryPrice: 1.1, size: 1 }];
  const candle = { low: 1.099, high: 1.102 };
  assert.ok(Math.abs(calculateFavorableIntrabarPnl(positions, candle, 'EURUSD') - 200) < 1e-8);
});
