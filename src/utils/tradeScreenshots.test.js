import test from 'node:test';
import assert from 'node:assert/strict';
import { getTradeCandleWindow, getTradeScreenshotKey } from './tradeScreenshots.js';

const candles = Array.from({ length: 100 }, (_, i) => ({
  time: i * 60,
  open: 1 + i / 10000,
  high: 1.001 + i / 10000,
  low: 0.999 + i / 10000,
  close: 1.0005 + i / 10000,
}));

test('builds a separate historical candle window for each trade', () => {
  const first = getTradeCandleWindow({ openTime: 600, closeTime: 720 }, candles, 1);
  const second = getTradeCandleWindow({ openTime: 3600, closeTime: 3720 }, candles, 1);

  assert.ok(first);
  assert.ok(second);
  assert.notDeepEqual(first.data.map(c => c.time), second.data.map(c => c.time));
  assert.ok(first.data.some(c => c.time === 600));
  assert.ok(second.data.some(c => c.time === 3600));
  assert.equal(first.data[first.entryIndex].time, 600);
  assert.equal(second.data[second.entryIndex].time, 3600);
});

test('keeps entry and exit marker indexes correct when malformed candles are skipped', () => {
  const input = candles.slice();
  input.splice(20, 0, { time: 1200, open: NaN, high: 1, low: 0, close: 1 });
  const result = getTradeCandleWindow({ openTime: 1200, closeTime: 1500 }, input, 1);

  assert.ok(result);
  assert.equal(result.data[result.entryIndex].time, 1200);
  assert.equal(result.data[result.exitIndex].time, 1500);
  assert.ok(result.data.every(c => Number.isFinite(c.open)));
});

test('rejects trades outside the loaded market-data range', () => {
  assert.equal(getTradeCandleWindow({ openTime: 9000, closeTime: 9060 }, candles), null);
  assert.equal(getTradeCandleWindow({ openTime: 60, closeTime: 120 }, []), null);
});

test('scopes screenshot storage keys by session and trade ID', () => {
  assert.equal(getTradeScreenshotKey('trade-1', 'session-a'), 'session-a::trade-1');
  assert.notEqual(getTradeScreenshotKey('trade-1', 'session-a'), getTradeScreenshotKey('trade-1', 'session-b'));
  assert.equal(getTradeScreenshotKey(null, 'session-a'), null);
});

test('renders distinct screenshot payloads containing each trade ID', () => {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const labels = [];
      const context = new Proxy({
        fillText: (value) => labels.push(String(value)),
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect() {},
        save() {}, restore() {}, setLineDash() {},
      }, { set(target, key, value) { target[key] = value; return true; } });
      return {
        width: 0,
        height: 0,
        getContext: () => context,
        toDataURL: () => 'data:image/jpeg;base64,' + Buffer.from(labels.join('|')).toString('base64'),
      };
    },
  };
  try {
    const { renderTradeScreenshot } = await import('./tradeScreenshots.js');
    const first = renderTradeScreenshot({
      id: 'trade-A', symbol: 'EURUSD', type: 'buy', openTime: 600, closeTime: 720,
      entryPrice: 1.1, exitPrice: 1.102, sl: 1.099, tp: 1.102, pnl: 20,
    }, candles, 1);
    const second = renderTradeScreenshot({
      id: 'trade-B', symbol: 'EURUSD', type: 'sell', openTime: 3600, closeTime: 3720,
      entryPrice: 1.2, exitPrice: 1.198, sl: 1.201, tp: 1.198, pnl: 20,
    }, candles, 1);
    assert.ok(first && second);
    assert.notEqual(first, second);
    assert.match(Buffer.from(first.split(',')[1], 'base64').toString(), /trade-A/);
    assert.match(Buffer.from(second.split(',')[1], 'base64').toString(), /trade-B/);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
