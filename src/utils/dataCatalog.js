import { parseMarketCsv } from './marketData';

const UTC_PLUS_3_SECONDS = 3 * 60 * 60;
const DATA_CACHE = 'omaxfx-market-data-v1';

async function fetchCachedCsv(url) {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(url);
      if (cached) return cached;
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response.clone());
      return response;
    } catch (error) {
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

export async function loadBundledCsvFiles(files, onProgress = () => {}) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('Select at least one CSV file from the data folder.');
  const candles = [];
  let invalidRows = 0;
  let duplicateRows = 0;
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const url = `${import.meta.env.BASE_URL}${String(file.url).replace(/^\/+/, '')}`;
    const response = await fetchCachedCsv(url);
    if (!response.ok) throw new Error(`Unable to read ${file.name}. Check that it exists in public/data.`);
    const blob = await response.blob();
    const parsed = await parseMarketCsv(blob);
    invalidRows += parsed.invalidRows;
    duplicateRows += parsed.duplicateRows;
    // Every file in the project data folder is broker wall-clock time UTC+3.
    for (const candle of parsed.candles) candles.push({ ...candle, time: candle.time - UTC_PLUS_3_SECONDS });
    onProgress({ completed: index + 1, total: files.length, file: file.name });
  }
  candles.sort((a, b) => a.time - b.time);
  const unique = candles.filter((candle, index) => index === 0 || candle.time > candles[index - 1].time);
  duplicateRows += candles.length - unique.length;
  if (unique.length < 2) throw new Error('The selected files contain fewer than two unique valid candles.');
  return {
    candles: unique,
    invalidRows,
    duplicateRows,
    symbol: files[0].symbol,
    files: files.map(file => file.name),
  };
}
