import { readFileSync, writeFileSync } from 'node:fs';
const font = readFileSync('space-grotesk-latin-700-normal.woff2').toString('base64');
const caseP = (x, y, w, h, fill, rot) => {
  const cx = x + w / 2, cy = y + h / 2, t = 1.1, sp = w * 0.14;
  return `<g transform="rotate(${rot} ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="${fill}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" fill="#fff" fill-opacity=".45"/>
    <rect x="${x + sp}" y="${y + t}" width="${(w - sp - t).toFixed(2)}" height="${h - 2 * t}" rx="0.8" fill="${fill}"/></g>`;
};
const sym = (front, mid, back) => `<svg viewBox="0 0 32 32" aria-hidden="true">
  ${caseP(14, 1, 15, 20.5, back, 8)}${caseP(9, 4, 16, 22, mid, 3)}${caseP(3, 7.2, 18, 24, front, -3)}
  <g transform="rotate(-3 12.3 19.2)"><text x="13.47" y="23.8" text-anchor="middle" font-family="SG" font-weight="700" font-size="12.6" letter-spacing="-0.7" fill="#fff">bp</text></g>
</svg>`;
const BLUE = '#0090ff', RED = '#e5484d';
const s1 = sym(BLUE, RED, '#46a758');
const s2 = sym(BLUE, RED, '#3dd68c');
const sizes = [128, 64, 32, 16];
const symRow = (l, s) => `<h3>${l}</h3><div class="pair">${['light','dark'].map(t=>`<div class="bg ${t}">${sizes.map(z=>`<div class="cell"><div style="width:${z}px;height:${z}px">${s}</div><span>${z}</span></div>`).join('')}</div>`).join('')}</div>`;
// Gli accenti: il colore del pulsante e della metà colorata del nome.
const acc = {
  blu: { light: { btn: BLUE, ink: '#1c2024', word: '#0d74ce' }, dark: { btn: BLUE, ink: '#1c2024', word: '#70b8ff' } },
  neutro: { light: { btn: '#1c2024', ink: '#ffffff', word: '#0d74ce' }, dark: { btn: '#edeef0', ink: '#1c2024', word: '#70b8ff' } },
  teal: { light: { btn: '#12a594', ink: '#1c2024', word: '#008573' }, dark: { btn: '#12a594', ink: '#1c2024', word: '#0bd8b6' } },
};
const bars = (l, a, s) => `<h3>${l}</h3><div class="pair">${['light','dark'].map(t=>{const c=acc[a][t];return `<div class="bar ${t}"><div style="width:24px;height:24px">${s}</div><span class="plain"><span style="color:${c.word}">beat</span>pile</span><span class="nav">Backlog · Ricerca</span><span class="btn" style="background:${c.btn};color:${c.ink}">Aggiungi</span></div>`;}).join('')}</div>`;
writeFileSync('../08-console-accese-e-accento.html', `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beatpile, console accese</title>
<style>
@font-face { font-family: SG; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 700; }
body { margin:0; padding:24px 16px 48px; background:#fcfcfd; color:#1c2024; font:15px/1.5 Inter, system-ui, sans-serif; }
main { max-width:960px; margin:0 auto; }
h1 { font:700 26px SG, sans-serif; margin:0 0 4px; } h2 { font:700 19px SG, sans-serif; margin:32px 0 6px; } h3 { font-size:14px; font-weight:600; margin:22px 0 8px; }
p { margin:0 0 8px; color:#60646c; max-width:72ch; }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:8px; }
@media (max-width:700px) { .pair { grid-template-columns:1fr; } }
.bg { border-radius:12px; padding:16px; display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap; border:1px solid #e0e1e6; }
.light { background:#fcfcfd; color:#1c2024; } .dark { background:#111113; color:#edeef0; border-color:#2b2d31; }
.cell { display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; }
svg { width:100%; height:100%; display:block; overflow:visible; }
.bar { display:flex; align-items:center; gap:8px; padding:12px 16px; border-radius:10px; border:1px solid #e0e1e6; }
.plain { font:700 18px/24px SG, sans-serif; } .nav { margin-left:auto; font-size:13px; opacity:.6; }
.btn { font-size:13px; font-weight:600; padding:4px 10px; border-radius:6px; }
@media (max-width:520px) { .nav { display:none; } }
</style></head><body><main>
<h1>Beatpile, console accese</h1>
<p>Blu più acceso (blue 9, #0090ff) e verde più acceso, in due prove. «bp» bianco sul blu: contrasto 3,3, sopra il minimo di 3 per un segno grafico.</p>
<h2>Il simbolo</h2>
${symRow('Verde grass 9 (#46a758)', s1)}
${symRow('Verde ancora più acceso (#3dd68c)', s2)}
<h2>L'accento, con il simbolo</h2>
<p>Il pulsante e la metà colorata del nome. Il verde e il rosso restano fuori: sono già «riuscito» e «distruttivo».</p>
${bars('Blu: lo stesso blu della custodia davanti (testo scuro sul pulsante, 5,0)', 'blu', s2)}
${bars('Neutro: pulsante nero sul chiaro e bianco sullo scuro; il colore lo porta solo il simbolo', 'neutro', s2)}
${bars("Teal, l'accento di oggi, per confronto", 'teal', s2)}
</main></body></html>`);
