import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateData, getExecutionCandle } from './timeframe.js';
import { parseMarketCsvText } from './marketData.js';
import { getPnlMultiplier } from './instrument.js';

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

test('parses separate date/time columns, alternate headers and drops duplicate timestamps', () => {
  const csv = [
    'Date,Time,Open,High,Low,Close,Tick_Volume',
    '2024.01.01,00:00:00,1.1,1.3,1.0,1.2,10',
    '2024.01.01,00:01:00,1.2,1.4,1.1,1.3,11',
    '2024.01.01,00:01:00,1.2,1.4,1.1,1.3,11',
    '2024.01.01,00:02:00,1.3,1.2,1.1,1.2,9',
  ].join('\n');
  const result = parseMarketCsvText(csv);
  assert.equal(result.candles.length, 2);
  assert.equal(result.duplicateRows, 1);
  assert.equal(result.invalidRows, 1);
  assert.equal(result.candles[0].volume, 10);
  assert.equal(result.timestampsAreUtc, false);
});

test('parses a combined timestamp and millisecond epoch headers', () => {
  const csv = [
    'Timestamp,O,H,L,C,Volume',
    '2024-01-01T00:00:00Z,10,12,9,11,4',
    '1704067260000,11,13,10,12,5',
  ].join('\n');
  const result = parseMarketCsvText(csv);
  assert.equal(result.candles.length, 2);
  assert.equal(result.candles[0].time, 1704067200);
  assert.equal(result.candles[1].time, 1704067260);
  assert.equal(result.timestampsAreUtc, true);
});

test('applies custom quote-to-account conversion to contract PnL multiplier', () => {
  assert.equal(getPnlMultiplier('EURUSD', {}), 100000);
  assert.equal(getPnlMultiplier('USDJPY', {
    USDJPY: { contractSize: 100000, quoteToAccountRate: 0.0067 },
  }), 670);
});

test('recognizes explicit UTC+3 ISO timestamps as absolute instants', () => {
  const csv = [
    'Timestamp,Open,High,Low,Close',
    '2024-01-01T00:00:00+03:00,10,12,9,11',
  ].join('\n');
  const result = parseMarketCsvText(csv);
  assert.equal(result.timestampsAreUtc, true);
  assert.equal(result.candles[0].time, 1704056400);
});


test('market execution uses the close of the last completed selected-timeframe candle', () => {
  const raw = Array.from({ length: 31 }, (_, i) => candle(i * 60, i, i + 2, i - 1, i + 1));
  const aggregated = aggregateData(raw, 15);
  const execution = getExecutionCandle(raw, aggregated, 15, 15);
  assert.equal(execution.time, 14 * 60);
  assert.equal(execution.close, 15);
  // A lower-timeframe cursor still resolves to its latest closed one-minute bar.
  assert.equal(getExecutionCandle(raw, raw, 14, 1).close, 15);
});

