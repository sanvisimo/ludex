import '../env';

import { db, schema } from '@repo/db';
import { and, eq, isNotNull, sql } from '@repo/db/orm';

import {
  fetchMetacriticGame,
  searchMetacriticGames,
  type MetacriticSearchHit,
} from '../external/metacritic';
import { fetchSteamMetacriticSlug } from '../external/steam';
import { toPlatformSlug } from '../services/metacritic-platforms';
import {
  normalizeTitle,
  pickByName,
  rankCandidates,
  shortenTitle,
} from '../services/title-match';

// Giro a vuoto del match Metacritic: cerca, punteggia, **non scrive niente**.
//
//   pnpm --filter api metacritic:probe [quanti]
//   pnpm --filter api metacritic:probe "Resident Evil 4"
//
// Come `hltb:probe`, la riga che conta è quella dei "da sistemare": è la lista
// di ciò che il job scarterebbe. In più mostra due cose che qui sono nuove — se
// il link della scheda Steam regge, e quali piattaforme non sappiamo tradurre.

const arg = process.argv[2];
const cercaTitolo = arg !== undefined && Number.isNaN(Number(arg));

type Riga = { id: string | null; name: string; firstReleaseDate: Date | null };

const colonne = {
  id: schema.games.id,
  name: schema.games.name,
  firstReleaseDate: schema.games.firstReleaseDate,
};

let giochi: Riga[] = cercaTitolo
  ? await db.select(colonne).from(schema.games).where(eq(schema.games.name, arg)).limit(1)
  : await db
      .select(colonne)
      .from(schema.games)
      .where(
        and(
          isNotNull(schema.games.igdbId),
          isNotNull(schema.games.firstReleaseDate),
        ),
      )
      .orderBy(sql`random()`)
      .limit(Number(arg ?? 10));

if (!giochi.length && cercaTitolo)
  giochi = [{ id: null, name: arg, firstReleaseDate: null }];

let agganciati = 0;
const scartati: string[] = [];
const piattaformeIgnote = new Set<string>();

for (const gioco of giochi) {
  const anno = gioco.firstReleaseDate?.getUTCFullYear() ?? null;
  console.log(`\n${gioco.name}${anno ? ` (${anno})` : ''}`);

  // La strada dello Steam link, che è quella che il job prova per prima.
  let daSteam: string | null = null;
  if (gioco.id) {
    const appIds = await db
      .select({ externalId: schema.externalIds.externalId })
      .from(schema.externalIds)
      .where(
        and(
          eq(schema.externalIds.gameId, gioco.id),
          eq(schema.externalIds.source, 'steam'),
        ),
      );
    for (const { externalId } of appIds) {
      daSteam = await fetchSteamMetacriticSlug(externalId);
      if (daSteam) break;
    }
  }
  console.log(`  steam: ${daSteam ?? 'nessun link dichiarato'}`);

  // Gli stessi tentativi del job: titolo intero, e se non convince nessuno la
  // testa prima dei due punti. L'arnese deve provare la stessa strada, o
  // mostrerebbe scarti che il job non farebbe — "Fallout: A Post Nuclear Role
  // Playing Game" è proprio uno di quelli.
  let ranked: ReturnType<typeof rankCandidates<MetacriticSearchHit>> = [];
  let scelto: (typeof ranked)[number] | null = null;
  let cercatoCome: string | null = null;

  for (const [indice, titolo] of [gioco.name, shortenTitle(gioco.name)]
    .filter((titolo): titolo is string => Boolean(titolo))
    .entries()) {
    const hits = await searchMetacriticGames(normalizeTitle(titolo));
    if (hits.length === 0) continue;

    ranked = rankCandidates(
      {
        name: gioco.name,
        searchedAs: indice > 0 ? titolo : null,
        releaseYear: anno,
      },
      hits,
    );
    scelto = pickByName(ranked);
    if (scelto) {
      cercatoCome = indice > 0 ? titolo : null;
      break;
    }
  }

  if (cercatoCome) console.log(`  cercato come "${cercatoCome}"`);

  for (const riga of ranked.slice(0, 3)) {
    const marchio = scelto?.hit.slug === riga.hit.slug ? '→' : ' ';
    console.log(
      `  ${marchio} ${riga.score.toFixed(2)}  ${riga.hit.slug.padEnd(34)} ` +
        `${riga.hit.name}${riga.hit.releaseYear ? ` (${riga.hit.releaseYear})` : ''}`,
    );
  }

  if (!scelto) {
    scartati.push(gioco.name);
    continue;
  }

  agganciati += 1;
  if (daSteam && daSteam !== scelto.hit.slug) {
    console.log(`      il link Steam (${daSteam}) non è quello scelto`);
  }

  const detail = await fetchMetacriticGame(scelto.hit.slug);
  if (!detail) {
    console.log('      scheda irraggiungibile');
    continue;
  }

  const tradotte = detail.platforms.map((piattaforma) => {
    const nostro = toPlatformSlug(piattaforma.slug);
    if (!nostro) piattaformeIgnote.add(piattaforma.slug);
    return `${nostro ?? `${piattaforma.slug}?`}=${piattaforma.score.score}`;
  });
  console.log(
    `      complessivo ${detail.overall?.score ?? '—'} | ${tradotte.join(' ') || 'nessuna piattaforma con voto'}`,
  );
}

console.log(`\n${agganciati}/${giochi.length} agganciati`);
if (scartati.length > 0) {
  console.log('da sistemare:');
  for (const nome of scartati) console.log(`  ${nome}`);
}
if (piattaformeIgnote.size > 0) {
  console.log(
    `piattaforme senza corrispondenza in metacritic-platforms.ts: ${[...piattaformeIgnote].join(', ')}`,
  );
}

process.exit(0);
