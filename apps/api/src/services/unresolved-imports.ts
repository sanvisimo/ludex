import { storeAccountName } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, asc, eq } from '@repo/db/orm';

import {
  ensureBacklogEntries,
  ensureOwnerships,
  findEntryByGame,
} from './backlog';
import { reopenSourcesForNewExternalIds } from './enrichment';
import { resolveGameFromIgdb } from './games';
import { platformFor } from './library-import';

/**
 * Le voci di libreria che l'import non ha saputo legare a un gioco.
 */
export async function listUnresolvedImports(userId: string) {
  // Le tre colonne del nome si portano su e si compongono in JS, invece di un
  // `coalesce` in SQL: la precedenza `label → display_name → external_account_id`
  // sta scritta in `storeAccountName` dentro packages/contracts, ed è l'unico
  // posto dove deve stare. Un coalesce a due termini è la stessa regola scritta
  // male una seconda volta, e infatti rendeva null il nome di un account senza
  // etichetta di cui il negozio non ci ha detto come si chiama.
  const rows = await db
    .select({
      id: schema.unresolvedImports.id,
      store: schema.unresolvedImports.store,
      label: schema.storeAccounts.label,
      displayName: schema.storeAccounts.displayName,
      externalAccountId: schema.storeAccounts.externalAccountId,
      externalId: schema.unresolvedImports.externalId,
      name: schema.unresolvedImports.name,
      playtimeMinutes: schema.unresolvedImports.playtimeMinutes,
      lastPlayedAt: schema.unresolvedImports.lastPlayedAt,
    })
    .from(schema.unresolvedImports)
    // La FK è NOT NULL, quindi la riga dell'account c'è sempre: la JOIN è
    // sinistra solo per non far sparire uno scarto se quel vincolo cambiasse.
    .leftJoin(
      schema.storeAccounts,
      eq(schema.unresolvedImports.storeAccountId, schema.storeAccounts.id),
    )
    .where(eq(schema.unresolvedImports.userId, userId))
    .orderBy(asc(schema.unresolvedImports.name));

  return rows.map(
    ({ label, displayName, externalAccountId, ...unresolved }) => ({
      ...unresolved,
      storeName: storeAccountName({
        label,
        displayName,
        externalAccountId: externalAccountId ?? '',
      }),
    }),
  );
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

  // La piattaforma della riga se il negozio l'ha detta, quella del negozio
  // altrimenti — la stessa precedenza dell'import, e per la stessa ragione:
  // indovinare vorrebbe dire scrivere dati sbagliati in silenzio in una tabella
  // su cui si filtra.
  //
  // «PSN è PS4 o PS5?» era la domanda lasciata qui in sospeso, e il 9b ha
  // risposto: **lo dice la riga**, e da allora lo scarto se la porta dietro. Su
  // un negozio PC resta nulla e decide `platformFor`, che continua ad alzare per
  // i negozi che non hanno né l'una né l'altra.
  const platformSlug = pending.platformSlug ?? platformFor(pending.store);

  const game = await resolveGameFromIgdb(igdbId);
  if (!game) return { status: 'unknown_igdb_id' as const };

  const inserted = await db
    .insert(schema.externalIds)
    .values({
      gameId: game.id,
      source: pending.store,
      externalId: pending.externalId,
    })
    .onConflictDoNothing({
      target: [schema.externalIds.source, schema.externalIds.externalId],
    })
    .returning({
      gameId: schema.externalIds.gameId,
      source: schema.externalIds.source,
    });
  // Collegare a mano un appid Steam è lo stesso evento di quando lo porta IGDB.
  await reopenSourcesForNewExternalIds(inserted);

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
