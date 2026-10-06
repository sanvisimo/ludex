import type { ManualSource, Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, asc, count, desc, eq, isNull, sql } from '@repo/db/orm';

// Le segnalazioni degli utenti (11a, passo 6): «questo gioco è sbagliato».
// L'utente segnala dalla pagina del gioco, l'admin le trova nella sezione
// Giochi, e si chiudono quando corregge quella cosa.

const gr = schema.gameReports;

/** La cosa segnalata: la copia di un negozio, oppure una fonte. */
export type ReportTarget = { store: Store } | { source: ManualSource };

function targetCondition(target: ReportTarget) {
  return 'store' in target
    ? and(eq(gr.store, target.store), isNull(gr.source))
    : and(eq(gr.source, target.source), isNull(gr.store));
}

/** I negozi delle copie che l'utente ha di quel gioco: solo quelli si segnalano. */
async function ownedStores(userId: string, gameId: string) {
  const rows = await db
    .selectDistinct({ store: schema.ownerships.store })
    .from(schema.ownerships)
    .innerJoin(
      schema.backlog,
      eq(schema.backlog.id, schema.ownerships.backlogId),
    )
    .where(
      and(eq(schema.backlog.userId, userId), eq(schema.backlog.gameId, gameId)),
    );
  return new Set(
    rows.map((row) => row.store).filter((store) => store !== null),
  );
}

/** Le segnalazioni aperte di un utente su un gioco: il «Segnalato il …». */
export function openReportsForGame(userId: string, gameId: string) {
  return db
    .select({
      id: gr.id,
      store: gr.store,
      source: gr.source,
      createdAt: gr.createdAt,
      updatedAt: gr.updatedAt,
    })
    .from(gr)
    .where(
      and(eq(gr.userId, userId), eq(gr.gameId, gameId), isNull(gr.resolvedAt)),
    )
    .orderBy(asc(gr.createdAt))
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        source: row.source as ManualSource | null,
      })),
    );
}

/**
 * Segnala una o più cose di un gioco. Una segnalazione per cosa; se ce n'è già
 * una aperta per quella cosa, la si aggiorna invece di aprirne un'altra.
 *
 * La copia di un negozio si segnala solo se l'utente ce l'ha: su un gioco non
 * suo può dire che una fonte è sbagliata, non che la sua copia lo è.
 */
export async function createReports(
  userId: string,
  input: {
    gameId: string;
    targets: ReportTarget[];
    suggestedIgdbId?: number | null;
    suggestedName?: string | null;
    note?: string | null;
  },
) {
  const game = await db.query.games.findFirst({
    columns: { id: true },
    where: eq(schema.games.id, input.gameId),
  });
  if (!game) return { status: 'not_found' as const };

  const stores = await ownedStores(userId, input.gameId);
  if (input.targets.some((t) => 'store' in t && !stores.has(t.store)))
    return { status: 'not_owned' as const };

  const values = {
    suggestedIgdbId: input.suggestedIgdbId ?? null,
    suggestedName: input.suggestedName ?? null,
    note: input.note ?? null,
  };

  for (const target of input.targets) {
    const [aperta] = await db
      .select({ id: gr.id })
      .from(gr)
      .where(
        and(
          eq(gr.userId, userId),
          eq(gr.gameId, input.gameId),
          isNull(gr.resolvedAt),
          targetCondition(target),
        ),
      );

    if (aperta) {
      await db
        .update(gr)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(gr.id, aperta.id));
    } else {
      await db.insert(gr).values({
        userId,
        gameId: input.gameId,
        ...('store' in target
          ? { store: target.store }
          : { source: target.source }),
        ...values,
      });
    }
  }

  return {
    status: 'ok' as const,
    open: await openReportsForGame(userId, input.gameId),
  };
}

/**
 * Chiude le segnalazioni aperte su quella cosa di quel gioco, di tutti gli
 * utenti. La chiamano i gesti che la correggono — ripuntare la copia,
 * scrivere l'id della fonte — e «Archivia».
 */
export async function closeReports(
  gameId: string,
  target: ReportTarget,
  resolvedBy: string | null,
) {
  const chiuse = await db
    .update(gr)
    .set({ resolvedAt: new Date(), resolvedBy, updatedAt: new Date() })
    .where(
      and(
        eq(gr.gameId, gameId),
        isNull(gr.resolvedAt),
        targetCondition(target),
      ),
    )
    .returning({ id: gr.id });
  return chiuse.length;
}

/**
 * Le segnalazioni aperte, una riga per gioco e cosa: tre utenti che dicono che
 * Toki su Nintendo è sbagliato sono una cosa sola da correggere. Con un
 * `gameId` solo quelle di quel gioco: la scheda admin del gioco.
 */
export async function listOpenReports(input: {
  gameId?: string;
  limit: number;
  offset: number;
}) {
  const where = and(
    isNull(gr.resolvedAt),
    input.gameId ? eq(gr.gameId, input.gameId) : undefined,
  );

  const groups = db
    .select({
      gameId: gr.gameId,
      store: gr.store,
      source: gr.source,
      users: sql<number>`count(*)::int`.as('users'),
      // I suggerimenti di tutti, senza doppioni: è da lì che l'admin parte.
      suggestions: sql<{ igdbId: number | null; name: string | null }[]>`
        coalesce(
          jsonb_agg(distinct jsonb_build_object(
            'igdbId', ${gr.suggestedIgdbId}, 'name', ${gr.suggestedName}
          )) filter (where ${gr.suggestedIgdbId} is not null or ${gr.suggestedName} is not null),
          '[]'::jsonb
        )`.as('suggestions'),
      notes: sql<string[]>`
        coalesce(array_agg(${gr.note}) filter (where ${gr.note} is not null), '{}')
      `.as('notes'),
      lastAt: sql<Date>`max(${gr.updatedAt})`.as('last_at'),
    })
    .from(gr)
    .where(where)
    .groupBy(gr.gameId, gr.store, gr.source)
    .as('groups');

  const [rows, [total]] = await Promise.all([
    db
      .select({
        gameId: groups.gameId,
        name: schema.games.name,
        slug: schema.games.slug,
        store: groups.store,
        source: groups.source,
        users: groups.users,
        suggestions: groups.suggestions,
        notes: groups.notes,
        lastAt: groups.lastAt,
      })
      .from(groups)
      .innerJoin(schema.games, eq(schema.games.id, groups.gameId))
      .orderBy(desc(groups.users), desc(groups.lastAt))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ n: count() }).from(groups),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      source: row.source as ManualSource | null,
      lastAt: new Date(row.lastAt),
    })),
    total: total?.n ?? 0,
  };
}
