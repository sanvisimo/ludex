// Fotografa le bozze: per ogni HTML nella cartella sopra, il PNG accanto, a
// densità 2. Senza argomenti le rifà tutte; con dei nomi solo quelle
// (`node png.cjs 12-nomi-e-accento`).
const { chromium } = require('playwright');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

const dir = join(__dirname, '..');
const wanted = process.argv.slice(2);
const pages = readdirSync(dir)
  .filter((f) => f.endsWith('.html'))
  .map((f) => f.slice(0, -5))
  .filter((n) => wanted.length === 0 || wanted.includes(n));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 2,
  });
  for (const name of pages) {
    await page.goto('file://' + join(dir, name + '.html'));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(dir, name + '.png'), fullPage: true });
    console.log(name + '.png');
  }
  await browser.close();
})();
