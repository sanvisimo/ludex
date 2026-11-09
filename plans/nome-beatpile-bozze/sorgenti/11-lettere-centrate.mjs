import { readFileSync, writeFileSync } from 'node:fs';
const font = readFileSync('space-grotesk-latin-700-normal.woff2').toString('base64');
const L = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return ((x + 0.05) / (y + 0.05)).toFixed(1).replace('.', ','); };
let gid = 0;
const caseP = (x, y, w, h, fill, rot, gloss, inner = '') => {
  const cx = x + w / 2, cy = y + h / 2, t = 1.1, sp = w * 0.14, id = 'g' + gid++;
  const ix = x + sp, iy = y + t, iw = w - sp - t, ih = h - 2 * t;
  return `<g transform="rotate(${rot} ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="${fill}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="#fff" fill-opacity=".45"/>
    <rect x="${ix}" y="${iy}" width="${iw.toFixed(2)}" height="${ih}" rx="0.8" fill="${fill}"/>
    ${gloss ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs><rect x="${ix}" y="${iy}" width="${iw.toFixed(2)}" height="${ih}" rx="0.8" fill="url(#${id})"/>` : ''}${inner}</g>`;
};
// «bp» centrato nella copertina, misurato sull'inchiostro delle lettere
// (Space Grotesk 700, 11,4): larghe 12,71, 0,8 di spalla a sinistra, 7,98
// sopra la linea di base e 2,28 sotto. La copertina va da x 5,52 a 19,9 e da
// y 8,3 a 30,1.
const BP = `<text x="5.56" y="22.05" font-family="SG" font-weight="700" font-size="11.4" letter-spacing="-0.6" fill="#fff">bp</text>`;
const OLD = `<text x="13.47" y="23.8" text-anchor="middle" font-family="SG" font-weight="700" font-size="12.6" letter-spacing="-0.7" fill="#fff">bp</text>`;
const sym = (c, gloss, txt = BP) => `<svg viewBox="0 0 32 32" aria-hidden="true">
  ${caseP(14, 1, 15, 20.5, c.green, 8, gloss)}${caseP(9, 4, 16, 22, c.red, 3, gloss)}${caseP(3, 7.2, 18, 24, c.blue, -3, gloss, txt)}
</svg>`;
const radix = { blue: '#0090ff', red: '#e5484d', green: '#46a758' };
const near = { blue: '#0050e6', red: '#ee0a1f', green: '#13a313' };
const brand = { blue: '#003791', red: '#e60012', green: '#107c10' };
const sizes = [128, 64, 32, 16];
const symRow = (l, s) => `<h3>${l}</h3><div class="pair">${['light','dark'].map(t=>`<div class="bg ${t}">${sizes.map(z=>`<div class="cell"><div style="width:${z}px;height:${z}px">${s}</div><span>${z}</span></div>`).join('')}</div>`).join('')}</div>`;
const sw = (n, c) => `<div class="sw"><b style="background:${c}"></b><span>${n}<br><code>${c}</code></span></div>`;
const swRow = (k, name, bn) => `<div class="swrow"><span class="lab">${name}</span>${sw('prima (Radix)', radix[k])}${sw('nuovo', near[k])}${sw(bn, brand[k])}</div>`;
writeFileSync('../11-lettere-centrate.html', `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beatpile, lettere al centro</title>
<style>
@font-face { font-family: SG; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 700; }
body { margin:0; padding:24px 16px 48px; background:#fcfcfd; color:#1c2024; font:15px/1.5 Inter, system-ui, sans-serif; }
main { max-width:960px; margin:0 auto; }
h1 { font:700 26px SG, sans-serif; margin:0 0 4px; } h2 { font:700 19px SG, sans-serif; margin:30px 0 6px; } h3 { font-size:14px; font-weight:600; margin:22px 0 8px; }
p { margin:0 0 8px; color:#60646c; max-width:72ch; }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:8px; }
@media (max-width:700px) { .pair { grid-template-columns:1fr; } }
.bg { border-radius:12px; padding:16px; display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap; border:1px solid #e0e1e6; }
.light { background:#fcfcfd; color:#1c2024; } .dark { background:#111113; color:#edeef0; border-color:#2b2d31; }
.cell { display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; }
svg { width:100%; height:100%; display:block; overflow:visible; }
.bar { display:flex; align-items:center; gap:8px; padding:12px 16px; border-radius:10px; border:1px solid #e0e1e6; }
.plain { font:700 18px/24px SG, sans-serif; }
.swrow { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
.lab { width:60px; font-weight:600; font-size:14px; }
.sw { width:130px; border:1px solid #e0e1e6; border-radius:10px; overflow:hidden; background:#fff; font-size:12px; }
.sw b { display:block; height:56px; } .sw span { display:block; padding:5px 8px; } code { font-size:12px; }
</style></head><body><main>
<h1>Beatpile, le lettere al centro</h1>
<p>I colori vicini alle console con il riflesso lucido, e «bp» spostato a sinistra e centrato nella copertina blu, anche in altezza: ora sta tutto nel colore, con un margine uguale ai due lati. Un filo più piccolo (11,4 invece di 12,6), perché a quella misura toccava il bordo. Contrasto ${cr(near.blue, '#ffffff')}.</p>
<h2>Il simbolo</h2>
${symRow('Lettere centrate nella copertina', sym(near, true))}
<div class="pair">${['light','dark'].map(t=>`<div class="bar ${t}"><div style="width:24px;height:24px">${sym(near, true)}</div><span class="plain"><span style="color:${t==='light'?'#0d74ce':'#70b8ff'}">beat</span>pile</span></div>`).join('')}</div>
${symRow('Prima: la p sul bordo', sym(near, true, OLD))}
</main></body></html>`);
