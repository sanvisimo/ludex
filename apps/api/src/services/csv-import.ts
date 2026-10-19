import type { BacklogStatus, Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq, inArray } from '@repo/db/orm';

import { chunk } from '../lib/chunk';
import {
  enqueueFileImport,
  type FileJobEntry,
  isImportRunning,
} from '../queue/imports';
import { type CsvRow, parseCsvFile } from './csv-file';
import { isPcStore } from './library-import';
import { ensureUserTags } from './tags';

/** La sorgente IGDB degli appid Steam, per l'indizio dei `Collegamenti`. */
const IGDB_STEAM_SOURCE = 1;

/** L'id esterno degli account interni dell'import da CSV: uno per negozio. */
export const CSV_ACCOUNT_ID = 'csv';

export type CsvImportReport = {
  /**
   * Il tag del file, già nel vocabolario: «Vedi i giochi nel backlog» filtra
   * per id, e i giochi lo prendono man mano che il worker li riconosce. Null
   * se non si è accodato niente.
   */
  tagId: string | null;
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
  /** Righe con lo stesso negozio e id di una riga prima: la stessa voce. */
  duplicates: number;
};

/** Perché una riga resta fuori, prima ancora di chiedere a IGDB. */
export type CsvSkipReason = 'no_store' | 'platform' | 'duplicate';

/**
 * Una riga del file e cosa ne farà l'import: la voce che accoderebbe, o il
 * perché la salta. Lo calcola `planCsvFile`, **l'unica strada** sia per
 * l'anteprima sia per l'import: l'anteprima mostra esattamente ciò che
 * l'import farà, e i numeri delle righe (`index`, la posizione nel file letto)
 * sono quelli con cui l'utente esclude.
 */
type PlannedRow = {
  index: number;
  row: CsvRow;
  platformSlug: string | null;
} & (
  | { store: Store; entry: FileJobEntry; skip: null }
  | { store: Store | null; entry: null; skip: CsvSkipReason }
);

async function planCsvFile(testo: string): Promise<PlannedRow[]> {
  const rows = parseCsvFile(testo);
  const slugByName = await platformSlugsByName();
  const viste = new Set<string>();

  return rows.map((row, index): PlannedRow => {
    const store = row.store;
    if (!store) {
      return {
        index,
        row,
        store,
        platformSlug: null,
        entry: null,
        skip: 'no_store',
      };
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
        return {
          index,
          row,
          store,
          platformSlug: null,
          entry: null,
          skip: 'platform',
        };
      }
      platformSlug = slug;
    }

    const entry = toEntry(row, platformSlug);
    // Lo stesso id due volte nello stesso negozio è la stessa voce: vale la
    // prima.
    const chiave = `${store}:${entry.externalId}`;
    if (viste.has(chiave)) {
      return {
        index,
        row,
        store,
        platformSlug,
        entry: null,
        skip: 'duplicate',
      };
    }
    viste.add(chiave);
    return { index, row, store, platformSlug, entry, skip: null };
  });
}

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
 * `exclude` sono le righe che l'utente ha tolto nell'anteprima, coi numeri
 * che lei gli ha dato (`previewCsvFile`).
 *
 * Il file si legge qui, nella richiesta, e un errore di formato torna subito
 * all'utente; la risoluzione su IGDB, che dura minuti, la fa il worker.
 */
export async function importCsvFile(
  userId: string,
  testo: string,
  tag: string,
  exclude: number[] = [],
): Promise<CsvImportReport> {
  const escluse = new Set(exclude);
  const report: CsvImportReport = {
    tagId: null,
    queued: [],
    alreadyRunning: [],
    noStore: {},
    noPlatform: 0,
    duplicates: 0,
  };

  const perStore = new Map<Store, FileJobEntry[]>();
  for (const planned of await planCsvFile(testo)) {
    if (planned.skip !== null) {
      if (planned.skip === 'no_store') {
        const source = planned.row.source || '—';
        report.noStore[source] = (report.noStore[source] ?? 0) + 1;
      } else if (planned.skip === 'platform') {
        report.noPlatform++;
      } else {
        report.duplicates++;
      }
      continue;
    }
    if (escluse.has(planned.index)) continue;
    perStore.set(planned.store, [
      ...(perStore.get(planned.store) ?? []),
      planned.entry,
    ]);
  }

  // Il tag si crea qui e non nel job, per poterlo già filtrare. Resta vuoto se
  // nessun gioco entra nel backlog: si cancella dal vocabolario come gli altri.
  if (perStore.size > 0) {
    const [saved] = await ensureUserTags(userId, [{ kind: 'tag', name: tag }]);
    report.tagId = saved?.id ?? null;
  }

  for (const [store, entries] of perStore) {
    const account = await upsertCsvAccount(userId, store);
    if (await isImportRunning(account.id)) {
      report.alreadyRunning.push(store);
      continue;
    }
    await enqueueFileImport(store, {
      storeAccountId: account.id,
      entries,
      tag,
    });
    report.queued.push({ store, entries: entries.length });
  }

  return report;
}

