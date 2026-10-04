import { db, schema } from '@repo/db';
import { and, asc, count, desc, eq, ilike, inArray, sql } from '@repo/db/orm';

import { escapeLike } from './backlog-search';
import { gameReturning, searchGames } from './games';

/**
 * La ricerca globale (12f), sul catalogo intero e non sul backlog di chi
 * cerca: `games` è di tutti. Da loggati ogni gioco porta lo stato che ha nel
 * tuo backlog, come in home.
 *
 * Il titolo si confronta come nel backlog, `ilike` sul nome. Prima il titolo
 * esatto, poi quelli che cominciano con ciò che si è scritto, poi gli altri in
 * ordine alfabetico: chi scrive «Hades» cerca Hades, non *Hades II* in testa
 * perché viene prima.
 */
export async function searchCatalog(
  input: { q: string; limit: number; offset: number },
  viewerId: string | null,
) {
  const term = escapeLike(input.q);
  const where = ilike(schema.games.name, `%${term}%`);

  const [games, [totale]] = await Promise.all([
    db
      .select({ ...gameReturning, status: schema.backlog.status })
      .from(schema.games)
      .leftJoin(
        schema.backlog,
        and(
          eq(schema.backlog.gameId, schema.games.id),
          // Da sloggati nessuno possiede niente: la condizione non trova righe.
          viewerId ? eq(schema.backlog.userId, viewerId) : sql`false`,
        ),
      )
      .where(where)
      .orderBy(
        desc(sql`lower(${schema.games.name}) = lower(${input.q})`),
        desc(ilike(schema.games.name, `${term}%`)),
        asc(sql`lower(${schema.games.name})`),
        asc(schema.games.id),
      )
      .limit(input.limit)
      .offset(input.offset),
    db.select({ n: count() }).from(schema.games).where(where),
  ]);

  return { games, total: totale?.n ?? 0 };
}

/**
 * I giochi IGDB che Ludex non ha ancora: la seconda metà della ricerca
 * globale, solo da loggati. Quelli già in `games` stanno nella prima metà,
 * con la loro scheda.
 *
 * Non scrive niente: la riga in `games` nasce quando l'utente sceglie un
 * risultato (`resolveGameFromIgdb`), non per ogni risultato visto, o la
 * tabella condivisa si riempirebbe di giochi che nessuno ha scelto.
 */
export async function searchIgdbNotInCatalog(term: string) {
  const hits = await searchGames(term);
  if (hits.length === 0) return [];

  const presenti = await db
    .select({ igdbId: schema.games.igdbId })
    .from(schema.games)
    .where(
      inArray(
        schema.games.igdbId,
        hits.map((hit) => hit.igdbId),
      ),
    );
  const noti = new Set(presenti.map((row) => row.igdbId));

  return hits.filter((hit) => !noti.has(hit.igdbId));
}
