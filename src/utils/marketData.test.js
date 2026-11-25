import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketCsvText } from './marketData.js';

test('detects semicolon CSV, European dates and decimal commas', () => {
  const csv = [
    'Date;Time;Open;High;Low;Close;Volume',
    '02.12.2024;09:00;1,0500;1,0600;1,0400;1,0550;100',
  ].join('\n');
  const parsed = parseMarketCsvText(csv);
  assert.equal(parsed.candles.length, 1);
  assert.equal(parsed.candles[0].open, 1.05);
  assert.equal(parsed.candles[0].close, 1.055);
  assert.equal(new Date(parsed.candles[0].time * 1000).toISOString(), '2024-12-02T09:00:00.000Z');
  assert.equal(parsed.delimiter, ';');
  assert.equal(parsed.timestampsAreUtc, false);
});

test('loads headerless YYYYMMDD plus separate time in standard OHLC order', () => {
  const csv = [
    '20241202,09:00,1.0500,1.0600,1.0400,1.0550,100',
    '20241202,09:05,1.0550,1.0650,1.0500,1.0600,120',
  ].join('\n');
  const parsed = parseMarketCsvText(csv);
  assert.equal(parsed.candles.length, 2);
  assert.equal(parsed.headerDetected, false);
  assert.equal(parsed.candles[0].open, 1.05);
  assert.equal(parsed.candles[1].time - parsed.candles[0].time, 300);
});

test('recognizes alternate OHLC price headers and ISO timestamps', () => {
  const csv = [
    'Timestamp,Open Price,High Price,Low Price,Close Price',
    '2024-12-02T09:00:00Z,1.05,1.06,1.04,1.055',
  ].join('\n');
  const parsed = parseMarketCsvText(csv);
  assert.equal(parsed.candles.length, 1);
  assert.equal(parsed.timestampsAreUtc, true);
  assert.equal(parsed.candles[0].close, 1.055);
});
