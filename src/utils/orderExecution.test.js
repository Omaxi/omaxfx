import test from 'node:test';
import assert from 'node:assert/strict';
import { getPendingOrderFillPrice, getStopLossFillPrice, getTakeProfitFillPrice } from './orderExecution.js';

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

test('stop-loss exits slip to the opening price when a candle gaps through the stop', () => {
  assert.equal(getStopLossFillPrice('buy', 98, candle(96, 99, 95)), 96);
  assert.equal(getStopLossFillPrice('buy', 98, candle(100, 101, 97)), 98);
  assert.equal(getStopLossFillPrice('sell', 102, candle(104, 105, 101)), 104);
  assert.equal(getStopLossFillPrice('sell', 102, candle(100, 103, 99)), 102);
});

test('take-profit exits receive a better opening price when the market gaps through target', () => {
  assert.equal(getTakeProfitFillPrice('buy', 105, candle(107, 108, 104)), 107);
  assert.equal(getTakeProfitFillPrice('buy', 105, candle(103, 106, 102)), 105);
  assert.equal(getTakeProfitFillPrice('sell', 95, candle(93, 96, 92)), 93);
  assert.equal(getTakeProfitFillPrice('sell', 95, candle(97, 98, 94)), 95);
});
