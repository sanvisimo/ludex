import type { PlaylistQuery } from '@repo/contracts';
import { BacklogQuerySchema, PlaylistQuerySchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, asc, eq, inArray, sql } from '@repo/db/orm';

import { isUniqueViolation } from '../lib/pg-error';
import { searchBacklog } from './backlog-search';

/**
 * Le playlist (step 15a): filtri del backlog salvati con un nome.
 *
 * Ogni funzione parte dallo `userId`, come per i tag: una playlist è di chi
 * l'ha scritta, e un id altrui si comporta come un id inesistente.
 */

const NAME_INDEX = 'playlists_user_name_idx';

const columns = {
  id: schema.playlists.id,
  name: schema.playlists.name,
  query: schema.playlists.query,
  createdAt: schema.playlists.createdAt,
  updatedAt: schema.playlists.updatedAt,
};

// Passa da Zod a ogni lettura: una playlist salvata prima di un campo nuovo
// riceve il suo default, e un campo che non esiste più viene scartato invece
// di arrivare al client.
function read<T extends { query: PlaylistQuery }>(row: T): T {
  return { ...row, query: PlaylistQuerySchema.parse(row.query) };
}

export async function listPlaylists(userId: string) {
  const rows = await db
    .select(columns)
    .from(schema.playlists)
    .where(eq(schema.playlists.userId, userId))
    .orderBy(asc(sql`lower(${schema.playlists.name})`));
  return rows.map(read);
}

/** `null` se l'utente ha già una playlist con quel nome, maiuscole a parte. */
export async function createPlaylist(
  userId: string,
  input: { name: string; query: PlaylistQuery },
) {
  try {
    const [row] = await db
      .insert(schema.playlists)
      .values({ userId, name: input.name, query: input.query })
      .returning(columns);
    return read(row!);
  } catch (error) {
    if (isUniqueViolation(error, NAME_INDEX)) return null;
    throw error;
  }
}

/** `undefined` se non esiste (o non è sua), `null` se il nome è già preso. */
export async function updatePlaylist(
  userId: string,
  input: { id: string; name?: string; query?: PlaylistQuery },
) {
  try {
    const [row] = await db
      .update(schema.playlists)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.query !== undefined && { query: input.query }),
      })
      .where(
        and(
          eq(schema.playlists.id, input.id),
          eq(schema.playlists.userId, userId),
        ),
      )
      .returning(columns);
    return row && read(row);
  } catch (error) {
    if (isUniqueViolation(error, NAME_INDEX)) return null;
    throw error;
  }
}

export async function deletePlaylist(userId: string, id: string) {
  const [row] = await db
    .delete(schema.playlists)
    .where(
      and(eq(schema.playlists.id, id), eq(schema.playlists.userId, userId)),
    )
    .returning({ id: schema.playlists.id });
  return row;
}

/**
 * Apre una playlist: esegue la query salvata, con la pagina chiesta.
 *
 * I tag stanno nella query per id, e un id può non valere più: il tag è stato
 * tolto dal vocabolario. Un tag mancante **si ignora**: lasciarlo nella query
 * darebbe una playlist sempre vuota, perché i tag sono in AND. Il numero di
 * quelli ignorati torna al chiamante, che deve dirlo: senza, la lista mostra più
 * giochi del previsto e nessuno sa perché.
 *
 * `q`, `sort` e `direction` sono la vista di chi guarda: coprono quelli salvati
 * e **non toccano la playlist**. Una `q` chiesta sostituisce quella salvata.
 */
export async function openPlaylist(
  userId: string,
  input: {
    id: string;
    limit: number;
    offset: number;
    q?: string;
    sort?: PlaylistQuery['sort'];
    direction?: PlaylistQuery['direction'];
  },
) {
  const [row] = await db
    .select(columns)
    .from(schema.playlists)
    .where(
      and(
        eq(schema.playlists.id, input.id),
        eq(schema.playlists.userId, userId),
      ),
    );
  if (!row) return undefined;

  const playlist = read(row);
  const saved = playlist.query.tags ?? [];

  // Filtrati per utente: l'id di un tag altrui vale come un id cancellato.
  const existing = saved.length
    ? await db
        .select({ id: schema.userTags.id })
        .from(schema.userTags)
        .where(
          and(
            eq(schema.userTags.userId, userId),
            inArray(schema.userTags.id, saved),
          ),
        )
    : [];
  const present = new Set(existing.map((tag) => tag.id));
  const tags = saved.filter((id) => present.has(id));

  const result = await searchBacklog(
    userId,
    BacklogQuerySchema.parse({
      ...playlist.query,
      tags: tags.length > 0 ? tags : undefined,
      // La vista di chi apre copre i criteri salvati, per questa apertura
      // soltanto: la playlist restituita è sempre quella salvata.
      ...(input.q !== undefined && { q: input.q }),
      ...(input.sort !== undefined && { sort: input.sort }),
      ...(input.direction !== undefined && { direction: input.direction }),
      limit: input.limit,
      offset: input.offset,
    }),
  );

  return { ...playlist, ...result, missingTags: saved.length - tags.length };
}
