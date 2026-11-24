import test from 'node:test';
import assert from 'node:assert/strict';
import { getTradeCandleWindow, getTradeScreenshotKey, getTradeScreenshotPriceRange, renderTradeScreenshot } from './tradeScreenshots.js';

const candles = Array.from({ length: 100 }, (_, i) => ({
  time: i * 60,
  open: 1 + i / 10000,
  high: 1.001 + i / 10000,
  low: 0.999 + i / 10000,
  close: 1.0005 + i / 10000,
}));

test('keeps screenshot price scaling independent from distant user drawings', () => {
  const chartData = [
    { high: 4430, low: 4427 },
    { high: 4432, low: 4428 },
    { high: 4431, low: 4426 },
  ];
  const trade = { entryPrice: 4429, exitPrice: 4430, sl: 4424, tp: 4435 };
  // Drawings are deliberately not inputs to this range calculation. A saved
  // horizontal line or pencil stroke at 4368 must not compress the candle view.
  const range = getTradeScreenshotPriceRange(chartData, trade);
  assert.ok(range);
  assert.ok(range.min > 4410, 'a distant drawing must not pull the lower scale down');
  assert.ok(range.max < 4450, 'the candle and trade levels should remain tightly framed');
  assert.ok(range.min < 4424 && range.max > 4435, 'the full trade risk/reward levels remain visible');
});

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

test('adds dashed entry, exit, SL and TP guides only when trade levels are visually tight', () => {
  const originalDocument = globalThis.document;
  const dashPatterns = [];
  const guideLabels = [];
  const strokes = [];
  globalThis.document = {
    createElement: () => {
      const context = {
        setLineDash: pattern => dashPatterns.push(pattern.slice()),
        fillText: value => guideLabels.push(String(value)),
        beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() { strokes.push(this.strokeStyle); },
        fillRect() {}, save() {}, restore() {},
      };
      return {
        getContext: () => context,
        toDataURL: () => 'data:image/jpeg;base64,test',
      };
    },
  };
  try {
    const base = {
      symbol: 'XAUUSD', openTime: 2400, closeTime: 2460,
      entryPrice: 1.01, exitPrice: 1.0101, sl: 1.0099, tp: 1.0102,
    };
    renderTradeScreenshot(base, candles, 1);
    assert.ok(dashPatterns.some(pattern => pattern.length === 2 && pattern[0] > 0 && pattern[1] > 0),
      'tight SL/TP distances should trigger dashed guides');
    assert.ok(['ENTRY', 'EXIT', 'SL', 'TP'].every(label => guideLabels.includes(label)),
      'the screenshot should identify each dashed trade level');

    dashPatterns.length = 0;
    guideLabels.length = 0;
    strokes.length = 0;
    renderTradeScreenshot({ ...base, sl: 0.95, tp: 1.08 }, candles, 1);
    assert.equal(dashPatterns.length, 0, 'normal-sized trades should keep the clean screenshot without guide lines');
    assert.ok(!['ENTRY', 'EXIT', 'SL', 'TP'].some(label => guideLabels.includes(label)),
      'normal-sized trades must not add trade-level labels (axis labels remain visible)');
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('renders distinct screenshot payloads without the removed trade title header', () => {
  const originalDocument = globalThis.document;
  const fillColors = [];
  const strokeColors = [];
  globalThis.document = {
    createElement: () => {
      const labels = [];
      const context = new Proxy({
        fillText: (value) => labels.push(String(value)),
        beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() { strokeColors.push(this.strokeStyle); }, fillRect() { fillColors.push(this.fillStyle); },
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
    const first = renderTradeScreenshot({
      id: 'trade-A', symbol: 'EURUSD', type: 'buy', openTime: 600, closeTime: 720,
      entryPrice: 1.1, exitPrice: 1.102, sl: 1.099, tp: 1.102, pnl: 20,
    }, candles, 1, 'dark', {
      drawings: [{ id: 'h1', type: 'horizontal', color: '#f59e0b', points: [{ time: 600, price: 1.1005 }] }],
    });
    const second = renderTradeScreenshot({
      id: 'trade-B', symbol: 'EURUSD', type: 'sell', openTime: 3600, closeTime: 3720,
      entryPrice: 1.2, exitPrice: 1.198, sl: 1.201, tp: 1.198, pnl: 20,
    }, candles, 1);
    assert.ok(first && second);
    assert.equal(fillColors[0], '#0d1117', 'saved trade screenshots must use the dark OmaxFX chart background');
    assert.ok(strokeColors.includes('#f59e0b'), 'historical user drawings should be included in the screenshot');
    assert.notEqual(first, second);
    const firstLabels = Buffer.from(first.split(',')[1], 'base64').toString();
    const secondLabels = Buffer.from(second.split(',')[1], 'base64').toString();
    assert.doesNotMatch(firstLabels, /trade-A|TRADE ID/);
    assert.doesNotMatch(secondLabels, /trade-B|TRADE ID/);
    assert.notEqual(firstLabels, secondLabels);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
