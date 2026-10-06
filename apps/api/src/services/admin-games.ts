import { storeAccountName } from '@repo/contracts';
import type { Medium, Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  sql,
} from '@repo/db/orm';

import { findIgdbGameById } from '../external/igdb';
import { enqueueEnrichment } from '../queue/enrichment';
import {
  advanceAddedAt,
  ensureBacklogEntries,
  ensureOwnerships,
} from './backlog';
import { reopenSourcesForNewExternalIds } from './enrichment';
import { findGameByIgdbId, resolveGameFromIgdb } from './games';
import { closeReports, listOpenReports } from './reports';

// La sezione Giochi dell'admin (11a, passo 6): i giochi senza id IGDB, la
// scheda admin di un gioco, e «Non è questo gioco» — ripuntare un collegamento
// sbagliato, il caso Toki.

/**
 * Quanti utenti hanno il gioco in backlog: dice quanto pesa sistemarlo.
 *
 * `games.id` scritto a mano e non `${schema.games.id}`: in una select su una
 * tabella sola Drizzle scrive la colonna senza tabella, `"id"`, e dentro la
 * sottoquery Postgres la legge come `b.id`. Contava sempre zero.
 */
const users = sql<number>`(
  select count(*)::int from backlog b where b.game_id = games.id
)`;

/** I giochi senza id IGDB: inseriti a mano e mai collegati. */
export async function listUnlinkedGames(input: {
  q?: string;
  limit: number;
  offset: number;
}) {
  const where = and(
    isNull(schema.games.igdbId),
    input.q ? ilike(schema.games.name, `%${input.q}%`) : undefined,
  );
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: schema.games.id,
        name: schema.games.name,
        slug: schema.games.slug,
        createdAt: schema.games.createdAt,
        users,
      })
      .from(schema.games)
      .where(where)
      .orderBy(sql`${users} desc`, asc(schema.games.name))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ n: count() }).from(schema.games).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

/**
 * «Collega a IGDB» per un gioco che non ce l'ha. Solo se l'id è libero: se è
 * già di un altro gioco, i due sono lo stesso gioco e vanno fusi, che è l'11b.
 */
export async function linkGameToIgdb(gameId: string, igdbId: number) {
  const game = await db.query.games.findFirst({
    columns: { id: true, igdbId: true },
    where: eq(schema.games.id, gameId),
  });
  if (!game) return { status: 'not_found' as const };
  if (game.igdbId !== null) return { status: 'already_linked' as const };

  const altro = await findGameByIgdbId(igdbId);
  if (altro) return { status: 'taken' as const, game: altro.name };

  if (!(await findIgdbGameById(igdbId)))
    return { status: 'unknown_igdb_id' as const };

  await db
    .update(schema.games)
    .set({ igdbId, updatedAt: new Date() })
    .where(eq(schema.games.id, gameId));
  // Da qui è un gioco come gli altri: l'enrichment IGDB porta nome, copertina
  // e il resto, e dietro di lui le altre fonti.
  await db
    .insert(schema.gameSources)
    .values({ gameId, source: 'igdb', status: 'pending' })
    .onConflictDoUpdate({
      target: [schema.gameSources.gameId, schema.gameSources.source],
      set: { status: 'pending', error: null, reason: null, attemptedAt: null },
    });
  await enqueueEnrichment('igdb', gameId);
  return { status: 'ok' as const };
}

/**
 * La scheda admin di un gioco (frame 5 del wireframe): i collegamenti dai
 * negozi, le fonti e le segnalazioni aperte, cioè tutto ciò che l'admin può
 * correggere su un gioco solo.
 */
