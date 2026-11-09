import { readFileSync, writeFileSync } from 'node:fs';
const font = readFileSync('space-grotesk-latin-700-normal.woff2').toString('base64');
const slate = '#1c2024';
// Fuoco: ambra davanti, arancio, rosso. Console: blu davanti, rosso, verde
// (scale Radix, non i colori esatti dei marchi).
const P = {
  fuoco: { front: '#ffc53d', mid: '#f76b15', back: '#ce2c31', l1: '#a3171c', l2: slate, word: { light: '#f76b15', dark: '#f76b15' } },
  console: { front: '#0d74ce', mid: '#e5484d', back: '#30a46c', l1: '#ffffff', l2: '#ffffff', word: { light: '#008573', dark: '#0bd8b6' } },
};
const caseP = (x, y, w, h, fill, rot) => {
  const cx = x + w / 2, cy = y + h / 2, t = 1.1, sp = w * 0.14;
  return `<g transform="rotate(${rot} ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="${fill}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="#fff" fill-opacity=".45"/>
    <rect x="${x + sp}" y="${y + t}" width="${(w - sp - t).toFixed(2)}" height="${h - 2 * t}" rx="0.8" fill="${fill}"/></g>`;
};
const sym = (p, txt) => `<svg viewBox="0 0 32 32" aria-hidden="true">
  ${caseP(14, 1, 15, 20.5, p.back, 8)}${caseP(9, 4, 16, 22, p.mid, 3)}${caseP(3, 7.2, 18, 24, p.front, -3)}
  <g transform="rotate(-3 12.3 19.2)"><text x="13.47" y="23.8" text-anchor="middle" font-family="SG" font-weight="700" font-size="12.6" letter-spacing="-0.7"><tspan fill="${p.l1}">${txt[0]}</tspan><tspan fill="${p.l2}">${txt[1]}</tspan></text></g>
</svg>`;
// Nel nome in testo si colora il verbo: «beat» in beatpile, «pick» in pilepick.
const word = (name, p, t) => {
  const c = p.word[t];
  return name === 'beatpile'
    ? `<span class="plain"><span style="color:${c}">beat</span>pile</span>`
    : `<span class="plain">pile<span style="color:${c}">pick</span></span>`;
};
const variants = [
  ['Beatpile, colori del fuoco (la scelta di oggi)', 'beatpile', 'fuoco', 'bp'],
  ['Beatpile, colori delle console', 'beatpile', 'console', 'bp'],
  ['Pilepick, colori del fuoco', 'pilepick', 'fuoco', 'pp'],
  ['Pilepick, colori delle console', 'pilepick', 'console', 'pp'],
];
const sizes = [128, 64, 32, 16];
const row = ([l, name, pal, txt]) => {
  const p = P[pal], s = sym(p, txt);
  return `<h3>${l}</h3><div class="pair">${['light','dark'].map(t=>`<div class="bg ${t}">${sizes.map(z=>`<div class="cell"><div style="width:${z}px;height:${z}px">${s}</div><span>${z}</span></div>`).join('')}</div>`).join('')}</div>
<div class="pair">${['light','dark'].map(t=>`<div class="bar ${t}"><div style="width:24px;height:24px">${s}</div>${word(name, p, t)}<span class="nav">Backlog · Ricerca · Playlist</span><span class="btn ${pal}">Aggiungi</span></div>`).join('')}</div>`;
};
writeFileSync('../07-pilepick-e-colori-console.html', `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beatpile o Pilepick</title>
<style>
@font-face { font-family: SG; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 700; }
body { margin:0; padding:24px 16px 48px; background:#fcfcfd; color:#1c2024; font:15px/1.5 Inter, system-ui, sans-serif; }
main { max-width:960px; margin:0 auto; }
h1 { font:700 26px SG, sans-serif; margin:0 0 4px; } h3 { font-size:14px; font-weight:600; margin:28px 0 8px; }
p { margin:0 0 8px; color:#60646c; max-width:72ch; }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:8px; }
@media (max-width:700px) { .pair { grid-template-columns:1fr; } }
.bg { border-radius:12px; padding:16px; display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap; border:1px solid #e0e1e6; }
.light { background:#fcfcfd; color:#1c2024; } .dark { background:#111113; color:#edeef0; border-color:#2b2d31; }
.cell { display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; }
svg { width:100%; height:100%; display:block; overflow:visible; }
.bar { display:flex; align-items:center; gap:8px; padding:12px 16px; border-radius:10px; border:1px solid #e0e1e6; }
.plain { font:700 18px/24px SG, sans-serif; } .nav { margin-left:auto; font-size:13px; opacity:.6; }
.btn { font-size:13px; font-weight:600; padding:4px 10px; border-radius:6px; color:#1c2024; }
.btn.fuoco { background:#f76b15; } .btn.console { background:#12a594; }
@media (max-width:520px) { .nav { display:none; } }
</style></head><body><main>
<h1>Beatpile o Pilepick, fuoco o console</h1>
<p>Lo stesso simbolo scelto — tre custodie storte con il bordo di plastica chiaro — con i due nomi e due serie di colori. Nel nome in testo si colora il verbo: <i>beat</i> in Beatpile, <i>pick</i> in Pilepick. Con i colori delle console l'accento resta il teal di oggi: il pulsante «Aggiungi» nella barra mostra l'accento di ciascuna.</p>
<p>Blu, rosso e verde sono le scale Radix, non i colori esatti di PlayStation, Nintendo e Xbox.</p>
${variants.map(row).join('')}
</main></body></html>`);
