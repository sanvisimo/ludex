import { db, schema, type Db } from '@repo/db';
import { and, asc, count, eq, inArray, isNull } from '@repo/db/orm';

import { enqueueEnrichment } from '../queue/enrichment';
import { reopenSourcesForNewExternalIds } from './enrichment';
import {
  mergeAddedAt,
  mergeHiddenAt,
  mergeNotes,
  mergeRating,
  mergeStatus,
  pickSurvivor,
} from './merge-rules';

// La fusione di due righe di `games` (11b, vedi `plans/11b-fusione.md`): lo
// stesso gioco con due id. Tocca dati condivisi fra tutti gli utenti e non si
// disfa, quindi l'anteprima e la conferma usano lo stesso piano, e la conferma
// lo ricalcola dentro la transazione: fra le due i dati si muovono.

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;
type BacklogRow = typeof schema.backlog.$inferSelect;
type OwnershipRow = typeof schema.ownerships.$inferSelect;

/** Il gioco senza i campi dell'enrichment: serve solo a riconoscerlo. */
const gameColumns = {
  id: schema.games.id,
  name: schema.games.name,
  slug: schema.games.slug,
  igdbId: schema.games.igdbId,
  createdAt: schema.games.createdAt,
};
type GameRef = {
  id: string;
  name: string;
  slug: string;
  igdbId: number | null;
  createdAt: Date;
};

async function loadPair(
  executor: Executor,
  gameId: string,
  otherId: string,
  lock = false,
) {
  if (gameId === otherId) return { status: 'same_game' as const };
  const query = executor
    .select(gameColumns)
    .from(schema.games)
    .where(inArray(schema.games.id, [gameId, otherId]));
  // `for update` sulle due righe, solo nella conferma: due fusioni
  // contemporanee dello stesso gioco si mettono in fila invece di incrociarsi.
  const rows: GameRef[] = lock ? await query.for('update') : await query;
  const a = rows.find((row) => row.id === gameId);
  const b = rows.find((row) => row.id === otherId);
  if (!a || !b) return { status: 'not_found' as const };
  const scelta = pickSurvivor(a, b);
  if (!scelta) return { status: 'both_linked' as const };
  return { status: 'ok' as const, ...scelta };
}

/**
 * Il piano, utente per utente. Chi ha una riga sola la sposta e basta; chi ha
 * entrambe le righe ne ha una, con i campi decisi da `merge-rules.ts`.
 */
async function planMerge(
  executor: Executor,
  survivorId: string,
  absorbedId: string,
) {
  const absorbed = await executor
    .select({ row: schema.backlog, userName: schema.user.name })
    .from(schema.backlog)
    .innerJoin(schema.user, eq(schema.user.id, schema.backlog.userId))
    .where(eq(schema.backlog.gameId, absorbedId))
    .orderBy(asc(schema.user.name));

  const userIds = absorbed.map(({ row }) => row.userId);
  const survivorRows =
    userIds.length === 0
      ? []
      : await executor
          .select()
          .from(schema.backlog)
          .where(
            and(
              eq(schema.backlog.gameId, survivorId),
              inArray(schema.backlog.userId, userIds),
            ),
          );
  const survivorByUser = new Map(survivorRows.map((row) => [row.userId, row]));

  const moved: { row: BacklogRow; userName: string }[] = [];
  const both: {
    userName: string;
    survivor: BacklogRow;
    absorbed: BacklogRow;
    merged: {
      status: BacklogRow['status'];
      rating: number | null;
      notes: string | null;
      hiddenAt: Date | null;
      addedAt: Date;
    };
  }[] = [];

  for (const { row, userName } of absorbed) {
    const survivor = survivorByUser.get(row.userId);
    if (!survivor) {
      moved.push({ row, userName });
      continue;
    }
    both.push({
      userName,
      survivor,
      absorbed: row,
      merged: {
        status: mergeStatus(survivor.status, row.status),
        rating: mergeRating(survivor, row),
        notes: mergeNotes(survivor, row),
        hiddenAt: mergeHiddenAt(survivor.hiddenAt, row.hiddenAt),
        addedAt: mergeAddedAt(survivor.addedAt, row.addedAt),
      },
    });
  }
  return { moved, both };
}

