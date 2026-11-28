import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMarketCsvText } from '../src/utils/marketData.js';
import { findNextSessionCandleIndex, formatMarketDateTime, formatMarketTick, getMarketSession } from '../src/utils/marketClock.js';

const csvUrl = new URL('../public/data/XAUUSD_2026.csv', import.meta.url);
const epoch = (value) => Math.floor(Date.parse(`${value}Z`) / 1000);

test('UTC+3 chart labels match the broker wall-clock candle time', () => {
  // The parser stores naive broker timestamps as UTC epochs, then dataCatalog
  // subtracts three hours. Chart labels must add that offset back exactly once.
  const internalTenAm = epoch('2026-01-02T10:00:00') - 3 * 60 * 60;
  const internalFirstBar = epoch('2026-01-02T02:00:00') - 3 * 60 * 60;

  assert.equal(formatMarketDateTime(internalTenAm), '2026-01-02 10:00');
  assert.equal(formatMarketTick(internalTenAm, 3), '10:00');
  assert.equal(formatMarketDateTime(internalFirstBar), '2026-01-02 02:00');
  assert.equal(formatMarketTick(internalFirstBar, 3), '02:00');
});

test('parses single-digit CSV hours without dropping the early session candles', () => {
  const csv = [
    'date,time,open,high,low,close,volume',
    '20260102,2:00:00,4323.698,4332.848,4323.698,4328.198,236',
    '20260102,2:01:00,4328.198,4331.998,4328.098,4328.898,174',
  ].join('\n');
  const parsed = parseMarketCsvText(csv);
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.candles.length, 2);
  assert.equal(parsed.candles[0].time, epoch('2026-01-02T02:00:00'));
  assert.equal(parsed.candles[0].open, 4323.698);
});

test('parses combined dotted and European broker timestamps', () => {
  const dotted = parseMarketCsvText([
    'Gmt time,Open,High,Low,Close',
    '2026.01.02 02:00:00,4323.698,4332.848,4323.698,4328.198',
    '2026.01.02 02:01:00,4328.198,4331.998,4328.098,4328.898',
  ].join('\n'));
  assert.equal(dotted.candles.length, 2);
  assert.equal(dotted.invalidRows, 0);
  assert.equal(dotted.candles[0].time, epoch('2026-01-02T02:00:00'));

  const european = parseMarketCsvText([
    'DateTime,Open,High,Low,Close',
    '02.01.2026 02:00:00,4323.698,4332.848,4323.698,4328.198',
    '02.01.2026 02:01:00,4328.198,4331.998,4328.098,4328.898',
  ].join('\n'));
  assert.equal(european.candles.length, 2);
  assert.equal(european.candles[0].time, epoch('2026-01-02T02:00:00'));
});

test('XAUUSD CSV contains the full 20:45-to-close sequence and does not jump to 07:00', async () => {
  const csv = await readFile(csvUrl, 'utf8');
  const parsed = parseMarketCsvText(csv);
  const byTime = new Map(parsed.candles.map((candle) => [candle.time, candle]));

  const first = byTime.get(epoch('2026-01-02T02:00:00'));
  assert.ok(first, `first CSV candle at 02:00 must be present; parsed first rows=${JSON.stringify(parsed.candles.slice(0, 3))}; invalidRows=${parsed.invalidRows}; warnings=${parsed.parserWarnings}`);
  assert.equal(first.open, 4323.698);
  assert.equal(first.high, 4332.848);
  assert.equal(first.low, 4323.698);
  assert.equal(first.close, 4328.198);

  const at2045 = byTime.get(epoch('2026-01-02T20:45:00'));
  const at2046 = byTime.get(epoch('2026-01-02T20:46:00'));
  const at2359 = byTime.get(epoch('2026-01-02T23:59:00'));
  const nextDay0000 = byTime.get(epoch('2026-01-03T00:00:00'));

  assert.ok(at2045, '20:45 candle must be present');
  assert.ok(at2046, '20:46 candle must be present');
  assert.equal(at2046.time - at2045.time, 60);
  assert.ok(at2359, '23:59 candle must be present');
  assert.ok(nextDay0000, 'next-day 00:00 candle must be present');
  assert.equal(nextDay0000.time - at2359.time, 60);
});


