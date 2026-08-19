import { db, schema } from '@repo/db';
import { and, eq, exists, gte, ilike, lte, notExists, sql } from '@repo/db/orm';

// Stessi costrutti di backlog-search.ts: serve a vedere che Drizzle li renda,
// senza bisogno di un database. postgres.js non si connette finché non si esegue.
const q = db
  .select({
    id: schema.backlog.id,
    total: sql<number>`count(*) over()`.mapWith(Number),
  })
  .from(schema.backlog)
  .innerJoin(schema.games, eq(schema.games.id, schema.backlog.gameId))
  .where(
    and(
      eq(schema.backlog.userId, 'u1'),
      ilike(schema.games.name, '%50\\%%'),
      exists(
        db
          .select({ uno: sql`1` })
          .from(schema.ownerships)
          .where(
            and(
              eq(schema.ownerships.backlogId, schema.backlog.id),
              eq(schema.ownerships.platformSlug, 'pc_windows'),
            ),
          ),
      ),
      exists(
        db
          .select({ uno: sql`1` })
          .from(schema.backlogTags)
          .where(
            and(
              eq(schema.backlogTags.backlogId, schema.backlog.id),
              eq(schema.backlogTags.tagId, 'tag-1'),
            ),
          ),
      ),
      notExists(
        db
          .select({ uno: sql`1` })
          .from(schema.ownerships)
          .where(
            and(
              eq(schema.ownerships.backlogId, schema.backlog.id),
              sql`coalesce(${schema.ownerships.playtimeMinutes}, 0) > 0`,
            ),
          ),
      ),
      lte(schema.games.hltbMainMinutes, 120),
      gte(schema.backlog.rating, 3),
      sql`${schema.games.hltbHasSolo} is not false`,
    ),
  )
  .orderBy(
    sql`(select max(${schema.ownerships.lastPlayedAt}) from ${schema.ownerships} where ${schema.ownerships.backlogId} = ${schema.backlog.id}) ${sql.raw('desc')} nulls last`,
    sql`${schema.backlog.id} asc`,
  )
  .limit(50)
  .offset(0);

console.log(q.toSQL().sql);