/** L'anteprima: ciò che la conferma farebbe, senza scrivere. */
export async function previewMerge(gameId: string, otherId: string) {
  const pair = await loadPair(db, gameId, otherId);
  if (pair.status !== 'ok') return pair;
  const { survivor, absorbed } = pair;
  const piano = await planMerge(db, survivor.id, absorbed.id);

  const [[sole], [ids], [lista]] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.backlog)
      .where(eq(schema.backlog.gameId, survivor.id)),
    db
      .select({ n: count() })
      .from(schema.externalIds)
      .where(eq(schema.externalIds.gameId, absorbed.id)),
    db
      .select({ n: count() })
      .from(schema.wishlistItems)
      .where(eq(schema.wishlistItems.gameId, absorbed.id)),
  ]);

  const preview = {
    survivor: toRef(survivor),
    absorbed: toRef(absorbed),
    moved: piano.moved.length,
    onlySurvivor: (sole?.n ?? 0) - piano.both.length,
    both: piano.both.map(({ userName, survivor, absorbed, merged }) => ({
      userName,
      statuses: [survivor.status, absorbed.status] as [
        BacklogRow['status'],
        BacklogRow['status'],
      ],
      status: merged.status,
      ratings: [survivor.rating, absorbed.rating] as [
        number | null,
        number | null,
      ],
      rating: merged.rating,
    })),
    externalIds: ids?.n ?? 0,
    wishlistItems: lista?.n ?? 0,
  };
  return { status: 'ok' as const, preview };
}

function toRef(game: GameRef) {
  return {
    id: game.id,
    name: game.name,
    slug: game.slug,
    igdbId: game.igdbId,
  };
}

// La chiave di una copia, come il vincolo `NULLS NOT DISTINCT`: un null è un
// valore, e due copie «PC / nessuno store» sono la stessa.
const chiave = (row: {
  platformSlug: string;
  store: string | null;
  storeAccountId: string | null;
  medium: string | null;
}) =>
  [row.platformSlug, row.store, row.storeAccountId, row.medium]
    .map((parte) => parte ?? '')
    .join('|');

const piuGrande = <T extends number | Date>(a: T | null, b: T | null) =>
  a === null ? b : b === null ? a : b > a ? b : a;
const piuPiccolo = <T extends number | Date>(a: T | null, b: T | null) =>
  a === null ? b : b === null ? a : b < a ? b : a;

/**
 * Le copie della riga assorbita finiscono su quella che resta. Una copia con la
 * stessa chiave è la stessa copia: se ne tiene una, con le ore più alte e
 * l'acquisto più vecchio (come fa `ensureOwnerships` sul reimport). Il resto si
 * sposta.
 */
async function mergeOwnerships(tx: Tx, survivorRowId: string, rowId: string) {
  const [dellaRiga, dellAssorbita] = await Promise.all([
    tx
      .select()
      .from(schema.ownerships)
      .where(eq(schema.ownerships.backlogId, survivorRowId)),
    tx
      .select()
      .from(schema.ownerships)
      .where(eq(schema.ownerships.backlogId, rowId)),
  ]);
  const perChiave = new Map<string, OwnershipRow>(
    dellaRiga.map((copia) => [chiave(copia), copia]),
  );

  for (const copia of dellAssorbita) {
    const uguale = perChiave.get(chiave(copia));
    if (!uguale) {
      await tx
        .update(schema.ownerships)
        .set({ backlogId: survivorRowId })
        .where(eq(schema.ownerships.id, copia.id));
      continue;
    }
    await tx
      .update(schema.ownerships)
      .set({
        playtimeMinutes: piuGrande(
          uguale.playtimeMinutes,
          copia.playtimeMinutes,
        ),
        lastPlayedAt: piuGrande(uguale.lastPlayedAt, copia.lastPlayedAt),
        acquiredAt: piuPiccolo(uguale.acquiredAt, copia.acquiredAt),
        // «Non più tua» solo se lo erano tutte e due: una copia viva tiene
        // viva l'altra, che è la stessa.
        subscriptionEndedAt:
          uguale.subscriptionEndedAt && copia.subscriptionEndedAt
            ? piuPiccolo(uguale.subscriptionEndedAt, copia.subscriptionEndedAt)
            : null,
        storePage: uguale.storePage ?? copia.storePage,
      })
      .where(eq(schema.ownerships.id, uguale.id));
  }
}