export async function gameAdminDetail(slug: string) {
  const game = await db
    .select({
      id: schema.games.id,
      name: schema.games.name,
      slug: schema.games.slug,
      igdbId: schema.games.igdbId,
      firstReleaseDate: schema.games.firstReleaseDate,
      gameType: schema.games.gameType,
      coverImageId: schema.games.coverImageId,
      users,
    })
    .from(schema.games)
    .where(eq(schema.games.slug, slug))
    .then((rows) => rows[0]);
  if (!game) return null;

  // Le copie per negozio, non per id: le copie non sanno da quale id sono
  // nate. Due id dello stesso negozio mostrano gli stessi numeri, ed è vero.
  const copie = await db
    .select({
      store: schema.ownerships.store,
      users: sql<number>`count(distinct ${schema.backlog.userId})::int`,
      copies: sql<number>`count(*)::int`,
    })
    .from(schema.ownerships)
    .innerJoin(
      schema.backlog,
      eq(schema.backlog.id, schema.ownerships.backlogId),
    )
    .where(eq(schema.backlog.gameId, game.id))
    .groupBy(schema.ownerships.store);
  const copiePer = new Map(copie.map((row) => [row.store, row]));

  const links = await db
    .select({
      id: schema.externalIds.id,
      source: schema.externalIds.source,
      externalId: schema.externalIds.externalId,
    })
    .from(schema.externalIds)
    .where(eq(schema.externalIds.gameId, game.id))
    .orderBy(
      asc(schema.externalIds.source),
      asc(schema.externalIds.externalId),
    );

  const sources = await db
    .select({
      source: schema.gameSources.source,
      status: schema.gameSources.status,
      reason: schema.gameSources.reason,
      error: schema.gameSources.error,
      externalId: schema.gameSources.externalId,
      manual: schema.gameSources.manual,
      attemptedAt: schema.gameSources.attemptedAt,
    })
    .from(schema.gameSources)
    .where(
      and(
        eq(schema.gameSources.gameId, game.id),
        ne(schema.gameSources.source, 'steamgriddb'),
      ),
    )
    .orderBy(asc(schema.gameSources.source));

  const { rows: reports } = await listOpenReports({
    gameId: game.id,
    limit: 100,
    offset: 0,
  });

  return {
    game,
    links: links.map((link) => ({
      ...link,
      users: copiePer.get(link.source)?.users ?? 0,
      copies: copiePer.get(link.source)?.copies ?? 0,
    })),
    sources: sources.map((row) => ({
      ...row,
      source: row.source as 'igdb' | 'hltb' | 'opencritic' | 'metacritic',
    })),
    reports,
  };
}

/**
 * Cosa farebbe «Non è questo gioco», utente per utente. È la stessa funzione
 * per l'anteprima e per la conferma, così l'admin vede esattamente ciò che
 * succederà.
 *
 * Per ogni utente che ha, sul gioco sbagliato, copie di quel negozio:
 *
 * - **la riga intera** cambia gioco se non ha altre copie lì e non ha già il
 *   gioco giusto: stato, voto, note e tag li aveva dati al gioco che credeva di
 *   avere, ed è quello giusto;
 * - **solo le copie**, altrimenti. La riga sul gioco sbagliato resta: è roba
 *   dell'utente, e due righe dello stesso utente si fondono nell'11b.
 */
