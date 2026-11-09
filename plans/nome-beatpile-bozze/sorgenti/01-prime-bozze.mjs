// Genera le bozze del simbolo e del nome di Beatpile in un HTML solo.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const font = readFileSync(
  'space-grotesk-latin-700-normal.woff2',
).toString('base64');

// Colori del fuoco (scale Radix: red, orange, amber, yellow) e la base slate.
const fire = {
  red: '#e5484d',
  redDark: '#ce2c31',
  orange: '#f76b15',
  amber: '#ffc53d',
  yellow: '#ffe629',
  slate: '#1c2024',
};
// Il logo di oggi (12, F2): copertine teal e tessera teal.
const teal = { back: '#1c6961', mid: '#008573', front: '#12a594' };

// ---------- i simboli, 32×32 ----------

const tile = (c) => `
  <rect x="13" y="1" width="17" height="19" rx="4" fill="${c.back}"/>
  <rect x="8" y="4" width="19" height="21" rx="5" fill="${c.mid}"/>
  <rect x="2" y="8" width="22" height="23" rx="5.5" fill="${c.front}"/>`;

const symB = (id) =>
  `<svg viewBox="0 0 32 32" aria-hidden="true">${tile(teal)}</svg>`;

const symBFire = () =>
  `<svg viewBox="0 0 32 32" aria-hidden="true">${tile({
    back: fire.redDark,
    mid: fire.orange,
    front: fire.amber,
  })}</svg>`;

// La pila in fiamme con «BP»: le fiamme dietro, due copertine, la tessera
// scura davanti con le lettere.
const flameOuter =
  'M3 31 C0.5 24 2 18 5.5 13.5 C5.8 16.5 7 18 8.2 18.6 C7.4 12.5 10 6.5 15 1.5 C14.6 6.5 16.4 9.6 18.6 10.6 C18.6 7.6 20 5.2 22.6 3.6 C22 8.6 24.8 11.6 27.6 14.4 C30.6 18 31.6 24.5 29.4 31 Z';
const flameMid =
  'M5.5 31 C4 26 5 21.5 7.8 18.4 C8.4 21 9.6 22 10.6 22.2 C10.2 17.4 12 13 15.6 9.4 C15.6 13 17.2 15.2 19.2 16 C19.4 13.6 20.6 12 22.4 11 C22.4 14.6 24.4 16.8 26.2 19 C28.4 22 28.8 26.4 27.4 31 Z';
const symBP = () => `<svg viewBox="0 0 32 32" aria-hidden="true">
  <path d="${flameOuter}" fill="${fire.red}"/>
  <path d="${flameMid}" fill="${fire.orange}"/>
  <rect x="11" y="12.5" width="17" height="18.5" rx="3.5" fill="${fire.amber}"/>
  <rect x="2.5" y="15.5" width="20.5" height="16" rx="4" fill="${fire.slate}"/>
  <text x="12.75" y="27.6" text-anchor="middle" font-family="SG" font-weight="700"
    font-size="10.5" letter-spacing="-0.6" fill="${fire.amber}">BP</text>
</svg>`;

// ---------- il nome ----------

// Numeri pseudo-casuali ripetibili, perché la pila esca uguale a ogni giro.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const GRID = {
  P: ['###', '#.#', '###', '#..', '#..'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  E: ['###', '#..', '##.', '#..', '###'],
};
const spines = [fire.red, fire.orange, fire.amber, '#12a594', '#3e63dd', '#8e4ec6'];

// «PILE» fatto di custodie sdraiate: ogni cella è un gioco visto di costa,
// con l'etichetta colorata sul dorso. Un po' storte, come una pila vera.
function pile(x0, capH) {
  const rowH = capH / 5;
  const caseH = rowH * 0.84;
  const cellW = rowH * 1.3;
  let out = '';
  let x = x0;
  for (const ch of 'PILE') {
    const g = GRID[ch];
    g.forEach((row, r) => {
      [...row].forEach((c, k) => {
        if (c !== '#') return;
        const jx = (rnd() - 0.5) * rowH * 0.3;
        const w = cellW * (0.92 + rnd() * 0.1);
        const cx = x + k * cellW + jx;
        const cy = r * rowH + (rowH - caseH) / 2;
        const spine = spines[Math.floor(rnd() * spines.length)];
        out += `<rect class="case" x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" width="${w.toFixed(2)}" height="${caseH.toFixed(2)}" rx="${(caseH * 0.22).toFixed(2)}"/>`;
        out += `<rect x="${(cx + w * 0.1).toFixed(2)}" y="${(cy + caseH * 0.3).toFixed(2)}" width="${(w * 0.3).toFixed(2)}" height="${(caseH * 0.4).toFixed(2)}" rx="${(caseH * 0.12).toFixed(2)}" fill="${spine}"/>`;
      });
    });
    x += cellW * 3 + rowH * 1.1;
  }
  return { svg: out, end: x - rowH * 1.1 };
}

