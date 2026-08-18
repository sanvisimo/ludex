import type { BacklogStatus, Store } from "@repo/contracts/vocabulary";
import { db, schema } from "@repo/db";
import { and, desc, eq } from "@repo/db/orm";

// Forma di BacklogEntrySchema: la riga, il gioco, i possessi.
const entryQuery = {
  columns: { id: true, status: true, createdAt: true },
  with: {
    game: { columns: { id: true, igdbId: true, name: true, createdAt: true } },
    ownerships: { columns: { id: true, platformSlug: true, store: true } },
  },
} as const;

export type OwnershipInput = { platformSlug: string; store?: Store | null };

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
