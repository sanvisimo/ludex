import { db, schema } from '@repo/db';
import { and, asc, eq } from '@repo/db/orm';

import {
  ensureBacklogEntries,
  ensureOwnerships,
  findEntryByGame,
} from './backlog';
import { resolveGameFromIgdb } from './games';
import { STEAM_PLATFORM } from './steam-import';

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

  // Oggi solo Steam produce scarti, e per Steam la piattaforma è PC. Il giorno
  // che arriva un negozio di console indovinarla sarebbe scrivere dati sbagliati
  // in silenzio — PSN è PS4 o PS5? — e non è una domanda da risolvere qui:
  // meglio fermarsi e costringere chi aggiunge il negozio a decidere.
  if (pending.store !== 'steam') {
    throw new Error(
      `Nessuna piattaforma definita per il negozio ${pending.store}`,
    );
  }

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
      platformSlug: STEAM_PLATFORM,
      store: pending.store,
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
