const DB_NAME = 'omaxfx-trade-journal-v2';
const STORE_NAME = 'screenshots';
let dbPromise;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { dbPromise = null; reject(request.error || new Error('Could not open trade screenshot database')); };
    });
  }
  return dbPromise;
}

export function getTradeScreenshotKey(tradeId, sessionId = 'default') {
  if (tradeId == null) return null;
  return String(sessionId || 'default') + '::' + String(tradeId);
}

export async function saveTradeScreenshot(tradeId, dataUrl, sessionId = 'default') {
  const key = getTradeScreenshotKey(tradeId, sessionId);
  if (!key || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(dataUrl, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Could not save trade screenshot'));
    tx.onabort = () => reject(tx.error || new Error('Trade screenshot save was aborted'));
  });
}

export async function getTradeScreenshot(tradeId, sessionId = 'default') {
  const key = getTradeScreenshotKey(tradeId, sessionId);
  if (!key) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
      request.onerror = () => reject(request.error || new Error('Could not read trade screenshot'));
    });
  } catch { return null; }
}

export function getTradeCandleWindow(trade, candles, timeframe = 1) {
  if (!trade || !Array.isArray(candles) || !candles.length) return null;
  const openTime = Number(trade.openTime);
  const closeTime = Number(trade.closeTime);
  if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) return null;

  const valid = candles.filter(c =>
    Number.isFinite(Number(c?.time)) &&
    Number.isFinite(Number(c?.open)) &&
    Number.isFinite(Number(c?.high)) &&
    Number.isFinite(Number(c?.low)) &&
    Number.isFinite(Number(c?.close))
  );
  if (!valid.length) return null;

  const firstTime = Number(valid[0].time);
  const lastTime = Number(valid[valid.length - 1].time);
  if (openTime > lastTime || closeTime < firstTime) return null;

  let entryIndex = valid.findIndex(c => Number(c.time) >= openTime);
  let exitIndex = valid.findIndex(c => Number(c.time) >= closeTime);
  if (entryIndex < 0) entryIndex = valid.length - 1;
  if (exitIndex < 0) exitIndex = valid.length - 1;
  if (exitIndex < entryIndex) [entryIndex, exitIndex] = [exitIndex, entryIndex];

  const padding = Math.max(18, Math.min(60, Math.round(42 * Math.max(1, Number(timeframe) || 1))));
  const start = Math.max(0, entryIndex - padding);
  const end = Math.min(valid.length - 1, exitIndex + padding);
  const data = valid.slice(start, end + 1);
  if (!data.length) return null;
  return { data, entryIndex: entryIndex - start, exitIndex: exitIndex - start, startIndex: start, endIndex: end };
}

