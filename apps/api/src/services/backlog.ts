import type { UserTag, UserTagInput } from "@repo/contracts";
import type { BacklogStatus, Store } from "@repo/contracts/vocabulary";

import { chunk } from "../lib/chunk";
import { gameColumns } from "./games";
import { ensureUserTags } from "./tags";
import { db, schema } from "@repo/db";
import { and, desc, eq, inArray, sql } from "@repo/db/orm";

// Forma di BacklogEntrySchema: la riga, il gioco, i possessi, i tag.
const entryQuery = {
  columns: { id: true, status: true, rating: true, notes: true, createdAt: true },
  with: {
    game: { columns: gameColumns },
    ownerships: {
      columns: {
        id: true,
        platformSlug: true,
        store: true,
        playtimeMinutes: true,
        lastPlayedAt: true,
      },
    },
    tags: {
      columns: {},
      with: { tag: { columns: { id: true, kind: true, name: true } } },
    },
  },
} as const;

/**
 * Appiattisce la tabella di raccordo dei tag.
 *
 * La query relazionale rende `tags: [{ tag: {...} }]`, il contratto vuole
 * `tags: [{...}]`. Passa da qui **ogni** funzione che restituisce una riga di
 * backlog, così la forma è una sola e nessun chiamante deve ricordarsene.
 */
function toEntry<T extends { tags: { tag: UserTag }[] }>(entry: T) {
  const { tags, ...rest } = entry;
  return { ...rest, tags: tags.map((row) => row.tag) };
}

export type OwnershipInput = { platformSlug: string; store?: Store | null };

// Quante righe per INSERT. Postgres regge 65535 parametri per istruzione: con
// una libreria da qualche migliaio di giochi un colpo solo li sfonderebbe.
const WRITE_CHUNK = 500;

/** Tutte le query partono dallo userId: è la JOIN backlog → games. */
export async function listBacklog(userId: string) {
  const rows = await db.query.backlog.findMany({
    ...entryQuery,
    where: eq(schema.backlog.userId, userId),
    orderBy: desc(schema.backlog.createdAt),
  });
  return rows.map(toEntry);
}

export async function findEntryById(userId: string, id: string) {
  const row = await db.query.backlog.findFirst({
    ...entryQuery,
    // Sempre in AND con lo userId: senza, un id indovinato leggerebbe la riga
    // di un altro utente.
    where: and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)),
  });
  return row ? toEntry(row) : undefined;
}

export async function findEntryByGame(userId: string, gameId: string) {
  const row = await db.query.backlog.findFirst({
    ...entryQuery,
    where: and(eq(schema.backlog.userId, userId), eq(schema.backlog.gameId, gameId)),
  });
  return row ? toEntry(row) : undefined;
}

/**
 * Crea la riga di backlog e i suoi possessi in transazione: una riga senza
 * piattaforma sarebbe invisibile al filtro hard, quindi o si scrive tutto o niente.
 */
export async function addToBacklog(input: {
  userId: string;
  gameId: string;
  status: BacklogStatus;
  ownerships: OwnershipInput[];
}) {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(schema.backlog)
      .values({ userId: input.userId, gameId: input.gameId, status: input.status })
      .returning({ id: schema.backlog.id });

    if (!entry) throw new Error("insert su backlog non ha restituito la riga");

    await tx.insert(schema.ownerships).values(
      input.ownerships.map((ownership) => ({
        backlogId: entry.id,
        platformSlug: ownership.platformSlug,
        store: ownership.store ?? null,
      })),
    );

    return entry.id;
  });
}

export async function setBacklogStatus(userId: string, id: string, status: BacklogStatus) {
  const [row] = await db
    .update(schema.backlog)
    .set({ status })
    .where(and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)))
    .returning({ id: schema.backlog.id });
  return row;
}

/**
 * I campi personali dello step 5, in una sola scrittura.
 *
 * Due proprietà da leggere insieme:
 *
 * - **assente ≠ null**. `undefined` vuol dire "non toccare", `null` vuol dire
 *   "togli". Senza la distinzione un form che manda solo il voto cancellerebbe
 *   le note, e un `set` costruito a partire dalle chiavi presenti è l'unico modo
 *   di rispettarla.
 * - **i tag si riscrivono in blocco**, come fa l'enrichment con gli attributi
 *   IGDB: si cancella il raccordo e si riscrive. È ciò che rende la mutazione
 *   idempotente e gestisce da solo i tag tolti, senza un endpoint apposta.
 *
 * Restituisce `null` se la riga non è dell'utente: la proprietà si verifica qui,
 * prima di toccare i tag, perché la scrittura sul raccordo passa dal `backlogId`
 * e non avrebbe più modo di sapere di chi è.
 */
