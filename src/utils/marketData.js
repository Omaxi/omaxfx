import Papa from 'papaparse';

const aliases = {
  time: ['time', 'timestamp', 'datetime', 'date time', 'gmt time', 'utc time'],
  date: ['date', 'day'],
  clock: ['clock', 'hour', 'time of day', 'time'],
  open: ['open', 'o', 'open price'],
  high: ['high', 'h', 'high price'],
  low: ['low', 'l', 'low price'],
  close: ['close', 'c', 'last', 'close price'],
  volume: ['volume', 'vol', 'tick volume'],
};

const cleanHeader = (value) => String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');

function makeRowPicker() {
  return (row, candidates) => {
    for (const key of candidates) {
      const value = row?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  };
}

function normalizeClockTime(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\\d{1,2}):(\\d{2})(?::(\\d{2})(\\.\\d+)?)?$/);
  if (!match) return raw;
  const hour = match[1].padStart(2, '0');
  const seconds = match[3] == null ? '' : `:${match[3]}${match[4] || ''}`;
  return `${hour}:${match[2]}${seconds}`;
}

function parseTimestamp(row, pick, keys) {
  const raw = pick(row, keys.time);
  if (raw !== undefined) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && String(raw).trim() !== '') {
      if (numeric > 1e12) return { time: Math.floor(numeric / 1000), isUtc: true };
      if (numeric > 1e9) return { time: Math.floor(numeric), isUtc: true };
    }
    const rawText = String(raw).trim();
    if (!/^\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(rawText)) {
      const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawText);
      const normalized = rawText.includes(' ') && !rawText.includes('T') ? rawText.replace(' ', 'T') : rawText;
      const parsed = Date.parse(hasExplicitZone ? normalized : `${normalized}Z`);
      if (Number.isFinite(parsed)) return { time: Math.floor(parsed / 1000), isUtc: hasExplicitZone };
    }
  }
  const date = pick(row, keys.date);
  const clock = pick(row, keys.clock);
  if (date === undefined || clock === undefined) return null;
  const d = String(date).trim();
  const t = normalizeClockTime(clock);
  let normalizedDate = d;
  if (/^\d{8}$/.test(d)) normalizedDate = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
  else if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(d)) normalizedDate = d.replace(/[./]/g, '-');
  else {
    const european = d.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (european) normalizedDate = `${european[3]}-${european[2].padStart(2,'0')}-${european[1].padStart(2,'0')}`;
  }
  const iso = `${normalizedDate}T${t}`;
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(t);
  const parsed = Date.parse(hasExplicitZone ? iso : `${iso}Z`);
  return Number.isFinite(parsed) ? { time: Math.floor(parsed / 1000), isUtc: hasExplicitZone } : null;
}

function createRowNormalizer(fields = []) {
  if (!fields.length) throw new Error('The CSV has no readable header row.');
  const pick = makeRowPicker();
  const keys = Object.fromEntries(Object.entries(aliases).map(([name, candidates]) => [
    name,
    candidates.map((candidate) => fields.find((field) => cleanHeader(field) === candidate)).filter(Boolean),
  ]));
  const candles = [];
  let invalidRows = 0;
  let timestampsAreUtc = true;
  let previousTime = -Infinity;
  let isChronological = true;

  const addRows = (rows) => {
    for (const row of rows) {
      const parsedTimestamp = parseTimestamp(row, pick, keys);
      const time = parsedTimestamp?.time;
      if (parsedTimestamp && !parsedTimestamp.isUtc) timestampsAreUtc = false;
      const open = Number(pick(row, keys.open));
      const high = Number(pick(row, keys.high));
      const low = Number(pick(row, keys.low));
      const close = Number(pick(row, keys.close));
      const volumeRaw = pick(row, keys.volume);
      const volume = volumeRaw == null ? 0 : Number(volumeRaw);
      if (time == null || ![open, high, low, close].every(Number.isFinite) ||
          high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
        invalidRows++;
        continue;
      }
      if (time < previousTime) isChronological = false;
      previousTime = time;
      candles.push({ time, open, high, low, close, volume: Number.isFinite(volume) && volume >= 0 ? volume : 0 });
    }
  };

  const finish = (parserWarnings = 0) => {
    if (!candles.length) throw new Error('No valid candles found. Expected time/date and OHLC columns.');
    // Most broker exports are already chronological. Avoid an O(n log n) sort in that common case.
    if (!isChronological) candles.sort((a, b) => a.time - b.time);
    const unique = [];
    let lastTime = -Infinity;
    let duplicateRows = 0;
    for (const candle of candles) {
      if (candle.time <= lastTime) {
        duplicateRows++;
        continue;
      }
      unique.push(candle);
      lastTime = candle.time;
    }
    return { candles: unique, invalidRows, duplicateRows, parserWarnings, timestampsAreUtc };
  };

  return { addRows, finish };
}

export function normalizeMarketRows({ data = [], errors = [], meta = {} }) {
  const normalizer = createRowNormalizer(meta.fields || []);
  normalizer.addRows(data);
  return normalizer.finish(errors.length);
}

const parseOptions = {
  header: true,
  skipEmptyLines: 'greedy',
  dynamicTyping: false,
};

export function parseMarketCsvText(text) {
  return normalizeMarketRows(Papa.parse(text, parseOptions));
}

// Parse CSVs in chunks. Papa's worker keeps CSV tokenization off the UI thread,
// while chunk callbacks normalize bounded batches instead of one huge result array.
export function parseMarketCsv(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    let normalizer = null;
    let parserWarnings = 0;
    let settled = false;
    let processedBytes = 0;
    const fileSize = Number(file?.size) || 0;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      // Do not use Papa Parse's worker option here. In the deployed Vite/PWA
      // build the generated worker can fail to start, leaving the Promise
      // pending forever and the UI stuck at 0%. Papa's local FileStreamer
      // already reads Blob/File input asynchronously in bounded chunks.
      onProgress({ loaded: 0, total: fileSize, percent: 0, stage: 'parsing' });
      Papa.parse(file, {
        ...parseOptions,
        worker: false,
        chunkSize: 1024 * 1024,
        chunk: (results) => {
          try {
            if (!normalizer) normalizer = createRowNormalizer(results.meta?.fields || []);
            normalizer.addRows(results.data || []);
            parserWarnings += results.errors?.length || 0;
            const cursor = Number(results.meta?.cursor);
            processedBytes = cursor > processedBytes
              ? Math.min(fileSize || cursor, cursor)
              : Math.min(fileSize, processedBytes + 1024 * 1024);
            onProgress({
              loaded: processedBytes,
              total: fileSize,
              percent: fileSize ? Math.min(99, Math.round((processedBytes / fileSize) * 100)) : 0,
              stage: 'parsing',
            });
          } catch (error) {
            fail(error);
          }
        },
        complete: () => {
          if (settled) return;
          try {
            if (!normalizer) throw new Error('The CSV file is empty or has no readable header row.');
            const result = normalizer.finish(parserWarnings);
            onProgress({ loaded: fileSize, total: fileSize, percent: 100 });
            settled = true;
            resolve(result);
          } catch (error) {
            fail(error);
          }
        },
        error: fail,
      });
    } catch (error) {
      fail(error);
    }
  });
}
