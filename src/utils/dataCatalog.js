import { parseMarketCsv } from './marketData';

const UTC_PLUS_3_SECONDS = 3 * 60 * 60;
const DATA_CACHE = 'omaxfx-market-data-v3';
const LEGACY_DATA_CACHES = ['omaxfx-market-data-v1', 'omaxfx-market-data-v2', 'csv-cache'];
let legacyCachesCleared = false;

async function fetchCachedCsv(url) {
  const absoluteUrl = new URL(url, document.baseURI).href;
  if (typeof caches !== 'undefined') {
    try {
      // Remove only known market-data caches from older releases. Saved
      // sessions and unrelated browser storage remain untouched.
      if (!legacyCachesCleared) {
        await Promise.all(LEGACY_DATA_CACHES.map((cacheName) => caches.delete(cacheName)));
        legacyCachesCleared = true;
      }
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(absoluteUrl);
      if (cached) return cached;

      const response = await fetch(url);
      // Cache in the background: waiting for a 15–20 MB disk write before parsing
      // made the first load feel stalled. Keep the response available immediately.
      if (response.ok) {
        const cacheCopy = response.clone();
        cache.put(absoluteUrl, cacheCopy).catch(() => {});
      }
      return response;
    } catch {
      // Cache storage can be unavailable in private browsing; normal fetch still works.
    }
  }
  return fetch(url);
}

export async function fetchDataCatalog() {
  const response = await fetch(`${import.meta.env.BASE_URL}data-manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('The local data catalog is unavailable. Run npm run dev or npm run build first.');
  const manifest = await response.json();
  return Array.isArray(manifest.files) ? manifest.files : [];
}

async function readCsvResponse(response, file, onProgress) {
  const total = Number(response.headers?.get('content-length')) || 0;
  if (!response.body?.getReader) {
    const blob = await response.blob();
    onProgress({ file: file.name, percent: 35, stage: 'parsing', loaded: blob.size, total: blob.size });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress({
        file: file.name,
        loaded,
        total,
        percent: total ? Math.min(35, Math.round((loaded / total) * 35)) : 1,
        stage: 'downloading',
      });
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* stream already closed */ }
    throw new Error(`Download failed for ${file.name}: ${error?.message || 'network interrupted'}`);
  }
  if (!loaded) throw new Error(`${file.name} downloaded no data. Check the CSV file and try again.`);
  onProgress({ file: file.name, loaded, total: total || loaded, percent: 35, stage: 'parsing' });
  return new Blob(chunks, { type: response.headers?.get('content-type') || 'text/csv' });
}

export async function loadBundledCsvFiles(files, onProgress = () => {}) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('Select at least one CSV file from the data folder.');
  const candles = [];
  let invalidRows = 0;
  let duplicateRows = 0;
  let previousTime = -Infinity;
  let isChronological = true;

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const url = `${import.meta.env.BASE_URL}${String(file.url).replace(/^[/]+/, '')}`;
    onProgress({ completed: index, total: files.length, file: file.name, percent: 0, stage: 'downloading' });

    const response = await fetchCachedCsv(url);
    if (!response.ok) throw new Error(`Unable to read ${file.name}. Check that it exists in public/data.`);
    const blob = await readCsvResponse(response, file, (progress) => {
      onProgress({
        completed: index,
        total: files.length,
        file: file.name,
        percent: Math.round(((index + progress.percent / 100) / files.length) * 100),
        stage: progress.stage || 'downloading',
      });
    });
    const parsed = await parseMarketCsv(blob, (progress) => {
      onProgress({
        completed: index,
        total: files.length,
        file: file.name,
        percent: Math.round(((index + (0.35 + (progress.percent / 100) * 0.64)) / files.length) * 100),
        stage: 'parsing',
      });
    });

    invalidRows += parsed.invalidRows;
    duplicateRows += parsed.duplicateRows;
    // Every file in the project data folder is broker wall-clock time UTC+3.
    for (const candle of parsed.candles) {
      const normalized = { ...candle, time: candle.time - (parsed.timestampsAreUtc ? 0 : UTC_PLUS_3_SECONDS) };
      if (normalized.time < previousTime) isChronological = false;
      previousTime = normalized.time;
      candles.push(normalized);
    }
    onProgress({ completed: index + 1, total: files.length, file: file.name, percent: Math.round(((index + 1) / files.length) * 100), stage: 'complete' });
  }

  // Yearly CSV files are normally ordered already. Only sort if the selected
  // files overlap or arrive out of order; deduplicate in one linear pass.
  if (!isChronological) candles.sort((a, b) => a.time - b.time);
  const unique = [];
  let lastTime = -Infinity;
  for (const candle of candles) {
    if (candle.time <= lastTime) {
      duplicateRows++;
      continue;
    }
    unique.push(candle);
    lastTime = candle.time;
  }

  if (unique.length < 2) throw new Error('The selected files contain fewer than two unique valid candles.');
  return {
    candles: unique,
    invalidRows,
    duplicateRows,
    symbol: files[0].symbol,
    files: files.map(file => file.name),
  };
}
