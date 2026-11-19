import {
  adminMissingDefaultSort,
  type AdminMissingSort,
} from '@repo/contracts';
import type {
  EnrichmentSource,
  ManualSource,
  MissingBucket,
  SourceReason,
} from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from '@repo/db/orm';

import { searchHltbGames } from '../external/hltb';
import { searchMetacriticGames } from '../external/metacritic';
import {
  openCriticEnabled,
  openCriticQuota,
  OpenCriticQuotaError,
  searchOpenCriticGames,
} from '../external/opencritic';
import { enqueueEnrichment } from '../queue/enrichment';
import { adminOrderBy } from './admin-sort';
import { closeReports } from './reports';

/**
 * I gruppi della tabellina, una colonna ciascuno.
 *
 * - `pending`: in coda. Su OpenCritic è normale averne: il budget è di 200
 *   richieste al giorno.
 * - `fixable`: `not_found` che un umano può sistemare, cioè tutti tranne
 *   `too_old` e `absent`. Anche `no_results`: «non ha nulla» può essere un
 *   nome cercato male. E anche un motivo nullo, che vuol dire un testo che la
 *   migration non ha saputo classificare: meglio mostrarlo che perderlo.
 * - `fine`: `too_old`, o `absent` che ha scritto un admin. Va bene così.
 * - `empty`: trovato ma senza il dato. HLTB senza durata, OpenCritic e
 *   Metacritic senza voto. Spesso è vero — un gioco che nessuno ha cronometrato
 *   — ma è anche la faccia di un aggancio sbagliato.
 * - `failed`: l'ultimo tentativo è fallito per una ragione che può passare.
 *
 * I valori stanno in `missingBucketValues`, nel vocabolario dei contratti.
 */

const gs = schema.gameSources;

/** Il dato che dice «trovato ma vuoto», per fonte. IGDB non ce l'ha. */
const isEmpty = sql`(
  (${gs.source} = 'hltb' and ${schema.games.hltbMainMinutes} is null)
  or (${gs.source} in ('opencritic', 'metacritic') and not exists (
    select 1 from game_scores sc
    where sc.game_id = ${gs.gameId} and sc.source::text = ${gs.source}::text
  ))
)`;

const fineReasons: SourceReason[] = ['too_old', 'absent'];

function bucketCondition(bucket: MissingBucket): SQL {
  switch (bucket) {
    case 'pending':
      return eq(gs.status, 'pending');
    case 'failed':
      return eq(gs.status, 'failed');
    case 'fine':
      return and(
        eq(gs.status, 'not_found'),
        inArray(gs.reason, fineReasons),
      )!;
    case 'fixable':
      return and(
        eq(gs.status, 'not_found'),
        or(isNull(gs.reason), notInArray(gs.reason, fineReasons)),
      )!;
    case 'empty':
      return sql`${gs.status} = 'ok' and ${isEmpty}`;
  }
}

const users = sql<number>`(
  select count(*)::int from backlog b where b.game_id = ${gs.gameId}
)`;

export async function missingSummary() {
  const rows = await db
    .select({
      source: gs.source,
      pending: sql<number>`count(*) filter (where ${bucketCondition('pending')})::int`,
      pendingSince: sql<Date | null>`min(${gs.updatedAt}) filter (where ${bucketCondition('pending')})`,
      fixable: sql<number>`count(*) filter (where ${bucketCondition('fixable')})::int`,
      fine: sql<number>`count(*) filter (where ${bucketCondition('fine')})::int`,
      empty: sql<number>`count(*) filter (where ${bucketCondition('empty')})::int`,
      failed: sql<number>`count(*) filter (where ${bucketCondition('failed')})::int`,
    })
    .from(gs)
    .innerJoin(schema.games, eq(schema.games.id, gs.gameId))
    .where(sql`${gs.source} in ('igdb', 'hltb', 'opencritic', 'metacritic')`)
    .groupBy(gs.source);

  const [withoutIgdb] = await db
    .select({ n: count() })
    .from(schema.games)
    .where(isNull(schema.games.igdbId));

  const [unresolved] = await db
    .select({ n: count() })
    .from(schema.unresolvedImports)
    .where(isNull(schema.unresolvedImports.hiddenAt));

  return {
    sources: rows.map((row) => ({
      ...row,
      source: row.source as EnrichmentSource,
      pendingSince: row.pendingSince ? new Date(row.pendingSince) : null,
    })),
    gamesWithoutIgdb: withoutIgdb?.n ?? 0,
    unresolvedImports: unresolved?.n ?? 0,
  };
}

