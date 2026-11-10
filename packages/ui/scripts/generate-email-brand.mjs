/** Esporta il marchio email senza portare Tamagui/React nel package auth. */
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { brandColors, wordmarkBox, wordmarkShapes } from '../src/brand-artwork.ts';
import { accents, base, defaultAccent } from '../src/palettes.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

export async function generateEmailBrand(browser) {
  const dir = resolve(root, 'packages/auth/assets');
  await mkdir(dir, { recursive: true });
  const colors = {
    page: base.light.step2,
    card: base.light.step1,
    surface: base.light.step3,
    border: base.light.step5,
    text: base.light.step12,
    muted: base.light.step11,
    accent: accents[defaultAccent].light.step9,
    onAccent: base.light.step2,
    header: base.light.step1,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wordmarkBox.width} ${wordmarkBox.height}">${wordmarkShapes.map((s) => `<path d="${s.d}" fill="${s.fill === 'ink' ? brandColors.navy : s.fill}" fill-rule="evenodd"${s.transform ? ` transform="${s.transform}"` : ''}/>`).join('')}</svg>`;
  const page = await browser.newPage({
    viewport: { width: wordmarkBox.width, height: wordmarkBox.height },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(`<style>html,body{margin:0;background:${colors.header}}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path: resolve(dir, 'pilecue-wordmark.png') });
    await writeFile(
      resolve(root, 'packages/auth/src/email-brand.ts'),
      `// Generato da @repo/ui brand:email. Modificare tracciati e palette alla sorgente.\nexport const emailColors = ${JSON.stringify(colors, null, 2)} as const;\n\nexport const emailLogo = { width: 201, height: 43 } as const;\n`,
    );
  } finally {
    await page.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const executablePath = process.argv.find((arg) => arg.startsWith('--chromium='))?.slice('--chromium='.length);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try { await generateEmailBrand(browser); } finally { await browser.close(); }
  console.log('Marchio PNG e palette email rigenerati in packages/auth.');
}
