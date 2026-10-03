import type { HomeBand } from '@repo/contracts';
import type { GameType } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from '@repo/db/orm';

import { haUnaFine } from './backlog-search';
import { cardScoreExtras, gameColumns } from './games';
import { cardScoreSql } from './scores';

/**
 * La home (12e): il catalogo a fasce, **uguale per tutti**. Chi guarda cambia
 * soltanto lo stato sulle card dei giochi che ha; i suoi nascosti ci sono,
 * perché nascondere è una preferenza della sua lista, non del catalogo.
 *
 * Ogni fascia è una query che sceglie gli id, tutta in SQL — tipo, durata,
 * voto, genere sono filtri hard — e poi un'idratazione sola per tutte, con la
 * forma delle card. Stesso schema in due fasi di `backlog-search.ts`.
 */

export const BAND_SIZE = 20;

/** «Meglio votati»: sotto, la fascia la apre un gioco con due recensioni a 95. */
export const MIN_REVIEWS = 10;

/** I bordi delle durate, in minuti: brevi fino a 10 h, medi fino a 35. */
export const SHORT_MAX = 10 * 60;
export const MEDIUM_MAX = 35 * 60;

/** Le fasce per genere del giorno, scelte fra quelli che le riempiono. */
export const GENRES_PER_DAY = 3;
export const MIN_GAMES_PER_GENRE = BAND_SIZE;

/**
 * I tipi che sono giochi da giocare: un DLC, un pacchetto, un aggiornamento
 * no. Un elenco di ciò che entra e non di ciò che resta fuori, perché un tipo
 * che IGDB aggiungesse domani arriva come nullo (vedi `gameTypeValues`), e
 * nullo vuol dire «non lo sappiamo».
 */
const PLAYABLE_TYPES: GameType[] = [
  'main_game',
  'standalone_expansion',
  'remake',
  'remaster',
  'expanded_game',
  'port',
  'fork',
];

const giocabile = inArray(schema.games.gameType, PLAYABLE_TYPES);

/**
 * L'estrazione del giorno: un ordinamento su un hash dell'id e della data.
 * Deterministico nel giorno, uguale per tutti, diverso domani, e senza una
 * tabella né un job che la rifaccia a mezzanotte.
 */
function sorteggio(id: AnyColumn, day: string) {
  return sql`md5(${id}::text || ${day})`;
}

async function pick(where: SQL | undefined, orderBy: SQL[]) {
  const rows = await db
    .select({ id: schema.games.id })
    .from(schema.games)
    .where(where)
    .orderBy(...orderBy)
    .limit(BAND_SIZE);
  return rows.map((row) => row.id);
}

/** I generi del giorno: fra quelli con abbastanza giochi da riempire la fascia. */
async function genresOfTheDay(day: string) {
  const giochi = db
    .select({ n: sql`count(*)` })
    .from(schema.gameAttributes)
    .innerJoin(schema.games, eq(schema.games.id, schema.gameAttributes.gameId))
    .where(
      and(
        eq(schema.gameAttributes.attributeId, schema.igdbAttributes.id),
        giocabile,
      ),
    );

  return db
    .select({ id: schema.igdbAttributes.id, name: schema.igdbAttributes.name })
    .from(schema.igdbAttributes)
    .where(
      and(
        eq(schema.igdbAttributes.kind, 'genre'),
        gte(sql`(${giochi})`, MIN_GAMES_PER_GENRE),
      ),
    )
    .orderBy(sorteggio(schema.igdbAttributes.id, day))
    .limit(GENRES_PER_DAY);
}

/** Il giorno dell'estrazione, in UTC: lo stesso per tutti, ovunque siano. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function listHomeBands(
  viewerId: string | null,
  day: string = today(),
): Promise<HomeBand[]> {
  const durata = schema.games.hltbMainMinutes;
  const ruota = sorteggio(schema.games.id, day);
  const genres = await genresOfTheDay(day);

  const bands: {
    kind: HomeBand['kind'];
    genre: HomeBand['genre'];
    ids: Promise<string[]>;
  }[] = [
    {
      kind: 'latest',
      genre: null,
      // L'unica fascia dove entra un gioco senza tipo: è appena arrivato, e
      // l'enrichment non ci è ancora passato.
      ids: pick(or(isNull(schema.games.gameType), giocabile), [
        desc(schema.games.createdAt),
        desc(schema.games.id),
      ]),
    },
    {
      kind: 'topRated',
      genre: null,
      // Ordina sul voto che la card mostra, non su `criticScore`: una fascia
      // ordinata su OpenCritic con le card senza numero non si capirebbe.
      ids: pick(
        and(
          giocabile,
          gte(
            sql`${cardScoreSql(schema.games.id, 'reviewCount')}`,
            MIN_REVIEWS,
          ),
        ),
        [
          sql`${cardScoreSql(schema.games.id, 'score')} desc`,
          desc(schema.games.id),
        ],
      ),
    },
    {
      kind: 'short',
      genre: null,
      ids: pick(and(giocabile, haUnaFine, lte(durata, SHORT_MAX)), [ruota]),
    },
    {
      kind: 'medium',
      genre: null,
      ids: pick(
        and(
          giocabile,
          haUnaFine,
          gt(durata, SHORT_MAX),
          lte(durata, MEDIUM_MAX),
        ),
        [ruota],
      ),
    },
    {
      kind: 'long',
      genre: null,
      ids: pick(and(giocabile, haUnaFine, gt(durata, MEDIUM_MAX)), [ruota]),
    },
    ...genres.map((genre) => ({
      kind: 'genre' as const,
      genre,
      ids: pick(
        and(
          giocabile,
          sql`exists (${db
            .select({ uno: sql`1` })
            .from(schema.gameAttributes)
            .where(
              and(
                eq(schema.gameAttributes.gameId, schema.games.id),
                eq(schema.gameAttributes.attributeId, genre.id),
              ),
            )})`,
        ),
        [ruota],
      ),
    })),
  ];

  const idsPerBand = await Promise.all(bands.map((band) => band.ids));
  const all = [...new Set(idsPerBand.flat())];
  if (all.length === 0) return [];

  const [games, owned] = await Promise.all([
    db.query.games.findMany({
      columns: gameColumns,
      extras: cardScoreExtras,
      where: inArray(schema.games.id, all),
    }),
    viewerId
      ? db
          .select({
            gameId: schema.backlog.gameId,
            status: schema.backlog.status,
          })
          .from(schema.backlog)
          .where(
            and(
              eq(schema.backlog.userId, viewerId),
              inArray(schema.backlog.gameId, all),
            ),
          )
      : Promise.resolve([]),
  ]);

  const byId = new Map(games.map((game) => [game.id, game]));
  const statusById = new Map(owned.map((row) => [row.gameId, row.status]));

  return bands
    .map((band, index) => ({
      kind: band.kind,
      genre: band.genre,
      // `IN` non conserva l'ordine: lo rimette quello della fascia.
      games: idsPerBand[index]!.flatMap((id) => {
        const game = byId.get(id);
        return game ? [{ ...game, status: statusById.get(id) ?? null }] : [];
      }),
    }))
    .filter((band) => band.games.length > 0);
}
