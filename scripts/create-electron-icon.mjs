import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = join(root, 'public', 'omaxfx-logo.svg');
const output = join(root, 'build', 'icon.ico');

const svg = await readFile(source);
const png = await sharp(svg, { density: 384 })
  .resize(256, 256, { fit: 'contain' })
  .png()
  .toBuffer();

// ICO directory header followed by a 256x256 PNG payload.
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);       // reserved
header.writeUInt16LE(1, 2);       // image type: ICO
header.writeUInt16LE(1, 4);       // image count
header.writeUInt8(0, 6);          // width 256 (0 means 256)
header.writeUInt8(0, 7);          // height 256 (0 means 256)
header.writeUInt8(0, 8);          // palette
header.writeUInt8(0, 9);          // reserved
header.writeUInt16LE(1, 10);      // color planes
header.writeUInt16LE(32, 12);     // bits per pixel
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.concat([header, png]));
console.log('Generated Windows icon from public/omaxfx-logo.svg');
