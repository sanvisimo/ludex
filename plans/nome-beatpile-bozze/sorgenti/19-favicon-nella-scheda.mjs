// Bozza 19: la favicon a 16 px in una barra di schede, accanto a quella di
// GitHub. Sotto, la lente: i pixel veri della favicon disegnata a 16 px, su uno
// schermo normale (16 pixel) e su uno ad alta densità (32 pixel), ingranditi
// senza sfumare.
//
// Il simbolo della bozza 18 e quello della 11 si prendono dai loro script; il
// segno di GitHub è `mark-github-16` di Primer Octicons (MIT); «Ludex oggi» è
// `apps/web/public/favicon.svg`. Serve Playwright, per fotografare i pixel.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const font = readFileSync(join(here, 'space-grotesk-latin-700-normal.woff2')).toString('base64');

// La funzione `sym` di un'altra bozza, senza eseguirne la scrittura.
const symFrom = (file, ...names) => {
  let src = readFileSync(join(here, file), 'utf8');
  src = src.slice(0, src.indexOf('const sizes = ['));
  src = src.replace(/^import .*$/gm, '').replace(/^const (here|font) = .*$/gm, '');
  return new Function('here', 'font', `${src}; return { ${names.join(', ')} };`)(here, font);
};
const b18 = symFrom('18-bordo-destro-1-5.mjs', 'sym').sym(1.5, 0.55, 'scura', 0.7);
const m11 = symFrom('11-lettere-centrate.mjs', 'sym', 'near');
const b11 = m11.sym(m11.near, true);
const ludex = readFileSync(join(here, '../../../apps/web/public/favicon.svg'), 'utf8');
const github = (fill) =>
  `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="${fill}" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>`;

const theme = {
  light: { strip: '#dfe1e5', tab: '#ffffff', fg: '#1f1f1f', muted: '#5f6368', page: '#fcfcfd', gh: '#1f2328' },
  dark: { strip: '#202124', tab: '#35363a', fg: '#e8eaed', muted: '#9aa0a6', page: '#111113', gh: '#f0f6fc' },
};
const icons = (t) => [
  ['Beatpile — bozza 18', 'Beatpile · Cosa gioco stasera', b18],
  ['GitHub', 'sanvisimo/ludex', github(theme[t].gh)],
  ['Beatpile — bozza 11', 'Beatpile · Cosa gioco stasera', b11],
  ['Ludex oggi', 'Ludex', ludex],
];

// 1. I pixel veri: ogni favicon in un quadrato di 16, fotografata a densità 1
//    e 2 sul fondo della scheda.
const css = `@font-face { font-family: SG; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 700; }
svg { width:100%; height:100%; display:block; overflow:visible; }`;
const browser = await chromium.launch();
const shots = {};
for (const dpr of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 200, height: 200 }, deviceScaleFactor: dpr });
  for (const t of ['light', 'dark']) {
    for (const [label, , svg] of icons(t)) {
      await page.setContent(`<!doctype html><style>${css} body{margin:0;background:${theme[t].tab}} #i{width:16px;height:16px;margin:8px}</style><div id="i">${svg}</div>`);
      await page.evaluate(() => document.fonts.ready);
      const png = await page.locator('#i').screenshot();
      shots[`${label}|${t}|${dpr}`] = 'data:image/png;base64,' + png.toString('base64');
    }
  }
  await page.close();
}
await browser.close();

// 2. La pagina: le schede come le disegna Chrome, e sotto la lente.
const strip = (t) => {
  const c = theme[t];
  return `<div class="strip" style="background:${c.strip}">${icons(t)
    .map(([, title, svg], i) => `<div class="tab" style="background:${i === 0 ? c.tab : 'transparent'};color:${i === 0 ? c.fg : c.muted}"><span class="fav">${svg}</span><span class="tt">${title}</span><span class="x">×</span></div>`)
    .join('')}</div>`;
};
const lens = (t) => `<div class="lens" style="background:${theme[t].tab};color:${theme[t].fg}">${icons(t)
  .map(([label]) => `<figure><div class="px"><img src="${shots[`${label}|${t}|1`]}" width="128" height="128" alt=""><img src="${shots[`${label}|${t}|2`]}" width="128" height="128" alt=""></div><figcaption>${label}</figcaption></figure>`)
  .join('')}</div>`;

writeFileSync(join(here, '..', '19-favicon-nella-scheda.html'), `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beatpile, la favicon nella scheda</title>
<style>
${css}
body { margin:0; padding:24px 16px 48px; background:#fcfcfd; color:#1c2024; font:15px/1.5 Inter, system-ui, sans-serif; }
main { max-width:1000px; margin:0 auto; }
h1 { font:700 26px SG, sans-serif; margin:0 0 4px; } h2 { font:700 19px SG, sans-serif; margin:30px 0 6px; } h3 { font-size:14px; font-weight:600; margin:18px 0 8px; }
p { margin:0 0 8px; color:#60646c; max-width:74ch; }
.strip { display:flex; gap:2px; padding:8px 8px 0; border-radius:10px 10px 0 0; overflow:hidden; }
.tab { display:flex; align-items:center; gap:8px; width:220px; min-width:0; height:34px; padding:0 10px; border-radius:8px 8px 0 0; font:12px/1 system-ui, sans-serif; }
.fav { width:16px; height:16px; flex:none; }
.tt { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .x { opacity:.6; }
.lens { display:flex; gap:20px; flex-wrap:wrap; padding:16px; border-radius:12px; }
figure { margin:0; } figcaption { font-size:12px; margin-top:6px; opacity:.8; }
.px { display:flex; gap:8px; } .px img { image-rendering:pixelated; border-radius:4px; }
@media (max-width:640px) { .tab { width:150px; } }
</style></head><body><main>
<h1>La favicon nella scheda, accanto a GitHub</h1>
<p>A grandezza vera, come le disegna Chrome: la scheda attiva è la prima. Nell'immagine questa pagina è fotografata a densità 2, cioè come la vede uno schermo ad alta densità (Mac, telefono); sotto, la lente fa vedere anche lo schermo normale.</p>
<p>«bp» qui è testo nel carattere della pagina. In una favicon vera, che è un file a parte, le lettere vanno convertite in tracciati.</p>
<h2>Le schede</h2>
<h3>Tema chiaro</h3>${strip('light')}
<h3>Tema scuro</h3>${strip('dark')}
<h2>La lente</h2>
<p>Per ognuna, a sinistra i 16 pixel di uno schermo normale, a destra i 32 di uno ad alta densità, ingranditi senza sfumare.</p>
<h3>Tema chiaro</h3>${lens('light')}
<h3>Tema scuro</h3>${lens('dark')}
</main></body></html>`);