export type CsvPreviewRow = {
  index: number;
  name: string;
  source: string;
  store: Store | null;
  /** Il nome della piattaforma su cui finirebbe la copia. */
  platform: string | null;
  status: BacklogStatus;
  /**
   * `new`: il gioco lo conosciamo già per quell'id e non è nel backlog;
   * `in_backlog`: c'è già, entra solo la copia o le sue ore; `unknown`: lo
   * cercherà il worker su IGDB; `skipped`: resta fuori, col perché.
   */
  outcome: 'new' | 'in_backlog' | 'unknown' | 'skipped';
  skipReason: CsvSkipReason | null;
  game: { name: string; slug: string } | null;
};

/**
 * L'anteprima del file (10): cosa farebbe l'import, riga per riga, **senza
 * scrivere niente e senza IGDB**. Il gioco si sa solo per gli id già in
 * `external_ids` — da un import di un altro utente, o da IGDB che li ha
 * scritti arricchendo il gioco —; gli altri sono «da riconoscere», e li
 * cercherà il worker come sempre.
 */
export async function previewCsvFile(
  userId: string,
  testo: string,
): Promise<CsvPreviewRow[]> {
  const planned = await planCsvFile(testo);
  const nomePiattaforma = await platformNamesBySlug();

  // Il gioco di ogni voce che Ludex conosce già, negozio per negozio.
  const perStore = new Map<Store, string[]>();
  for (const { entry, store } of planned) {
    if (entry && store) {
      perStore.set(store, [...(perStore.get(store) ?? []), entry.externalId]);
    }
  }
  const giochi = new Map<string, { id: string; name: string; slug: string }>();
  for (const [store, externalIds] of perStore) {
    for (const page of chunk(externalIds, 1000)) {
      const rows = await db
        .select({
          externalId: schema.externalIds.externalId,
          id: schema.games.id,
          name: schema.games.name,
          slug: schema.games.slug,
        })
        .from(schema.externalIds)
        .innerJoin(schema.games, eq(schema.games.id, schema.externalIds.gameId))
        .where(
          and(
            eq(schema.externalIds.source, store),
            inArray(schema.externalIds.externalId, page),
          ),
        );
      for (const row of rows) giochi.set(`${store}:${row.externalId}`, row);
    }
  }

  const gameIds = [...new Set([...giochi.values()].map((game) => game.id))];
  const nelBacklog = new Set<string>();
  for (const page of chunk(gameIds, 1000)) {
    const rows = await db
      .select({ gameId: schema.backlog.gameId })
      .from(schema.backlog)
      .where(
        and(
          eq(schema.backlog.userId, userId),
          inArray(schema.backlog.gameId, page),
        ),
      );
    for (const row of rows) nelBacklog.add(row.gameId);
  }

  return planned.map(({ index, row, store, platformSlug, entry, skip }) => {
    const game =
      entry && store ? giochi.get(`${store}:${entry.externalId}`) : undefined;
    const slug =
      platformSlug ?? (store && isPcStore(store) ? 'pc_windows' : null);
    return {
      index,
      name: row.name,
      source: row.source,
      store,
      platform: slug ? (nomePiattaforma.get(slug) ?? slug) : null,
      status: row.status,
      outcome: skip
        ? 'skipped'
        : !game
          ? 'unknown'
          : nelBacklog.has(game.id)
            ? 'in_backlog'
            : 'new',
      skipReason: skip,
      game: game ? { name: game.name, slug: game.slug } : null,
    };
  });
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

/** Il nome di ogni piattaforma, per l'anteprima. */
async function platformNamesBySlug() {
  const rows = await db
    .select({ slug: schema.platforms.slug, name: schema.platforms.name })
    .from(schema.platforms);
  return new Map(rows.map((row) => [row.slug, row.name]));
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
