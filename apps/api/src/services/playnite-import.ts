import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';

import {
  enqueueFileImport,
  type FileJobEntry,
  isImportRunning,
} from '../queue/imports';
import { isPcStore } from './library-import';
import { parsePlayniteCsv, type PlayniteRow } from './playnite-csv';

/** La sorgente IGDB degli appid Steam, per l'indizio dei `Collegamenti`. */
const IGDB_STEAM_SOURCE = 1;

/** L'id esterno delle schede da file: uno per negozio e utente. */
export const PLAYNITE_ACCOUNT_ID = 'playnite';

export type PlayniteFileReport = {
  /** Le schede accodate, una per negozio, con quante voci. */
  queued: { store: Store; storeAccountId: string; entries: number }[];
  /** Negozi con un import della scheda già in corso: il file non è accodato. */
  alreadyRunning: Store[];
  /** Righe saltate perché la sorgente non è un negozio nostro, per sorgente. */
  noStore: Record<string, number>;
  /**
   * Righe di un negozio console senza **una** piattaforma che conosciamo:
   * le Xbox di Playnite ne elencano più d'una (One, Series, PC), che è dove il
   * gioco esiste e non dove ce l'hai. Restano fuori finché non si decide.
   */
  noPlatform: number;
};

/**
 * Il file di Playnite (10): una scheda per negozio, e un import per scheda.
 *
 * Una scheda e non una per tutto il file, perché `importLibrary` lavora su un
 * negozio solo — fonte di `external_ids`, piattaforma, scarti — e a fine corsa
 * pota gli scarti che non ha visto: con più negozi sulla stessa scheda ogni
 * negozio cancellerebbe quelli degli altri. Così un file con solo Ubisoft non
 * tocca la scheda EA caricata la settimana prima.
 *
 * Il file si legge qui, nella richiesta, e un errore di formato torna subito
 * all'utente; la risoluzione su IGDB, che dura minuti, la fa il worker.
 */
export async function importPlayniteFile(
  userId: string,
  testo: string,
): Promise<PlayniteFileReport> {
  const rows = parsePlayniteCsv(testo);
  const slugByName = await platformSlugsByName();

  const report: PlayniteFileReport = {
    queued: [],
    alreadyRunning: [],
    noStore: {},
    noPlatform: 0,
  };

  const perStore = new Map<Store, Map<string, FileJobEntry>>();
  for (const row of rows) {
    const store = row.store;
    if (!store) {
      const source = row.source || '—';
      report.noStore[source] = (report.noStore[source] ?? 0) + 1;
      continue;
    }

    // Sui negozi PC la piattaforma è quella del negozio, come per ogni import:
    // `Piattaforme` dice dove il gioco esiste, non dove ce l'hai.
    let platformSlug: string | null = null;
    if (!isPcStore(store)) {
      const slugs = row.platforms.flatMap((name) => {
        const slug = slugByName.get(name.toLowerCase());
        return slug ? [slug] : [];
      });
      if (slugs.length !== 1 || row.platforms.length !== 1) {
        report.noPlatform++;
        continue;
      }
      platformSlug = slugs[0]!;
    }

    const voci = perStore.get(store) ?? new Map<string, FileJobEntry>();
    // Lo stesso id due volte nello stesso negozio è la stessa voce.
    if (!voci.has(row.gameId)) voci.set(row.gameId, toEntry(row, platformSlug));
    perStore.set(store, voci);
  }

  for (const [store, voci] of perStore) {
    const account = await upsertFileAccount(userId, store);
    if (await isImportRunning(account.id)) {
      report.alreadyRunning.push(store);
      continue;
    }
    const entries = [...voci.values()];
    await enqueueFileImport(store, { storeAccountId: account.id, entries });
    report.queued.push({
      store,
      storeAccountId: account.id,
      entries: entries.length,
    });
  }

  return report;
}

function toEntry(row: PlayniteRow, platformSlug: string | null): FileJobEntry {
  return {
    externalId: row.gameId,
    name: row.name,
    releaseYear: row.releaseYear,
    retryWithoutYear: true,
    igdbHint: row.steamAppId
      ? { source: IGDB_STEAM_SOURCE, uid: row.steamAppId }
      : null,
    platformSlug,
    playtimeMinutes: row.playtimeMinutes,
    lastPlayedAt: row.lastPlayedAt?.toISOString() ?? null,
    status: row.status,
    categories: row.categories,
  };
}

/** I nomi di Playnite sono quelli della tabella `platforms`, che viene da lì. */
async function platformSlugsByName() {
  const rows = await db
    .select({ slug: schema.platforms.slug, name: schema.platforms.name })
    .from(schema.platforms);
  return new Map(rows.map((row) => [row.name.toLowerCase(), row.slug]));
}

/**
 * La scheda da file di un negozio: creata la prima volta, ritrovata dopo.
 * Una scheda scollegata tenendo i giochi torna `ok` ricaricando il file, come
 * un account ricollegato.
 */
async function upsertFileAccount(userId: string, store: Store) {
  const [row] = await db
    .insert(schema.storeAccounts)
    .values({
      userId,
      store,
      externalAccountId: PLAYNITE_ACCOUNT_ID,
      displayName: 'Playnite',
      fromFile: true,
      // Niente aggiornamento automatico: non c'è niente da cui riaggiornarsi.
      autoSync: false,
    })
    .onConflictDoUpdate({
      target: [
        schema.storeAccounts.userId,
        schema.storeAccounts.store,
        schema.storeAccounts.externalAccountId,
      ],
      set: { status: 'ok', updatedAt: new Date() },
    })
    .returning();
  return row!;
}
