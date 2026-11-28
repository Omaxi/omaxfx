const DB_NAME = 'tradepast-backtest-sessions';
const DB_VERSION = 1;
const STORE_NAME = 'saved-sessions';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('This browser does not support local session storage.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open saved-session storage.'));
    request.onblocked = () => reject(new Error('Saved-session storage is busy in another tab. Close other TradePast tabs and try again.'));
  });
}

function withStore(mode, operation) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try {
      result = operation(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(result?.result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Saved-session storage operation failed.'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error('Saved-session storage operation was cancelled.'));
    };
  }));
}

export async function saveBacktestSession(name, snapshot) {
  const now = Date.now();
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || 'Untitled backtest').trim().slice(0, 80) || 'Untitled backtest',
    symbol: snapshot.symbol || 'Unknown',
    currentTime: Number(snapshot.currentTime) || null,
    createdAt: now,
    updatedAt: now,
    snapshot,
  };
  await withStore('readwrite', store => store.put(record));
  return { id: record.id, name: record.name, symbol: record.symbol, currentTime: record.currentTime, createdAt: now, updatedAt: now };
}

export async function listSavedBacktestSessions() {
  const records = await withStore('readonly', store => store.getAll());
  return (records || [])
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
    .map(({ id, name, symbol, currentTime, createdAt, updatedAt }) => ({ id, name, symbol, currentTime, createdAt, updatedAt }));
}

export async function getSavedBacktestSession(id) {
  return withStore('readonly', store => store.get(id));
}

export async function deleteSavedBacktestSession(id) {
  await withStore('readwrite', store => store.delete(id));
}