// Le lingue di fuoco sopra «BEAT»: una fila di punte irregolari, dietro le
// lettere e col loro stesso sfumato.
function flames(x0, x1, base, maxH) {
  let d = `M${x0} ${base + 4}`;
  let x = x0;
  d += ` L${x0} ${base}`;
  while (x < x1) {
    const w = 10 + rnd() * 9;
    const h = maxH * (0.45 + rnd() * 0.55);
    const peakX = x + w * (0.55 + rnd() * 0.25);
    const nx = Math.min(x + w, x1);
    d += ` C${x + w * 0.1} ${base - h * 0.35} ${peakX - w * 0.35} ${base - h * 0.6} ${peakX} ${base - h}`;
    d += ` C${peakX - w * 0.05} ${base - h * 0.55} ${nx - w * 0.1} ${base - h * 0.25} ${nx} ${base - 2}`;
    x = nx;
  }
  d += ` L${x1} ${base + 4} Z`;
  return d;
}

let wmRatio = 1;
function wordmark(id) {
  seed = 11;
  const capH = 36; // altezza delle maiuscole, in unità del disegno
  const fs = capH / 0.7;
  const topPad = 26; // spazio per le fiamme
  const beatW = fs * 2.45; // larghezza stimata di «BEAT» in Space Grotesk 700
  const gap = 10;
  const p = pile(beatW + gap, capH);
  const W = p.end + 2;
  const H = topPad + capH + 4;
  wmRatio = W / H;
  return `<svg viewBox="0 -${topPad} ${W.toFixed(1)} ${H}" aria-label="Beatpile" role="img">
  <defs>
    <linearGradient id="g${id}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${fire.amber}"/>
      <stop offset="0.45" stop-color="${fire.orange}"/>
      <stop offset="1" stop-color="${fire.red}"/>
    </linearGradient>
    <linearGradient id="f${id}" x1="0" y1="1" x2="0" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${fire.orange}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${fire.red}"/>
    </linearGradient>
  </defs>
  <path d="${flames(2, beatW - 4, 8, topPad + 6)}" fill="url(#f${id})"/>
  <text x="0" y="${capH}" font-family="SG" font-weight="700" font-size="${fs.toFixed(1)}"
    letter-spacing="-1.5" fill="url(#g${id})" textLength="${beatW.toFixed(1)}" lengthAdjust="spacingAndGlyphs">BEAT</text>
  <g transform="translate(0 0)">${p.svg}</g>
</svg>`;
}

// Il nome semplice, per la barra: lo stesso carattere di oggi, «beat»
// nell'arancio. Serve dove il disegno non regge.
const plainWord = () =>
  `<span class="plain"><span class="beat">beat</span>pile</span>`;

const sizes = [128, 64, 32, 16];
const symbols = [
  ['B — la tessera senza lettera, teal di oggi', symB()],
  ['B — la stessa, nei colori del fuoco', symBFire()],
  ['La pila in fiamme con «BP»', symBP()],
];

const symbolRow = ([label, svg]) => `
<div class="sym">
  <h3>${label}</h3>
  <div class="pair">
    ${['light', 'dark']
      .map(
        (t) => `<div class="bg ${t}">${sizes
          .map((s) => `<div class="cell"><div style="width:${s}px;height:${s}px">${svg}</div><span>${s}</span></div>`)
          .join('')}</div>`,
      )
      .join('')}
  </div>
</div>`;

const bar = (sym, word) =>
  ['light', 'dark']
    .map(
      (t) =>
        `<div class="bar ${t}"><div style="width:24px;height:24px">${sym}</div>${word}<span class="nav">Backlog · Ricerca · Playlist</span></div>`,
    )
    .join('');

