import type {
  AccountListQuery,
  HiddenItem,
  HiddenKind,
  Store,
} from '@repo/contracts';
import { hiddenKindValues } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, eq, inArray, isNull, or, sql } from '@repo/db/orm';

import { entryQuery, toEntry } from './backlog';
import { listUnresolvedImports } from './unresolved-imports';

type Filter = Pick<AccountListQuery, 'q' | 'store'>;
const textFilter = (name: ReturnType<typeof sql>, q?: string) =>
  q ? sql`position(lower(${q}) in lower(${name})) > 0` : sql`true`;

function reviewSource(userId: string, filter: Filter) {
  return sql`select u.id, u.name, u.store, u.same_product_as
    from unresolved_imports u
    where u.user_id = ${userId} and u.hidden_kind is null
      and ${textFilter(sql`u.name`, filter.q)}
      and ${filter.store ? sql`u.store = ${filter.store}` : sql`true`}`;
}

async function reviewCounts(userId: string, filter: Filter) {
  const [row] = await db.execute<{
    unrecognised: number;
    duplicates: number;
  }>(sql`
    with filtered as (${reviewSource(userId, filter)})
    select (select count(*)::int from filtered where same_product_as is null) as unrecognised,
      (select count(*)::int from (select distinct store, same_product_as
        from filtered where same_product_as is not null) groups) as duplicates`);
  return row!;
}

function hiddenSource(userId: string, filter: Filter) {
  return sql`
    select 'import'::text as type, u.id, u.hidden_kind::text as kind, u.hidden_at
    from unresolved_imports u
    where u.user_id = ${userId} and u.hidden_kind is not null
      and ${textFilter(sql`u.name`, filter.q)}
      and ${filter.store ? sql`u.store = ${filter.store}` : sql`true`}
    union all
    select 'game'::text, b.id, 'unwanted'::text, b.hidden_at
    from backlog b join games g on g.id = b.game_id
    where b.user_id = ${userId} and b.hidden_at is not null
      and ${textFilter(sql`g.name`, filter.q)}
      and ${filter.store ? sql`exists (select 1 from ownerships o where o.backlog_id = b.id and o.store = ${filter.store})` : sql`true`}`;
}

async function hiddenCounts(userId: string, filter: Filter) {
  const rows = await db.execute<{ kind: HiddenKind; count: number }>(sql`
    with filtered as (${hiddenSource(userId, filter)})
    select kind, count(*)::int as count from filtered group by kind`);
  const counts: Record<HiddenKind, number> = {
    app: 0,
    dlc: 0,
    extra: 0,
    prerelease: 0,
    unwanted: 0,
  };
  for (const row of rows) counts[row.kind] = row.count;
  return counts;
}

const validPage = (page: number, total: number, limit: number) =>
  Math.min(page, Math.max(1, Math.ceil(total / limit)));

export async function accountListCounts(userId: string) {
  const [review, hidden] = await Promise.all([
    reviewCounts(userId, {}),
    hiddenCounts(userId, {}),
  ]);
  return {
    toFix: review.unrecognised + review.duplicates,
    hidden: Object.values(hidden).reduce((sum, n) => sum + n, 0),
  };
}

export async function reviewPage(
  userId: string,
  input: AccountListQuery & { tab?: 'unrecognised' | 'duplicates' },
) {
  const counts = await reviewCounts(userId, input);
  const tab =
    input.tab ??
    (counts.unrecognised === 0 && counts.duplicates > 0
      ? 'duplicates'
      : 'unrecognised');
  const total = counts[tab];
  const page = validPage(input.page, total, input.limit);
  let ids: string[];
  if (tab === 'unrecognised') {
    const rows = await db.execute<{ id: string }>(sql`
      with filtered as (${reviewSource(userId, input)})
      select id from filtered where same_product_as is null
      order by lower(name), id limit ${input.limit} offset ${(page - 1) * input.limit}`);
    ids = rows.map((row) => row.id);
  } else {
    const groups = await db.execute<{
      store: Store;
      same_product_as: string;
    }>(sql`
      with filtered as (${reviewSource(userId, input)})
      select store, same_product_as from filtered where same_product_as is not null
      group by store, same_product_as
      order by min(lower(name)), store, same_product_as
      limit ${input.limit} offset ${(page - 1) * input.limit}`);
    // Una corrispondenza include tutte le voci del prodotto: il filtro e il limite
    // scelgono gruppi, non devono separarne i figli fra pagine diverse.
    const rows = groups.length
      ? await db
          .select({ id: schema.unresolvedImports.id })
          .from(schema.unresolvedImports)
          .where(
            and(
              eq(schema.unresolvedImports.userId, userId),
              isNull(schema.unresolvedImports.hiddenKind),
              or(
                ...groups.map((group) =>
                  and(
                    eq(schema.unresolvedImports.store, group.store),
                    eq(
                      schema.unresolvedImports.sameProductAs,
                      group.same_product_as,
                    ),
                  ),
                ),
              ),
            ),
          )
          .orderBy(
            sql`lower(${schema.unresolvedImports.name})`,
            schema.unresolvedImports.id,
          )
      : [];
    ids = rows.map((row) => row.id);
  }
  const entries = await listUnresolvedImports(userId, ids);
  const position = new Map(ids.map((id, i) => [id, i]));
  entries.sort((a, b) => position.get(a.id)! - position.get(b.id)!);
  return { entries, counts, total, page, tab };
}

export async function hiddenPage(
  userId: string,
  input: AccountListQuery & { kind?: HiddenKind },
) {
  const counts = await hiddenCounts(userId, input);
  const kind =
    input.kind ?? hiddenKindValues.find((kind) => counts[kind] > 0) ?? 'app';
  const total = counts[kind];
  const page = validPage(input.page, total, input.limit);
  // Le due sorgenti vanno ordinate insieme prima del LIMIT, altrimenti si
  // perdono elementi e la cronologia cambia fra una pagina e la successiva.
  const rows = await db.execute<{ type: 'game' | 'import'; id: string }>(sql`
    with filtered as (${hiddenSource(userId, input)})
    select type, id from filtered where kind = ${kind}
    order by hidden_at desc nulls last, type, id
    limit ${input.limit} offset ${(page - 1) * input.limit}`);
  const importIds = rows
    .filter((row) => row.type === 'import')
    .map((row) => row.id);
  const gameIds = rows
    .filter((row) => row.type === 'game')
    .map((row) => row.id);
  const [imports, games] = await Promise.all([
    listUnresolvedImports(userId, importIds),
    gameIds.length
      ? db.query.backlog.findMany({
          ...entryQuery,
          where: and(
            eq(schema.backlog.userId, userId),
            inArray(schema.backlog.id, gameIds),
          ),
        })
      : [],
  ]);
  const importOf = new Map(imports.map((entry) => [entry.id, entry]));
  const gameOf = new Map(games.map((row) => [row.id, toEntry(row)]));
  const items = rows.flatMap<HiddenItem>((row) => {
    if (row.type === 'import') {
      const entry = importOf.get(row.id);
      return entry ? [{ type: 'import' as const, entry }] : [];
    }
    const entry = gameOf.get(row.id);
    return entry ? [{ type: 'game' as const, entry }] : [];
  });
  return { items, counts, total, page, kind };
}
