import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const dataDir = join(process.cwd(), 'public', 'data');
const output = join(process.cwd(), 'public', 'data-manifest.json');
let names = [];
try { names = await readdir(dataDir); } catch { names = []; }
const files = [];
for (const name of names.filter((entry) => entry.toLowerCase().endsWith('.csv')).sort()) {
  const info = await stat(join(dataDir, name));
  const stem = basename(name, '.csv');
  const yearMatch = stem.match(/[_-](\d{4})$/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const symbol = stem.replace(/[_-]\d{4}$/, '').replace(/[^a-z0-9._-]/gi, '').toUpperCase();
  const version = Math.trunc(info.mtimeMs);
  files.push({ name, symbol, year, version, url: `data/${encodeURIComponent(name)}?v=${version}`, size: info.size });
}
await writeFile(output, JSON.stringify({ version: 1, timezone: 'UTC+3', files }, null, 2) + '\n');
console.log(`Generated data manifest with ${files.length} CSV file(s).`);
