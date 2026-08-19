import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, desc, eq, inArray } from '@repo/db/orm';

import { findIgdbGameById, searchIgdbGames } from '../external/igdb';
import { chunk } from '../lib/chunk';
import { enqueueEnrichment } from '../queue/enrichment';

// Postgres regge 65535 parametri per istruzione: con librerie da qualche
// migliaio di voci un colpo solo li sfonderebbe.
const READ_CHUNK = 1000;
const WRITE_CHUNK = 500;

/**
 * Le colonne che compongono GameSchema nel contratto. Tenerle esplicite evita
 * che una colonna aggiunta dall'enrichment finisca per sbaglio in una risposta
 * pubblica.
 *
 * Esportata perché la stessa forma serve anche a `backlog.ts`, che annida un
 * gioco in ogni riga: erano due elenchi gemelli, e una colonna aggiunta a uno
 * solo si scopriva a runtime, quando il contratto rifiutava la risposta.
 */
export const gameColumns = {
  id: true,
  igdbId: true,
  name: true,
  coverImageId: true,
  firstReleaseDate: true,
  hltbMainMinutes: true,
  hltbHasSolo: true,
  createdAt: true,
} as const;

// Le stesse colonne nella forma che vuole `.returning()`. Derivata da
// `gameColumns` e non riscritta a mano: erano due elenchi gemelli in tre punti,
// e una colonna aggiunta a uno solo sarebbe passata inosservata fino a un errore
// di validazione del contratto.
const gameReturning = Object.fromEntries(
  Object.keys(gameColumns).map((name) => [
    name,
    schema.games[name as keyof typeof gameColumns],
  ]),
) as { [K in keyof typeof gameColumns]: (typeof schema.games)[K] };

/** Catalogo pubblico: gli ultimi giochi che Ludex ha conosciuto. */
export function listLatestGames(limit: number) {
  return db.query.games.findMany({
    columns: gameColumns,
    orderBy: desc(schema.games.createdAt),
    limit,
  });
}

export function findGameById(id: string) {
  return db.query.games.findFirst({
    columns: gameColumns,
    where: eq(schema.games.id, id),
  });
}

/**
 * Scheda completa: i campi dell'enrichment piu gli attributi.
 *
 * Restituisce anche quando ciascuna fonte e' stata sincronizzata, cosi la UI puo
 * distinguere "questo gioco non ha generi" da "l'enrichment non e ancora
 * passato" — che senza sarebbero indistinguibili. Sono due campi e non uno
 * perche' le fonti arrivano in momenti diversi: un gioco puo' avere i metadati
 * IGDB e non ancora le durate.
 */
export async function findGameDetailById(id: string) {
  const game = await db.query.games.findFirst({
    columns: {
      ...gameColumns,
      summary: true,
      coverWidth: true,
      coverHeight: true,
      aggregatedRating: true,
      aggregatedRatingCount: true,
      hltbMainMinutes: true,
      hltbPlusMinutes: true,
      hltbCompletionistMinutes: true,
      hltbAllStylesMinutes: true,
      hltbMainCount: true,
      hltbPlusCount: true,
      hltbCompletionistCount: true,
      hltbAllStylesCount: true,
      hltbHasSolo: true,
      hltbHasCoop: true,
      hltbHasVersus: true,
    },
    where: eq(schema.games.id, id),
    with: {
      attributes: {
        columns: {},
        with: {
          attribute: { columns: { kind: true, igdbId: true, name: true } },
        },
      },
      sources: { columns: { source: true, syncedAt: true } },
    },
  });

  if (!game) return null;

  const { attributes, sources, ...rest } = game;

  return {
    ...rest,
    attributes: attributes.map((row) => row.attribute),
    igdbSyncedAt:
      sources.find((row) => row.source === 'igdb')?.syncedAt ?? null,
    hltbSyncedAt:
      sources.find((row) => row.source === 'hltb')?.syncedAt ?? null,
  };
}

/**
 * Crea un gioco non risolto, con il solo titolo: `igdbId` resta null finché non
 * passa l'enrichment dello step 3.
 */
export async function createGame(name: string) {
  const [row] = await db
    .insert(schema.games)
    .values({ name })
    .returning(gameReturning);
  return row;
}

export function searchGames(term: string) {
  return searchIgdbGames(term);
}

export function findGameByIgdbId(igdbId: number) {
  return db.query.games.findFirst({
    columns: gameColumns,
    where: eq(schema.games.igdbId, igdbId),
  });
}

/**
 * Passo 1 e 3 del flusso di risoluzione: se il gioco esiste già in `games` si
 * riusa quella riga — è condivisa fra tutti gli utenti, e l'enrichment si paga
 * una volta sola. Altrimenti si crea con id e titolo presi da IGDB.
 */
