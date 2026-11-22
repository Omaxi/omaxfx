import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFairValueGaps, formatFvgTimeframe } from './fvg.js';

const candle = (time, high, low) => ({ time, open: (high + low) / 2, high, low, close: (high + low) / 2 });

test('detects a bullish three-candle FVG and leaves it open until fully filled', () => {
  const gaps = detectFairValueGaps([
    candle(0, 10, 8),
    candle(60, 13, 11),
    candle(120, 14, 11),
    candle(180, 12, 10.5),
  ], 5);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].direction, 'bullish');
  assert.equal(gaps[0].top, 11);
  assert.equal(gaps[0].bottom, 10);
  assert.equal(gaps[0].startTime, 120);
  assert.equal(gaps[0].mitigatedAt, null);
});

test('marks a bullish FVG mitigated when price reaches its far boundary', () => {
  const gaps = detectFairValueGaps([
    candle(0, 10, 8),
    candle(60, 13, 11),
    candle(120, 14, 11),
    candle(180, 10, 9),
  ], 15);
  assert.equal(gaps[0].mitigatedAt, 180);
});

test('detects bearish FVGs and full mitigation', () => {
  const gaps = detectFairValueGaps([
    candle(0, 12, 10),
    candle(60, 11, 8),
    candle(120, 9, 6),
    candle(180, 11, 8),
  ], 60);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].direction, 'bearish');
  assert.equal(gaps[0].top, 10);
  assert.equal(gaps[0].bottom, 9);
  assert.equal(gaps[0].mitigatedAt, 180);
});

test('ignores overlapping candles and formats timeframe labels', () => {
  assert.deepEqual(detectFairValueGaps([
    candle(0, 10, 8), candle(60, 11, 7), candle(120, 10, 8),
  ], 1), []);
  assert.equal(formatFvgTimeframe(15), '15m');
  assert.equal(formatFvgTimeframe(60), '1h');
  assert.equal(formatFvgTimeframe(240), '4h');
  assert.equal(formatFvgTimeframe(1440), '1D');
});
