import { writeFileSync } from 'node:fs';
const rows = [
  ['Blu', [['Il nostro', 'blue 9 Radix', '#0090ff']], [['PlayStation', 'PS4, il più citato', '#003791'], ['PlayStation Store', 'più chiaro', '#00a8e2']]],
  ['Rosso', [['Il nostro', 'red 9 Radix', '#e5484d']], [['Nintendo', 'rosso del marchio', '#e60012']]],
  ['Verde', [['Il nostro, 1', 'grass 9 Radix', '#46a758'], ['Il nostro, 2', 'più acceso', '#3dd68c']], [['Xbox', 'oggi, non confermato', '#107c10'], ['Xbox', 'console, da un sito di terzi', '#92c83e']]],
];
const sw = ([n, d, c]) => `<div class="sw"><b style="background:${c}"></b><span><strong>${n}</strong><br>${d}<br><code>${c}</code></span></div>`;
writeFileSync('../09-colori-console-a-confronto.html', `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Colori a confronto</title>
<style>
body { margin:0; padding:24px 16px 48px; background:#fcfcfd; color:#1c2024; font:14px/1.45 Inter, system-ui, sans-serif; }
main { max-width:960px; margin:0 auto; }
h1 { font-size:24px; margin:0 0 4px; } h2 { font-size:16px; margin:26px 0 8px; }
p { margin:0 0 8px; color:#60646c; max-width:72ch; }
.row { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:640px) { .row { grid-template-columns:1fr; } }
.col { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-start; }
.col h3 { width:100%; margin:0; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#60646c; }
.sw { width:150px; border:1px solid #e0e1e6; border-radius:10px; overflow:hidden; background:#fff; }
.sw b { display:block; height:80px; } .sw span { display:block; padding:6px 8px; font-size:12px; }
code { font-size:12px; }
</style></head><body><main>
<h1>I nostri colori e quelli delle console</h1>
<p>A sinistra quelli delle bozze, a destra quelli dei marchi. I valori dei marchi vengono da siti di palette, non dalle linee guida ufficiali: quello di Nintendo è il più sicuro, quello di Xbox il meno.</p>
${rows.map(([t, ours, brand]) => `<h2>${t}</h2><div class="row"><div class="col"><h3>Bozze</h3>${ours.map(sw).join('')}</div><div class="col"><h3>Marchio</h3>${brand.map(sw).join('')}</div></div>`).join('')}
</main></body></html>`);
