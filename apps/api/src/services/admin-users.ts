import { db, schema } from '@repo/db';
import { count, desc, ilike, or, sql } from '@repo/db/orm';

// La sezione Utenti dell'admin (11a, passo 7). Qui solo la lista: ruolo, ban e
// sessioni passano dalle API del plugin `admin` di Better Auth, nel router,
// perché è lui che sa cosa vuol dire bannare — chiude le sessioni, e da lì in
// poi rifiuta di aprirne di nuove finché il ban non scade.

/**
 * Gli utenti, i più recenti prima, con quanti giochi e quanti account di
 * negozio hanno: è ciò che dice all'admin chi sta usando Ludex davvero.
 */
export async function listUsers(input: {
  q?: string;
  limit: number;
  offset: number;
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
        games: sql<number>`(
          select count(*)::int from backlog b where b.user_id = "user".id
        )`,
        accounts: sql<number>`(
          select count(*)::int from store_accounts a where a.user_id = "user".id
        )`,
        // L'ultima sessione usata, al giorno: Better Auth ne rinnova la data al
        // più una volta al giorno. Quelle aperte da un admin «come» l'utente
        // non contano.
        lastSeenAt: sql<Date | null>`(
          select max(s.updated_at) from session s
          where s.user_id = "user".id and s.impersonated_by is null
        )`.mapWith(schema.session.updatedAt),
      })
      .from(schema.user)
      .where(where)
      .orderBy(desc(schema.user.createdAt))
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