// Render a deterministic historical chart for exactly one trade. The live chart
// canvas is never reused, so a batch of closures cannot receive one shared image.
export function renderTradeScreenshot(trade, candles, timeframe = 1) {
  const windowData = getTradeCandleWindow(trade, candles, timeframe);
  if (!windowData || typeof document === 'undefined') return null;
  const { data, entryIndex, exitIndex } = windowData;

  const width = 1280, height = 640;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const left = 76, right = 108, top = 76, bottom = 58;
  const plotW = width - left - right, plotH = height - top - bottom;
  const entry = Number(trade.entryPrice), exit = Number(trade.exitPrice);
  const sl = Number(trade.sl), tp = Number(trade.tp);
  const prices = data.flatMap(c => [Number(c.high), Number(c.low)]);
  [entry, exit, sl, tp].forEach(v => { if (Number.isFinite(v)) prices.push(v); });
  if (!prices.length) return null;

  let min = Math.min(...prices), max = Math.max(...prices);
  const span = Math.max(max - min, Math.abs(max || 1) * 0.0001, 1e-8);
  min -= span * 0.12; max += span * 0.12;
  const y = price => top + ((max - price) / (max - min)) * plotH;
  const step = plotW / data.length;
  const candleW = Math.max(1, Math.min(9, step * 0.68));
  const x = index => left + (index + 0.5) * step;

  ctx.fillStyle = '#131722'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e5e7eb'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'left';
  ctx.fillText(String(trade.symbol || 'MARKET') + ' · ' + String(trade.type || '').toUpperCase() + ' · TRADE ID ' + String(trade.id), left, 34);
  ctx.fillStyle = '#8b98a9'; ctx.font = '13px Arial';
  ctx.fillText('Entry ' + (Number.isFinite(entry) ? entry : '—') + '   Exit ' + (Number.isFinite(exit) ? exit : '—') + '   P&L ' + Number(trade.pnl || 0).toFixed(2), left, 56);

  ctx.strokeStyle = '#293241'; ctx.lineWidth = 1; ctx.font = '11px Arial'; ctx.fillStyle = '#9aa4b2';
  for (let i = 0; i <= 6; i++) {
    const yy = top + (plotH * i / 6), value = max - (max - min) * i / 6;
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(width - right, yy); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(value.toFixed(Math.min(8, Math.max(2, Number(trade.precision) || 5))), width - 12, yy + 4);
  }

  const boxLeft = x(entryIndex), boxRight = x(exitIndex);
  if (Number.isFinite(entry) && Number.isFinite(sl)) {
    ctx.fillStyle = 'rgba(239,83,80,0.18)';
    ctx.fillRect(Math.min(boxLeft, boxRight), Math.min(y(entry), y(sl)), Math.max(3, Math.abs(boxRight - boxLeft)), Math.abs(y(entry) - y(sl)));
  }
  if (Number.isFinite(entry) && Number.isFinite(tp)) {
    ctx.fillStyle = 'rgba(38,166,154,0.18)';
    ctx.fillRect(Math.min(boxLeft, boxRight), Math.min(y(entry), y(tp)), Math.max(3, Math.abs(boxRight - boxLeft)), Math.abs(y(entry) - y(tp)));
  }

  data.forEach((c, i) => {
    const cx = x(i), yo = y(Number(c.open)), yc = y(Number(c.close));
    const yh = y(Number(c.high)), yl = y(Number(c.low));
    const color = Number(c.close) >= Number(c.open) ? '#26a69a' : '#ef5350';
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, yh); ctx.lineTo(cx, yl); ctx.stroke();
    ctx.fillRect(cx - candleW / 2, Math.min(yo, yc), candleW, Math.max(1, Math.abs(yc - yo)));
  });

  const drawLevel = (price, color, label, dash = []) => {
    if (!Number.isFinite(price)) return;
    const yy = y(price);
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(width - right, yy); ctx.stroke();
    ctx.setLineDash([]); ctx.font = 'bold 12px Arial'; ctx.textAlign = 'left';
    ctx.fillText(label + '  ' + price, width - right + 8, yy - 5);
    ctx.restore();
  };
  drawLevel(entry, '#fbbf24', 'ENTRY', [5, 4]);
  drawLevel(exit, '#60a5fa', 'EXIT', [3, 3]);
  drawLevel(sl, '#ef5350', 'SL');
  drawLevel(tp, '#26a69a', 'TP');

  const markX = x(entryIndex);
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(markX, top); ctx.lineTo(markX, top + plotH); ctx.stroke();
  const exitX = x(exitIndex);
  ctx.strokeStyle = '#60a5fa';
  ctx.beginPath(); ctx.moveTo(exitX, top); ctx.lineTo(exitX, top + plotH); ctx.stroke();

  ctx.fillStyle = '#9aa4b2'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
  const labelCount = Math.min(7, data.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.round(i * (data.length - 1) / Math.max(1, labelCount - 1));
    ctx.fillText(new Date(Number(data[idx].time) * 1000).toLocaleString(), x(idx), height - 24);
  }
  try { return canvas.toDataURL('image/jpeg', 0.9); } catch { return null; }
}