/**
 * I rifiuti seguono la riga che resta, tranne quelli che un possesso presente
 * contraddice: l'utente ha tolto una copia da un gioco e ce l'ha sull'altro,
 * quindi la vuole.
 */
async function mergeRejections(tx: Tx, survivorRowId: string, rowId: string) {
  const [copie, rifiuti] = await Promise.all([
    tx
      .select()
      .from(schema.ownerships)
      .where(eq(schema.ownerships.backlogId, survivorRowId)),
    tx
      .select()
      .from(schema.ownershipRejections)
      .where(
        inArray(schema.ownershipRejections.backlogId, [survivorRowId, rowId]),
      ),
  ]);
  const possedute = new Set(copie.map(chiave));

  const cadono = rifiuti.filter(
    (rifiuto) =>
      rifiuto.backlogId === survivorRowId && possedute.has(chiave(rifiuto)),
  );
  if (cadono.length > 0)
    await tx.delete(schema.ownershipRejections).where(
      inArray(
        schema.ownershipRejections.id,
        cadono.map((rifiuto) => rifiuto.id),
      ),
    );

  const daSpostare = rifiuti.filter(
    (rifiuto) => rifiuto.backlogId === rowId && !possedute.has(chiave(rifiuto)),
  );
  if (daSpostare.length > 0)
    await tx
      .insert(schema.ownershipRejections)
      .values(
        daSpostare.map((rifiuto) => ({
          backlogId: survivorRowId,
          platformSlug: rifiuto.platformSlug,
          store: rifiuto.store,
          storeAccountId: rifiuto.storeAccountId,
          medium: rifiuto.medium,
        })),
      )
      .onConflictDoNothing();
}

/**
 * La fusione. Chi chiama passa i due id in qualunque ordine: sopravvive quello
 * con `igdbId` (vedi `pickSurvivor`). Ripetuta a cose fatte rende `not_found`,
 * perché l'assorbito non c'è più, e non scrive niente.
 */