export async function updateBacklogEntry(
  userId: string,
  input: {
    id: string;
    status?: BacklogStatus;
    rating?: number | null;
    notes?: string | null;
    tags?: UserTagInput[];
  },
) {
  const owned = await db.query.backlog.findFirst({
    columns: { id: true },
    where: and(eq(schema.backlog.id, input.id), eq(schema.backlog.userId, userId)),
  });
  if (!owned) return null;

  // I tag si risolvono **fuori** dalla transazione e sempre partendo dallo
  // userId: è qui che si impedisce a un utente di attaccarsi il tag di un altro.
  // Un id arrivato dal client non basterebbe, perché non dice di chi è.
  const tagIds =
    input.tags === undefined
      ? null
      : (await ensureUserTags(userId, input.tags)).map((tag) => tag.id);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.backlog)
      .set({
        // `updatedAt` c'è sempre, e non solo per correttezza: senza, una
        // modifica dei soli tag lascerebbe `set` vuoto e Drizzle rifiuterebbe
        // la query.
        updatedAt: new Date(),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        // Il campo svuotato dalla UI arriva come stringa vuota: vale "nessuna
        // nota", non "una nota vuota".
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      })
      .where(eq(schema.backlog.id, input.id));

    if (tagIds === null) return;

    await tx.delete(schema.backlogTags).where(eq(schema.backlogTags.backlogId, input.id));

    if (tagIds.length > 0) {
      await tx
        .insert(schema.backlogTags)
        .values(tagIds.map((tagId) => ({ backlogId: input.id, tagId })));
    }
  });

  return owned;
}

/**
 * Aggiunge una piattaforma a un gioco già nel backlog.
 *
 * Non riscrive niente da sé: appoggia su `ensureOwnerships`, la stessa scrittura
 * idempotente che usa l'import Steam. Riaggiungere un possesso che c'è già non è
 * un errore e non duplica la riga — è il vincolo `(backlog, piattaforma, store)`
 * con `NULLS NOT DISTINCT` a garantirlo — e il COALESCE lascia intatte le ore
 * che l'import aveva scritto.
 */
export async function addOwnershipToEntry(
  userId: string,
  id: string,
  ownership: OwnershipInput,
) {
  const owned = await db.query.backlog.findFirst({
    columns: { id: true },
    // I possessi si raggiungono dal `backlogId`, che da solo non dice di chi è
    // la riga: la proprietà va verificata prima di scrivere.
    where: and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)),
  });
  if (!owned) return null;

  await ensureOwnerships([
    { backlogId: id, platformSlug: ownership.platformSlug, store: ownership.store ?? null },
  ]);

  return owned;
}

export async function removeFromBacklog(userId: string, id: string) {
  const [row] = await db
    .delete(schema.backlog)
    .where(and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)))
    .returning({ id: schema.backlog.id });
  return row;
}

/**
 * Crea le righe di backlog che mancano, in un colpo solo.
 *
 * **Non tocca lo stato di quelle che ci sono già.** È la regola che rende un
 * import innocuo su una libreria curata a mano: se hai messo Hollow Knight su
 * Switch come `playing`, l'import di Steam aggiunge il possesso e ti lascia lo
 * stato dov'era.
 *
 * Restituisce la mappa gameId → backlogId per *tutte* le righe chieste, e
 * l'insieme di quelle appena create — che al chiamante serve per il resoconto.
 */
export async function ensureBacklogEntries(
  userId: string,
  gameIds: string[],
): Promise<{ byGameId: Map<string, string>; created: Set<string> }> {
  const byGameId = new Map<string, string>();
  const created = new Set<string>();
  if (gameIds.length === 0) return { byGameId, created };

  // Lo stesso gioco può arrivare due volte dalla stessa libreria: su Steam due
  // appid diversi possono puntare allo stesso gioco IGDB. Senza questa riga
  // l'INSERT proporrebbe due volte la stessa coppia (utente, gioco).
  const unique = [...new Set(gameIds)];

  for (const page of chunk(unique, WRITE_CHUNK)) {
    const inserted = await db
      .insert(schema.backlog)
      .values(page.map((gameId) => ({ userId, gameId })))
      .onConflictDoNothing({
        target: [schema.backlog.userId, schema.backlog.gameId],
      })
      .returning({ id: schema.backlog.id, gameId: schema.backlog.gameId });

    for (const row of inserted) {
      byGameId.set(row.gameId, row.id);
      created.add(row.gameId);
    }

    // Le righe che c'erano già non tornano dal RETURNING: si rileggono.
    const mancanti = page.filter((gameId) => !byGameId.has(gameId));
    if (mancanti.length === 0) continue;

    const esistenti = await db
      .select({ id: schema.backlog.id, gameId: schema.backlog.gameId })
      .from(schema.backlog)
      .where(
        and(eq(schema.backlog.userId, userId), inArray(schema.backlog.gameId, mancanti)),
      );

    for (const row of esistenti) byGameId.set(row.gameId, row.id);
  }

  return { byGameId, created };
}

