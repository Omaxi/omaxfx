import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import Papa from 'papaparse';

const dataDir = join(process.cwd(), 'public', 'data');
const monthlyDir = join(process.cwd(), 'public', 'data-monthly');
const output = join(process.cwd(), 'public', 'data-manifest.json');

function monthFromRow(row) {
  const normalized = Object.entries(row || {}).map(([key, value]) => [String(key).trim().toLowerCase(), String(value ?? '').trim()]);
  const dateEntry = normalized.find(([key]) => ['date', 'day', 'datetime', 'timestamp', 'time'].includes(key) || key.includes('date'));
  if (!dateEntry) return null;
  const raw = dateEntry[1];
  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.]\d{1,2}/);
  if (!match) match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) {
    const european = raw.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})/);
    if (european) return { year: Number(european[3]), month: String(Number(european[2])).padStart(2, '0') };
  }
  if (match) return { year: Number(match[1]), month: String(Number(match[2])).padStart(2, '0') };
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) {
    const date = new Date(parsed);
    return { year: date.getUTCFullYear(), month: String(date.getUTCMonth() + 1).padStart(2, '0') };
  }
  return null;
}

await rm(monthlyDir, { recursive: true, force: true });
await mkdir(monthlyDir, { recursive: true });
let names = [];
try { names = await readdir(dataDir); } catch { names = []; }
const files = [];
for (const name of names.filter((entry) => entry.toLowerCase().endsWith('.csv')).sort()) {
  const path = join(dataDir, name);
  const contents = await readFile(path);
  const stem = basename(name, '.csv');
  const yearMatch = stem.match(/[_-](\d{4})$/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const symbol = stem.replace(/[_-]\d{4}$/, '').replace(/[^a-z0-9._-]/gi, '').toUpperCase();
  const version = createHash('sha256').update(contents).digest('hex').slice(0, 16);
  const monthlyFiles = new Map();
  const parser = Papa.parse(Papa.NODE_STREAM_INPUT, { header: true, skipEmptyLines: 'greedy' });
  createReadStream(path).pipe(parser);
  for await (const row of parser) {
    const date = monthFromRow(row);
    if (!date || (year && date.year !== year)) continue;
    let entry = monthlyFiles.get(date.month);
    if (!entry) {
      const monthName = symbol + '_' + date.year + '-' + date.month + '.csv';
      const monthPath = join(monthlyDir, monthName);
      entry = { name: monthName, symbol, year: date.year, month: date.month, path: monthPath, stream: createWriteStream(monthPath), count: 0 };
      monthlyFiles.set(date.month, entry);
    }
    entry.stream.write(Papa.unparse([row], { header: entry.count === 0 }) + '\n');
    entry.count++;
  }
  const monthEntries = [];
  for (const entry of monthlyFiles.values()) {
    entry.stream.end();
    await finished(entry.stream);
    if (!entry.count) continue;
    const bytes = await readFile(entry.path);
    const monthVersion = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    monthEntries.push({
      name: entry.name, symbol, year: entry.year, month: entry.month,
      version: monthVersion, size: bytes.byteLength,
      url: 'data-monthly/' + encodeURIComponent(entry.name) + '?v=' + monthVersion,
    });
  }
  files.push({
    name, symbol, year, version, url: 'data/' + encodeURIComponent(name) + '?v=' + version,
    size: contents.byteLength, monthlyFiles: monthEntries,
  });
}
await writeFile(output, JSON.stringify({ version: 3, timezone: 'UTC+3', files }, null, 2) + '\n');
console.log('Generated data manifest with ' + files.length + ' CSV file(s) and ' + files.reduce((n, f) => n + f.monthlyFiles.length, 0) + ' monthly dataset(s).');
