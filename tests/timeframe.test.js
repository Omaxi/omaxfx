import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateData } from '../src/utils/timeframe.js';

const candles = [
  { time: 1712563500, open: 1.1, high: 1.3, low: 1.0, close: 1.2, volume: 2 },
  { time: 1712563560, open: 1.2, high: 1.4, low: 1.1, close: 1.3, volume: 3 },
  { time: 1712563800, open: 1.3, high: 1.5, low: 1.2, close: 1.4, volume: 4 },
];

test('one-minute timeframe preserves original candles', () => {
  assert.equal(aggregateData(candles, 1), candles);
});

test('aggregates OHLCV and aligns bars to epoch timeframe boundaries', () => {
  const result = aggregateData(candles, 5);
  assert.equal(result.length, 2);
  assert.equal(result[0].time, Math.floor(candles[0].time / 300) * 300);
  assert.equal(result[0].open, 1.1);
  assert.equal(result[0].high, 1.4);
  assert.equal(result[0].low, 1.0);
  assert.equal(result[0].close, 1.3);
  assert.equal(result[0].volume, 5);
  assert.equal(result[1].open, 1.3);
  assert.equal(result[1].close, 1.4);
  assert.equal(result[1].volume, 4);
});

test('empty datasets are safe', () => {
  assert.deepEqual(aggregateData([], 15), []);
});
