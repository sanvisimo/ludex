import type { BacklogStatus, Store } from "@repo/contracts/vocabulary";

import { chunk } from "../lib/chunk";
import { db, schema } from "@repo/db";
import { and, desc, eq, inArray, sql } from "@repo/db/orm";

// Forma di BacklogEntrySchema: la riga, il gioco, i possessi.
const entryQuery = {
  columns: { id: true, status: true, createdAt: true },
  with: {
    game: {
      columns: {
        id: true,
        igdbId: true,
        name: true,
        coverImageId: true,
        firstReleaseDate: true,
        createdAt: true,
      },
    },
    ownerships: {
      columns: {
        id: true,
        platformSlug: true,
        store: true,
        playtimeMinutes: true,
        lastPlayedAt: true,
      },
    },
  },
} as const;

export type OwnershipInput = { platformSlug: string; store?: Store | null };

// Quante righe per INSERT. Postgres regge 65535 parametri per istruzione: con
// una libreria da qualche migliaio di giochi un colpo solo li sfonderebbe.
const WRITE_CHUNK = 500;

/** Tutte le query partono dallo userId: è la JOIN backlog → games. */
export function listBacklog(userId: string) {
  return db.query.backlog.findMany({
    ...entryQuery,
    where: eq(schema.backlog.userId, userId),
    orderBy: desc(schema.backlog.createdAt),
  });
}

export function findEntryById(userId: string, id: string) {
  return db.query.backlog.findFirst({
    ...entryQuery,
    // Sempre in AND con lo userId: senza, un id indovinato leggerebbe la riga
    // di un altro utente.
    where: and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)),
  });
}

export function findEntryByGame(userId: string, gameId: string) {
  return db.query.backlog.findFirst({
    ...entryQuery,
    where: and(eq(schema.backlog.userId, userId), eq(schema.backlog.gameId, gameId)),
  });
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
