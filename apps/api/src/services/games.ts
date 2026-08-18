import { db, schema } from "@repo/db";
import { desc, eq } from "@repo/db/orm";

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
