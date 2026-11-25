import Papa from 'papaparse';

const aliases = {
  time: ['time', 'timestamp', 'datetime', 'date time', 'gmt time', 'utc time', 'local time'],
  date: ['date', 'day', 'trading date'],
  clock: ['clock', 'hour', 'time of day', 'time'],
  open: ['open', 'o', 'open price', 'bid open', 'ask open', 'open bid', 'open ask'],
  high: ['high', 'h', 'high price', 'bid high', 'ask high', 'high bid', 'high ask'],
  low: ['low', 'l', 'low price', 'bid low', 'ask low', 'low bid', 'low ask'],
  close: ['close', 'c', 'last', 'close price', 'bid close', 'ask close', 'close bid', 'close ask'],
  volume: ['volume', 'vol', 'tick volume', 'real volume', 'tickvol'],
};

const cleanHeader = value => String(value ?? '')
  .replace(/^\uFEFF/, '').trim().toLowerCase()
  .replace(/[<>()[\]{}]/g, ' ')
  .replace(/[._\/-]+/g, ' ').replace(/\s+/g, ' ').trim();

function normalizeNumber(value, decimalComma) {
  if (typeof value === 'number') return value;
  let raw = String(value ?? '').trim().replace(/[\s'’]/g, '');
  if (!raw) return NaN;
  if (decimalComma) {
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
    raw = raw.replace(/,/g, '');
  }
  return Number(raw);
}

function normalizeClockTime(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?$/);
  if (!match) return raw;
  return `${match[1].padStart(2, '0')}:${match[2]}${match[3] == null ? '' : `:${match[3]}${match[4] || ''}`}`;
}

function parseDateTimeText(rawText) {
  const raw = String(rawText ?? '').trim();
  if (!raw) return null;
  const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  let normalized = raw;
  const ymd = normalized.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})(.*)$/);
  const dmy = normalized.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(.*)$/);
  if (ymd) normalized = `${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}${ymd[4]}`;
  else if (dmy) normalized = `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}${dmy[4]}`;
  normalized = normalized.replace(/^(\d{4})(\d{2})(\d{2})(?=T|\s|$)/, '$1-$2-$3');
  if (normalized.includes(' ') && !normalized.includes('T')) normalized = normalized.replace(/\s+/, 'T');
  const parsed = Date.parse(explicitZone ? normalized : `${normalized}Z`);
  return Number.isFinite(parsed) ? { time: Math.floor(parsed / 1000), isUtc: explicitZone } : null;
}

function parseTimestamp(row, keys) {
  const pick = candidates => {
    for (const key of candidates) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return undefined;
  };
  const raw = pick(keys.time);
  if (raw !== undefined) {
    const text = String(raw).trim();
    if (/^\d{13}$/.test(text)) return { time: Math.floor(Number(text) / 1000), isUtc: true };
    if (/^\d{10}$/.test(text)) return { time: Number(text), isUtc: true };
    if (/^\d{8}$/.test(text)) {
      const parsed = parseDateTimeText(`${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}`);
      if (parsed) return parsed;
    }
    if (!/^\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
      const parsed = parseDateTimeText(text);
      if (parsed) return parsed;
    }
  }
  const date = pick(keys.date);
  const clock = pick(keys.clock);
  if (date === undefined || clock === undefined) return null;
  let d = String(date).trim();
  if (/^\d{8}$/.test(d)) d = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
  else {
    const yearFirst = d.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    const dayFirst = d.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (yearFirst) d = `${yearFirst[1]}-${yearFirst[2].padStart(2,'0')}-${yearFirst[3].padStart(2,'0')}`;
    else if (dayFirst) d = `${dayFirst[3]}-${dayFirst[2].padStart(2,'0')}-${dayFirst[1].padStart(2,'0')}`;
  }
  return parseDateTimeText(`${d}T${normalizeClockTime(clock)}`);
}

function scoreHeader(row) {
  const values = (row || []).map(cleanHeader);
  const has = candidates => candidates.some(candidate => values.some(value => value === candidate || value.startsWith(candidate + ' ') || value.endsWith(' ' + candidate)));
  let score = 0;
  if (has(aliases.time) || (has(aliases.date) && has(aliases.clock))) score += 2;
  for (const key of ['open', 'high', 'low', 'close']) if (has(aliases[key])) score += 1;
  return score;
}

