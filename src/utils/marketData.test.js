import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSymbolFromFilename, parseMarketCsvText } from './marketData.js';

test('parses compact YYYYMMDD date and separate broker clock columns', () => {
  const parsed = parseMarketCsvText([
    'date,time,open,high,low,close,volume',
    '20241202,1:00:00,1.10427,1.10429,1.10425,1.10429,7',
    '20241202,1:01:00,1.10429,1.10431,1.10428,1.10430,9',
  ].join('\n'));
  assert.equal(parsed.candles.length, 2);
  assert.equal(parsed.candles[0].time, Date.UTC(2024, 11, 2, 1, 0, 0) / 1000);
  assert.equal(parsed.timestampsAreUtc, false);
  assert.equal(parsed.candles[0].volume, 7);
});

test('parses ISO timestamps and short OHLC headers', () => {
  const parsed = parseMarketCsvText([
    'Timestamp,O,H,L,C',
    '2024-12-02T01:00:00Z,1.1,1.2,1.0,1.15',
    '2024-12-02T01:01:00Z,1.15,1.25,1.1,1.2',
  ].join('\n'));
  assert.equal(parsed.candles.length, 2);
  assert.equal(parsed.timestampsAreUtc, true);
  assert.equal(parsed.detectedColumns.open, 'O');
  assert.equal(parsed.candles[1].close, 1.2);
});

test('detects broker Bid/Ask OHLC headers and semicolon delimiter with decimal commas', () => {
  const parsed = parseMarketCsvText([
    'Gmt time;Bid Open;Bid High;Bid Low;Bid Close;Tick volume',
    '2024.12.02 01:00:00;1,10427;1,10429;1,10425;1,10428;7',
    '2024.12.02 01:01:00;1,10428;1,10430;1,10427;1,10429;8',
  ].join('\n'));
  assert.equal(parsed.candles.length, 2);
  assert.equal(parsed.candles[0].open, 1.10427);
  assert.equal(parsed.candles[0].volume, 7);
});

test('parses day-first European dates', () => {
  const parsed = parseMarketCsvText([
    'Date,Time,Open Price,High Price,Low Price,Close Price',
    '02.12.2024,01:00:00,1.1,1.2,1.0,1.15',
    '02.12.2024,01:01:00,1.15,1.25,1.1,1.2',
  ].join('\n'));
  assert.equal(parsed.candles[0].time, Date.UTC(2024, 11, 2, 1, 0, 0) / 1000);
});

test('infers common instrument symbols from dataset filenames', () => {
  assert.equal(inferSymbolFromFilename('EURUSD_2024.csv'), 'EURUSD');
  assert.equal(inferSymbolFromFilename('XAUUSD-2026.csv'), 'XAUUSD');
  assert.equal(inferSymbolFromFilename('NAS100_M1.csv'), 'NAS100');
});

test('reports unrecognized OHLC headings with actionable diagnostics', () => {
  assert.throws(
    () => parseMarketCsvText('Date,Time,Price A,Price B\n20241202,01:00,1,2'),
    /Could not identify required price columns/
  );
});
