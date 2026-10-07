import type { SharedPlaylist } from '@repo/contracts';
import {
  BacklogQuerySchema,
  backlogStatusValues,
  GameSchema,
  PlaylistQuerySchema,
} from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, eq, inArray } from '@repo/db/orm';

import { searchBacklog } from './backlog-search';

/**
 * Una playlist vista da chi ha il link (step 15d).
 *
 * **Sono giochi del proprietario, quindi la regola è: esce il gioco, mai
 * niente di suo.** Quello che esce è il nome della playlist, i giochi come li
 * mostra il catalogo, i filtri senza i tag, e lo stato di chi guarda. Il resto
 * — stato, voto, note, tag, possessi, date, e chi è il proprietario — non arriva
 * nemmeno a questa funzione: si legge dal backlog solo ciò che serve a
 * scegliere i giochi, e si riduce a `Game` prima di restituire.
 *
 * La query gira **come il proprietario** e a ogni apertura (la playlist è
 * dinamica), con due condizioni che nessun filtro salvato può togliere: né i
 * giochi nascosti né quelli «non mi interessa». Sono giudizi suoi.
 *
 * `undefined` se il link non c'è: sconosciuto e revocato sono la stessa cosa,
 * o si potrebbe capire che un link è esistito.
 */
export async function openSharedPlaylist(
  input: { token: string; limit: number; offset: number },
  viewerId: string | null,
): Promise<SharedPlaylist | undefined> {
  const [row] = await db
    .select({
      userId: schema.playlists.userId,
      name: schema.playlists.name,
      query: schema.playlists.query,
    })
    .from(schema.playlists)
    .where(eq(schema.playlists.shareToken, input.token));
  if (!row) return undefined;

  const { tags: saved = [], ...query } = PlaylistQuerySchema.parse(row.query);
  // Quanti tag il filtro del proprietario usa e chi apre non può avere: sono per
  // id e suoi. Serve a dirlo a chi riusa i filtri.
  const base = { name: row.name, query, droppedTags: saved.length };

  // Il filtro del proprietario lo applica lui: i suoi tag valgono, se esistono
  // ancora (un tag cancellato si ignora, come quando apre la playlist).
  const existing = saved.length
    ? await db
        .select({ id: schema.userTags.id })
        .from(schema.userTags)
        .where(
          and(
            eq(schema.userTags.userId, row.userId),
            inArray(schema.userTags.id, saved),
          ),
        )
    : [];
  const tags = existing.map((tag) => tag.id);

  // Mai `excluded`. Se il filtro salvato chiedeva solo quelli non resta niente,
  // e va detto subito: una lista di stati vuota la ricerca la leggerebbe come
  // «nessun filtro» e mostrerebbe tutto.
  const status = (query.status ?? backlogStatusValues).filter(
    (value) => value !== 'excluded',
  );
  if (status.length === 0) return { ...base, total: 0, games: [] };

  const { entries, total } = await searchBacklog(
    row.userId,
    BacklogQuerySchema.parse({
      ...query,
      tags: tags.length > 0 ? tags : undefined,
      status,
      limit: input.limit,
      offset: input.offset,
    }),
  );

  // Lo stato di chi guarda, non del proprietario: come nella home.
  const ids = entries.map((entry) => entry.game.id);
  const owned =
    viewerId && ids.length > 0
      ? await db
          .select({
            gameId: schema.backlog.gameId,
            status: schema.backlog.status,
          })
          .from(schema.backlog)
          .where(
            and(
              eq(schema.backlog.userId, viewerId),
              inArray(schema.backlog.gameId, ids),
            ),
          )
      : [];
  const viewerStatus = new Map(owned.map((o) => [o.gameId, o.status]));

  return {
    ...base,
    total,
    // `GameSchema.parse` e non un passaggio diretto: scarta qualunque campo che
    // un domani finisse sul gioco di una riga di backlog senza essere pubblico.
    games: entries.map((entry) => ({
      ...GameSchema.parse(entry.game),
      status: viewerStatus.get(entry.game.id) ?? null,
    })),
  };
}
