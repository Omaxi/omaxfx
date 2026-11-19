const DB_NAME = 'omaxfx-trade-journal';
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
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function saveTradeScreenshot(tradeId, dataUrl) {
  if (tradeId == null || !dataUrl) return false;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(dataUrl, String(tradeId));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTradeScreenshot(tradeId) {
  if (tradeId == null) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(String(tradeId));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export function captureChartScreenshot() {
  const chart = document.querySelector('.chart-no-touch');
  const root = chart?.parentElement;
  if (!root) return null;
  const bounds = root.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const output = document.createElement('canvas');
  output.width = Math.round(bounds.width * dpr);
  output.height = Math.round(bounds.height * dpr);
  const ctx = output.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#131722';
  ctx.fillRect(0, 0, output.width, output.height);
  const canvases = Array.from(root.querySelectorAll('canvas'));
  canvases.forEach(source => {
    const rect = source.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    try {
      ctx.drawImage(
        source,
        Math.round((rect.left - bounds.left) * dpr),
        Math.round((rect.top - bounds.top) * dpr),
        Math.round(rect.width * dpr),
        Math.round(rect.height * dpr),
      );
    } catch (error) {
      // A canvas that cannot be read is skipped; other chart layers still save.
    }
  });
  try { return output.toDataURL('image/jpeg', 0.88); } catch { return null; }
}
