import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const dataDir = join(process.cwd(), 'public', 'data');
const output = join(process.cwd(), 'public', 'data-manifest.json');
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
  // Content fingerprints change only when the actual CSV bytes change. File
  // mtimes are unreliable across ZIP extraction, deploys and copied datasets.
  const version = createHash('sha256').update(contents).digest('hex').slice(0, 16);
  files.push({ name, symbol, year, version, url: `data/${encodeURIComponent(name)}?v=${version}`, size: contents.byteLength });
}
await writeFile(output, JSON.stringify({ version: 2, timezone: 'UTC+3', files }, null, 2) + '\n');
console.log(`Generated data manifest with ${files.length} CSV file(s).`);
