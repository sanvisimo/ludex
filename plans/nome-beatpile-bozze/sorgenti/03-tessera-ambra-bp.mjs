import { readFileSync, writeFileSync } from 'node:fs';
const font = readFileSync('space-grotesk-latin-700-normal.woff2').toString('base64');
const C = { red:'#ce2c31', orange:'#f76b15', amber:'#ffc53d', slate:'#1c2024', white:'#ffffff' };
const sym = ({ back, mid, front, b, p, txt }) => `<svg viewBox="0 0 32 32" aria-hidden="true">
  <rect x="13" y="1" width="17" height="19" rx="4" fill="${back}"/>
  <rect x="8" y="4" width="19" height="21" rx="5" fill="${mid}"/>
  <rect x="2" y="8" width="22" height="23" rx="5.5" fill="${front}"/>
  <text x="13" y="${txt === 'bp' ? 23.6 : 24.4}" text-anchor="middle" font-family="SG" font-weight="700" font-size="${txt === 'bp' ? 14 : 13}" letter-spacing="-0.7"><tspan fill="${b}">${txt[0]}</tspan><tspan fill="${p}">${txt[1]}</tspan></text>
</svg>`;
const F = { back: C.red, mid: C.orange, front: C.amber, txt: 'BP' };
const variants = [
  ['1 — come chiesto: B arancio, P bianca (contrasto sull\'ambra 1,9 e 1,6)', sym({ ...F, b: C.orange, p: C.white })],
  ['2 — B rosso scuro, P scura (contrasto 4,9 e 10,4)', sym({ ...F, b: '#a3171c', p: C.slate })],
  ['3 — BP scure, come la «L» di oggi (contrasto 10,4)', sym({ ...F, b: C.slate, p: C.slate })],
];
const sizes = [128, 64, 32, 16];
const row = ([l, s]) => `<h3>${l}</h3><div class="pair">${['light','dark'].map(t=>`<div class="bg ${t}">${sizes.map(z=>`<div class="cell"><div style="width:${z}px;height:${z}px">${s}</div><span>${z}</span></div>`).join('')}</div>`).join('')}</div>
<div class="pair">${['light','dark'].map(t=>`<div class="bar ${t}"><div style="width:24px;height:24px">${s}</div><span class="plain"><span class="beat">beat</span>pile</span><span class="nav">Backlog · Ricerca · Playlist</span></div>`).join('')}</div>`;
writeFileSync('../03-tessera-ambra-bp.html', `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beatpile, il simbolo</title>
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
svg { width:100%; height:100%; display:block; }
.bar { display:flex; align-items:center; gap:8px; padding:12px 16px; border-radius:10px; border:1px solid #e0e1e6; }
.plain { font:700 18px/24px SG, sans-serif; } .beat { color:#f76b15; } .nav { margin-left:auto; font-size:13px; opacity:.6; }
@media (max-width:520px) { .nav { display:none; } }
</style></head><body><main>
<h1>Beatpile, il simbolo</h1>
<p>La B nei colori del fuoco — rosso dietro, arancio in mezzo, ambra davanti — con «BP» sulla tessera ambra. Per un segno grafico il minimo di contrasto è 3.</p>
${variants.map(row).join('')}
</main></body></html>`);