function findHeaderInfo(sampleRows) {
  for (let index = 0; index < Math.min(sampleRows.length, 12); index++) {
    if (scoreHeader(sampleRows[index]) >= 5) {
      return { header: true, headerRowIndex: index, fields: sampleRows[index].map((v, i) => String(v ?? '').trim() || `column_${i + 1}`) };
    }
  }
  const first = sampleRows.find(row => row?.length >= 5 && row.some(value => String(value ?? '').trim() !== ''));
  if (!first) throw new Error('The CSV file is empty.');
  const firstValue = String(first[0] ?? '').trim();
  const hasSeparateDateTime = /^(\d{8}|\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})$/.test(firstValue)
    && /^\d{1,2}:\d{2}/.test(String(first[1] ?? '').trim());
  const fields = hasSeparateDateTime
    ? ['date', 'time', 'open', 'high', 'low', 'close', 'volume']
    : ['time', 'open', 'high', 'low', 'close', 'volume'];
  return { header: false, headerRowIndex: 0, fields, hasSeparateDateTime };
}

function makeKeys(fields) {
  const normalized = fields.map(field => cleanHeader(field));
  const result = {};
  for (const [name, candidates] of Object.entries(aliases)) {
    result[name] = [];
    for (const candidate of candidates) {
      const index = normalized.findIndex(value => value === candidate || value.startsWith(candidate + ' ') || value.endsWith(' ' + candidate));
      if (index >= 0 && !result[name].includes(fields[index])) result[name].push(fields[index]);
    }
  }
  return result;
}

