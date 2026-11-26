import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const source = 'public/tradepast-logo.svg';
const outputDir = 'build';
await mkdir(outputDir, { recursive: true });

const png = await sharp(source)
  .resize(256, 256, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

await writeFile(`${outputDir}/tradepast.png`, png);
await writeFile(`${outputDir}/tradepast.ico`, await pngToIco(png));
console.log('Generated TradePast PNG and Windows ICO icons from the official logo.');
