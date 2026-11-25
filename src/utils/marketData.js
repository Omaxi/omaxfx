import Papa from 'papaparse';

const HEADER_ALIASES = {
  datetime: ['datetime', 'date time', 'date and time', 'date/time', 'timestamp', 'time stamp', 'unix time', 'epoch', 'gmt time', 'utc time', 'server time', 'open time'],
  date: ['date', 'day', 'trading date', 'gmt date', 'utc date', 'server date', 'local date'],
  clock: ['time', 'clock', 'hour', 'time of day'],
  open: ['open', 'o', 'open price', 'opening price', 'bid open', 'ask open', 'bidopen', 'askopen'],
  high: ['high', 'h', 'high price', 'maximum', 'bid high', 'ask high', 'bidhigh', 'askhigh'],
  low: ['low', 'l', 'low price', 'minimum', 'bid low', 'ask low', 'bidlow', 'asklow'],
  close: ['close', 'c', 'last', 'close price', 'closing price', 'bid close', 'ask close', 'bidclose', 'askclose'],
  volume: ['volume', 'vol', 'tick volume', 'tickvol', 'tick volume', 'real volume', 'quantity'],
};

const cleanHeader = (value) => String(value ?? '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/[\u00A0_./\\-]+/g, ' ')
  .replace(/[()[\]{}]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function headerScore(header, field) {
  const normalized = cleanHeader(header);
  const aliases = HEADER_ALIASES[field] || [];
  if (aliases.includes(normalized)) return 100;
  const stripped = normalized
    .replace(/^(bid|ask|last|mid|price)\s+/, '')
    .replace(/\s+(bid|ask|price|value|rate)$/, '')
    .replace(/\s+(ohlc)$/, '');
  if (aliases.includes(stripped)) return 90;
  const compact = normalized.replace(/\s+/g, '');
  const compactAliases = aliases.map((item) => item.replace(/\s+/g, ''));
  if (compactAliases.includes(compact)) return 85;
  if (field === 'open' || field === 'high' || field === 'low' || field === 'close') {
    const token = field;
    if (new RegExp('(^|\\s)' + token + '(\\s|$)').test(normalized) &&
        !/(time|date|spread|change|percent|percentage)/.test(normalized)) return 50;
  }
  if (field === 'date' && /(^|\\s)(date|day)(\\s|$)/.test(normalized)) return 70;
  if (field === 'clock' && /(^|\\s)(time|clock|hour)(\\s|$)/.test(normalized)) return 70;
  if (field === 'datetime' && /(date.*time|time.*date|timestamp)/.test(normalized)) return 80;
  return 0;
}

function resolveColumns(fields) {
  const result = {};
  for (const field of Object.keys(HEADER_ALIASES)) {
    const ranked = fields.map((name, index) => ({ name, index, score: headerScore(name, field) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    result[field] = ranked.length ? ranked[0].name : null;
  }
  // A single "time" column can contain either a full timestamp or a clock.
  if (!result.datetime && result.clock && !result.date) result.datetime = result.clock;
  return result;
}

function parseNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let text = String(value ?? '').trim().replace(/[\s\u00A0']/g, '');
  if (!text) return NaN;
  if (text.includes(',') && text.includes('.')) {
    const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    text = decimal === ',' ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    const parts = text.split(',');
    text = parts.length === 2 && parts[1].length !== 3 ? parts[0] + '.' + parts[1] : text.replace(/,/g, '');
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

function validUtcParts(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  if (![year, month, day, hour, minute, second, ms].every(Number.isFinite)) return NaN;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return NaN;
  const value = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const date = new Date(value);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return NaN;
  return Math.floor(value / 1000);
}

function parseDateParts(value) {
  const raw = String(value ?? '').trim();
  let match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  match = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) {
    const first = Number(match[1]), second = Number(match[2]);
    // Trading-platform exports most often use day-first dates. If one side is
    // greater than 12, the ordering is unambiguous; otherwise use DD/MM/YYYY.
    const dayFirst = first > 12 || second <= 12;
    return dayFirst
      ? { year: Number(match[3]), month: second, day: first }
      : { year: Number(match[3]), month: first, day: second };
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) {
    const date = new Date(parsed);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }
  return null;
}

function parseClockParts(value) {
  let raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  const ampm = raw.match(/\s*(AM|PM)$/);
  const suffix = ampm?.[1];
  if (suffix) raw = raw.replace(/\s*(AM|PM)$/, '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const ms = match[4] ? Number(('0.' + match[4])) * 1000 : 0;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === 'AM' && hour === 12) hour = 0;
    if (suffix === 'PM' && hour !== 12) hour += 12;
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second, ms: Math.floor(ms) };
}

function normalizeDateTime(raw) {
  let text = String(raw ?? '').trim();
  if (!text) return null;
  // Normalize compact and dotted broker timestamps before parsing.
  text = text.replace(/^(\d{4})(\d{2})(\d{2})(?=\s|T)/, '$1-$2-$3');
  text = text.replace(/^(\d{4})[./](\d{1,2})[./](\d{1,2})(.*)$/, (_, y, m, d, tail) =>
    y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') + tail);
  text = text.replace(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(.*)$/, (_, a, b, y, tail) => {
    const first = Number(a), second = Number(b);
    const dayFirst = first > 12 || second <= 12;
    const month = dayFirst ? second : first;
    const day = dayFirst ? first : second;
    return y + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0') + tail;
  });
  if (text.includes(' ') && !text.includes('T')) text = text.replace(/\s+/, 'T');
  return text;
}

function parseTimestamp(row, columns) {
  const rawDateTime = columns.datetime ? row?.[columns.datetime] : undefined;
  if (rawDateTime !== undefined && rawDateTime !== null && String(rawDateTime).trim() !== '') {
    const raw = String(rawDateTime).trim();
    const clockOnly = /^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*(AM|PM))?$/i.test(raw);
    if (!clockOnly) {
      const compactDateTime = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
      if (compactDateTime) {
        const time = validUtcParts(Number(compactDateTime[1]), Number(compactDateTime[2]), Number(compactDateTime[3]), Number(compactDateTime[4]), Number(compactDateTime[5]), Number(compactDateTime[6]));
        if (Number.isFinite(time)) return { time, isUtc: false };
      }
      const compactDate = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (compactDate) {
        const time = validUtcParts(Number(compactDate[1]), Number(compactDate[2]), Number(compactDate[3]));
        if (Number.isFinite(time)) return { time, isUtc: false };
      }
      const numeric = Number(raw);
      if (/^\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(numeric)) {
        if (numeric >= 1e12) return { time: Math.floor(numeric / 1000), isUtc: true };
        if (numeric >= 1e9) return { time: Math.floor(numeric), isUtc: true };
        // Excel serial date (days since 1899-12-30).
        if (numeric >= 20000 && numeric <= 100000) {
          const ms = Date.UTC(1899, 11, 30) + numeric * 86400000;
          return { time: Math.floor(ms / 1000), isUtc: false };
        }
      }
      const normalized = normalizeDateTime(raw);
      const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
      const parsed = Date.parse(explicitZone ? normalized : normalized + 'Z');
      if (Number.isFinite(parsed)) return { time: Math.floor(parsed / 1000), isUtc: explicitZone };
    }
  }

  const dateValue = columns.date ? row?.[columns.date] : undefined;
  const clockValue = columns.clock ? row?.[columns.clock] : undefined;
  if (dateValue === undefined || clockValue === undefined) return null;
  const date = parseDateParts(dateValue);
  const clock = parseClockParts(clockValue);
  if (!date || !clock) return null;
  const time = validUtcParts(date.year, date.month, date.day, clock.hour, clock.minute, clock.second, clock.ms);
  if (!Number.isFinite(time)) return null;
  const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(clockValue).trim());
  return { time, isUtc: explicitZone };
}

function createRowNormalizer(fields = []) {
  if (!fields.length) throw new Error('The CSV has no readable header row.');
  const columns = resolveColumns(fields);
  const missing = ['open', 'high', 'low', 'close'].filter((field) => !columns[field]);
  if (missing.length) {
    throw new Error('Could not identify required price columns (' + missing.join(', ') + '). Detected headers: ' + fields.join(', ') + '. Supported examples include Date, Time, Open, High, Low, Close; Timestamp, O, H, L, C; and broker Bid/Ask OHLC exports.');
  }
  if (!columns.datetime && !(columns.date && columns.clock)) {
    throw new Error('Could not identify a date/time column. Detected headers: ' + fields.join(', ') + '. Use a timestamp column or separate Date and Time columns.');
  }

  const candles = [];
  let invalidRows = 0;
  let timestampsAreUtc = true;
  let previousTime = -Infinity;
  let isChronological = true;

  const addRows = (rows) => {
    for (const row of rows) {
      const parsedTimestamp = parseTimestamp(row, columns);
      const time = parsedTimestamp?.time;
      if (parsedTimestamp && !parsedTimestamp.isUtc) timestampsAreUtc = false;
      const open = parseNumeric(row?.[columns.open]);
      const high = parseNumeric(row?.[columns.high]);
      const low = parseNumeric(row?.[columns.low]);
      const close = parseNumeric(row?.[columns.close]);
      const volume = columns.volume ? parseNumeric(row?.[columns.volume]) : 0;
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
    if (!candles.length) {
      throw new Error('No valid candles were found. The file was read, but its dates or OHLC values could not be interpreted. Check the detected headers and date format.');
    }
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
    if (unique.length < 2) {
      throw new Error('Only ' + unique.length + ' unique candle was found. At least two different timestamps are required for replay.');
    }
    return {
      candles: unique,
      invalidRows,
      duplicateRows,
      parserWarnings,
      timestampsAreUtc,
      fields: [...fields],
      detectedColumns: { ...columns },
      totalRows: candles.length + invalidRows,
    };
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
  const result = Papa.parse(text, { ...parseOptions, delimiter: '' });
  return normalizeMarketRows(result);
}

export function inferSymbolFromFilename(filename = '') {
  const base = String(filename).split(/[\\/]/).pop().replace(/\.[^.]+$/, '').toUpperCase();
  const known = base.match(/(?:^|[^A-Z0-9])(XAUUSD|XAGUSD|EURUSD|GBPUSD|USDJPY|USDCHF|USDCAD|AUDUSD|NZDUSD|BTCUSD|ETHUSD|NAS100|US30|SPX500|GER40|UK100|JP225)(?:$|[^A-Z0-9])/);
  if (known) return known[1];
  const index = base.match(/(?:^|[^A-Z0-9])(NAS100|US30|SPX500|GER40|UK100|JP225|DAX40|USOIL|UKOIL|WTI|BRENT)(?:$|[^A-Z0-9])/);
  if (index) return index[1];
  const pair = base.match(/(?:^|[^A-Z0-9])([A-Z]{6})(?:$|[^A-Z0-9])/);
  return pair ? pair[1] : '';
}

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
      onProgress({ loaded: 0, total: fileSize, percent: 0, stage: 'parsing' });
      Papa.parse(file, {
        ...parseOptions,
        delimiter: '',
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
            onProgress({ loaded: fileSize, total: fileSize, percent: 100, stage: 'complete' });
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