export async function resolveGameFromIgdb(igdbId: number) {
  const existing = await findGameByIgdbId(igdbId);
  if (existing) return existing;

  const hit = await findIgdbGameById(igdbId);
  if (!hit) return null;

  // `onConflictDoNothing` copre la corsa fra due utenti che importano lo stesso
  // gioco insieme: chi perde non fallisce, rilegge la riga dell'altro.
  const [inserted] = await db
    .insert(schema.games)
    .values({ igdbId: hit.igdbId, name: hit.name })
    .onConflictDoNothing({ target: schema.games.igdbId })
    .returning(gameReturning);

  // Solo chi ha davvero creato la riga accoda: se la corsa è stata persa, il
  // job lo ha gia' messo in coda l'altro. E l'accodamento sta qui, non nella
  // procedura oRPC, perché vale per qualunque strada porti a un gioco nuovo —
  // compreso l'import Steam dello step 4.
  if (inserted) {
    await enqueueEnrichment('igdb', inserted.id);
    return inserted;
  }

  return (await findGameByIgdbId(igdbId)) ?? null;
}

// --- Risoluzione per id esterno (step 4): import di librerie ---

/**
 * appid → gameId per i giochi che Ludex conosce già.
 *
 * È il **primo** passo dell'import, prima di IGDB: `games` è condivisa fra tutti
 * gli utenti, quindi il secondo che importa la stessa libreria non paga né la
 * risoluzione né l'enrichment. Su una collezione popolare il risparmio è quasi
 * tutto il lavoro.
 */
export async function findGameIdsByExternalIds(
  source: Store,
  externalIds: string[],
) {
  const byExternalId = new Map<string, string>();
  if (externalIds.length === 0) return byExternalId;

  for (const page of chunk(externalIds, READ_CHUNK)) {
    const rows = await db
      .select({
        externalId: schema.externalIds.externalId,
        gameId: schema.externalIds.gameId,
      })
      .from(schema.externalIds)
      .where(
        and(
          eq(schema.externalIds.source, source),
          inArray(schema.externalIds.externalId, page),
        ),
      );

    for (const row of rows) byExternalId.set(row.externalId, row.gameId);
  }

  return byExternalId;
}

export type ExternalGameLink = {
  externalId: string;
  igdbId: number;
  name: string;
};

/**
 * Registra su `games` i giochi risolti da una sorgente esterna e li mappa in
 * `external_ids`.
 *
 * Due cose che l'import dà per scontate e che devono valere qui:
 *
 * - **riusa la riga esistente**: se un altro utente aveva già importato quel
 *   gioco, non se ne crea una seconda. È la regola che fa pagare l'enrichment
 *   una volta sola.
 * - **più appid possono puntare allo stesso gioco**: su una libreria vera capita
 *   (445 giochi IGDB distinti per 447 appid). Le righe `external_ids` sono due,
 *   la riga `games` una.
 *
 * Restituisce anche i giochi appena nati: sono gli unici per cui vale la pena
 * accodare l'enrichment.
 */
export async function linkExternalGames(
  source: Store,
  links: ExternalGameLink[],
) {
  const byExternalId = new Map<string, string>();
  const createdGameIds: string[] = [];
  if (links.length === 0) return { byExternalId, createdGameIds };

  // Dedotto per igdbId: senza, lo stesso gioco verrebbe proposto due volte nella
  // stessa INSERT.
  const perIgdbId = new Map<number, ExternalGameLink>();
  for (const link of links)
    if (!perIgdbId.has(link.igdbId)) perIgdbId.set(link.igdbId, link);

  const gameIdByIgdbId = new Map<number, string>();

  for (const page of chunk([...perIgdbId.values()], WRITE_CHUNK)) {
    const inserted = await db
      .insert(schema.games)
      .values(page.map((link) => ({ igdbId: link.igdbId, name: link.name })))
      .onConflictDoNothing({ target: schema.games.igdbId })
      .returning({ id: schema.games.id, igdbId: schema.games.igdbId });

    for (const row of inserted) {
      if (row.igdbId === null) continue;
      gameIdByIgdbId.set(row.igdbId, row.id);
      createdGameIds.push(row.id);
    }

    // Quelle che c'erano già non tornano dal RETURNING.
    const mancanti = page
      .map((link) => link.igdbId)
      .filter((igdbId) => !gameIdByIgdbId.has(igdbId));
    if (mancanti.length === 0) continue;

    const esistenti = await db
      .select({ id: schema.games.id, igdbId: schema.games.igdbId })
      .from(schema.games)
      .where(inArray(schema.games.igdbId, mancanti));

    for (const row of esistenti) {
      if (row.igdbId !== null) gameIdByIgdbId.set(row.igdbId, row.id);
    }
  }

  const mappature = links
    .map((link) => ({ link, gameId: gameIdByIgdbId.get(link.igdbId) }))
    .filter(
      (row): row is { link: ExternalGameLink; gameId: string } =>
        row.gameId !== undefined,
    );

  for (const page of chunk(mappature, WRITE_CHUNK)) {
    await db
      .insert(schema.externalIds)
      .values(
        page.map(({ link, gameId }) => ({
          gameId,
          source,
          externalId: link.externalId,
        })),
      )
      // Reimportare non deve rompersi sulle mappature già scritte.
      .onConflictDoNothing({
        target: [schema.externalIds.source, schema.externalIds.externalId],
      });
  }

  for (const { link, gameId } of mappature)
    byExternalId.set(link.externalId, gameId);

  return { byExternalId, createdGameIds };
}
