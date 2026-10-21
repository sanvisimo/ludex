import { db, schema } from '@repo/db';
import { and, eq, inArray, isNotNull, isNull } from '@repo/db/orm';

import { findGameIdsByExternalIds } from './games';
import { type LibraryEntry, platformOf } from './library-import';
import { hasPersonalData } from './personal-data';
import type { StoreAccountRow } from './store-accounts';

/** Cosa ha fatto la potatura: vedi `pruneSubscriptionCopies`. */
export type SubscriptionPruneReport = {
  /** Copie uscite e tolte. */
  removed: number;
  /** Copie uscite ma rimaste, «non più tue», perché la riga ha dati dell'utente. */
  kept: number;
};

const chiave = (gameId: string, platformSlug: string) =>
  `${gameId}|${platformSlug}`;

/**
 * Le copie che il negozio ha appena elencato, come `gioco|piattaforma`: ciò che
 * `pruneSubscriptionCopies` deve tenere.
 *
 * Si legge **dopo** `importLibrary`, che è ciò che ha scritto le mappature dei
 * giochi appena nati. Per gioco e piattaforma e non per gioco soltanto: su Xbox
 * lo stesso gioco è una copia per console, e la console tolta dalle spunte è una
 * copia che il negozio non elenca più.
 */
export async function listedCopies(
  account: StoreAccountRow,
  entries: LibraryEntry[],
) {
  const gameIds = await findGameIdsByExternalIds(
    account.store,
    entries.map((entry) => entry.externalId),
  );
  return new Set(
    entries.flatMap((entry) => {
      const gameId = gameIds.get(entry.externalId);
      return gameId ? [chiave(gameId, platformOf(account.store, entry))] : [];
    }),
  );
}

/**
 * Il giro intero, dopo `importLibrary`: le copie da abbonamento che `entries`
 * non elenca più escono. Per PSN, EA e Xbox; Steam chiama i due pezzi da sé,
 * perché il resoconto della famiglia li vuole.
 */
export async function pruneUnlistedSubscriptionCopies(
  account: StoreAccountRow,
  entries: LibraryEntry[],
) {
  const report = await pruneSubscriptionCopies(
    account,
    await listedCopies(account, entries),
  );
  if (report.removed > 0 || report.kept > 0) {
    console.log(
      `[import] ${account.store}: ${report.removed} copie da abbonamento uscite e tolte` +
        (report.kept > 0
          ? `, ${report.kept} rimaste «non più tue» perché hanno dati tuoi`
          : ''),
    );
  }
  return report;
}

/**
 * Toglie le copie da abbonamento che il negozio non elenca più (step 14).
 *
 * È l'import successivo ad accorgersi che l'abbonamento è finito: una copia con
 * `subscription` di questo account che non sta in `keep` è uscita — il Plus è
 * scaduto, il Game Pass tolto dalle spunte, il parente ha lasciato la famiglia.
 * Il destino lo decide ciò che c'è sopra:
 *
 * - **c'è un'altra copia ancora tua** dello stesso gioco (comprato su GOG,
 *   inserito a mano, un disco): esce solo questa;
 * - **non ce ne sono e la riga non ha niente dell'utente**: esce la copia e
 *   anche la riga di backlog, che era solo il riflesso dell'abbonamento;
 * - **non ce ne sono e la riga ha dati dell'utente** (voto, note, tag, stato):
 *   **la copia resta**, marcata in `subscription_ended_at`. Una riga di
 *   backlog senza possessi non è uno stato legittimo, e il voto non sparisce
 *   perché è finito un abbonamento.
 *
 * «Ancora tua» vuol dire non marcata: due copie uscite dello stesso gioco non
 * si tengono in vita a vicenda. E le copie già marcate tornano a ogni giro, così
 * una riga a cui l'utente ha tolto i dati se ne va al primo import dopo; la data
 * della marca resta quella del primo import che non le ha viste.
 *
 * Una riga di `games` non si tocca mai. Scritta in modo che un fallimento non
 * possa potare per errore: la chiama solo chi ha letto la libreria **per
 * intero**. Una rete che cade non è un'uscita.
 */
export async function pruneSubscriptionCopies(
  account: StoreAccountRow,
  keep: Set<string>,
): Promise<SubscriptionPruneReport> {
  return db.transaction(async (tx) => {
    const copie = await tx
      .select({
        id: schema.ownerships.id,
        backlogId: schema.ownerships.backlogId,
        gameId: schema.backlog.gameId,
        platformSlug: schema.ownerships.platformSlug,
        personale: hasPersonalData,
      })
      .from(schema.ownerships)
      .innerJoin(
        schema.backlog,
        eq(schema.backlog.id, schema.ownerships.backlogId),
      )
      .where(
        and(
          eq(schema.ownerships.storeAccountId, account.id),
          isNotNull(schema.ownerships.subscription),
        ),
      );

    const uscite = copie.filter(
      (copia) => !keep.has(chiave(copia.gameId, copia.platformSlug)),
    );
    if (uscite.length === 0) return { removed: 0, kept: 0 };

    const backlogIds = [...new Set(uscite.map((copia) => copia.backlogId))];
    const tutte = await tx
      .select({
        id: schema.ownerships.id,
        backlogId: schema.ownerships.backlogId,
        endedAt: schema.ownerships.subscriptionEndedAt,
      })
      .from(schema.ownerships)
      .where(inArray(schema.ownerships.backlogId, backlogIds));

    const idUscite = new Set(uscite.map((copia) => copia.id));
    const daTogliere: string[] = [];
    const daMarcare: string[] = [];
    const righeOrfane: string[] = [];

    for (const backlogId of backlogIds) {
      const dellaRiga = uscite.filter((copia) => copia.backlogId === backlogId);
      const restano = tutte.filter(
        (copia) =>
          copia.backlogId === backlogId &&
          !idUscite.has(copia.id) &&
          copia.endedAt === null,
      ).length;

      if (restano > 0) {
        daTogliere.push(...dellaRiga.map((copia) => copia.id));
      } else if (!dellaRiga[0]!.personale) {
        righeOrfane.push(backlogId);
      } else {
        daMarcare.push(...dellaRiga.map((copia) => copia.id));
      }
    }

    if (daTogliere.length > 0) {
      await tx
        .delete(schema.ownerships)
        .where(inArray(schema.ownerships.id, daTogliere));
    }
    // Con la riga se ne vanno tutte le sue copie, per la cascade: anche quelle
    // già marcate di un altro account, che senza la riga non hanno senso.
    let orfane = 0;
    if (righeOrfane.length > 0) {
      orfane = uscite.filter((copia) =>
        righeOrfane.includes(copia.backlogId),
      ).length;
      await tx
        .delete(schema.backlog)
        .where(
          and(
            eq(schema.backlog.userId, account.userId),
            inArray(schema.backlog.id, righeOrfane),
          ),
        );
    }
    if (daMarcare.length > 0) {
      await tx
        .update(schema.ownerships)
        .set({ subscriptionEndedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            inArray(schema.ownerships.id, daMarcare),
            isNull(schema.ownerships.subscriptionEndedAt),
          ),
        );
    }

    return { removed: daTogliere.length + orfane, kept: daMarcare.length };
  });
}