export async function listMissing(input: {
  source: EnrichmentSource;
  bucket: MissingBucket;
  reason?: SourceReason;
  q?: string;
  limit: number;
  offset: number;
  sorting?: AdminMissingSort;
}) {
  const where = and(
    eq(gs.source, input.source),
    bucketCondition(input.bucket),
    input.reason ? eq(gs.reason, input.reason) : undefined,
    input.q ? ilike(schema.games.name, `%${input.q}%`) : undefined,
  );
  const { sort, direction } = input.sorting ?? adminMissingDefaultSort;
  const columns = {
    game: sql`lower(${schema.games.name})`,
    reason: sql`coalesce(${gs.reason}::text, ${gs.status}::text)`,
    users,
  };

  const [rows, [total]] = await Promise.all([
    db
      .select({
        gameId: gs.gameId,
        name: schema.games.name,
        slug: schema.games.slug,
        coverImageId: schema.games.coverImageId,
        source: gs.source,
        status: gs.status,
        reason: gs.reason,
        error: gs.error,
        externalId: gs.externalId,
        manual: gs.manual,
        attemptedAt: gs.attemptedAt,
        users,
      })
      .from(gs)
      .innerJoin(schema.games, eq(schema.games.id, gs.gameId))
      .where(where)
      .orderBy(
        adminOrderBy(columns[sort], direction),
        asc(schema.games.name),
        asc(gs.gameId),
      )
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ n: count() })
      .from(gs)
      .innerJoin(schema.games, eq(schema.games.id, gs.gameId))
      .where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      source: row.source as EnrichmentSource,
    })),
    total: total?.n ?? 0,
  };
}

export async function retrySource(gameId: string, source: EnrichmentSource) {
  const [row] = await db
    .update(gs)
    .set({
      status: 'pending',
      error: null,
      reason: null,
      attemptedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(gs.gameId, gameId), eq(gs.source, source)))
    .returning({ gameId: gs.gameId });
  if (!row) return false;

  await enqueueEnrichment(source, gameId);
  return true;
}

/**
 * «Non c'è»: l'admin ha controllato, e sulla fonte il gioco non c'è. Solo su
 * un `not_found`: una fonte `ok` agganciata male ha già scritto i suoi dati
 * sul gioco, e quella si sistema con «Inserisci id».
 */
export async function markSourceAbsent(
  gameId: string,
  source: ManualSource,
  // L'admin che lo decide: chiude a suo nome le segnalazioni su quella fonte.
  resolvedBy: string | null = null,
) {
  const [row] = await db
    .update(gs)
    .set({ reason: 'absent', updatedAt: new Date() })
    .where(
      and(
        eq(gs.gameId, gameId),
        eq(gs.source, source),
        eq(gs.status, 'not_found'),
      ),
    )
    .returning({ gameId: gs.gameId });
  if (!row) return false;

  await closeReports(gameId, { source }, resolvedBy);
  return true;
}

/**
 * L'id dentro quello che l'admin ha incollato: l'id nudo o l'indirizzo della
 * scheda, che è ciò che si ha sotto mano. Null se non si riconosce.
 *
 * - HLTB: `howlongtobeat.com/game/5913` → `5913`
 * - OpenCritic: `opencritic.com/game/1548/hollow-knight` → `1548`
 * - Metacritic: `metacritic.com/game/hollow-knight/` → `hollow-knight`, che
 *   per Metacritic è l'id: è quello che il client usa per la scheda.
 */
export function parseSourceId(
  source: ManualSource,
  input: string,
): string | null {
  const value = input.trim();
  if (source === 'metacritic') {
    const fromUrl = value.match(/metacritic\.com\/game\/([a-z0-9-]+)/i)?.[1];
    const slug = (fromUrl ?? value).toLowerCase();
    return /^[a-z0-9-]+$/.test(slug) ? slug : null;
  }

  const host = source === 'hltb' ? 'howlongtobeat\\.com' : 'opencritic\\.com';
  const fromUrl = value.match(new RegExp(`${host}/game/(\\d+)`, 'i'))?.[1];
  const id = fromUrl ?? value;
  return /^\d+$/.test(id) && Number(id) > 0 ? id : null;
}

