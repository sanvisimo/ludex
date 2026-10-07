import { randomBytes } from 'node:crypto';

import type { PlaylistQuery } from '@repo/contracts';
import { BacklogQuerySchema, PlaylistQuerySchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, asc, eq, inArray, isNull, sql } from '@repo/db/orm';

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
  shareToken: schema.playlists.shareToken,
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
    .orderBy(
      asc(schema.playlists.position),
      asc(sql`lower(${schema.playlists.name})`),
      asc(schema.playlists.id),
    );
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
      .values({
        userId,
        name: input.name,
        query: input.query,
        // In fondo: una più dell'ultima. Letta qui nella stessa INSERT e non in
        // una query prima, che due salvataggi insieme leggerebbero uguale.
        position: sql`(select coalesce(max(${schema.playlists.position}), -1) + 1 from ${schema.playlists} where ${schema.playlists.userId} = ${userId})`,
      })
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

/**
 * Sposta una playlist di un posto. `false` se non esiste o non è sua.
 *
 * Le posizioni si riscrivono **per tutte**, da 0 e senza buchi, invece di
 * scambiarne due: dopo una cancellazione i numeri hanno dei buchi, e a pari
 * posizione — le playlist nate prima del riordino, o due salvate insieme —
 * "scambiare" non avrebbe un senso. Sono poche, e in una transazione.
 */
export async function movePlaylist(
  userId: string,
  id: string,
  direction: 'up' | 'down',
) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: schema.playlists.id, position: schema.playlists.position })
      .from(schema.playlists)
      .where(eq(schema.playlists.userId, userId))
      .orderBy(
        asc(schema.playlists.position),
        asc(sql`lower(${schema.playlists.name})`),
        asc(schema.playlists.id),
      )
      // Due spostamenti insieme si mettono in fila invece di leggere lo stesso
      // ordine e scriversi addosso.
      .for('update');

    const from = rows.findIndex((row) => row.id === id);
    if (from === -1) return false;

    const to = direction === 'up' ? from - 1 : from + 1;
    const ordered = rows.map((row) => row.id);
    if (to >= 0 && to < ordered.length) {
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved!);
    }

    for (const [position, playlistId] of ordered.entries()) {
      if (rows.find((row) => row.id === playlistId)!.position === position)
        continue;
      await tx
        .update(schema.playlists)
        .set({ position })
        .where(eq(schema.playlists.id, playlistId));
    }
    return true;
  });
}

/**
 * Il link pubblico di una playlist (step 15d): quello che c'è, o uno nuovo.
 * `undefined` se non esiste o non è sua.
 *
 * Chiamarla due volte dà lo stesso link. L'aggiornamento scrive solo dove il
 * link è ancora nullo, così due richieste insieme non se lo sovrascrivono: la
 * seconda rilegge quello della prima.
 */
export async function sharePlaylist(userId: string, id: string) {
  const mine = and(
    eq(schema.playlists.id, id),
    eq(schema.playlists.userId, userId),
  );
  const read = async () => {
    const [row] = await db
      .select({ shareToken: schema.playlists.shareToken })
      .from(schema.playlists)
      .where(mine);
    return row;
  };

  const current = await read();
  if (!current) return undefined;
  if (current.shareToken) return current.shareToken;

  // 128 bit: non si indovina, ed è l'unica cosa che protegge la pagina.
  const token = randomBytes(16).toString('base64url');
  const [written] = await db
    .update(schema.playlists)
    .set({ shareToken: token })
    .where(and(mine, isNull(schema.playlists.shareToken)))
    .returning({ shareToken: schema.playlists.shareToken });
  return written?.shareToken ?? (await read())?.shareToken ?? undefined;
}

/** Toglie il link: smette di funzionare subito. `false` se non è sua. */
export async function unsharePlaylist(userId: string, id: string) {
  const [row] = await db
    .update(schema.playlists)
    .set({ shareToken: null })
    .where(
      and(eq(schema.playlists.id, id), eq(schema.playlists.userId, userId)),
    )
    .returning({ id: schema.playlists.id });
  return row !== undefined;
}