/**
 * Fonde le righe che finirebbero sullo stesso possesso.
 *
 * Non è prudenza: su Steam due appid diversi possono puntare allo stesso gioco
 * IGDB (445 giochi distinti per 447 appid su una libreria vera), e allora la
 * chiave `(backlog, piattaforma, store)` è la stessa per entrambe. Postgres
 * rifiuta una ON CONFLICT DO UPDATE che tocchi la stessa riga due volte nello
 * stesso comando, quindi vanno fuse **prima** di scrivere.
 *
 * Le ore si sommano: sono due voci di libreria dello stesso gioco, e il tempo
 * speso è la somma dei due. L'ultima partita è la più recente delle due.
 */
function fondiDoppioni(rows: OwnershipUpsert[]) {
  const perChiave = new Map<string, OwnershipUpsert>();

  for (const row of rows) {
    const chiave = `${row.backlogId}|${row.platformSlug}|${row.store ?? ""}`;
    const gia = perChiave.get(chiave);

    if (!gia) {
      perChiave.set(chiave, row);
      continue;
    }

    perChiave.set(chiave, {
      ...gia,
      playtimeMinutes:
        gia.playtimeMinutes == null && row.playtimeMinutes == null
          ? null
          : (gia.playtimeMinutes ?? 0) + (row.playtimeMinutes ?? 0),
      lastPlayedAt:
        [gia.lastPlayedAt, row.lastPlayedAt]
          .filter((date): date is Date => date instanceof Date)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    });
  }

  return [...perChiave.values()];
}

export type OwnershipUpsert = {
  backlogId: string;
  platformSlug: string;
  store?: Store | null;
  playtimeMinutes?: number | null;
  lastPlayedAt?: Date | null;
};

/**
 * Scrive i possessi che mancano e aggiorna il tempo di gioco di quelli che ci sono.
 *
 * Idempotente per costruzione: la chiave è `(backlog, piattaforma, store)`, e il
 * vincolo è `NULLS NOT DISTINCT` — senza, "PC / nessuno store" si potrebbe
 * inserire due volte perché in Postgres i NULL sono tutti diversi fra loro.
 *
 * Sul conflitto aggiorna **solo** le ore, e solo se il chiamante le ha portate:
 * un inserimento manuale non deve azzerare il tempo di gioco che l'import aveva
 * scritto.
 */
export async function ensureOwnerships(rows: OwnershipUpsert[]) {
  if (rows.length === 0) return { created: 0 };

  let created = 0;

  for (const page of chunk(fondiDoppioni(rows), WRITE_CHUNK)) {
    const inserted = await db
      .insert(schema.ownerships)
      .values(
        page.map((row) => ({
          backlogId: row.backlogId,
          platformSlug: row.platformSlug,
          store: row.store ?? null,
          playtimeMinutes: row.playtimeMinutes ?? null,
          lastPlayedAt: row.lastPlayedAt ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [
          schema.ownerships.backlogId,
          schema.ownerships.platformSlug,
          schema.ownerships.store,
        ],
        set: {
          // COALESCE e non assegnazione secca: se questa scrittura non porta le
          // ore, restano quelle che c'erano.
          playtimeMinutes: sql`coalesce(excluded.playtime_minutes, ${schema.ownerships.playtimeMinutes})`,
          lastPlayedAt: sql`coalesce(excluded.last_played_at, ${schema.ownerships.lastPlayedAt})`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.ownerships.id, createdAt: schema.ownerships.createdAt });

    created += inserted.length;
  }

  // Con DO UPDATE il RETURNING rende anche le righe aggiornate, quindi questo
  // conta le scritture, non le creazioni. Chi vuole il numero esatto dei nuovi
  // possessi lo ricava dai backlog creati, che è l'unico dato che serve nel
  // resoconto.
  return { created };
}
