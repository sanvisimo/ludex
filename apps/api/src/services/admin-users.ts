import { adminUsersDefaultSort, type AdminUsersSort } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { asc, count, eq, ilike, or, sql } from '@repo/db/orm';

import { adminOrderBy } from './admin-sort';

export async function listUsers(input: {
  q?: string;
  limit: number;
  offset: number;
  sorting?: AdminUsersSort;
}) {
  const where = input.q
    ? or(
        ilike(schema.user.name, `%${input.q}%`),
        ilike(schema.user.email, `%${input.q}%`),
      )
    : undefined;

  // `"user".id` scritto a mano: in una select su una tabella sola Drizzle
  // scriverebbe `"id"`, e nella sottoquery Postgres lo leggerebbe come l'id
  // della riga interna.
  const games = sql<number>`(
    select count(*)::int from backlog b where b.user_id = "user".id
  )`;
  const accounts = sql<number>`(
    select count(*)::int from store_accounts a where a.user_id = "user".id
  )`;
  // Better Auth aggiorna la sessione al più una volta al giorno.
  const lastSeenAt = sql<Date | null>`(
    select max(s.updated_at) from session s
    where s.user_id = "user".id and s.impersonated_by is null
  )`.mapWith(schema.session.updatedAt);
  const { sort, direction } = input.sorting ?? adminUsersDefaultSort;
  const columns = {
    account: sql`lower(${schema.user.name})`,
    joined: schema.user.createdAt,
    lastSeen: lastSeenAt,
    games,
    accounts,
    state: sql`coalesce(${schema.user.banned}, false)`,
  };
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        createdAt: schema.user.createdAt,
        role: schema.user.role,
        banned: schema.user.banned,
        banReason: schema.user.banReason,
        banExpires: schema.user.banExpires,
        games,
        accounts,
        lastSeenAt,
      })
      .from(schema.user)
      .where(where)
      .orderBy(adminOrderBy(columns[sort], direction), asc(schema.user.id))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ n: count() }).from(schema.user).where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      role: row.role === 'admin' ? ('admin' as const) : ('user' as const),
      banned: row.banned ?? false,
    })),
    total: total?.n ?? 0,
  };
}

/**
 * Chi riceve l'avviso di un cambio di ruolo: indirizzo, ruolo di adesso e la
 * lingua che ha scelto, che non è quella dell'admin che fa la richiesta.
 */
export async function findUserForRoleChange(userId: string) {
  const [row] = await db
    .select({
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      locale: schema.userSettings.locale,
    })
    .from(schema.user)
    .leftJoin(
      schema.userSettings,
      eq(schema.userSettings.userId, schema.user.id),
    )
    .where(eq(schema.user.id, userId));
  return row ?? null;
}
