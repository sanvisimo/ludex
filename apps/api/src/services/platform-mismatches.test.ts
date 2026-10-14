import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import {
  dismissPlatformMismatch,
  listPlatformMismatches,
  restorePlatformMismatch,
} from './platform-mismatches';

/** Un gioco con le piattaforme che IGDB gli dà. */
async function gioco(name: string, platformIgdbIds: number[] | null) {
  const game = await createGame({ name });
  await db
    .update(schema.games)
    .set({ platformIgdbIds })
    .where(eq(schema.games.id, game.id));
  return game;
}

/** Una copia di `userId` su quel gioco. `store` nullo: aggiunta a mano. */
async function copia(
  userId: string,
  gameId: string,
  platformSlug: string,
  store: Store | null = 'psn',
) {
  const [riga] = await db
    .insert(schema.backlog)
    .values({ userId, gameId })
    .onConflictDoNothing()
    .returning();
  const backlogId =
    riga?.id ??
    (await db.query.backlog.findFirst({
      where: (b, { and, eq }) =>
        and(eq(b.userId, userId), eq(b.gameId, gameId)),
    }))!.id;
  await db.insert(schema.ownerships).values({ backlogId, platformSlug, store });
}

const lista = (dismissed = false) =>
  listPlatformMismatches({ dismissed, limit: 50, offset: 0 });

describe('listPlatformMismatches', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('trova la copia su una console dove il gioco non è uscito', async () => {
    // L'Harry Potter del 2001: Mega Drive (29), mai su PS5.
    const hp = await gioco('Harry Potter', [29]);
    await copia(userId, hp.id, 'sony_playstation4');
    await copia(userId, hp.id, 'sony_playstation5');

    const { rows, total } = await lista();

    expect(total).toBe(1);
    expect(rows).toMatchObject([
      {
        gameId: hp.id,
        name: 'Harry Potter',
        users: 1,
        copies: [
          { store: 'psn', platformSlug: 'sony_playstation4' },
          { store: 'psn', platformSlug: 'sony_playstation5' },
        ],
      },
    ]);
    expect(rows[0]!.igdbPlatforms).toHaveLength(1);
  });

  it('non segnala ciò che è a posto', async () => {
    // Sulla console giusta.
    const giusto = await gioco('Giusto', [48, 167]);
    await copia(userId, giusto.id, 'sony_playstation4');
    // PS VR vale per una copia PS4.
    const moss = await gioco('Moss', [165]);
    await copia(userId, moss.id, 'sony_playstation4');
    // DOS vale per una copia PC.
    const pools = await gioco('Pools of Darkness', [13]);
    await copia(userId, pools.id, 'pc_windows', 'gog');
    // IGDB non dice niente: non è una smentita.
    const ignoto = await gioco('Ignoto', []);
    await copia(userId, ignoto.id, 'sony_playstation5');
    const maiChiesto = await gioco('Mai chiesto', null);
    await copia(userId, maiChiesto.id, 'sony_playstation5');
    // Aggiunta a mano: è una dichiarazione dell'utente, non un collegamento.
    const manuale = await gioco('Manuale', [29]);
    await copia(userId, manuale.id, 'sony_playstation5', null);

    expect(await lista()).toEqual({ rows: [], total: 0 });
  });

  it('conta gli utenti, e mette prima chi ne ha di più', async () => {
    const altro = await createUser();
    const a = await gioco('A', [29]);
    const b = await gioco('B', [29]);
    await copia(userId, a.id, 'sony_playstation5');
    await copia(userId, b.id, 'sony_playstation5');
    await copia(altro, b.id, 'sony_playstation5');

    const { rows } = await lista();

    expect(rows.map((row) => [row.name, row.users])).toEqual([
      ['B', 2],
      ['A', 1],
    ]);
  });

  it('«va bene così» lo toglie, e si annulla', async () => {
    const slug = await gioco('Metal Slug 3', [52, 80]);
    await copia(userId, slug.id, 'pc_windows', 'amazon');
    const adminId = await createUser();

    await dismissPlatformMismatch(slug.id, ['pc_windows'], adminId);

    expect((await lista()).rows).toEqual([]);
    expect((await lista(true)).rows).toMatchObject([{ gameId: slug.id }]);

    await restorePlatformMismatch(slug.id, ['pc_windows']);

    expect((await lista()).rows).toMatchObject([{ gameId: slug.id }]);
    expect((await lista(true)).rows).toEqual([]);
  });

  it('«va bene così» vale per quella piattaforma, non per le altre', async () => {
    const hp = await gioco('Harry Potter', [29]);
    await copia(userId, hp.id, 'sony_playstation4');
    await copia(userId, hp.id, 'sony_playstation5');

    await dismissPlatformMismatch(hp.id, ['sony_playstation4'], userId);

    expect((await lista()).rows).toMatchObject([
      { copies: [{ platformSlug: 'sony_playstation5' }] },
    ]);
  });
});
