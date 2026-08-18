import { db, schema } from "@repo/db";
import { desc, eq } from "@repo/db/orm";

import { findIgdbGameById, searchIgdbGames } from "../external/igdb";
import { enqueueIgdbEnrichment } from "../queue/enrichment";

// Le colonne che compongono GameSchema nel contratto. Tenerle esplicite evita
// che una colonna aggiunta allo step 3 finisca per sbaglio in una risposta
// pubblica.
const gameColumns = {
  id: true,
  igdbId: true,
  name: true,
  coverImageId: true,
  firstReleaseDate: true,
  createdAt: true,
} as const;

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
 * Restituisce anche `igdbSyncedAt` da `game_sources`, cosi la UI puo distinguere
 * "questo gioco non ha generi" da "l'enrichment non e ancora passato" — che
 * senza questo campo sarebbero indistinguibili.
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
    },
    where: eq(schema.games.id, id),
    with: {
      attributes: {
        columns: {},
        with: { attribute: { columns: { kind: true, igdbId: true, name: true } } },
      },
      sources: { columns: { source: true, syncedAt: true } },
    },
  });

  if (!game) return null;

  const { attributes, sources, ...rest } = game;

  return {
    ...rest,
    attributes: attributes.map((row) => row.attribute),
    igdbSyncedAt: sources.find((row) => row.source === "igdb")?.syncedAt ?? null,
  };
}

/**
 * Crea un gioco non risolto, con il solo titolo: `igdbId` resta null finché non
 * passa l'enrichment dello step 3.
 */
export async function createGame(name: string) {
  const [row] = await db.insert(schema.games).values({ name }).returning({
    id: schema.games.id,
    igdbId: schema.games.igdbId,
    name: schema.games.name,
    coverImageId: schema.games.coverImageId,
    firstReleaseDate: schema.games.firstReleaseDate,
    createdAt: schema.games.createdAt,
  });
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
    .returning({
      id: schema.games.id,
      igdbId: schema.games.igdbId,
      name: schema.games.name,
      coverImageId: schema.games.coverImageId,
      firstReleaseDate: schema.games.firstReleaseDate,
      createdAt: schema.games.createdAt,
    });

  // Solo chi ha davvero creato la riga accoda: se la corsa è stata persa, il
  // job lo ha gia' messo in coda l'altro. E l'accodamento sta qui, non nella
  // procedura oRPC, perché vale per qualunque strada porti a un gioco nuovo —
  // compreso l'import Steam dello step 4.
  if (inserted) {
    await enqueueIgdbEnrichment(inserted.id);
    return inserted;
  }

  return (await findGameByIgdbId(igdbId)) ?? null;
}
