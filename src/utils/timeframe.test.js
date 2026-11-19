import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateData } from './timeframe.js';

const candle = (time, open, high, low, close, volume = 1) => ({ time, open, high, low, close, volume });

test('aggregates intraday candles into UTC-aligned five-minute bars', () => {
  const data = [
    candle(120, 10, 12, 9, 11, 5),
    candle(180, 11, 13, 10, 12, 7),
    candle(300, 12, 14, 11, 13, 2),
  ];
  const result = aggregateData(data, 5);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], candle(0, 10, 13, 9, 12, 12));
  assert.deepEqual(result[1], candle(300, 12, 14, 11, 13, 2));
});

test('keeps one-minute data unchanged', () => {
  const data = [candle(60, 1, 2, 0.5, 1.5)];
  assert.equal(aggregateData(data, 1), data);
});

test('aligns weekly bars to Monday UTC rather than Unix epoch Thursday', () => {
  const thursday = 0;
  const mondayAfterEpoch = 4 * 86400;
  const result = aggregateData([
    candle(thursday, 1, 2, 1, 2),
    candle(mondayAfterEpoch, 2, 3, 2, 3),
  ], 10080);
  assert.equal(result.length, 2);
  assert.equal(result[0].time, -3 * 86400);
  assert.equal(result[1].time, mondayAfterEpoch);
});

test('ignores invalid timestamps and tolerates missing volume', () => {
  const result = aggregateData([
    candle(Number.NaN, 1, 2, 1, 2, 3),
    { time: 0, open: 1, high: 2, low: 1, close: 2 },
    { time: 60, open: 2, high: 3, low: 2, close: 3 },
  ], 5);
  assert.equal(result.length, 1);
  assert.equal(result[0].volume, 0);
});
