/** node >=24. Rigenera i file distribuiti dai medesimi tracciati dell'UI.
 * Chromium è quello di Playwright, oppure --chromium=/percorso/al/browser.
 */
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { generateEmailBrand } from './generate-email-brand.mjs';
import {
  brandColors,
  faviconShapes,
  iconShapes,
  wordmarkShapes,
} from '../src/brand-artwork.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dir = resolve(root, 'docs/brand/pilecue');
await mkdir(dir, { recursive: true });
const svg = (shapes, box, ink = brandColors.white) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box}">${shapes.map((s) => `<path d="${s.d}" fill="${s.fill === 'ink' ? ink : s.fill}" fill-rule="evenodd"${s.transform ? ` transform="${s.transform}"` : ''}/>`).join('')}</svg>`;
const icon = svg(iconShapes, '176 176');
const favicon = svg(faviconShapes, '16 16');
const dark = svg(wordmarkShapes, '804 172');
const light = svg(wordmarkShapes, '804 172', brandColors.navy);
await Promise.all([
  writeFile(resolve(dir, 'wordmark-dark.svg'), dark),
  writeFile(resolve(dir, 'wordmark-light.svg'), light),
  writeFile(resolve(dir, 'icon.svg'), icon),
  writeFile(resolve(dir, 'favicon.svg'), favicon),
  writeFile(resolve(root, 'apps/web/public/favicon.svg'), favicon),
  writeFile(resolve(root, 'apps/web/public/pilecue-wordmark.svg'), dark),
  writeFile(resolve(root, 'apps/web/public/pilecue-icon.svg'), icon),
]);
const executablePath = process.argv
  .find((arg) => arg.startsWith('--chromium='))
  ?.slice('--chromium='.length);
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
try {
  await generateEmailBrand(browser);
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { width: 1024, height: 1024 },
  });
  const png = async (source, size, opaque = false) => {
    await page.setContent(
      `<style>html,body{margin:0;background:${opaque ? brandColors.navy : 'transparent'}}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
    );
    return page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  };
  const entries = [];
  for (const size of [16, 32, 48, 192, 512]) {
    const data = await png(size === 16 ? favicon : icon, size, size >= 192);
    await writeFile(resolve(dir, `icon-${size}.png`), data);
    if (size <= 48) entries.push({ size, data });
  }
  // ICO: un contenitore con tre immagini PNG, 16/32/48, supportato dai browser.
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, data }, i) => {
    const at = 6 + i * 16;
    header[at] = size;
    header[at + 1] = size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  await writeFile(
    resolve(root, 'apps/web/public/favicon.ico'),
    Buffer.concat([header, ...entries.map((e) => e.data)]),
  );
  await writeFile(
    resolve(root, 'apps/web/public/apple-touch-icon.png'),
    await png(icon, 180, true),
  );
  const mobile = await png(icon, 1024, true);
  await writeFile(resolve(root, 'apps/mobile/assets/icon.png'), mobile);
  await writeFile(resolve(root, 'apps/mobile/assets/splash-icon.png'), mobile);
  console.log(
    `Asset PileCue rigenerati in ${dir}, apps/web/public e apps/mobile/assets`,
  );
} finally {
  await browser.close();
}
