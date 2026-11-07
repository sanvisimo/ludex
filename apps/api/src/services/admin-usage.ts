import type { AdminUsage } from '@repo/contracts';
import {
  apiCallSourceValues,
  enrichmentSourceValues,
  type EnrichmentSource,
  type Store,
} from '@repo/contracts/vocabulary';
import { db } from '@repo/db';
import { sql } from '@repo/db/orm';

import { readApiCalls } from '../lib/api-calls';
import { enrichmentQueue } from '../queue/enrichment';
import { importsQueue } from '../queue/imports';

// La sezione Uso dell'admin (plans/admin-uso.md). Solo letture, da dati che
// esistono già: nessuna tabella nuova e nessun dato personale in più.
//
// Le soglie sono date calcolate qui e passate come parametro, non `now()` del
// database: le colonne sono `timestamp` senza fuso, scritte in UTC da Drizzle,
// e fidarsi del fuso del server Postgres è la trappola che
// `library-sync.ts` racconta. Per la stessa ragione i giorni dei grafici sono
// giorni UTC.

const DAY_MS = 24 * 60 * 60 * 1000;
/** Quanti giorni mostrano i due grafici. */
export const CHART_DAYS = 30;

const daysAgo = (now: Date, days: number) =>
  new Date(now.getTime() - days * DAY_MS).toISOString();

/** Gli ultimi `CHART_DAYS` giorni, il più vecchio prima, anche quelli a zero. */
function fillDays(rows: { day: string; count: number }[], now: Date) {
  const counts = new Map(rows.map((row) => [row.day, row.count]));
  return Array.from({ length: CHART_DAYS }, (_, i) => {
    const day = new Date(now.getTime() - (CHART_DAYS - 1 - i) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return { day, count: counts.get(day) ?? 0 };
  });
}

/** Il primo istante del giorno UTC più vecchio del grafico. */
const chartStart = (now: Date) =>
  `${daysAgo(now, CHART_DAYS - 1).slice(0, 10)}T00:00:00.000Z`;

async function users(now: Date): Promise<AdminUsage['users']> {
  const d7 = daysAgo(now, 7);
  const d30 = daysAgo(now, 30);

  // Le sessioni aperte da un admin «come» un altro utente non sono il suo uso.
  const [totals] = await db.execute<{
    total: number;
    new7: number;
    active7: number;
    active30: number;
  }>(sql`
    select
      (select count(*)::int from "user") as total,
      (select count(*)::int from "user" where created_at >= ${d7}) as new7,
      (select count(distinct user_id)::int from session
        where impersonated_by is null and updated_at >= ${d7}) as active7,
      (select count(distinct user_id)::int from session
        where impersonated_by is null and updated_at >= ${d30}) as active30
  `);

  const signups = await db.execute<{ day: string; count: number }>(sql`
    select to_char(created_at, 'YYYY-MM-DD') as day, count(*)::int as count
    from "user"
    where created_at >= ${chartStart(now)}
    group by 1
  `);

  return { ...totals!, signups: fillDays([...signups], now) };
}

async function libraries(now: Date): Promise<AdminUsage['libraries']> {
  // Gli account `csv` non sono librerie: sono il posto a cui si lega un
  // import da file (vedi `store_accounts`).
  const rows = await db.execute<{
    store: Store;
    accounts: number;
    imported: number;
    synced7: number;
    needs_reauth: number;
  }>(sql`
    select
      store,
      count(*)::int as accounts,
      count(*) filter (where last_sync_at is not null)::int as imported,
      count(*) filter (where last_sync_at >= ${daysAgo(now, 7)})::int as synced7,
      count(*) filter (where status = 'needs_reauth')::int as needs_reauth
    from store_accounts
    where external_account_id <> 'csv'
    group by store
    order by accounts desc, store
  `);

  return rows.map(({ needs_reauth, ...row }) => ({
    ...row,
    needsReauth: needs_reauth,
  }));
}

async function games(now: Date): Promise<AdminUsage['games']> {
  const [totals] = await db.execute<{
    total: number;
    new7: number;
    resolved: number;
    in_libraries: number;
  }>(sql`
    select
      (select count(*)::int from games) as total,
      (select count(*)::int from games where created_at >= ${daysAgo(now, 7)}) as new7,
      (select count(*)::int from games where igdb_id is not null) as resolved,
      (select count(distinct game_id)::int from backlog) as in_libraries
  `);

  const added = await db.execute<{ day: string; count: number }>(sql`
    select to_char(created_at, 'YYYY-MM-DD') as day, count(*)::int as count
    from games
    where created_at >= ${chartStart(now)}
    group by 1
  `);

  const top = await db.execute<{
    id: string;
    name: string;
    slug: string;
    users: number;
  }>(sql`
    select g.id, g.name, g.slug, count(*)::int as users
    from backlog b
    join games g on g.id = b.game_id
    group by g.id
    order by users desc, g.name
    limit 10
  `);

  const { in_libraries, ...rest } = totals!;
  return {
    ...rest,
    inLibraries: in_libraries,
    added: fillDays([...added], now),
    top: [...top],
  };
}

/** In diretta da Redis; `null` se non risponde. */
async function queues(): Promise<AdminUsage['queues']> {
  try {
    return await Promise.all(
      [enrichmentQueue, importsQueue].map(async (queue) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'prioritized',
          'active',
          'delayed',
          'failed',
          'completed',
        );
        return {
          name: queue.name,
          // BullMQ tiene a parte i job con una priorità: per chi guarda sono
          // in attesa come gli altri.
          waiting: (counts.waiting ?? 0) + (counts.prioritized ?? 0),
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
        };
      }),
    );
  } catch (error) {
    console.log(`admin: conteggio delle code fallito: ${String(error)}`);
    return null;
  }
}

async function apis(now: Date): Promise<AdminUsage['apis']> {
  const days = await readApiCalls(7, now);
  if (!days) return null;

  return apiCallSourceValues.map((source) => ({
    source,
    today: days[0]?.calls[source] ?? 0,
    calls7: days.reduce((sum, day) => sum + (day.calls[source] ?? 0), 0),
    rejected7: days.reduce((sum, day) => sum + (day.rejected[source] ?? 0), 0),
  }));
}

async function outcomes(now: Date): Promise<AdminUsage['outcomes']> {
  const rows = await db.execute<{
    source: EnrichmentSource;
    ok: number;
    failed: number;
    not_found: number;
  }>(sql`
    select
      source,
      count(*) filter (where status = 'ok')::int as ok,
      count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status = 'not_found')::int as not_found
    from game_sources
    where attempted_at >= ${daysAgo(now, 7)}
    group by source
  `);

  const bySource = new Map(rows.map((row) => [row.source, row]));
  return enrichmentSourceValues.map((source) => {
    const row = bySource.get(source);
    return {
      source,
      ok: row?.ok ?? 0,
      failed: row?.failed ?? 0,
      notFound: row?.not_found ?? 0,
    };
  });
}

export async function adminUsage(now = new Date()): Promise<AdminUsage> {
  const [u, l, g, q, a, o] = await Promise.all([
    users(now),
    libraries(now),
    games(now),
    queues(),
    apis(now),
    outcomes(now),
  ]);
  return { users: u, libraries: l, games: g, queues: q, apis: a, outcomes: o };
}
