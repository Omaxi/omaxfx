import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFairValueGaps, formatFvgTimeframe, latestFairValueGap, latestFairValueGapPair } from './fvg.js';

const candle = (time, high, low, close = (high + low) / 2) => ({ time, open: close, high, low, close });

test('detects a bullish FVG only when the middle candle closes above the first candle high', () => {
  const gaps = detectFairValueGaps([
    candle(0, 10, 8),
    candle(60, 13, 10.5, 10.2),
    candle(120, 14, 11),
  ], 5);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].direction, 'bullish');
  assert.equal(gaps[0].top, 11);
  assert.equal(gaps[0].bottom, 10);
  assert.equal(gaps[0].startTime, 120);
  assert.equal(gaps[0].mitigatedAt, null);
});

test('rejects a wick-only gap when the middle candle did not close beyond the boundary', () => {
  assert.deepEqual(detectFairValueGaps([
    candle(0, 10, 8),
    candle(60, 13, 10.5, 9.9),
    candle(120, 14, 11),
  ], 5), []);
});

test('marks bullish FVG mitigated only after a candle closes below its far boundary', () => {
  const gaps = detectFairValueGaps([
    candle(0, 10, 8),
    candle(60, 13, 11, 11.5),
    candle(120, 14, 11),
    candle(180, 12, 9.5, 10.2),
    candle(240, 11, 9, 9.9),
  ], 15);
  assert.equal(gaps[0].mitigatedAt, 240);
});

test('detects bearish FVGs and uses close-through mitigation', () => {
  const gaps = detectFairValueGaps([
    candle(0, 12, 10),
    candle(60, 11, 8, 9),
    candle(120, 9, 6),
    candle(180, 11, 8, 10.5),
  ], 60);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].direction, 'bearish');
  assert.equal(gaps[0].top, 10);
  assert.equal(gaps[0].bottom, 9);
  assert.equal(gaps[0].mitigatedAt, 180);
});

test('applies LuxAlgo percentage threshold when configured', () => {
  const candles = [
    candle(0, 100, 90),
    candle(60, 105, 100.5, 101),
    candle(120, 101.2, 100.2),
  ];
  assert.equal(detectFairValueGaps(candles, 1, 0).length, 1);
  assert.equal(detectFairValueGaps(candles, 1, 1).length, 0);
});

test('returns only the latest FVG and never revives an older one after mitigation', () => {
  const gaps = [
    { id: 'old', startTime: 10, mitigatedAt: null },
    { id: 'new', startTime: 20, mitigatedAt: null },
  ];
  assert.equal(latestFairValueGap(gaps, 20).id, 'new');
  assert.equal(latestFairValueGap([...gaps, { id: 'latest', startTime: 30, mitigatedAt: 40 }], 50), null);
  assert.equal(latestFairValueGap(gaps, 15).id, 'old');
});

test('formats timeframes', () => {
  assert.equal(formatFvgTimeframe(15), '15m');
  assert.equal(formatFvgTimeframe(60), '1h');
  assert.equal(formatFvgTimeframe(240), '4h');
  assert.equal(formatFvgTimeframe(1440), '1D');
});


test('keeps the newest active FVG and newest mitigated FVG as an iFVG', () => {
  const gaps = [
    { id: 'old-active', startTime: 10, mitigatedAt: null },
    { id: 'old-dead', startTime: 20, mitigatedAt: 30 },
    { id: 'new-active', startTime: 40, mitigatedAt: null },
    { id: 'new-dead', startTime: 50, mitigatedAt: 60 },
  ];

  const zones = latestFairValueGapPair(gaps, 70);
  assert.equal(zones.length, 2);
  assert.deepEqual(zones.map(zone => [zone.id, zone.isIFVG]), [
    ['new-active', false],
    ['new-dead', true],
  ]);
});

test('keeps a mitigated FVG grey only after its mitigation candle is reached in replay', () => {
  const gaps = [
    { id: 'still-active', startTime: 10, mitigatedAt: 50 },
  ];

  assert.deepEqual(latestFairValueGapPair(gaps, 40).map(zone => [zone.id, zone.isIFVG]), [
    ['still-active', false],
  ]);
  assert.deepEqual(latestFairValueGapPair(gaps, 50).map(zone => [zone.id, zone.isIFVG]), [
    ['still-active', true],
  ]);
});

test('does not resurrect an older active FVG when a newer FVG is mitigated', () => {
  const gaps = [
    { id: 'old-active', startTime: 10, mitigatedAt: null },
    { id: 'latest-dead', startTime: 20, mitigatedAt: 30 },
  ];

  assert.deepEqual(latestFairValueGapPair(gaps, 40).map(zone => [zone.id, zone.isIFVG]), [
    ['old-active', false],
    ['latest-dead', true],
  ]);
});
