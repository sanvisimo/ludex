import { db, schema } from '@repo/db';
import { and, asc, eq } from '@repo/db/orm';

import {
  ensureBacklogEntries,
  ensureOwnerships,
  findEntryByGame,
} from './backlog';
import { resolveGameFromIgdb } from './games';
import { platformFor } from './library-import';

/**
 * Le voci di libreria che l'import non ha saputo legare a un gioco.
 */
export function listUnresolvedImports(userId: string) {
  return db
    .select({
      id: schema.unresolvedImports.id,
      store: schema.unresolvedImports.store,
      externalId: schema.unresolvedImports.externalId,
      name: schema.unresolvedImports.name,
      playtimeMinutes: schema.unresolvedImports.playtimeMinutes,
      lastPlayedAt: schema.unresolvedImports.lastPlayedAt,
    })
    .from(schema.unresolvedImports)
    .where(eq(schema.unresolvedImports.userId, userId))
    .orderBy(asc(schema.unresolvedImports.name));
}

function findOwn(userId: string, id: string) {
  return db.query.unresolvedImports.findFirst({
    // Sempre in AND con lo userId: senza, un id indovinato toccherebbe la riga
    // di un altro.
    where: and(
      eq(schema.unresolvedImports.id, id),
      eq(schema.unresolvedImports.userId, userId),
    ),
  });
}

/**
 * L'utente indica il gioco giusto: la voce entra nel backlog e sparisce dagli scarti.
 *
 * Scrive anche la mappatura in `external_ids`, ed è la parte che conta più della
 * riga di backlog: da lì in avanti quell'appid è risolto **per tutti**, e il
 * prossimo import — suo o di un altro utente — non ripasserà da qui.
 */
export async function resolveUnresolvedImport(
  userId: string,
  id: string,
  igdbId: number,
) {
  const pending = await findOwn(userId, id);
  if (!pending) return { status: 'not_found' as const };

  // La stessa mappa che usa l'import, e per la stessa ragione: se un negozio non
  // la dichiara `platformFor` alza invece di indovinare. Indovinare vorrebbe
  // dire scrivere dati sbagliati in silenzio in una tabella su cui si filtra —
  // PSN è PS4 o PS5? — e la risposta la deve dare chi aggiunge quel negozio.
  const platformSlug = platformFor(pending.store);

  const game = await resolveGameFromIgdb(igdbId);
  if (!game) return { status: 'unknown_igdb_id' as const };

  await db
    .insert(schema.externalIds)
    .values({
      gameId: game.id,
      source: pending.store,
      externalId: pending.externalId,
    })
    .onConflictDoNothing({
      target: [schema.externalIds.source, schema.externalIds.externalId],
    });

  const { byGameId } = await ensureBacklogEntries(userId, [game.id]);
  const backlogId = byGameId.get(game.id)!;

  await ensureOwnerships([
    {
      backlogId,
      platformSlug,
      store: pending.store,
      // Lo scarto sa da quale account veniva, e il possesso che ne nasce deve
      // saperlo quanto un possesso importato: risolvere a mano non è un
      // inserimento manuale, è un import finito a mano.
      storeAccountId: pending.storeAccountId,
      playtimeMinutes: pending.playtimeMinutes,
      lastPlayedAt: pending.lastPlayedAt,
    },
  ]);

  await db
    .delete(schema.unresolvedImports)
    .where(eq(schema.unresolvedImports.id, pending.id));

  const entry = await findEntryByGame(userId, game.id);
  return { status: 'ok' as const, entry };
}

/**
 * "Non è un gioco": toglie la voce senza importarla.
 *
 * Serve perché la maggior parte degli scarti non si risolverà mai — client beta,
 * "Friend's Pass", branch instabili — e senza una via d'uscita resterebbero nella
 * lista a chiedere un intervento che non arriverà.
 *
 * Torneranno al prossimo import: è il prezzo di non tenere una lista di ignorati,
 * che sarebbe una tabella in più per un fastidio che si toglie con un click.
 */
export async function dismissUnresolvedImport(userId: string, id: string) {
  const [row] = await db
    .delete(schema.unresolvedImports)
    .where(
      and(
        eq(schema.unresolvedImports.id, id),
        eq(schema.unresolvedImports.userId, userId),
      ),
    )
    .returning({ id: schema.unresolvedImports.id });

  return row;
}