test('UTC+3 session boundaries are exact and New York crosses midnight', () => {
  const at = (value) => epoch(value) - 3 * 60 * 60;
  assert.deepEqual(getMarketSession(at('2026-01-02T00:59:00')), {
    key: 'newyork', label: 'New York', sessionDate: '2026-01-01',
  });
  assert.equal(getMarketSession(at('2026-01-02T01:00:00')).key, 'asia');
  assert.equal(getMarketSession(at('2026-01-02T10:59:00')).key, 'asia');
  assert.equal(getMarketSession(at('2026-01-02T11:00:00')).key, 'london');
  assert.equal(getMarketSession(at('2026-01-02T15:59:00')).key, 'london');
  assert.deepEqual(getMarketSession(at('2026-01-02T16:00:00')), {
    key: 'newyork', label: 'New York', sessionDate: '2026-01-02',
  });
});


test('next-session lookup skips missing session windows and finds the next available day', () => {
  const at = (value) => epoch(value) - 3 * 60 * 60;
  const candles = [
    { time: at('2026-01-02T10:59:00') },
    // No London candles on Jan 2: jump must skip that day.
    { time: at('2026-01-03T10:59:00') },
    { time: at('2026-01-03T11:07:00') },
    { time: at('2026-01-03T11:08:00') },
  ];
  assert.equal(findNextSessionCandleIndex(candles, 0, 11, 16), 2);
});

test('next-session lookup handles overnight windows and exact session boundaries', () => {
  const at = (value) => epoch(value) - 3 * 60 * 60;
  const candles = [
    { time: at('2026-01-02T15:59:00') },
    { time: at('2026-01-02T16:00:00') },
    { time: at('2026-01-02T23:59:00') },
    { time: at('2026-01-03T00:00:00') },
    { time: at('2026-01-03T00:30:00') },
    { time: at('2026-01-03T01:00:00') },
    { time: at('2026-01-03T16:00:00') },
  ];
  assert.equal(findNextSessionCandleIndex(candles, 0, 16, 1), 1);
  assert.equal(findNextSessionCandleIndex(candles, 1, 16, 1), 6);
  assert.equal(findNextSessionCandleIndex(candles, 2, 16, 1), 6);
  assert.equal(findNextSessionCandleIndex(candles, 3, 16, 1), 6);
  assert.equal(findNextSessionCandleIndex(candles, 4, 16, 1), 6);
  assert.equal(findNextSessionCandleIndex(candles, 5, 16, 1), 6);
  assert.equal(findNextSessionCandleIndex(candles, 6, 16, 1), -1);
});

test('next-session lookup uses the first available candle after the start minute', () => {
  const at = (value) => epoch(value) - 3 * 60 * 60;
  const candles = [
    { time: at('2026-01-02T10:59:00') },
    { time: at('2026-01-02T11:04:00') },
    { time: at('2026-01-02T11:05:00') },
  ];
  assert.equal(findNextSessionCandleIndex(candles, 0, 11, 16), 1);
});

test('next-session lookup safely rejects invalid windows and empty data', () => {
  assert.equal(findNextSessionCandleIndex([], 0, 11, 16), -1);
  assert.equal(findNextSessionCandleIndex([{ time: 0 }], 0, 11, 11), -1);
  assert.equal(findNextSessionCandleIndex([{ time: 0 }], 0, 25, 26), -1);
});


test('next-session lookup skips weekends and sparse days without matching candles', () => {
  const at = (value) => epoch(value) - 3 * 60 * 60;
  const candles = [
    { time: at('2026-01-02T10:30:00') },
    // Friday has no Asia session candles; Saturday and Sunday are absent.
    { time: at('2026-01-05T02:59:00') },
    { time: at('2026-01-05T03:07:00') },
    { time: at('2026-01-05T03:08:00') },
  ];
  assert.equal(findNextSessionCandleIndex(candles, 0, 3, 8), 2);
});

test('next-session lookup supports a session ending at midnight', () => {
  const at = (value) => epoch(value) - 3 * 60 * 60;
  const candles = [
    { time: at('2026-01-02T15:59:00') },
    { time: at('2026-01-02T16:03:00') },
    { time: at('2026-01-02T23:59:00') },
    { time: at('2026-01-03T00:00:00') },
    { time: at('2026-01-03T16:00:00') },
  ];
  assert.equal(findNextSessionCandleIndex(candles, 0, 16, 24), 1);
  assert.equal(findNextSessionCandleIndex(candles, 2, 16, 24), 4);
});

test('next-session lookup never returns a candle at or before the replay cursor', () => {
  const at = (value) => epoch(value) - 3 * 60 * 60;
  const candles = [
    { time: at('2026-01-02T10:59:00') },
    { time: at('2026-01-02T11:00:00') },
    { time: at('2026-01-02T11:01:00') },
    { time: at('2026-01-03T11:00:00') },
  ];
  assert.equal(findNextSessionCandleIndex(candles, 1, 11, 16), 3);
});
