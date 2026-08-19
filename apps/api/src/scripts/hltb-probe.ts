import "../env";

import { db, schema } from "@repo/db";
import { and, eq, isNotNull, sql } from "@repo/db/orm";

import { fetchHltbGameDetail } from "../external/hltb";
import { findHltbCandidates } from "../services/hltb-enrichment";
import { pickByName } from "../services/hltb-match";

// Giro a vuoto del match HLTB: cerca, punteggia, **non scrive niente**.
//
//   pnpm --filter api hltb:probe [quanti]
//   pnpm --filter api hltb:probe "Resident Evil 4"
//
// Serve a guardare come si comporta il matcher su giochi veri prima di lasciarlo
// scrivere in DB, e soprattutto a vedere *cosa scarta*: la riga che conta è
// quella dei "da sistemare", perché è la lista che un domani finirà nella
// schermata di collegamento manuale.
//
// Senza argomento pesca dal catalogo i giochi già arricchiti da IGDB.

const arg = process.argv[2];
const cercaTitolo = arg !== undefined && Number.isNaN(Number(arg));

type Riga = { id: string | null; name: string; firstReleaseDate: Date | null };

const giochi: Riga[] = cercaTitolo
  ? [{ id: null, name: arg, firstReleaseDate: null }]
  : await db
      .select({
        id: schema.games.id,
        name: schema.games.name,
        firstReleaseDate: schema.games.firstReleaseDate,
      })
      .from(schema.games)
      .where(and(isNotNull(schema.games.igdbId), isNotNull(schema.games.firstReleaseDate)))
      .orderBy(sql`random()`)
      .limit(Number(arg ?? 10));

let agganciati = 0;
const scartati: string[] = [];

for (const gioco of giochi) {
  const anno = gioco.firstReleaseDate?.getUTCFullYear() ?? null;
  const { ranked, shortened } = await findHltbCandidates(gioco.name, anno);
  const scelto = pickByName(ranked);

  const appIds = gioco.id
    ? (
        await db
          .select({ externalId: schema.externalIds.externalId })
          .from(schema.externalIds)
          .where(
            and(
              eq(schema.externalIds.gameId, gioco.id),
              eq(schema.externalIds.source, "steam"),
            ),
          )
      ).map((row) => row.externalId)
    : [];

  console.log(
    `\n${gioco.name}${anno ? ` (${anno})` : ""}` +
      (shortened ? ` → secondo tentativo su "${shortened}"` : ""),
  );
  for (const [indice, riga] of ranked.slice(0, 3).entries()) {
    const marchio = scelto?.hit.hltbId === riga.hit.hltbId ? "→" : " ";
    console.log(
      `  ${marchio} ${riga.score.toFixed(2)}  ${String(riga.hit.hltbId).padEnd(7)} ` +
        `${riga.hit.name}${riga.hit.releaseYear ? ` (${riga.hit.releaseYear})` : ""}` +
        `${riga.hit.type && riga.hit.type !== "game" ? ` [${riga.hit.type}]` : ""}`,
    );
    // La verifica vera dell'import: gli appid della pagina HLTB contro i nostri.
    // Qui si guarda solo il primo candidato, e solo per mostrare se
    // confermerebbe: un appid diverso non è una smentita.
    if (indice === 0 && appIds.length > 0) {
      const detail = await fetchHltbGameDetail(riga.hit.hltbId);
      const suoi = detail?.steamAppIds ?? [];
      const esito =
        suoi.length === 0
          ? "HLTB non dichiara appid"
          : suoi.some((appId) => appIds.includes(appId))
            ? `appid ${appIds.join(",")} confermato`
            : `appid ${suoi.join(",")} ≠ ${appIds.join(",")} — nessuna conferma`;
      console.log(`      steam: ${esito}`);
    }
  }

  if (scelto) agganciati += 1;
  else scartati.push(gioco.name);
}

console.log(`\n${agganciati}/${giochi.length} agganciati per nome e anno`);
if (scartati.length > 0) {
  console.log("da sistemare:");
  for (const nome of scartati) console.log(`  ${nome}`);
}

process.exit(0);
