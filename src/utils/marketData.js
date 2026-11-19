import Papa from 'papaparse';

const aliases = {
  time: ['time', 'timestamp', 'datetime', 'date time', 'date_time', 'gmt time', 'utc time'],
  date: ['date', 'day'],
  clock: ['clock', 'hour', 'time of day'],
  open: ['open', 'o', 'open price'],
  high: ['high', 'h', 'high price'],
  low: ['low', 'l', 'low price'],
  close: ['close', 'c', 'last', 'close price'],
  volume: ['volume', 'vol', 'tick volume', 'tick_volume'],
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
      if (numeric > 1e12) return Math.floor(numeric / 1000);
      if (numeric > 1e9) return Math.floor(numeric);
    }
    const parsed = Date.parse(String(raw).trim());
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  const date = pick(row, aliases.date);
  const clock = pick(row, aliases.clock);
  if (date === undefined || clock === undefined) return null;
  const d = String(date).trim();
  const t = String(clock).trim();
  let iso;
  if (/^\d{8}$/.test(d)) iso = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t}`;
  else iso = `${d}T${t}`;
  const parsed = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

export function parseMarketCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      worker: true,
      transformHeader: (header) => cleanHeader(header),
      complete: ({ data, errors, meta }) => {
        try {
          if (!meta.fields?.length) throw new Error('The CSV has no readable header row.');
          const candles = [];
          let invalid = 0;
          for (const row of data) {
            const time = parseTimestamp(row);
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
          resolve({ candles: unique, invalidRows: invalid, duplicateRows: candles.length - unique.length, parserWarnings: errors.length });
        } catch (error) { reject(error); }
      },
      error: reject,
    });
  });
}
