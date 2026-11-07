import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { describe, expect, it } from 'vitest';

import {
  ago,
  createGame,
  createUser,
  linkStoreAccount,
  setSource,
} from '../../test/factories';
import { adminUsage, CHART_DAYS } from './admin-usage';

// La sezione Uso legge e basta, ma i suoi numeri sono predicati su date e
// JOIN: un `>=` al posto di un `>` o un filtro dimenticato non si vedono a
// occhio. Qui i casi che li separano.

const eqId = (id: string) => eq(schema.user.id, id);
const eqAccount = (id: string) => eq(schema.storeAccounts.id, id);

let sessions = 0;
function addSession(
  userId: string,
  updatedAt: Date,
  impersonatedBy: string | null = null,
) {
  const n = ++sessions;
  return db.insert(schema.session).values({
    id: `session-${n}`,
    token: `token-${n}`,
    userId,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: updatedAt,
    updatedAt,
    impersonatedBy,
  });
}

describe('adminUsage', () => {
  it('conta come attivo chi ha usato una sessione, non chi è entrato come lui', async () => {
    const recente = await createUser();
    const vecchio = await createUser();
    const impersonato = await createUser();
    await createUser(); // mai entrato

    await addSession(recente, ago.days(2));
    await addSession(recente, ago.days(1)); // due sessioni, un utente
    await addSession(vecchio, ago.days(20));
    await addSession(impersonato, ago.days(1), 'admin-1');

    const { users } = await adminUsage();

    expect(users.total).toBe(4);
    expect(users.active7).toBe(1);
    expect(users.active30).toBe(2);
  });

  it('dà un giorno per barra, a zero dove non è successo niente', async () => {
    const now = new Date('2026-11-07T12:00:00Z');
    const oggi = await createUser();
    const ieri = await createUser();
    const prima = await createUser();

    await db
      .update(schema.user)
      .set({ createdAt: new Date('2026-11-07T08:00:00Z') })
      .where(eqId(oggi));
    await db
      .update(schema.user)
      .set({ createdAt: new Date('2026-11-06T23:30:00Z') })
      .where(eqId(ieri));
    await db
      .update(schema.user)
      .set({ createdAt: new Date('2026-09-01T10:00:00Z') })
      .where(eqId(prima));

    const { users } = await adminUsage(now);

    expect(users.signups).toHaveLength(CHART_DAYS);
    expect(users.signups.at(-1)?.day).toBe('2026-11-07');
    expect(users.signups[0]?.day).toBe('2026-10-09');
    expect(users.signups.at(-1)?.count).toBe(1);
    expect(users.signups.at(-2)).toEqual({ day: '2026-11-06', count: 1 });
    expect(users.signups.slice(0, -2).every((d) => d.count === 0)).toBe(true);
  });

  it('non conta gli account del CSV fra le librerie', async () => {
    const userId = await createUser();
    const steam = await linkStoreAccount(userId, 'steam');
    await linkStoreAccount(userId, 'gog', 'csv');

    await db
      .update(schema.storeAccounts)
      .set({ lastSyncAt: ago.days(1), status: 'needs_reauth' })
      .where(eqAccount(steam.id));

    const { libraries } = await adminUsage();

    expect(libraries).toEqual([
      {
        store: 'steam',
        accounts: 1,
        imported: 1,
        synced7: 1,
        needsReauth: 1,
      },
    ]);
  });

  it('ordina i giochi per quanti utenti li hanno', async () => {
    const [a, b] = [await createUser(), await createUser()];
    const raro = await createGame({ name: 'Raro' });
    const comune = await createGame({ name: 'Comune' });
    await createGame({ igdbId: null }); // non risolto, in nessuna libreria

    await db.insert(schema.backlog).values([
      { userId: a, gameId: comune.id },
      { userId: b, gameId: comune.id },
      { userId: a, gameId: raro.id },
    ]);

    const { games } = await adminUsage();

    expect(games.total).toBe(3);
    expect(games.resolved).toBe(2);
    expect(games.inLibraries).toBe(2);
    expect(games.top.map((g) => [g.name, g.users])).toEqual([
      ['Comune', 2],
      ['Raro', 1],
    ]);
  });

  it('negli esiti tiene solo i tentativi degli ultimi 7 giorni', async () => {
    const [g1, g2, g3] = [
      await createGame(),
      await createGame(),
      await createGame(),
    ];
    await setSource({ gameId: g1.id, status: 'ok', attemptedAt: ago.days(1) });
    await setSource({
      gameId: g2.id,
      source: 'hltb',
      status: 'not_found',
      attemptedAt: ago.days(3),
    });
    await setSource({
      gameId: g3.id,
      status: 'failed',
      attemptedAt: ago.days(9),
    });

    const { outcomes } = await adminUsage();

    expect(outcomes.find((o) => o.source === 'igdb')).toEqual({
      source: 'igdb',
      ok: 1,
      failed: 0,
      notFound: 0,
    });
    expect(outcomes.find((o) => o.source === 'hltb')?.notFound).toBe(1);
  });
});
