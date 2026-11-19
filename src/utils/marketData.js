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

function pick(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find((candidate) => cleanHeader(candidate) === name);
    if (key != null && row[key] !== '') return row[key];
  }
  return undefined;
}

function parseTimestamp(row) {
  const raw = pick(row, aliases.time);
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
  const date = pick(row, aliases.date);
  const clock = pick(row, aliases.clock);
  if (date === undefined || clock === undefined) return null;
  const d = String(date).trim();
  const t = String(clock).trim();
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

export function normalizeMarketRows({ data = [], errors = [], meta = {} }) {
  if (!meta.fields?.length) throw new Error('The CSV has no readable header row.');
  const candles = [];
  let invalid = 0;
  let timestampsAreUtc = true;
  for (const row of data) {
    const parsedTimestamp = parseTimestamp(row);
    const time = parsedTimestamp?.time;
    if (parsedTimestamp && !parsedTimestamp.isUtc) timestampsAreUtc = false;
    const open = Number(pick(row, aliases.open));
    const high = Number(pick(row, aliases.high));
    const low = Number(pick(row, aliases.low));
    const close = Number(pick(row, aliases.close));
    const volumeRaw = pick(row, aliases.volume);
    const volume = volumeRaw == null ? 0 : Number(volumeRaw);
    if (time == null || ![open, high, low, close].every(Number.isFinite) ||
        high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      invalid++;
      continue;
    }
    candles.push({ time, open, high, low, close, volume: Number.isFinite(volume) && volume >= 0 ? volume : 0 });
  }
  candles.sort((a, b) => a.time - b.time);
  const unique = candles.filter((candle, index) => index === 0 || candle.time > candles[index - 1].time);
  if (!unique.length) throw new Error('No valid candles found. Expected time/date and OHLC columns.');
  return { candles: unique, invalidRows: invalid, duplicateRows: candles.length - unique.length, parserWarnings: errors.length, timestampsAreUtc };
}

const parseOptions = {
  header: true,
  skipEmptyLines: 'greedy',
  dynamicTyping: false,
};

export function parseMarketCsvText(text) {
  return normalizeMarketRows(Papa.parse(text, parseOptions));
}

export function parseMarketCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      ...parseOptions,
      worker: true,
      complete: (results) => {
        try { resolve(normalizeMarketRows(results)); }
        catch (error) { reject(error); }
      },
      error: reject,
    });
  });
}
