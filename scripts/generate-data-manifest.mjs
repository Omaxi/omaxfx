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
  const symbol = stem.replace(/[_-]\d{4}$/, '').replace(/[^a-z0-9._-]/gi, '').toUpperCase();
  files.push({ name, symbol, url: `data/${encodeURIComponent(name)}`, size: info.size });
}
await writeFile(output, JSON.stringify({ version: 1, timezone: 'UTC+3', files }, null, 2) + '\n');
console.log(`Generated data manifest with ${files.length} CSV file(s).`);
