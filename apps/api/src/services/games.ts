import { db, schema } from "@repo/db";
import { desc, eq } from "@repo/db/orm";

import { findIgdbGameById, searchIgdbGames } from "../external/igdb";

// Le colonne che compongono GameSchema nel contratto. Tenerle esplicite evita
// che una colonna aggiunta allo step 3 finisca per sbaglio in una risposta
// pubblica.
const gameColumns = { id: true, igdbId: true, name: true, createdAt: true } as const;

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
 * Crea un gioco non risolto, con il solo titolo: `igdbId` resta null finché non
 * passa l'enrichment dello step 3.
 */
export async function createGame(name: string) {
  const [row] = await db
    .insert(schema.games)
    .values({ name })
    .returning({
      id: schema.games.id,
      igdbId: schema.games.igdbId,
      name: schema.games.name,
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
      createdAt: schema.games.createdAt,
    });

  return inserted ?? ((await findGameByIgdbId(igdbId)) ?? null);
}
