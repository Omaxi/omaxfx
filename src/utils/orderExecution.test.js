import test from 'node:test';
import assert from 'node:assert/strict';
import { getPendingOrderFillPrice } from './orderExecution.js';

const candle = (open, high, low) => ({ open, high, low });

test('buy limit fills at its level or at a better opening price after a gap down', () => {
  const order = { type: 'buy', orderType: 'limit', entryPrice: 100 };
  assert.equal(getPendingOrderFillPrice(order, candle(101, 102, 99)), 100);
  assert.equal(getPendingOrderFillPrice(order, candle(98, 101, 97)), 98);
  assert.equal(getPendingOrderFillPrice(order, candle(102, 103, 101)), null);
});

test('sell limit fills at its level or at a better opening price after a gap up', () => {
  const order = { type: 'sell', orderType: 'limit', entryPrice: 100 };
  assert.equal(getPendingOrderFillPrice(order, candle(99, 101, 98)), 100);
  assert.equal(getPendingOrderFillPrice(order, candle(102, 103, 101)), 102);
  assert.equal(getPendingOrderFillPrice(order, candle(98, 99, 97)), null);
});

test('buy stop fills on an upward break and accounts for a gap above the trigger', () => {
  const order = { type: 'buy', orderType: 'stop', entryPrice: 100 };
  assert.equal(getPendingOrderFillPrice(order, candle(99, 101, 98)), 100);
  assert.equal(getPendingOrderFillPrice(order, candle(102, 103, 101)), 102);
  assert.equal(getPendingOrderFillPrice(order, candle(98, 99, 97)), null);
});

test('sell stop fills on a downward break and accounts for a gap below the trigger', () => {
  const order = { type: 'sell', orderType: 'stop', entryPrice: 100 };
  assert.equal(getPendingOrderFillPrice(order, candle(101, 102, 99)), 100);
  assert.equal(getPendingOrderFillPrice(order, candle(98, 99, 97)), 98);
  assert.equal(getPendingOrderFillPrice(order, candle(102, 103, 101)), null);
});

test('rejects malformed pending orders and candles', () => {
  assert.equal(getPendingOrderFillPrice({ type: 'buy', orderType: 'stop', entryPrice: 0 }, candle(1, 2, 0)), null);
  assert.equal(getPendingOrderFillPrice({ type: 'buy', orderType: 'stop', entryPrice: 1 }, candle(NaN, 2, 0)), null);
});
