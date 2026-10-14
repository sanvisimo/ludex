import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq, inArray, sql } from '@repo/db/orm';

import { igdbPlatformsOfCopy } from './copy-platforms';

/**
 * I nomi delle piattaforme IGDB che la tabella `platforms` non ha: è presa da
 * Playnite, che i telefoni e il browser non li emula. Sono le più frequenti
 * fra le smentite (_Monument Valley 2+_ solo iOS); le altre restano col numero.
 */
const FUORI_TABELLA: Record<number, string> = {
  34: 'Android',
  39: 'iOS',
  55: 'Mobile',
  82: 'Web browser',
};

/**
 * Le copie su una piattaforma dove IGDB dice che il gioco non è uscito (9b PSN).
 *
 * È l'ultima spiaggia: l'import per nome queste copie non le scrive più (la
 * regola 3 in `resolveByName`), ma restano i collegamenti fatti da IGDB per id
 * — Steam, GOG, i dischi PSN — e quelli scritti prima della regola. Una copia
 * PS5 sull'_Harry Potter_ del 2001, che su PS5 non c'è, è un collegamento
 * sbagliato; l'admin apre il gioco e lo corregge con «Non è questo gioco», e la
 * riga sparisce da sola. Quando invece è IGDB che non ha la piattaforma, «va
 * bene così» la toglie per sempre.
 *
 * Calcolata a ogni richiesta, non tenuta in una tabella: le piattaforme valide
 * per una copia le dice `igdbPlatformsOfCopy`, la stessa funzione della regola
 * 3, e passarle a Postgres come tabella di valori evita di scriverle due volte.
 * Solo le copie dei negozi: quella aggiunta a mano è una dichiarazione
 * dell'utente, non un collegamento.
 */
export async function listPlatformMismatches(input: {
  dismissed: boolean;
  limit: number;
  offset: number;
}) {
  const piattaforme = await db.select().from(schema.platforms);
  const slugByIgdbId = new Map(
    piattaforme.flatMap((p) => (p.igdbId ? [[p.igdbId, p.slug] as const] : [])),
  );
  const nomeBySlug = new Map(piattaforme.map((p) => [p.slug, p.name]));
  const nomeByIgdbId = new Map(
    piattaforme.flatMap((p) => (p.igdbId ? [[p.igdbId, p.name] as const] : [])),
  );

  const valide = sql.join(
    piattaforme.map((p) => {
      const ids = [...igdbPlatformsOfCopy(p.slug, slugByIgdbId)];
      return sql`(${p.slug}, ${`{${ids.join(',')}}`}::int[])`;
    }),
    sql`, `,
  );

  const rows = await db.execute<{
    gameId: string;
    name: string;
    slug: string;
    releaseYear: number | null;
    platformIgdbIds: number[];
    copies: { store: Store; platformSlug: string }[];
    users: number;
    total: number;
  }>(sql`
    with valide(slug, ids) as (values ${valide}),
    fuori as (
      select b.game_id, b.user_id, o.store, o.platform_slug
      from ownerships o
      join backlog b on b.id = o.backlog_id
      join games g on g.id = b.game_id
      join valide v on v.slug = o.platform_slug
      where o.store is not null
        and cardinality(g.platform_igdb_ids) > 0
        and not (g.platform_igdb_ids && v.ids)
        and ${input.dismissed ? sql`` : sql`not`} exists (
          select 1 from platform_mismatch_dismissals d
          where d.game_id = b.game_id and d.platform_slug = o.platform_slug
        )
    ),
    gruppi as (
      select game_id,
        jsonb_agg(distinct jsonb_build_object(
          'store', store, 'platformSlug', platform_slug
        )) as copies,
        count(distinct user_id)::int as users
      from fuori
      group by game_id
    )
    select g.id as "gameId", g.name, g.slug,
      extract(year from g.first_release_date)::int as "releaseYear",
      g.platform_igdb_ids as "platformIgdbIds",
      gr.copies, gr.users,
      count(*) over ()::int as total
    from gruppi gr
    join games g on g.id = gr.game_id
    order by gr.users desc, g.name
    limit ${input.limit} offset ${input.offset}
  `);

  return {
    rows: rows.map((row) => ({
      gameId: row.gameId,
      name: row.name,
      slug: row.slug,
      releaseYear: row.releaseYear,
      users: row.users,
      copies: row.copies
        .map((copia) => ({
          store: copia.store,
          platformSlug: copia.platformSlug,
          platformName:
            nomeBySlug.get(copia.platformSlug) ?? copia.platformSlug,
        }))
        .sort((a, b) =>
          `${a.store}${a.platformSlug}`.localeCompare(
            `${b.store}${b.platformSlug}`,
          ),
        ),
      // Le piattaforme che IGDB gli dà, coi nostri nomi. Un id che la nostra
      // tabella non conosce si mostra com'è: è comunque un «no».
      igdbPlatforms: row.platformIgdbIds.map(
        (id) => nomeByIgdbId.get(id) ?? FUORI_TABELLA[id] ?? `IGDB ${id}`,
      ),
    })),
    total: rows[0]?.total ?? 0,
  };
}

/** «Va bene così»: quel gioco su quelle piattaforme non torna in lista. */
export async function dismissPlatformMismatch(
  gameId: string,
  platformSlugs: string[],
  adminId: string,
) {
  if (platformSlugs.length === 0) return;
  await db
    .insert(schema.platformMismatchDismissals)
    .values(
      platformSlugs.map((platformSlug) => ({
        gameId,
        platformSlug,
        dismissedBy: adminId,
      })),
    )
    .onConflictDoNothing();
}

/** Annulla il «va bene così»: se la copia è ancora lì, torna in lista. */
export async function restorePlatformMismatch(
  gameId: string,
  platformSlugs: string[],
) {
  if (platformSlugs.length === 0) return;
  await db
    .delete(schema.platformMismatchDismissals)
    .where(
      and(
        eq(schema.platformMismatchDismissals.gameId, gameId),
        inArray(schema.platformMismatchDismissals.platformSlug, platformSlugs),
      ),
    );
}
