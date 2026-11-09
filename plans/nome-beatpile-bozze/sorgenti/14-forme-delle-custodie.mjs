// Bozza 14: le tre custodie con le forme dei modelli delle console, senza
// loghi. Blu davanti con la fascia dritta in alto (PlayStation), rossa in mezzo
// con la fascia dalla curva bianca (Switch), verde dietro con la cornice e la
// striscia nera in diagonale (Xbox). Due versioni: copertina chiara come nei
// modelli, o copertina nel colore pieno con gli stessi segni sopra.
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

// PlayStation: fascia dritta in alto.
const ps = (x, y, w, h, rot, mode) => {
  const light = mode === 'chiara';
  const { svg, box } = shell(x, y, w, h, light ? C.paper : C.blue, light ? C.line : null);
  const bandH = box.h * 0.17;
  const band = { ...box, h: bandH };
  return `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">${svg}
    ${rect(box, light ? C.paper : C.blue)}
    <path d="M${box.x} ${box.y + bandH} V${box.y + 0.8} Q${box.x} ${box.y} ${box.x + 0.8} ${box.y} H${box.x + box.w - 0.8} Q${box.x + box.w} ${box.y} ${box.x + box.w} ${box.y + 0.8} V${box.y + bandH} Z" fill="${light ? C.blue : C.blueDeep}"/>
    ${gloss(box.x, box.y, box.w, box.h)}
    ${letters(box, box.y + bandH, light ? C.blue : '#fff')}</g>`;
};
// Switch: la scocca rossa, la fascia in alto con il bordo curvo e la riga
// bianca sotto.
const sw = (x, y, w, h, rot, mode) => {
  const light = mode === 'chiara';
  const { svg, box } = shell(x, y, w, h, C.red, null);
  const bh = box.h * 0.2;
  const curve = `M${box.x} ${box.y + bh * 0.45} Q${box.x + box.w * 0.55} ${box.y + bh * 1.25} ${box.x + box.w} ${box.y + bh * 0.45}`;
  return `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">${svg}
    ${rect(box, light ? '#5c6068' : C.red)}
    <path d="${curve} V${box.y} H${box.x} Z" fill="${light ? C.red : C.redDeep}"/>
    <path d="${curve}" fill="none" stroke="#fff" stroke-width=".55"/>
    ${gloss(box.x, box.y, box.w, box.h)}</g>`;
};
// Xbox: cornice verde tutt'intorno, fascia verde in alto e sotto la striscia
// nera in diagonale.
const xb = (x, y, w, h, rot, mode) => {
  const light = mode === 'chiara';
  const { svg, box } = shell(x, y, w, h, light ? C.green : C.greenDeep, null);
  const bh = box.h * 0.14, sh = box.h * 0.07;
  return `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">${svg}
    ${rect(box, light ? C.paper : C.green)}
    <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${bh}" fill="${light ? C.green : C.greenDeep}"/>
    <path d="M${box.x} ${box.y + bh} H${box.x + box.w * 0.66} L${box.x + box.w * 0.56} ${box.y + bh + sh} H${box.x} Z" fill="${C.black}"/>
    ${gloss(box.x, box.y, box.w, box.h)}</g>`;
};
const sym = (mode) => `<svg viewBox="0 0 32 32" aria-hidden="true">
  ${xb(14, 1, 15, 20.5, 8, mode)}${sw(9, 4, 16, 22, 3, mode)}${ps(3, 7.2, 18, 24, -3, mode)}
</svg>`;

// Il simbolo della bozza 11, per confronto.
const caseP = (x, y, w, h, fill, rot, inner = '') => {
  const { svg, box } = shell(x, y, w, h, fill, null);
  return `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">${svg}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="#fff" fill-opacity=".45"/>${rect(box, fill)}${gloss(box.x, box.y, box.w, box.h)}${inner}</g>`;
};
const sym11 = () => `<svg viewBox="0 0 32 32" aria-hidden="true">
  ${caseP(14, 1, 15, 20.5, C.green, 8)}${caseP(9, 4, 16, 22, C.red, 3)}${caseP(3, 7.2, 18, 24, C.blue, -3, `<text x="5.56" y="22.05" font-family="SG" font-weight="700" font-size="11.4" letter-spacing="-0.6" fill="#fff">bp</text>`)}
</svg>`;

const sizes = [128, 64, 32, 16];
const row = (l, s) => `<h3>${l}</h3><div class="pair">${['light', 'dark'].map((t) => `<div class="bg ${t}">${sizes.map((z) => `<div class="cell"><div style="width:${z}px;height:${z}px">${s}</div><span>${z}</span></div>`).join('')}</div>`).join('')}</div>
<div class="pair">${['light', 'dark'].map((t) => `<div class="bar ${t}"><div style="width:24px;height:24px">${s}</div><span class="plain"><span style="color:${t === 'light' ? C.blue : '#7aa2ff'}">beat</span>pile</span></div>`).join('')}</div>`;

writeFileSync(join(here, '..', '14-forme-delle-custodie.html'), `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beatpile, le forme delle custodie</title>
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
<h1>Beatpile, le forme delle custodie</h1>
<p>Le tre custodie prendono le forme dei modelli delle console, senza loghi: la fascia dritta in alto (PlayStation, davanti), la fascia rossa con la curva bianca (Switch, in mezzo), la cornice verde con la striscia nera in diagonale (Xbox, dietro). «bp» sta nella copertina blu, sotto la fascia.</p>
${row('Copertine chiare, come nei modelli', sym('chiara'))}
${row('Copertine nel colore pieno, con gli stessi segni sopra', sym('piena'))}
${row('La bozza 11, per confronto', sym11())}
</main></body></html>`);
