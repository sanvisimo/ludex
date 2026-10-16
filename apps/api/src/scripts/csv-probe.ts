import '../env';

import { readFileSync } from 'node:fs';

import { findIgdbGamesBySource } from '../external/igdb';
import { resolveByName } from '../services/library-import';
import { parsePlayniteCsv } from '../services/playnite-csv';

// Giro a vuoto dell'import da file (10): legge l'export di Playnite, prova a
// risolverlo su IGDB, **non scrive niente**.
//
//   pnpm --filter api csv:probe [file.csv]
//
// Senza argomento usa l'export Ubisoft delle fixture. Parla solo con IGDB, con
// la nostra chiave: nessun account dell'utente. Le domande (vedi
// `plans/10-import-csv.md`):
//
//  1. quante righe per negozio, e quante senza un negozio nostro;
//  2. le piattaforme: quante righe ne portano più d'una;
//  3. quante si risolvono per appid Steam (dai `Collegamenti`), quante per
//     nome, quante restano negli scarti;
//  4. dove appid e nome danno due giochi diversi.

const file =
  process.argv[2] ??
  new URL('../../test/fixtures/playnite-ubisoft-2026-08.csv', import.meta.url)
    .pathname;

const rows = parsePlayniteCsv(readFileSync(file, 'utf8'));

const conta = (valori: string[]) =>
  [...valori.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())]
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `    ${String(n).padStart(4)}  ${v}`)
    .join('\n');

console.log(`\n${file}: ${rows.length} righe`);
console.log(
  `\n  sorgenti → negozio:\n${conta(rows.map((r) => `${r.source || '(vuota)'} → ${r.store ?? '—'}`))}`,
);
console.log(
  `\n  piattaforme:\n${conta(rows.map((r) => r.platforms.join(' + ') || '(vuota)'))}`,
);
console.log(`\n  stati:\n${conta(rows.map((r) => r.status))}`);
console.log(
  `\n  con categorie: ${rows.filter((r) => r.categories.length).length}, con ore: ${rows.filter((r) => r.playtimeMinutes).length}, con appid Steam: ${rows.filter((r) => r.steamAppId).length}`,
);

// Solo le righe PC: la piattaforma delle altre è la domanda 2, e qui la
// regola 3 vorrebbe lo slug, che il probe non sceglie.
const pc = rows.filter(
  (r) => r.store && r.platforms.every((p) => p === 'PC (Windows)'),
);

const perAppid = await findIgdbGamesBySource(
  1,
  pc.flatMap((r) => (r.steamAppId ? [r.steamAppId] : [])),
);
const perNome = new Map(
  (
    await resolveByName(
      pc.map((r) => ({
        externalId: r.gameId,
        name: r.name,
        releaseYear: r.releaseYear,
      })),
    )
  ).map((link) => [link.externalId, link]),
);

let daAppid = 0;
let soloNome = 0;
const scarti: string[] = [];
const diversi: string[] = [];

for (const r of pc) {
  const a = r.steamAppId ? perAppid.get(r.steamAppId) : undefined;
  const n = perNome.get(r.gameId);
  if (a) daAppid++;
  else if (n) soloNome++;
  else
    scarti.push(
      `    ${r.name}${r.steamAppId ? ` (appid ${r.steamAppId} sconosciuto)` : ''}`,
    );
  if (a && n && a.igdbId !== n.igdbId) {
    diversi.push(
      `    ${r.name}\n      appid → ${a.name} (${a.releaseYear}, ${a.gameType ?? '?'})\n      nome  → ${n.name} (${n.releaseYear})`,
    );
  }
}

console.log(`\nrisoluzione delle ${pc.length} righe PC`);
console.log(`  per appid Steam:  ${daAppid}`);
console.log(`  solo per nome:    ${soloNome}`);
console.log(`  scarti:           ${scarti.length}`);
console.log(
  `  (per nome in tutto: ${perNome.size}; l'appid salva dal nome: ${
    pc
      .filter(
        (r) =>
          r.steamAppId && perAppid.has(r.steamAppId) && !perNome.has(r.gameId),
      )
      .map((r) => r.name)
      .join(', ') || 'nessuno'
  })`,
);
if (scarti.length) console.log(scarti.join('\n'));
console.log(`\n  appid e nome in disaccordo: ${diversi.length}`);
if (diversi.length) console.log(diversi.join('\n'));

process.exit(0);