async function planRepoint(
  wrongGameId: string,
  store: Store,
  rightGameId: string | null,
) {
  const righe = await db
    .select({
      backlogId: schema.backlog.id,
      userId: schema.backlog.userId,
      userName: schema.user.name,
      ownershipId: schema.ownerships.id,
      ownershipStore: schema.ownerships.store,
      platformSlug: schema.ownerships.platformSlug,
      medium: schema.ownerships.medium,
      label: schema.storeAccounts.label,
      displayName: schema.storeAccounts.displayName,
      externalAccountId: schema.storeAccounts.externalAccountId,
    })
    .from(schema.backlog)
    .innerJoin(schema.user, eq(schema.user.id, schema.backlog.userId))
    .innerJoin(
      schema.ownerships,
      eq(schema.ownerships.backlogId, schema.backlog.id),
    )
    .leftJoin(
      schema.storeAccounts,
      eq(schema.storeAccounts.id, schema.ownerships.storeAccountId),
    )
    .where(eq(schema.backlog.gameId, wrongGameId))
    .orderBy(asc(schema.user.name));

  const giaGiusto = new Set(
    rightGameId === null
      ? []
      : (
          await db
            .select({ userId: schema.backlog.userId })
            .from(schema.backlog)
            .where(eq(schema.backlog.gameId, rightGameId))
        ).map((row) => row.userId),
  );

  const perRiga = new Map<
    string,
    {
      backlogId: string;
      userId: string;
      userName: string;
      copies: {
        ownershipId: string;
        platformSlug: string;
        medium: Medium | null;
        account: string | null;
      }[];
      altreCopie: boolean;
    }
  >();
  for (const riga of righe) {
    const voce = perRiga.get(riga.backlogId) ?? {
      backlogId: riga.backlogId,
      userId: riga.userId,
      userName: riga.userName,
      copies: [],
      altreCopie: false,
    };
    if (riga.ownershipStore === store) {
      voce.copies.push({
        ownershipId: riga.ownershipId,
        platformSlug: riga.platformSlug,
        medium: riga.medium,
        account: riga.externalAccountId
          ? storeAccountName({
              label: riga.label,
              displayName: riga.displayName,
              externalAccountId: riga.externalAccountId,
            })
          : null,
      });
    } else {
      voce.altreCopie = true;
    }
    perRiga.set(riga.backlogId, voce);
  }

  return [...perRiga.values()]
    .filter((voce) => voce.copies.length > 0)
    .map((voce) => ({
      backlogId: voce.backlogId,
      userId: voce.userId,
      userName: voce.userName,
      copies: voce.copies,
      wholeRow: !voce.altreCopie && !giaGiusto.has(voce.userId),
    }));
}

async function findLink(linkId: string) {
  const [link] = await db
    .select({
      id: schema.externalIds.id,
      gameId: schema.externalIds.gameId,
      source: schema.externalIds.source,
      externalId: schema.externalIds.externalId,
      gameName: schema.games.name,
    })
    .from(schema.externalIds)
    .innerJoin(schema.games, eq(schema.games.id, schema.externalIds.gameId))
    .where(eq(schema.externalIds.id, linkId));
  return link ?? null;
}

/**
 * L'anteprima di «Non è questo gioco»: non scrive niente, nemmeno il gioco
 * giusto se il catalogo non ce l'ha ancora — quello lo crea la conferma.
 */
export async function previewRepoint(linkId: string, igdbId: number) {
  const link = await findLink(linkId);
  if (!link) return { status: 'not_found' as const };

  const inCatalogo = await findGameByIgdbId(igdbId);
  const target = inCatalogo
    ? { id: inCatalogo.id, name: inCatalogo.name, inCatalog: true }
    : await findIgdbGameById(igdbId).then((hit) =>
        hit ? { id: null, name: hit.name, inCatalog: false } : null,
      );
  if (!target) return { status: 'unknown_igdb_id' as const };
  if (target.id === link.gameId) return { status: 'same_game' as const };

  // Gli altri id dello stesso negozio che puntano al gioco sbagliato: le copie
  // non sanno da quale sono nate, e si spostano tutte con il primo.
  const altriId = await db
    .select({
      id: schema.externalIds.id,
      externalId: schema.externalIds.externalId,
    })
    .from(schema.externalIds)
    .where(
      and(
        eq(schema.externalIds.gameId, link.gameId),
        eq(schema.externalIds.source, link.source),
        ne(schema.externalIds.id, link.id),
      ),
    );

  return {
    status: 'ok' as const,
    from: { id: link.gameId, name: link.gameName },
    to: target,
    link: { source: link.source, externalId: link.externalId },
    moves: (await planRepoint(link.gameId, link.source, target.id)).map(
      ({ userName, copies, wholeRow }) => ({
        userName,
        copies: copies.map((copy) => ({
          platformSlug: copy.platformSlug,
          medium: copy.medium,
          account: copy.account,
        })),
        wholeRow,
      }),
    ),
    otherIdsSameStore: altriId,
  };
}

