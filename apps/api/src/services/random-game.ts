import type { RandomFilter } from '@repo/contracts';
import { PlaylistQuerySchema, RandomFilterSchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, eq, inArray, ne, sql } from '@repo/db/orm';
import type { SQL } from '@repo/db/orm';

import { buildConditions } from './backlog-search';
import { findGameIdBySlug } from './games';
import { PLAYABLE_TYPES } from './home';
import { existingTags } from './playlists';

/**
 * Il dado (15c): un gioco a caso, e dalla sua scheda il successivo.
 *
 * Da loggati i candidati sono le righe del backlog dentro il filtro di
 * `/backlog` — `buildConditions`, la stessa della lista, quindi «pesca da ciò
 * che vedi» —, da anonimi il catalogo coi tipi giocabili della home: un DLC
 * non risponde a «cosa gioco».
 *
 * Con `playlistId` si pesca dalla playlist, sempre da ciò che la sua pagina
 * mostra: una a filtro col suo filtro salvato (senza i tag cancellati, come
 * `openPlaylist`), una scelta a mano dai suoi giochi, anche quelli fuori dal
 * backlog. Una playlist che non è di chi guarda non ha candidati.
 *
 * **Il mazzo.** I candidati si ordinano per `md5(seme || id)`: un
 * mescolamento che dipende solo dal seme, ricalcolato uguale a ogni tiro, come
 * la rotazione della home. Senza `after` si prende il primo; con `after` il
 * primo che nel mazzo gli viene dopo, e in fondo si ricomincia dall'inizio.
 * Così il giro passa per tutti i giochi del filtro prima di ripeterne uno,
 * senza niente salvato sul server.
 *
 * `after` fa da segnalibro col suo hash, non con una posizione: se il gioco è
 * uscito dal filtro (segnato «in corso» mentre si pescava fra i «da giocare»)
 * l'hash si calcola lo stesso, e il successivo resta quello giusto. Un
 * `offset` salterebbe un gioco.
 *
 * Rende lo slug, o `null` se non c'è niente da pescare oltre `after`.
 */
export async function pickRandomGame(input: {
  viewerId: string | null;
  filter: RandomFilter;
  playlistId?: string;
  seed: string;
  after?: string;
}) {
  const seed = sql`${input.seed}::text`;
  const mazzo = sql`md5(${seed} || ${schema.games.id}::text)`;

  // Uno slug che non esiste più (fuso, 11b) non è un errore: si riparte dal
  // primo del mazzo.
  const afterId = input.after ? await findGameIdBySlug(input.after) : null;

  const ordine: SQL[] = afterId
    ? // `false` prima di `true`: prima chi viene dopo il segnalibro, poi da capo.
      [sql`${mazzo} <= md5(${seed} || ${afterId}::text)`, mazzo]
    : [mazzo];
  const nonQuesto = afterId ? ne(schema.games.id, afterId) : undefined;

  if (!input.viewerId) {
    const [row] = await db
      .select({ slug: schema.games.slug })
      .from(schema.games)
      .where(and(inArray(schema.games.gameType, PLAYABLE_TYPES), nonQuesto))
      .orderBy(...ordine)
      .limit(1);
    return row?.slug ?? null;
  }

  let filter = input.filter;
  if (input.playlistId) {
    const [playlist] = await db
      .select({ kind: schema.playlists.kind, query: schema.playlists.query })
      .from(schema.playlists)
      .where(
        and(
          eq(schema.playlists.id, input.playlistId),
          eq(schema.playlists.userId, input.viewerId),
          inArray(schema.playlists.kind, ['filter', 'curated']),
        ),
      );
    if (!playlist) return null;

    if (playlist.kind === 'curated') {
      const [row] = await db
        .select({ slug: schema.games.slug })
        .from(schema.wishlistItems)
        .innerJoin(
          schema.games,
          eq(schema.games.id, schema.wishlistItems.gameId),
        )
        .where(
          and(eq(schema.wishlistItems.listId, input.playlistId), nonQuesto),
        )
        .orderBy(...ordine)
        .limit(1);
      return row?.slug ?? null;
    }

    const saved = PlaylistQuerySchema.parse(playlist.query);
    const tags = await existingTags(input.viewerId, saved.tags ?? []);
    filter = RandomFilterSchema.parse({
      ...saved,
      tags: tags.length > 0 ? tags : undefined,
    });
  }

  const [row] = await db
    .select({ slug: schema.games.slug })
    .from(schema.backlog)
    .innerJoin(schema.games, eq(schema.games.id, schema.backlog.gameId))
    .where(and(...buildConditions(input.viewerId, filter), nonQuesto))
    .orderBy(...ordine)
    .limit(1);
  return row?.slug ?? null;
}