const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beatpile, bozze del logo</title>
<style>
@font-face { font-family: SG; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 700; }
:root { --bg:#fcfcfd; --fg:#1c2024; --muted:#60646c; --line:#e0e1e6; }
body { margin:0; padding:24px 16px 48px; background:var(--bg); color:var(--fg); font:15px/1.5 Inter, system-ui, sans-serif; }
main { max-width: 960px; margin: 0 auto; }
h1 { font: 700 26px SG, sans-serif; margin: 0 0 4px; }
h2 { font: 700 19px SG, sans-serif; margin: 36px 0 8px; }
h3 { font-size: 14px; font-weight: 600; margin: 18px 0 8px; }
p { margin: 0 0 8px; color: var(--muted); max-width: 70ch; }
.pair { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 700px) { .pair { grid-template-columns: 1fr; } }
.bg { border-radius: 12px; padding: 16px; display:flex; align-items:flex-end; gap: 20px; flex-wrap: wrap; border:1px solid var(--line); }
.light { background:#fcfcfd; color:#1c2024; --case:#1c2024; }
.dark { background:#111113; color:#edeef0; --case:#edeef0; border-color:#2b2d31; }
.cell { display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; opacity:.9; }
.cell svg, .bar svg { width:100%; height:100%; display:block; }
.case { fill: var(--case); }
.word { border-radius:12px; padding: 28px 20px; border:1px solid var(--line); }
.word svg { width:100%; max-width: 640px; height:auto; display:block; }
.small { display:flex; gap: 24px; align-items:center; flex-wrap: wrap; }
.small svg { width:100%; height:100%; }
.bar { display:flex; align-items:center; gap:8px; padding: 12px 16px; border-radius:10px; border:1px solid var(--line); margin-bottom: 8px; }
.plain { font: 700 18px/24px SG, sans-serif; }
.beat { color:#f76b15; }
.nav { margin-left:auto; font-size:13px; opacity:.6; }
@media (max-width: 520px) { .nav { display:none; } }
.sw { display:flex; gap:8px; flex-wrap:wrap; }
.sw div { width:96px; border-radius:8px; overflow:hidden; border:1px solid var(--line); font-size:12px; }
.sw b { display:block; height:44px; }
.sw span { display:block; padding:4px 6px; }
</style></head>
<body><main>
<h1>Beatpile, bozze del logo</h1>
<p>Bozze per scegliere la direzione, non disegni finiti: le forme si rifiniscono dopo. Il carattere è Space Grotesk, quello di oggi.</p>

<h2>Il simbolo</h2>
<p>A 128, 64, 32 e 16 pixel, su fondo chiaro e scuro. 16 è la favicon, 32 la barra su schermi densi.</p>
${symbols.map(symbolRow).join('')}

<h2>Il nome</h2>
<p>«BEAT» nel fuoco, «PILE» fatto di giochi impilati: ogni mattone è una custodia vista di costa, con l'etichetta sul dorso.</p>
<div class="pair">
  <div class="word light">${wordmark('a')}</div>
  <div class="word dark">${wordmark('b')}</div>
</div>
<h3>Lo stesso nome piccolo, all'altezza della barra (24 px) e a 40 px</h3>
<div class="pair">
  ${['light', 'dark']
    .map(
      (t, i) =>
        `<div class="bg ${t} small">${[24, 40].map((h) => { const w = wordmark(h + t); return `<div style="height:${h}px;width:${(h * wmRatio).toFixed(0)}px">${w}</div>`; }).join('')}</div>`,
    )
    .join('')}
</div>

<h2>Nella barra</h2>
<p>Il simbolo con «BP» e, accanto, il nome semplice: dove il disegno non regge serve una versione in solo testo.</p>
${bar(symBP(), plainWord())}
<p>Il simbolo B nei colori del fuoco, con lo stesso nome semplice.</p>
${bar(symBFire(), plainWord())}

<h2>I colori del fuoco</h2>
<p>Dalle scale Radix. Oggi l'accento è il teal (#12a594); spostarlo sull'arancio vuol dire rimisurare i contrasti di Button e Badge.</p>
<div class="sw">
  ${[
    ['red 9', fire.red],
    ['red 10', fire.redDark],
    ['orange 9', fire.orange],
    ['amber 9', fire.amber],
    ['yellow 9', fire.yellow],
    ['teal 9, oggi', '#12a594'],
  ]
    .map(([n, c]) => `<div><b style="background:${c}"></b><span>${n}<br>${c}</span></div>`)
    .join('')}
</div>
</main></body></html>`;

writeFileSync('../01-prime-bozze.html', html);
console.log('ok');