function createRowNormalizer(fields, { headerless = false, decimalComma = false, delimiter = ',' } = {}) {
  if (!fields.length) throw new Error('The CSV has no readable columns.');
  const keys = makeKeys(fields);
  const candles = [];
  let invalidRows = 0, previousTime = -Infinity, isChronological = true, timestampsAreUtc = true;
  const addRows = rows => {
    for (const input of rows || []) {
      const row = Array.isArray(input)
        ? Object.fromEntries(fields.map((field, index) => [field, input[index]]))
        : input;
      const parsedTimestamp = parseTimestamp(row, keys);
      const time = parsedTimestamp?.time;
      if (parsedTimestamp && !parsedTimestamp.isUtc) timestampsAreUtc = false;
      const value = key => {
        const raw = keys[key].map(name => row?.[name]).find(v => v !== undefined && v !== null && String(v).trim() !== '');
        return normalizeNumber(raw, decimalComma);
      };
      const open = value('open'), high = value('high'), low = value('low'), close = value('close');
      const volumeRaw = keys.volume.map(name => row?.[name]).find(v => v !== undefined && v !== null && String(v).trim() !== '');
      const volume = volumeRaw == null ? 0 : normalizeNumber(volumeRaw, decimalComma);
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
  const finish = parserWarnings => {
    if (!candles.length) throw new Error(`No valid candles found. Detected columns: ${fields.join(', ')}. Expected a timestamp (or Date + Time) and Open, High, Low, Close. Supported delimiters include comma, semicolon, tab and pipe.`);
    if (!isChronological) candles.sort((a, b) => a.time - b.time);
    const unique = [];
    let duplicateRows = 0, lastTime = -Infinity;
    for (const candle of candles) {
      if (candle.time <= lastTime) { duplicateRows++; continue; }
      unique.push(candle); lastTime = candle.time;
    }
    return {
      candles: unique, invalidRows, duplicateRows, parserWarnings, timestampsAreUtc,
      fields: [...fields], delimiter, headerDetected: !headerless,
      detectedFormat: `${headerless ? 'Headerless OHLC' : 'Header-based'} · ${delimiter === '\t' ? 'Tab' : delimiter === ';' ? 'Semicolon' : delimiter === '|' ? 'Pipe' : 'Comma'} separated`,
    };
  };
  return { addRows, finish };
}

export function normalizeMarketRows(parsed) {
  const data = parsed?.data || [];
  const sample = data.slice(0, 12);
  const info = findHeaderInfo(sample);
  const rows = info.header ? data.slice(info.headerRowIndex + 1) : data;
  const normalizer = createRowNormalizer(info.fields, {
    headerless: !info.header,
    hasSeparateDateTime: info.hasSeparateDateTime,
    delimiter: parsed?.meta?.delimiter || ',',
    decimalComma: (parsed?.meta?.delimiter || ',') !== ',' && rows.some(row => Array.isArray(row) && row.some(value => typeof value === 'string' && /^-?\d+,\d+$/.test(value.trim()))),
  });
  normalizer.addRows(rows);
  return normalizer.finish(parsed?.errors?.length || 0);
}

async function inspectCsv(file) {
  const sample = await file.slice(0, Math.min(file.size || 256 * 1024, 256 * 1024)).text();
  const parsed = Papa.parse(sample, { skipEmptyLines: 'greedy', preview: 12 });
  const info = findHeaderInfo(parsed.data || []);
  const rows = info.header ? parsed.data.slice(info.headerRowIndex + 1) : parsed.data;
  const delimiter = parsed.meta?.delimiter || ',';
  const decimalComma = delimiter !== ',' && rows.some(row => Array.isArray(row) && row.some(value => typeof value === 'string' && /^-?\d+,\d+$/.test(value.trim())));
  return { ...info, delimiter, decimalComma };
}

export function parseMarketCsvText(text) {
  const sample = Papa.parse(String(text).slice(0, 256 * 1024), { skipEmptyLines: 'greedy', preview: 12 });
  const info = findHeaderInfo(sample.data || []);
  const delimiter = sample.meta?.delimiter || ',';
  const sampleRows = sample.data || [];
  const decimalComma = delimiter !== ',' && sampleRows.some(row => Array.isArray(row) && row.some(value => typeof value === 'string' && /^-?\\d+,\\d+$/.test(value.trim())));
  const full = Papa.parse(String(text), {
    delimiter,
    header: info.header,
    skipEmptyLines: 'greedy',
  });
  if (info.headerRowIndex > 0) full.data = full.data.slice(info.headerRowIndex);
  const normalizer = createRowNormalizer(info.fields, {
    headerless: !info.header,
    delimiter: full.meta?.delimiter || delimiter,
    decimalComma,
  });
  normalizer.addRows(full.data);
  return normalizer.finish(full.errors?.length || 0);
}

export function parseMarketCsv(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    let normalizer = null, parserWarnings = 0, settled = false, processedBytes = 0;
    const fileSize = Number(file?.size) || 0;
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    (async () => {
      try {
        onProgress({ loaded: 0, total: fileSize, percent: 0, stage: 'detecting' });
        const info = await inspectCsv(file);
        onProgress({ loaded: 0, total: fileSize, percent: 0, stage: 'parsing', detectedFormat: info });
        const beforeFirstChunk = chunk => {
          if (info.headerRowIndex <= 0) return chunk;
          return chunk.split(/\r\n|\n|\r/).slice(info.headerRowIndex).join('\n');
        };
        Papa.parse(file, {
          delimiter: info.delimiter,
          header: info.header,
          skipEmptyLines: 'greedy',
          dynamicTyping: false,
          worker: false,
          chunkSize: 1024 * 1024,
          beforeFirstChunk,
          chunk: results => {
            try {
              if (!normalizer) normalizer = createRowNormalizer(
                info.fields,
                { headerless: !info.header, hasSeparateDateTime: info.hasSeparateDateTime, decimalComma: info.decimalComma, delimiter: info.delimiter },
              );
              normalizer.addRows(results.data || []);
              parserWarnings += results.errors?.length || 0;
              const cursor = Number(results.meta?.cursor);
              processedBytes = cursor > processedBytes ? Math.min(fileSize, cursor) : Math.min(fileSize, processedBytes + 1024 * 1024);
              onProgress({ loaded: processedBytes, total: fileSize, percent: fileSize ? Math.min(99, Math.round(processedBytes / fileSize * 100)) : 0, stage: 'parsing' });
            } catch (error) { fail(error); }
          },
          complete: () => {
            if (settled) return;
            try {
              if (!normalizer) throw new Error('The CSV file is empty or has no readable data.');
              const result = normalizer.finish(parserWarnings);
              result.detectedFormat = `${info.header ? 'Header-based' : 'Headerless OHLC'} · ${info.delimiter === '\t' ? 'Tab' : info.delimiter === ';' ? 'Semicolon' : info.delimiter === '|' ? 'Pipe' : 'Comma'} separated`;
              onProgress({ loaded: fileSize, total: fileSize, percent: 100, stage: 'verified' });
              settled = true;
              resolve(result);
            } catch (error) { fail(error); }
          },
          error: fail,
        });
      } catch (error) { fail(error); }
    })();
  });
}
