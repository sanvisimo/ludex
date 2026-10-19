import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';

import {
  enqueueFileImport,
  type FileJobEntry,
  isImportRunning,
} from '../queue/imports';
import { type CsvRow, parseCsvFile } from './csv-file';
import { isPcStore } from './library-import';

/** La sorgente IGDB degli appid Steam, per l'indizio dei `Collegamenti`. */
const IGDB_STEAM_SOURCE = 1;

/** L'id esterno degli account interni dell'import da CSV: uno per negozio. */
export const CSV_ACCOUNT_ID = 'csv';

export type CsvImportReport = {
  /** I negozi accodati, con quante righe. */
  queued: { store: Store; entries: number }[];
  /** Negozi con un import da CSV già in corso: le loro righe non sono accodate. */
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
 * L'import da CSV (10): un account interno per negozio, e un import per
 * account. **Non è una libreria**: questi account non compaiono fra le
 * librerie, non si aggiornano da soli e non si scollegano; esistono perché
 * ogni import di Ludex ne vuole uno — tengono gli scarti, il salto dei
 * doppioni e l'adozione da parte di un collegamento vero
 * (`store_accounts.from_file`).
 *
 * Uno per negozio e non uno solo, perché `importLibrary` lavora su un negozio
 * per volta — fonte di `external_ids`, piattaforma, scarti — e a fine corsa
 * pota gli scarti che non ha visto: con più negozi sullo stesso account ogni
 * negozio cancellerebbe quelli degli altri.
 *
 * `tag` è il tag che prendono i giochi **che entrano nel backlog** con questo
 * file: «Importato il 19/10/2026», scritto dal client nella lingua di chi
 * carica. Chi c'era già non lo prende, come lo stato e le categorie.
 *
 * Il file si legge qui, nella richiesta, e un errore di formato torna subito
 * all'utente; la risoluzione su IGDB, che dura minuti, la fa il worker.
 */
export async function importCsvFile(
  userId: string,
  testo: string,
  tag: string,
): Promise<CsvImportReport> {
  const rows = parseCsvFile(testo);
  const slugByName = await platformSlugsByName();

  const report: CsvImportReport = {
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
    // `Platforms` dice dove il gioco esiste, non dove ce l'hai.
    let platformSlug: string | null = null;
    if (!isPcStore(store)) {
      const slug =
        row.platforms.length === 1
          ? slugByName.get(row.platforms[0]!.toLowerCase())
          : undefined;
      if (!slug) {
        report.noPlatform++;
        continue;
      }
      platformSlug = slug;
    }

    const entry = toEntry(row, platformSlug);
    const voci = perStore.get(store) ?? new Map<string, FileJobEntry>();
    // Lo stesso id due volte nello stesso negozio è la stessa voce.
    if (!voci.has(entry.externalId)) voci.set(entry.externalId, entry);
    perStore.set(store, voci);
  }

  for (const [store, voci] of perStore) {
    const account = await upsertCsvAccount(userId, store);
    if (await isImportRunning(account.id)) {
      report.alreadyRunning.push(store);
      continue;
    }
    const entries = [...voci.values()];
    await enqueueFileImport(store, {
      storeAccountId: account.id,
      entries,
      tag,
    });
    report.queued.push({ store, entries: entries.length });
  }

  return report;
}

/**
 * L'id esterno della voce: quello del negozio, o il nome.
 *
 * Il nome vale per chi scrive il file a mano e l'id Ubisoft di un gioco non lo
 * sa. Col prefisso, perché finisce in `external_ids` come gli altri e non deve
 * poter coincidere con un id vero del negozio; minuscolo e senza spazi doppi,
 * perché «Assassin's Creed» scritto due volte in due file sia la stessa voce.
 */
function externalIdOf(row: CsvRow) {
  return (
    row.gameId ?? `name:${row.name.trim().toLowerCase().replace(/\s+/g, ' ')}`
  );
}

function toEntry(row: CsvRow, platformSlug: string | null): FileJobEntry {
  return {
    externalId: externalIdOf(row),
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

/**
 * Le piattaforme per nome: quelli di Playnite sono quelli della tabella
 * `platforms`, che viene da lì; anche lo slug, per chi scrive a mano.
 */
async function platformSlugsByName() {
  const rows = await db
    .select({ slug: schema.platforms.slug, name: schema.platforms.name })
    .from(schema.platforms);
  return new Map(
    rows.flatMap((row) => [
      [row.name.toLowerCase(), row.slug],
      [row.slug, row.slug],
    ]),
  );
}

/** L'account interno di un negozio: creato la prima volta, ritrovato dopo. */
async function upsertCsvAccount(userId: string, store: Store) {
  const [row] = await db
    .insert(schema.storeAccounts)
    .values({
      userId,
      store,
      externalAccountId: CSV_ACCOUNT_ID,
      // È come gli scarti di questo account si leggono in «Da sistemare»:
      // «Ubisoft Connect · CSV».
      displayName: 'CSV',
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

/**
 * A che punto è l'import da CSV dell'utente, per il riquadro in Librerie:
 * quando è finito l'ultimo (null = mai) e se ce n'è uno in corso, su un
 * negozio qualunque.
 */
export async function csvImportStatus(userId: string) {
  const accounts = await db
    .select({
      id: schema.storeAccounts.id,
      lastSyncAt: schema.storeAccounts.lastSyncAt,
    })
    .from(schema.storeAccounts)
    .where(
      and(
        eq(schema.storeAccounts.userId, userId),
        eq(schema.storeAccounts.fromFile, true),
      ),
    );

  let syncing = false;
  for (const account of accounts) {
    if (await isImportRunning(account.id)) syncing = true;
  }
  const ultimi = accounts.flatMap((account) =>
    account.lastSyncAt ? [account.lastSyncAt.getTime()] : [],
  );

  return {
    lastImportAt: ultimi.length > 0 ? new Date(Math.max(...ultimi)) : null,
    syncing,
  };
}
