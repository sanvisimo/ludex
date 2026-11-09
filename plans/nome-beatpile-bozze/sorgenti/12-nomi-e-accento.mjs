// Bozza 12: Beatpile e Pilepick col simbolo scelto, ciascuno con l'accento blu
// e con quello neutro, in un pezzo di interfaccia vera: barra, schede, voci.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const font = readFileSync(join(here, 'space-grotesk-latin-700-normal.woff2')).toString('base64');

let gid = 0;
const caseP = (x, y, w, h, fill, rot, inner = '') => {
  const cx = x + w / 2, cy = y + h / 2, t = 1.1, sp = w * 0.14, id = 'g' + gid++;
  const ix = x + sp, iy = y + t, iw = (w - sp - t).toFixed(2), ih = h - 2 * t;
  return `<g transform="rotate(${rot} ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="${fill}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="#fff" fill-opacity=".45"/>
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="0.8" fill="${fill}"/>
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="0.8" fill="url(#${id})"/>${inner}</g>`;
};
// Le lettere centrate sull'inchiostro (Space Grotesk 700, 11,4): «bp» ha
// l'asta della b sopra, «pp» no, quindi la linea di base cambia.
const letters = (txt) => `<text x="5.56" y="${txt === 'bp' ? 22.05 : 20.97}" font-family="SG" font-weight="700" font-size="11.4" letter-spacing="-0.6" fill="#fff">${txt}</text>`;
const sym = (txt) => `<svg viewBox="0 0 32 32" aria-hidden="true">
  ${caseP(14, 1, 15, 20.5, '#13a313', 8)}${caseP(9, 4, 16, 22, '#ee0a1f', 3)}${caseP(3, 7.2, 18, 24, '#0050e6', -3, letters(txt))}
</svg>`;

// Gli accenti, per tema. Il blu è la scala Radix `blue`; il neutro è slate.
const A = {
  blu: {
    light: { btn: '#0090ff', btnInk: '#1c2024', ink: '#0d74ce', soft: '#e6f4fe' },
    dark: { btn: '#0090ff', btnInk: '#1c2024', ink: '#70b8ff', soft: '#0d2847' },
  },
  neutro: {
    light: { btn: '#1c2024', btnInk: '#ffffff', ink: '#1c2024', soft: '#f0f0f3' },
    dark: { btn: '#edeef0', btnInk: '#1c2024', ink: '#edeef0', soft: '#272a2d' },
  },
};
const T = {
  light: { bg: '#fcfcfd', panel: '#ffffff', fg: '#1c2024', muted: '#60646c', line: '#e0e1e6' },
  dark: { bg: '#111113', panel: '#18191b', fg: '#edeef0', muted: '#b0b4ba', line: '#2b2d31' },
};
// La metà colorata del nome è il blu del marchio, in tutti e due i casi.
const wordInk = { light: '#0d74ce', dark: '#70b8ff' };
const word = (name, t) => name === 'beatpile'
  ? `<span class="name"><span style="color:${wordInk[t]}">beat</span>pile</span>`
  : `<span class="name">pile<span style="color:${wordInk[t]}">pick</span></span>`;

const games = [
  ['Hollow Knight', 'Metroidvania · 27 h', 'Stasera'],
  ['Outer Wilds', 'Esplorazione · 17 h', ''],
  ['Celeste', 'Platform · 8 h', ''],
];
const cover = ['#3e63dd', '#e54666', '#ffb224'];
const mock = (name, acc, t) => {
  const a = A[acc][t], c = T[t];
  return `<div class="mock" style="background:${c.bg};color:${c.fg};border-color:${c.line}">
  <div class="top" style="border-color:${c.line}">
    <div class="sym">${sym(name === 'beatpile' ? 'bp' : 'pp')}</div>${word(name, t)}
    <nav><span style="color:${a.ink};box-shadow:inset 0 -2px ${a.ink}">Backlog</span><span style="color:${c.muted}">Ricerca</span><span style="color:${c.muted}">Playlist</span></nav>
  </div>
  <div class="body">
    <div class="head"><strong>Cosa gioco stasera?</strong><span class="btn" style="background:${a.btn};color:${a.btnInk}">Scegli per me</span></div>
    ${games.map(([g, d, b], i) => `<div class="row" style="background:${c.panel};border-color:${c.line}"><span class="cv" style="background:${cover[i]}"></span><span class="tx"><strong>${g}</strong><small style="color:${c.muted}">${d}</small></span>${b ? `<span class="badge" style="background:${a.soft};color:${a.ink}">${b}</span>` : ''}<span class="link" style="color:${a.ink}">Gioca</span></div>`).join('')}
  </div></div>`;
};
const variants = [
  ['Beatpile, accento blu', 'beatpile', 'blu'],
  ['Beatpile, accento neutro', 'beatpile', 'neutro'],
  ['Pilepick, accento blu', 'pilepick', 'blu'],
  ['Pilepick, accento neutro', 'pilepick', 'neutro'],
];
writeFileSync(join(here, '..', '12-nomi-e-accento.html'), `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beatpile o Pilepick, blu o neutro</title>
<style>
@font-face { font-family: SG; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 700; }
body { margin:0; padding:24px 16px 48px; background:#fcfcfd; color:#1c2024; font:15px/1.5 Inter, system-ui, sans-serif; }
main { max-width:1000px; margin:0 auto; }
h1 { font:700 26px SG, sans-serif; margin:0 0 4px; } h3 { font-size:15px; font-weight:600; margin:28px 0 8px; }
p { margin:0 0 8px; color:#60646c; max-width:74ch; }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
@media (max-width:760px) { .pair { grid-template-columns:1fr; } }
.mock { border:1px solid; border-radius:12px; overflow:hidden; font-size:14px; }
.top { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid; }
.sym { width:24px; height:24px; } svg { width:100%; height:100%; display:block; overflow:visible; }
.name { font:700 18px/24px SG, sans-serif; }
nav { margin-left:auto; display:flex; gap:12px; font-size:13px; font-weight:600; } nav span { padding:4px 0; }
.body { padding:14px; display:flex; flex-direction:column; gap:8px; }
.head { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
.btn { font-size:13px; font-weight:600; padding:6px 12px; border-radius:6px; }
.row { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid; border-radius:8px; }
.cv { width:28px; height:38px; border-radius:3px; flex:none; }
.tx { display:flex; flex-direction:column; line-height:1.3; flex:1; min-width:0; } .tx small { font-size:12px; }
.badge { font-size:12px; font-weight:600; padding:2px 8px; border-radius:99px; }
.link { font-size:13px; font-weight:600; }
@media (max-width:520px) { nav span:not(:first-child) { display:none; } }
</style></head><body><main>
<h1>Beatpile o Pilepick, accento blu o neutro</h1>
<p>Il simbolo scelto (bozza 11) con i due nomi, ciascuno con i due accenti, in un pezzo di interfaccia: la barra, il pulsante principale, la voce di menu attiva, un'etichetta e un link. Nel nome in testo la parte colorata è il verbo, nel blu del marchio, con tutti e due gli accenti. Le copertine dei giochi sono rettangoli di colore, solo per vedere l'accento accanto a delle immagini.</p>
<p>Blu: pulsante <code>blue 9</code> con testo scuro (5,0); voce attiva, etichetta e link in <code>blue 11</code>. Neutro: pulsante nero sul chiaro e chiaro sullo scuro; il resto nel colore del testo.</p>
${variants.map(([l, n, a]) => `<h3>${l}</h3><div class="pair">${mock(n, a, 'light')}${mock(n, a, 'dark')}</div>`).join('')}
</main></body></html>`);