/**
 * Di quale gioco è già quell'id, se di qualcuno. Serve all'avviso del dialogo
 * «Inserisci id» prima di salvare: si può fare lo stesso, ma lo si fa sapendolo.
 */
export async function findSourceIdOwner(
  source: ManualSource,
  externalId: string,
  exceptGameId?: string,
) {
  const [row] = await db
    .select({
      id: schema.games.id,
      name: schema.games.name,
      slug: schema.games.slug,
    })
    .from(gs)
    .innerJoin(schema.games, eq(schema.games.id, gs.gameId))
    .where(
      and(
        eq(gs.source, source),
        eq(gs.externalId, externalId),
        exceptGameId ? sql`${gs.gameId} <> ${exceptGameId}` : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * «Inserisci id»: l'id lo decide l'admin, e il match per nome non si rifà.
 *
 * La riga si marca `manual`, ed è esente dall'unicità: port e remaster
 * condividono davvero la voce dell'originale. Poi `pending` e in coda:
 * l'enrichment trova l'id scritto e va dritto alla scheda.
 *
 * Vale su qualunque stato, anche `ok`: un aggancio sbagliato è `ok`, e a
 * vederlo è stato un umano (MGS3 Master Collection, agganciato su Metacritic
 * a Peace Walker).
 */
export async function setSourceExternalId(
  gameId: string,
  source: ManualSource,
  externalId: string,
  // L'admin che lo scrive: chiude a suo nome le segnalazioni su quella fonte.
  resolvedBy: string | null = null,
) {
  const now = new Date();
  await db
    .insert(gs)
    .values({ gameId, source, status: 'pending', externalId, manual: true })
    .onConflictDoUpdate({
      target: [gs.gameId, gs.source],
      set: {
        externalId,
        manual: true,
        status: 'pending',
        error: null,
        reason: null,
        attemptedAt: null,
        updatedAt: now,
      },
    });

  await enqueueEnrichment(source, gameId);
  await closeReports(gameId, { source }, resolvedBy);
}

/**
 * «Cerca» nel dialogo «Inserisci id»: il testo come nome, sulla fonte, e i
 * risultati da scegliere. Gli stessi client dell'enrichment, col loro ritmo.
 *
 * HLTB e Metacritic non costano niente. OpenCritic sì: ogni ricerca è una
 * delle 25 al giorno del piano gratuito, che il dialogo dice prima. Dopo, il
 * client sa quante ne restano — la risposta lo dichiara — e lo si rende.
 */
export async function searchSource(source: ManualSource, query: string) {
  if (source === 'hltb') {
    const hits = await searchHltbGames(query, 10);
    return {
      status: 'ok' as const,
      hits: hits.map((hit) => ({
        id: String(hit.hltbId),
        name: hit.name,
        releaseYear: hit.releaseYear,
        image: hit.image ?? null,
      })),
      searchesLeft: null,
    };
  }

  if (source === 'metacritic') {
    const hits = await searchMetacriticGames(query, 10);
    return {
      status: 'ok' as const,
      hits: hits.map((hit) => ({
        id: hit.slug,
        name: hit.name,
        releaseYear: hit.releaseYear,
        image: hit.image ?? null,
      })),
      searchesLeft: null,
    };
  }

  if (!openCriticEnabled()) return { status: 'disabled' as const };
  try {
    const hits = await searchOpenCriticGames(query);
    return {
      status: 'ok' as const,
      hits: hits.map((hit) => ({
        id: String(hit.id),
        name: hit.name,
        releaseYear: null,
        // La ricerca OpenCritic l'immagine non la dà, e prenderla costerebbe
        // una richiesta per risultato sul budget del giorno.
        image: null,
      })),
      searchesLeft: openCriticQuota().searches,
    };
  } catch (error) {
    if (error instanceof OpenCriticQuotaError)
      return { status: 'quota' as const };
    throw error;
  }
}
