// Bozza 16: la 15 con la fascia di nuovo distinta dalla cornice. Nella 15 il
// riflesso forte passava anche sulla fascia, dello stesso colore, e senza la
// striscia nera sotto la fascia diventava solo un bordo alto. Tre modi per
// staccarla: un tono più scuro, la striscia scura in diagonale, una riga chiara.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const font = readFileSync(join(here, 'space-grotesk-latin-700-normal.woff2')).toString('base64');

const C = {
  blue: '#0050e6', blueDeep: '#003ab0',
  red: '#ee0a1f', redDeep: '#b8000f',
  green: '#13a313', greenDeep: '#0b7a0b',
  black: '#1c2024', paper: '#f7f8fa', grey: '#d9dce1', line: '#b9bec6',
};
let gid = 0;
const gloss = (x, y, w, h) => {
  const id = 'g' + gid++;
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.8" fill="url(#${id})"/>`;
};
// La scocca: il colore della plastica e la copertina rientrata, più spessa a
// sinistra dove c'è la cerniera. Restituisce le misure della copertina.
const shell = (x, y, w, h, plastic, edge) => {
  const t = 1.1, sp = w * 0.14;
  const box = { x: x + sp, y: y + t, w: +(w - sp - t).toFixed(2), h: h - 2 * t };
  const svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="${plastic}"${edge ? ` stroke="${edge}" stroke-width=".35"` : ''}/>`;
  return { svg, box };
};
const rect = (b, fill, extra = '') => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="0.8" fill="${fill}"${extra}/>`;

// «bp» centrato nello spazio della copertina sotto la fascia (Space Grotesk
// 700): a 11,4 l'inchiostro è largo 12,71, con 0,8 di spalla, 7,98 sopra la
// linea di base e 2,28 sotto. Qui si scala per stare nello spazio rimasto.
const letters = (b, top, fill) => {
  const room = { y: top, h: b.y + b.h - top };
  const s = Math.min(11.4, (b.w * 0.86) / 1.115, (room.h * 0.82) / 0.9);
  const inkW = 1.115 * s, left = 0.07 * s, asc = 0.7 * s, desc = 0.2 * s;
  const x = b.x + (b.w - inkW) / 2 - left;
  const base = room.y + room.h / 2 + (asc - desc) / 2;
  return `<text x="${x.toFixed(2)}" y="${base.toFixed(2)}" font-family="SG" font-weight="700" font-size="${s.toFixed(2)}" letter-spacing="${(-0.0526 * s).toFixed(2)}" fill="${fill}">bp</text>`;
};


// Un riflesso forte sulla plastica colorata: chiaro in alto a sinistra, che
// sfuma, e una riga di luce lungo il bordo alto.
const shine = (x, y, w, h, strength) => {
  const id = 'h' + gid++;
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${strength}"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient></defs>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="url(#${id})"/>
  <path d="M${x + 1.6} ${y + 0.45} H${x + w - 1.6}" stroke="#fff" stroke-opacity=".7" stroke-width=".35" stroke-linecap="round"/>`;
};
// La custodia: cornice nel colore della console, più spessa a sinistra dove
// c'è la cerniera, fascia rettangolare in alto, copertina chiara.
const DEEP = { [C.blue]: C.blueDeep, [C.red]: C.redDeep, [C.green]: C.greenDeep };
const box3 = (x, y, w, h, rot, color, { frame = 1.5, txt = null, strength = 0.55, mode = 'piatta' } = {}) => {
  const sp = w * 0.15;
  const b = { x: x + sp, y: y + frame, w: +(w - sp - frame).toFixed(2), h: +(h - 2 * frame).toFixed(2) };
  const bh = +(b.h * 0.15).toFixed(2);
  return `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="${color}"/>
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="0.5" fill="${C.paper}"/>
    ${shine(x, y, w, h, strength)}
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${bh}" fill="${mode === 'scura' ? DEEP[color] : color}"/>
    ${mode === 'striscia' ? `<path d="M${b.x} ${b.y + bh} H${(b.x + b.w * 0.66).toFixed(2)} L${(b.x + b.w * 0.56).toFixed(2)} ${(b.y + bh + b.h * 0.07).toFixed(2)} H${b.x} Z" fill="${C.black}"/>` : ''}
    ${mode === 'riga' ? `<path d="M${b.x} ${b.y + 0.15} H${b.x + b.w}" stroke="#fff" stroke-opacity=".85" stroke-width=".3"/><path d="M${b.x} ${b.y + bh} H${b.x + b.w}" stroke="#fff" stroke-opacity=".85" stroke-width=".3"/>` : ''}
    ${gloss(b.x, b.y + bh, b.w, b.h - bh)}
    ${txt ? letters(b, b.y + bh + (mode === 'striscia' ? b.h * 0.07 : 0), txt) : ''}</g>`;
};
const sym = (frame, strength, mode) => `<svg viewBox="0 0 32 32" aria-hidden="true">
  ${box3(14, 1, 15, 20.5, 8, C.green, { frame, strength, mode })}${box3(9, 4, 16, 22, 3, C.red, { frame, strength, mode })}${box3(3, 7.2, 18, 24, -3, C.blue, { frame, strength, mode, txt: C.blue })}
</svg>`;
const sizes = [128, 64, 32, 16];
const row = (l, s) => `<h3>${l}</h3><div class="pair">${['light', 'dark'].map((t) => `<div class="bg ${t}">${sizes.map((z) => `<div class="cell"><div style="width:${z}px;height:${z}px">${s}</div><span>${z}</span></div>`).join('')}</div>`).join('')}</div>
<div class="pair">${['light', 'dark'].map((t) => `<div class="bar ${t}"><div style="width:24px;height:24px">${s}</div><span class="plain"><span style="color:${t === 'light' ? C.blue : '#7aa2ff'}">beat</span>pile</span></div>`).join('')}</div>`;

writeFileSync(join(here, '..', '16-fascia-distinta.html'), `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beatpile, la fascia distinta</title>
<style>
@font-face { font-family: SG; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 700; }
body { margin:0; padding:24px 16px 48px; background:#fcfcfd; color:#1c2024; font:15px/1.5 Inter, system-ui, sans-serif; }
main { max-width:960px; margin:0 auto; }
h1 { font:700 26px SG, sans-serif; margin:0 0 4px; } h3 { font-size:14px; font-weight:600; margin:26px 0 8px; }
p { margin:0 0 8px; color:#60646c; max-width:72ch; }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:8px; }
@media (max-width:700px) { .pair { grid-template-columns:1fr; } }
.bg { border-radius:12px; padding:16px; display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap; border:1px solid #e0e1e6; }
.light { background:#fcfcfd; color:#1c2024; } .dark { background:#111113; color:#edeef0; border-color:#2b2d31; }
.cell { display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; }
svg { width:100%; height:100%; display:block; overflow:visible; }
.bar { display:flex; align-items:center; gap:8px; padding:12px 16px; border-radius:10px; border:1px solid #e0e1e6; }
.plain { font:700 18px/24px SG, sans-serif; }
</style></head><body><main>
<h1>Beatpile, la fascia distinta dalla cornice</h1>
<p>Nella bozza 15 la fascia si era appiattita: era dello stesso colore della cornice, il riflesso forte ci passava sopra, e senza la striscia nera sotto diventava solo un bordo alto più spesso. Qui il riflesso resta sulla cornice e la fascia si stacca in tre modi, più un quarto dove cambia solo il riflesso. Tutte con la cornice spessa.</p>
${row('Fascia in un tono più scuro del colore della custodia', sym(2.2, 0.55, 'scura'))}
${row('Fascia con la striscia scura in diagonale sotto, come nel modello Xbox, su tutte e tre', sym(2.2, 0.55, 'striscia'))}
${row('Fascia dello stesso colore, staccata da due righe chiare', sym(2.2, 0.55, 'riga'))}
${row('Fascia dello stesso colore, solo senza il riflesso sopra', sym(2.2, 0.55, 'piatta'))}
</main></body></html>`);