export async function mergeGames(
  adminId: string,
  gameId: string,
  otherId: string,
) {
  const esito = await db.transaction(async (tx) => {
    const pair = await loadPair(tx, gameId, otherId, true);
    if (pair.status !== 'ok') return pair;
    const { survivor, absorbed } = pair;
    const piano = await planMerge(tx, survivor.id, absorbed.id);

    // Chi ha una riga sola la sposta.
    if (piano.moved.length > 0)
      await tx
        .update(schema.backlog)
        .set({ gameId: survivor.id })
        .where(
          inArray(
            schema.backlog.id,
            piano.moved.map(({ row }) => row.id),
          ),
        );

    // Chi le ha entrambe ne tiene una, quella del sopravvissuto.
    for (const { survivor: resta, absorbed: via, merged } of piano.both) {
      await tx
        .update(schema.backlog)
        .set({
          ...merged,
          // `$onUpdate` lo riscriverebbe a «adesso»: la riga non è stata
          // modificata dall'utente, e `updatedAt` serve a dire chi ha votato
          // per ultimo.
          updatedAt: piuGrande(resta.updatedAt, via.updatedAt)!,
        })
        .where(eq(schema.backlog.id, resta.id));

      const tag = await tx
        .select({ tagId: schema.backlogTags.tagId })
        .from(schema.backlogTags)
        .where(eq(schema.backlogTags.backlogId, via.id));
      if (tag.length > 0)
        await tx
          .insert(schema.backlogTags)
          .values(tag.map(({ tagId }) => ({ backlogId: resta.id, tagId })))
          .onConflictDoNothing();

      await mergeOwnerships(tx, resta.id, via.id);
      await mergeRejections(tx, resta.id, via.id);
      // Cancella ciò che è rimasto (tag e rifiuti già copiati) per cascata.
      await tx.delete(schema.backlog).where(eq(schema.backlog.id, via.id));
    }

    // Gli id dei negozi: la chiave unique è su `(source, external_id)`, quindi
    // non possono collidere con quelli del sopravvissuto.
    const spostati = await tx
      .update(schema.externalIds)
      .set({ gameId: survivor.id })
      .where(eq(schema.externalIds.gameId, absorbed.id))
      .returning({ source: schema.externalIds.source });

    const lista = await tx
      .select()
      .from(schema.wishlistItems)
      .where(eq(schema.wishlistItems.gameId, absorbed.id));
    if (lista.length > 0)
      await tx
        .insert(schema.wishlistItems)
        .values(
          lista.map((voce) => ({
            listId: voce.listId,
            gameId: survivor.id,
            addedAt: voce.addedAt,
            // Il posto nella playlist aperta (15f), dove c'è.
            position: voce.position,
          })),
        )
        .onConflictDoNothing();

    // Le segnalazioni: una sola aperta per utente e cosa, quindi quelle
    // dell'assorbito che il sopravvissuto ha già si chiudono prima di spostare.
    const aperte = await tx
      .select()
      .from(schema.gameReports)
      .where(
        and(
          inArray(schema.gameReports.gameId, [survivor.id, absorbed.id]),
          isNull(schema.gameReports.resolvedAt),
        ),
      );
    const delSopravvissuto = new Set(
      aperte
        .filter((r) => r.gameId === survivor.id)
        .map((r) => `${r.userId}|${r.store ?? ''}|${r.source ?? ''}`),
    );
    const doppie = aperte.filter(
      (r) =>
        r.gameId === absorbed.id &&
        delSopravvissuto.has(`${r.userId}|${r.store ?? ''}|${r.source ?? ''}`),
    );
    if (doppie.length > 0)
      await tx
        .update(schema.gameReports)
        .set({ resolvedAt: new Date(), resolvedBy: adminId })
        .where(
          inArray(
            schema.gameReports.id,
            doppie.map((r) => r.id),
          ),
        );
    await tx
      .update(schema.gameReports)
      .set({ gameId: survivor.id })
      .where(eq(schema.gameReports.gameId, absorbed.id));

    // Prima di cancellare: nessun utente deve avere ancora l'assorbito, o la
    // cascata se lo porterebbe via. Se succede la transazione si annulla.
    const [rimasti] = await tx
      .select({ n: count() })
      .from(schema.backlog)
      .where(eq(schema.backlog.gameId, absorbed.id));
    if ((rimasti?.n ?? 0) > 0)
      throw new Error(
        `Fusione annullata: ${rimasti!.n} righe di backlog sono rimaste su ${absorbed.id}`,
      );

    // Punteggi, fonti, attributi e giochi legati dell'assorbito cadono con lui:
    // quelli del sopravvissuto restano, e l'enrichment li riscrive.
    await tx.delete(schema.games).where(eq(schema.games.id, absorbed.id));

    // Sono arrivati id nuovi: lo stesso evento dell'enrichment e dell'import.
    const sources = [...new Set(spostati.map((row) => row.source))];
    await reopenSourcesForNewExternalIds(
      sources.map((source) => ({ gameId: survivor.id, source })),
      tx,
    );

    return {
      status: 'ok' as const,
      survivor: toRef(survivor),
      absorbed: toRef(absorbed),
      movedUsers: piano.moved.length,
      mergedUsers: piano.both.length,
    };
  });

  // Fuori dalla transazione: il job legge dal database, e la fusione deve già
  // essere visibile.
  if (esito.status === 'ok' && esito.survivor.igdbId !== null)
    await enqueueEnrichment('igdb', esito.survivor.id);
  return esito;
}
