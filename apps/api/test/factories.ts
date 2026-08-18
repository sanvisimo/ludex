import type { IgdbGameMetadata } from "../src/external/igdb";
import { db, schema } from "@repo/db";

// Fixture minime: scrivono la riga e restituiscono l'id. Niente builder
// generalizzati — quando serviranno più campi si allargano queste.

let counter = 0;
const unique = () => ++counter;

export async function createUser() {
  const n = unique();
  const [row] = await db
    .insert(schema.user)
    .values({ id: `user-${n}`, name: `Utente ${n}`, email: `utente${n}@esempio.test` })
    .returning({ id: schema.user.id });
  return row!.id;
}

export async function createGame(values: { igdbId?: number | null; name?: string } = {}) {
  const n = unique();
  const [row] = await db
    .insert(schema.games)
    .values({
      name: values.name ?? `Gioco ${n}`,
      // `undefined` vuol dire "dammene uno qualunque", `null` vuol dire
      // "non risolto": sono due casi diversi e i test usano entrambi.
      igdbId: values.igdbId === undefined ? 100_000 + n : values.igdbId,
    })
    .returning({ id: schema.games.id, igdbId: schema.games.igdbId });
  return row!;
}

/** Scrive a mano lo stato di una fonte, per costruire i casi della spazzata. */
export function setSource(values: {
  gameId: string;
  status: "pending" | "ok" | "failed" | "not_found";
  syncedAt?: Date | null;
  attemptedAt?: Date | null;
}) {
  return db.insert(schema.gameSources).values({
    gameId: values.gameId,
    source: "igdb",
    status: values.status,
    syncedAt: values.syncedAt ?? null,
    attemptedAt: values.attemptedAt ?? null,
  });
}

/** Metadati IGDB completi di default, così ogni test dichiara solo ciò che conta. */
export function igdbMetadata(over: Partial<IgdbGameMetadata> = {}): IgdbGameMetadata {
  return {
    igdbId: 100_001,
    name: "Nome da IGDB",
    summary: null,
    firstReleaseDate: null,
    coverImageId: null,
    coverWidth: null,
    coverHeight: null,
    aggregatedRating: null,
    aggregatedRatingCount: null,
    attributes: [],
    ...over,
  };
}

export const ago = {
  hours: (n: number) => new Date(Date.now() - n * 3_600_000),
  days: (n: number) => new Date(Date.now() - n * 86_400_000),
};
