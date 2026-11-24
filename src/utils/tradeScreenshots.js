const DB_NAME = 'omaxfx-trade-journal-v7';
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
export function renderTradeScreenshot(trade, candles, timeframe = 1, uiTheme = 'dark', drawingSnapshot = {}) {
  const windowData = getTradeCandleWindow(trade, candles, timeframe);
  if (!windowData || typeof document === 'undefined') return null;
  const { data, entryIndex, exitIndex } = windowData;
  const palette = { background: '#0d1117', text: '#9aa4b2' };
  const width = 1280, height = 640;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const left = 76, right = 108, top = 34, bottom = 58;
  const plotW = width - left - right, plotH = height - top - bottom;
  void uiTheme;
  const entry = Number(trade.entryPrice), sl = trade.sl == null ? NaN : Number(trade.sl), tp = trade.tp == null ? NaN : Number(trade.tp);
  const drawings = [
    ...(Array.isArray(drawingSnapshot.drawings) ? drawingSnapshot.drawings : []),
    ...Object.values(drawingSnapshot.chartDrawings || {}).flatMap(list => Array.isArray(list) ? list : []),
  ];
  const pencilStrokes = Array.isArray(drawingSnapshot.pencilStrokes) ? drawingSnapshot.pencilStrokes : [];
  const prices = data.flatMap(c => [Number(c.high), Number(c.low)]);
  [entry, Number(trade.exitPrice), sl, tp].forEach(v => { if (Number.isFinite(v)) prices.push(v); });
  drawings.forEach(d => (d.points || []).forEach(point => {
    const price = Number(point?.price);
    if (Number.isFinite(price)) prices.push(price);
  }));
  pencilStrokes.forEach(stroke => (stroke.points || []).forEach(point => {
    const price = Number(point?.price);
    if (Number.isFinite(price)) prices.push(price);
  }));
  if (!prices.length) return null;
  let min = Math.min(...prices), max = Math.max(...prices);
  const span = Math.max(max - min, Math.abs(max || 1) * 0.0001, 1e-8);
  min -= span * 0.12; max += span * 0.12;
  const y = price => top + ((max - price) / (max - min)) * plotH;
  const timeToIndex = time => {
    const target = Number(time);
    if (!Number.isFinite(target)) return null;
    if (data.length === 1) return 0;
    if (target <= Number(data[0].time)) return (target - Number(data[0].time)) / Math.max(1, Number(data[1].time) - Number(data[0].time));
    const last = data.length - 1;
    if (target >= Number(data[last].time)) return last + (target - Number(data[last].time)) / Math.max(1, Number(data[last].time) - Number(data[last - 1].time));
    let lo = 0, hi = last;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (Number(data[mid].time) < target) lo = mid; else hi = mid; }
    const t1 = Number(data[lo].time), t2 = Number(data[hi].time);
    return lo + (hi - lo) * ((target - t1) / Math.max(1, t2 - t1));
  };
  const step = plotW / data.length, candleW = Math.max(1, Math.min(9, step * 0.68));
  const x = index => left + (index + 0.5) * step;
  const pointToXY = point => {
    const index = timeToIndex(point?.time), price = Number(point?.price);
    return index == null || !Number.isFinite(price) ? null : { x: x(index), y: y(price) };
  };
  ctx.fillStyle = palette.background; ctx.fillRect(0, 0, width, height);
  const boxLeft = x(entryIndex), boxRight = x(exitIndex);
  if (Number.isFinite(entry) && Number.isFinite(sl)) {
    ctx.fillStyle = 'rgba(239,83,80,0.14)';
    ctx.fillRect(Math.min(boxLeft, boxRight), Math.min(y(entry), y(sl)), Math.max(3, Math.abs(boxRight - boxLeft)), Math.abs(y(entry) - y(sl)));
  }
  if (Number.isFinite(entry) && Number.isFinite(tp)) {
    ctx.fillStyle = 'rgba(38,166,154,0.14)';
    ctx.fillRect(Math.min(boxLeft, boxRight), Math.min(y(entry), y(tp)), Math.max(3, Math.abs(boxRight - boxLeft)), Math.abs(y(entry) - y(tp)));
  }
  data.forEach((c, i) => {
    const cx = x(i), yo = y(Number(c.open)), yc = y(Number(c.close)), yh = y(Number(c.high)), yl = y(Number(c.low));
    const color = Number(c.close) >= Number(c.open) ? '#26a69a' : '#ef5350';
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, yh); ctx.lineTo(cx, yl); ctx.stroke();
    ctx.fillRect(cx - candleW / 2, Math.min(yo, yc), candleW, Math.max(1, Math.abs(yc - yo)));
  });

  const seen = new Set();
  drawings.forEach(d => {
    if (!d || (d.symbol && d.symbol !== trade.symbol)) return;
    const signature = d.id != null ? String(d.id) : JSON.stringify(d);
    if (seen.has(signature)) return;
    seen.add(signature);
    const pts = (d.points || []).map(pointToXY);
    if (!pts.length || pts.some(p => !p)) return;
    const color = d.color || d.borderColor || '#f59e0b';
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = d.fillColor || (color + '33');
    ctx.lineWidth = Math.max(1, Number(d.lineWidth) || 1);
    if (d.type === 'horizontal') { ctx.beginPath(); ctx.moveTo(left, pts[0].y); ctx.lineTo(width-right, pts[0].y); ctx.stroke(); }
    else if (d.type === 'vertical') { ctx.beginPath(); ctx.moveTo(pts[0].x, top); ctx.lineTo(pts[0].x, height-bottom); ctx.stroke(); }
    else if (d.type === 'trendline' && pts.length >= 2) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); }
    else if (d.type === 'rectangle' && pts.length >= 2) {
      const rx=Math.min(pts[0].x,pts[1].x), ry=Math.min(pts[0].y,pts[1].y), rw=Math.abs(pts[1].x-pts[0].x), rh=Math.abs(pts[1].y-pts[0].y);
      ctx.fillRect(rx,ry,rw,rh); if(d.showBorder===true)ctx.strokeRect(rx,ry,rw,rh);
    } else if (d.type === 'fibonacci' && pts.length >= 2) {
      const rx=Math.min(pts[0].x,pts[1].x), rw=Math.abs(pts[1].x-pts[0].x);
      ctx.fillRect(rx,Math.min(pts[0].y,pts[1].y),rw,Math.abs(pts[1].y-pts[0].y));
      if(d.showBorder===true)[0,.236,.382,.5,.618,.764,1].forEach(level=>{const yy=pts[0].y+(pts[1].y-pts[0].y)*level;ctx.beginPath();ctx.moveTo(rx,yy);ctx.lineTo(rx+rw,yy);ctx.stroke();});
    } else if (d.type === 'text') {
      ctx.fillStyle=color; ctx.font=(d.fontSize||14)+'px '+(d.fontFamily||'Arial'); ctx.textBaseline='bottom'; ctx.fillText(String(d.text||''),pts[0].x,pts[0].y);
    }
    ctx.restore();
  });
  pencilStrokes.forEach(stroke => {
    const points=(stroke.points||[]).map(p=>Number.isFinite(Number(p?.time))&&Number.isFinite(Number(p?.price))?pointToXY(p):null).filter(Boolean);
    if(points.length<2)return;
    ctx.save();ctx.strokeStyle=stroke.color||'#3b82f6';ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();ctx.restore();
  });

  // Very tight stop/target distances can disappear at screenshot scale. Only
  // in that case, add dashed trade-level guides to the saved image (never the
  // live chart or interactive journal preview).
  const smallTradeLevels = [sl, tp]
    .filter(Number.isFinite)
    .some(price => Math.abs(y(entry) - y(price)) <= 22);
  if (smallTradeLevels) {
    const guides = [
      { label: 'ENTRY', price: entry, color: '#60a5fa' },
      { label: 'EXIT', price: Number(trade.exitPrice), color: '#e5e7eb' },
      { label: 'SL', price: sl, color: '#ef5350' },
      { label: 'TP', price: tp, color: '#26a69a' },
    ].filter(level => Number.isFinite(level.price));
    const drawn = [];
    guides.forEach(level => {
      const levelY = y(level.price);
      if (drawn.some(item => Math.abs(item.y - levelY) < 1.5)) return;
      drawn.push({ y: levelY });
      ctx.save();
      ctx.strokeStyle = level.color;
      ctx.fillStyle = level.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(left, levelY);
      ctx.lineTo(width - right, levelY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(level.label, left + 5, levelY - 3);
      ctx.restore();
    });
  }

  ctx.fillStyle=palette.text;ctx.font='11px Arial';ctx.textAlign='right';
  for(let i=0;i<=4;i++){const value=max-(max-min)*i/4;ctx.fillText(value.toFixed(Math.min(8,Math.max(2,Number(trade.precision)||5))),width-12,y(value)+4);}
  ctx.textAlign='center';
  const labelCount=Math.min(7,data.length);
  for(let i=0;i<labelCount;i++){const idx=Math.round(i*(data.length-1)/Math.max(1,labelCount-1));ctx.fillText(new Date((Number(data[idx].time)+3*3600)*1000).toLocaleString(undefined,{timeZone:'UTC'}),x(idx),height-24);}
  try{return canvas.toDataURL('image/jpeg',0.9);}catch{return null;}
}