/**
 * «Non è questo gioco»: la riga di `external_ids` punta al gioco giusto, e le
 * copie di quel negozio lo seguono, per ogni utente che le ha.
 *
 * L'ordine conta. Prima le copie, **poi** la riga: se qualcosa si rompe a
 * metà, la riga punta ancora al gioco sbagliato e ripetere il gesto riprende
 * da dove si era fermato. All'incontrario, la seconda volta direbbe «è già
 * giusto» e le copie rimaste resterebbero dove sono. Ripetuto a cose fatte non
 * cambia niente.
 */
export async function repointLink(
  adminId: string,
  linkId: string,
  igdbId: number,
) {
  const link = await findLink(linkId);
  if (!link) return { status: 'not_found' as const };

  const target = await resolveGameFromIgdb(igdbId);
  if (!target) return { status: 'unknown_igdb_id' as const };
  if (target.id === link.gameId)
    return { status: 'ok' as const, wholeRows: 0, copies: 0 };

  const piano = await planRepoint(link.gameId, link.source, target.id);
  let wholeRows = 0;
  let copies = 0;

  for (const voce of piano) {
    if (voce.wholeRow) {
      // La riga cambia gioco: tag, rifiuti, voto e note sono legati a lei e
      // la seguono da soli.
      await db
        .update(schema.backlog)
        .set({ gameId: target.id, updatedAt: new Date() })
        .where(eq(schema.backlog.id, voce.backlogId));
      wholeRows++;
      copies += voce.copies.length;
      continue;
    }

    const { byGameId } = await ensureBacklogEntries(voce.userId, [target.id]);
    const giusta = byGameId.get(target.id)!;
    const ids = voce.copies.map((copy) => copy.ownershipId);

    const daSpostare = await db
      .select()
      .from(schema.ownerships)
      .where(inArray(schema.ownerships.id, ids));
    // La stessa strada dell'import: fonde con una copia uguale che ci fosse
    // già, e rispetta i rifiuti del gioco giusto.
    await ensureOwnerships(
      daSpostare.map((copy) => ({
        backlogId: giusta,
        platformSlug: copy.platformSlug,
        store: copy.store,
        storeAccountId: copy.storeAccountId,
        playtimeMinutes: copy.playtimeMinutes,
        lastPlayedAt: copy.lastPlayedAt,
        acquiredAt: copy.acquiredAt,
        subscription: copy.subscription,
        medium: copy.medium,
        storePage: copy.storePage,
      })),
    );
    await db
      .delete(schema.ownerships)
      .where(inArray(schema.ownerships.id, ids));

    // I rifiuti di quel negozio seguono le copie: chi aveva tolto una copia
    // non deve ritrovarsela sul gioco giusto al prossimo import.
    const rifiuti = await db
      .select()
      .from(schema.ownershipRejections)
      .where(
        and(
          eq(schema.ownershipRejections.backlogId, voce.backlogId),
          eq(schema.ownershipRejections.store, link.source),
        ),
      );
    if (rifiuti.length > 0) {
      await db
        .insert(schema.ownershipRejections)
        .values(
          rifiuti.map((rifiuto) => ({
            backlogId: giusta,
            platformSlug: rifiuto.platformSlug,
            store: rifiuto.store,
            storeAccountId: rifiuto.storeAccountId,
            medium: rifiuto.medium,
          })),
        )
        .onConflictDoNothing();
      await db.delete(schema.ownershipRejections).where(
        inArray(
          schema.ownershipRejections.id,
          rifiuti.map((r) => r.id),
        ),
      );
    }

    await advanceAddedAt([giusta]);
    copies += voce.copies.length;
  }

  // Per ultima, la riga: vedi sopra.
  await db
    .update(schema.externalIds)
    .set({ gameId: target.id, updatedAt: new Date() })
    .where(eq(schema.externalIds.id, link.id));
  // Un id di negozio arrivato al gioco giusto è lo stesso evento di quando lo
  // porta IGDB: può riaprire HLTB e Metacritic.
  await reopenSourcesForNewExternalIds([
    { gameId: target.id, source: link.source },
  ]);

  await closeReports(link.gameId, { store: link.source }, adminId);

  return { status: 'ok' as const, wholeRows, copies };
}
