import { readFileSync, writeFileSync } from 'node:fs';
const font = readFileSync('space-grotesk-latin-700-normal.woff2').toString('base64');
const C = { red:'#ce2c31', orange:'#f76b15', amber:'#ffc53d', slate:'#1c2024', bred:'#a3171c' };
// Una custodia: rettangolo verticale, angoli appena arrotondati, il dorso a
// sinistra un po' più scuro. `band` aggiunge la fascia in alto, generica.
const box = (x, y, w, h, fill, { band = false, rot = 0 } = {}) => {
  const cx = x + w / 2, cy = y + h / 2;
  return `<g transform="rotate(${rot} ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6" fill="${fill}"/>
    <rect x="${x}" y="${y}" width="${(w * 0.13).toFixed(2)}" height="${h}" rx="1.6" fill="#000" fill-opacity=".18"/>
    ${band ? `<rect x="${x + w * 0.13}" y="${y}" width="${w * 0.87}" height="${(h * 0.14).toFixed(2)}" fill="#000" fill-opacity=".12"/>` : ''}
  </g>`;
};
const letters = (x, y, w, h, rot = 0) => {
  const cx = x + w * 0.565, cy = y + h * 0.5;
  return `<g transform="rotate(${rot} ${x + w / 2} ${cy})"><text x="${cx}" y="${cy + 5.4}" text-anchor="middle" font-family="SG" font-weight="700" font-size="14.5" letter-spacing="-0.8"><tspan fill="${C.bred}">b</tspan><tspan fill="${C.slate}">p</tspan></text></g>`;
};
const symA = (band) => `<svg viewBox="0 0 32 32" aria-hidden="true">
  ${box(15, 0.5, 15, 20.5, C.red, { band })}
  ${box(9.5, 3.5, 16, 22, C.orange, { band })}
  ${box(2, 7.5, 18, 24, C.amber, { band })}
  ${letters(2, 7.5 + (band ? 1.2 : 0), 18, 24)}
</svg>`;
const symC = () => `<svg viewBox="0 0 32 32" aria-hidden="true">
  ${box(14, 1, 15, 20.5, C.red, { rot: 8 })}
  ${box(9, 4, 16, 22, C.orange, { rot: 3 })}
  ${box(3, 7.2, 18, 24, C.amber, { rot: -3 })}
  ${letters(3, 7.2, 18, 24, -3)}
</svg>`;
const variants = [
  ['A — tre custodie con il dorso', symA(false)],
  ['B — le stesse, con la fascia in alto', symA(true)],
  ['C — le stesse, un po\' storte, come una pila vera', symC()],
];
const sizes = [128, 64, 32, 16];
const row = ([l, s]) => `<h3>${l}</h3><div class="pair">${['light','dark'].map(t=>`<div class="bg ${t}">${sizes.map(z=>`<div class="cell"><div style="width:${z}px;height:${z}px">${s}</div><span>${z}</span></div>`).join('')}</div>`).join('')}</div>
<div class="pair">${['light','dark'].map(t=>`<div class="bar ${t}"><div style="width:24px;height:24px">${s}</div><span class="plain"><span class="beat">beat</span>pile</span><span class="nav">Backlog · Ricerca · Playlist</span></div>`).join('')}</div>`;
writeFileSync('../05-custodie.html', `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beatpile, le custodie</title>
<style>
@font-face { font-family: SG; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 700; }
body { margin:0; padding:24px 16px 48px; background:#fcfcfd; color:#1c2024; font:15px/1.5 Inter, system-ui, sans-serif; }
main { max-width:960px; margin:0 auto; }
h1 { font:700 26px SG, sans-serif; margin:0 0 4px; } h3 { font-size:14px; font-weight:600; margin:28px 0 8px; }
p { margin:0 0 8px; color:#60646c; max-width:70ch; }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:8px; }
@media (max-width:700px) { .pair { grid-template-columns:1fr; } }
.bg { border-radius:12px; padding:16px; display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap; border:1px solid #e0e1e6; }
.light { background:#fcfcfd; color:#1c2024; } .dark { background:#111113; color:#edeef0; border-color:#2b2d31; }
.cell { display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; }
svg { width:100%; height:100%; display:block; overflow:visible; }
.bar { display:flex; align-items:center; gap:8px; padding:12px 16px; border-radius:10px; border:1px solid #e0e1e6; }
.plain { font:700 18px/24px SG, sans-serif; } .beat { color:#f76b15; } .nav { margin-left:auto; font-size:13px; opacity:.6; }
@media (max-width:520px) { .nav { display:none; } }
</style></head><body><main>
<h1>Beatpile, le custodie</h1>
<p>Le tre tessere diventano custodie di videogiochi: più alte che larghe, angoli appena arrotondati, il dorso a sinistra. Stessi colori e stesso «bp».</p>
${variants.map(row).join('')}
</main></body></html>`);
