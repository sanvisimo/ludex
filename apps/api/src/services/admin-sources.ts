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
  isNull,
  sql,
  type SQL,
} from '@repo/db/orm';

import { enqueueEnrichment } from '../queue/enrichment';

// La sezione «Dati mancanti» dell'admin (11a, passo 4): ciò che l'enrichment
// non ha saputo chiudere da solo, e i due gesti per chiuderlo a mano.

/**
 * I gruppi della tabellina, una colonna ciascuno.
 *
 * - `pending`: in coda. Su OpenCritic è normale averne: il budget è di 200
 *   richieste al giorno.
 * - `fixable`: `not_found` che un umano può sistemare, cioè tutti tranne
 *   `too_old`. Anche `no_results`: «non ha nulla» può essere un nome cercato
 *   male. E anche un motivo nullo, che vuol dire un testo che la migration non
 *   ha saputo classificare: meglio mostrarlo che perderlo.
 * - `fine`: `too_old`. Va bene così.
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

function bucketCondition(bucket: MissingBucket): SQL {
  switch (bucket) {
    case 'pending':
      return eq(gs.status, 'pending');
    case 'failed':
      return eq(gs.status, 'failed');
    case 'fine':
      return and(eq(gs.status, 'not_found'), eq(gs.reason, 'too_old'))!;
    case 'fixable':
      return sql`${gs.status} = 'not_found' and ${gs.reason} is distinct from 'too_old'`;
    case 'empty':
      return sql`${gs.status} = 'ok' and ${isEmpty}`;
  }
}

/** Quanti utenti hanno il gioco in backlog: dice quanto pesa sistemarlo. */
const users = sql<number>`(
  select count(*)::int from backlog b where b.game_id = ${gs.gameId}
)`;

/** La tabellina in cima alla sezione: fonte per gruppo, più due righe. */
export async function missingSummary() {
  const rows = await db
    .select({
      source: gs.source,
      pending: sql<number>`count(*) filter (where ${bucketCondition('pending')})::int`,
      // La più vecchia in coda: «137 dal 03/10» dice se la coda si muove.
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

  // Gli scarti visibili, di tutti gli utenti. Una riga per utente: il conteggio
  // per chiave è della sezione Scarti.
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

/** Una cella della tabellina, aperta: i giochi di quella fonte in quel gruppo. */
export async function listMissing(input: {
  source: EnrichmentSource;
  bucket: MissingBucket;
  reason?: SourceReason;
  q?: string;
  limit: number;
  offset: number;
}) {
  const where = and(
    eq(gs.source, input.source),
    bucketCondition(input.bucket),
    input.reason ? eq(gs.reason, input.reason) : undefined,
    input.q ? ilike(schema.games.name, `%${input.q}%`) : undefined,
  );

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
      // Prima i giochi che hanno più utenti: è lì che sistemare rende di più.
      .orderBy(sql`${users} desc`, asc(schema.games.name))
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

/** «Ritenta»: la fonte torna in coda così com'è, col suo id se ce l'ha. */
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
}
