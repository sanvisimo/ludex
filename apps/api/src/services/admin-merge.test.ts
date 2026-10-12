import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { describe, expect, it, vi } from 'vitest';

import { createGame, createUser, setSource } from '../../test/factories';
import { enqueueEnrichment } from '../queue/enrichment';
import { mergeGames, previewMerge } from './admin-merge';

vi.mock('../queue/enrichment', () => ({
  enqueueEnrichment: vi.fn(),
  enqueuePostImport: vi.fn(),
}));

const vecchio = new Date('2024-01-01');
const nuovo = new Date('2025-06-01');

/** Il gioco con id IGDB, e quello inserito a mano che è lo stesso gioco. */
async function coppia() {
  const giusto = await createGame({ name: 'Hades' });
  const amano = await createGame({ name: 'hades', igdbId: null });
  return { giusto, amano };
}

async function riga(
  userId: string,
  gameId: string,
  over: Partial<typeof schema.backlog.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.backlog)
    .values({ userId, gameId, ...over })
    .returning();
  return row!;
}

async function tag(userId: string, name: string) {
  const [row] = await db
    .insert(schema.userTags)
    .values({ userId, kind: 'tag', name })
    .returning({ id: schema.userTags.id });
  return row!.id;
}

const backlogDi = (userId: string) =>
  db.select().from(schema.backlog).where(eq(schema.backlog.userId, userId));

describe('mergeGames', () => {
  it('chi ha una riga sola la sposta sul gioco che resta, senza toccarla', async () => {
    const { giusto, amano } = await coppia();
    const userId = await createUser();
    const admin = await createUser();
    await riga(userId, amano.id, {
      status: 'completed',
      rating: 4.5,
      notes: 'bello',
    });

    const esito = await mergeGames(admin, amano.id, giusto.id);

    expect(esito).toMatchObject({
      status: 'ok',
      movedUsers: 1,
      mergedUsers: 0,
    });
    const [voce, ...altre] = await backlogDi(userId);
    expect(altre).toHaveLength(0);
    expect(voce).toMatchObject({
      gameId: giusto.id,
      status: 'completed',
      rating: 4.5,
      notes: 'bello',
    });
  });

  it('chi le ha entrambe ne ha una, con stato, voto, note, tag e date decisi dalle regole', async () => {
    const { giusto, amano } = await coppia();
    const userId = await createUser();
    const admin = await createUser();
    const staiLeggendo = await tag(userId, 'da rigiocare');
    const stanco = await tag(userId, 'stanco');

    const sul = await riga(userId, giusto.id, {
      status: 'playing',
      rating: 3,
      notes: 'prima nota',
      hiddenAt: nuovo,
      addedAt: nuovo,
      createdAt: vecchio,
      updatedAt: vecchio,
    });
    const via = await riga(userId, amano.id, {
      status: 'completed',
      rating: 5,
      notes: 'seconda nota',
      addedAt: vecchio,
      createdAt: nuovo,
      updatedAt: nuovo,
    });
    await db.insert(schema.backlogTags).values([
      { backlogId: sul.id, tagId: staiLeggendo },
      { backlogId: via.id, tagId: staiLeggendo },
      { backlogId: via.id, tagId: stanco },
    ]);

    const esito = await mergeGames(admin, giusto.id, amano.id);

    expect(esito).toMatchObject({ movedUsers: 0, mergedUsers: 1 });
    const [voce, ...altre] = await backlogDi(userId);
    expect(altre).toHaveLength(0);
    expect(voce).toMatchObject({
      id: sul.id,
      gameId: giusto.id,
      status: 'completed',
      rating: 5,
      notes: 'prima nota\n\nseconda nota',
      hiddenAt: null,
    });
    expect(voce!.addedAt).toEqual(vecchio);
    const tagFinali = await db
      .select({ tagId: schema.backlogTags.tagId })
      .from(schema.backlogTags)
      .where(eq(schema.backlogTags.backlogId, sul.id));
    expect(tagFinali.map((t) => t.tagId).sort()).toEqual(
      [staiLeggendo, stanco].sort(),
    );
  });

  it('excluded sopravvive anche contro completed', async () => {
    const { giusto, amano } = await coppia();
    const userId = await createUser();
    await riga(userId, giusto.id, { status: 'completed' });
    await riga(userId, amano.id, { status: 'excluded' });

    await mergeGames(await createUser(), giusto.id, amano.id);

    expect((await backlogDi(userId)).map((r) => r.status)).toEqual([
      'excluded',
    ]);
  });

  it('i possessi con la stessa chiave diventano uno, con le ore più alte; gli altri si spostano', async () => {
    const { giusto, amano } = await coppia();
    const userId = await createUser();
    const sul = await riga(userId, giusto.id);
    const via = await riga(userId, amano.id);
    await db.insert(schema.ownerships).values([
      {
        backlogId: sul.id,
        platformSlug: 'pc_windows',
        store: 'steam',
        playtimeMinutes: 60,
        acquiredAt: nuovo,
      },
      {
        backlogId: via.id,
        platformSlug: 'pc_windows',
        store: 'steam',
        playtimeMinutes: 600,
        acquiredAt: vecchio,
      },
      {
        backlogId: via.id,
        platformSlug: 'nintendo_switch',
        store: 'nintendo',
      },
    ]);

    await mergeGames(await createUser(), giusto.id, amano.id);

    const copie = await db
      .select()
      .from(schema.ownerships)
      .where(eq(schema.ownerships.backlogId, sul.id));
    expect(copie).toHaveLength(2);
    const steam = copie.find((c) => c.store === 'steam')!;
    expect(steam.playtimeMinutes).toBe(600);
    expect(steam.acquiredAt).toEqual(vecchio);
    expect(copie.some((c) => c.store === 'nintendo')).toBe(true);
  });

  it('un rifiuto contraddetto da un possesso cade; gli altri seguono la riga', async () => {
    const { giusto, amano } = await coppia();
    const userId = await createUser();
    const sul = await riga(userId, giusto.id);
    const via = await riga(userId, amano.id);
    await db.insert(schema.ownerships).values({
      backlogId: via.id,
      platformSlug: 'pc_windows',
      store: 'gog',
    });
    await db.insert(schema.ownershipRejections).values([
      // Contraddetto: la copia GOG c'è, sull'altra riga.
      { backlogId: sul.id, platformSlug: 'pc_windows', store: 'gog' },
      // Dell'assorbito, non contraddetto: deve seguire.
      {
        backlogId: via.id,
        platformSlug: 'pc_windows',
        store: 'epic',
      },
    ]);

    await mergeGames(await createUser(), giusto.id, amano.id);

    const rifiuti = await db
      .select()
      .from(schema.ownershipRejections)
      .where(eq(schema.ownershipRejections.backlogId, sul.id));
    expect(rifiuti.map((r) => r.store)).toEqual(['epic']);
  });

  it('sposta gli id dei negozi, la wishlist e le segnalazioni, senza doppioni', async () => {
    const { giusto, amano } = await coppia();
    const userId = await createUser();
    const admin = await createUser();
    await db.insert(schema.externalIds).values({
      gameId: amano.id,
      source: 'steam',
      externalId: '1145360',
    });
    const [lista] = await db
      .insert(schema.playlists)
      .values({ userId, name: 'Voglie', kind: 'wishlist' })
      .returning({ id: schema.playlists.id });
    await db.insert(schema.wishlistItems).values([
      { listId: lista!.id, gameId: giusto.id },
      { listId: lista!.id, gameId: amano.id },
    ]);
    await db.insert(schema.gameReports).values([
      { userId, gameId: giusto.id, store: 'steam' },
      { userId, gameId: amano.id, store: 'steam' },
    ]);

    await mergeGames(admin, giusto.id, amano.id);

    const ids = await db.select().from(schema.externalIds);
    expect(ids).toMatchObject([{ gameId: giusto.id, externalId: '1145360' }]);
    const voci = await db.select().from(schema.wishlistItems);
    expect(voci).toHaveLength(1);
    const segnalazioni = await db
      .select()
      .from(schema.gameReports)
      .where(eq(schema.gameReports.gameId, giusto.id));
    expect(segnalazioni).toHaveLength(2);
    expect(segnalazioni.filter((r) => r.resolvedAt === null)).toHaveLength(1);
  });

  it('i dati del sopravvissuto non si toccano, e l’assorbito sparisce', async () => {
    const { giusto, amano } = await coppia();
    await db.insert(schema.gameScores).values([
      {
        gameId: giusto.id,
        source: 'opencritic',
        score: 90,
        platformSlug: null,
      },
      { gameId: amano.id, source: 'opencritic', score: 10, platformSlug: null },
    ]);

    await mergeGames(await createUser(), giusto.id, amano.id);

    const voti = await db.select().from(schema.gameScores);
    expect(voti).toMatchObject([{ gameId: giusto.id, score: 90 }]);
    const giochi = await db
      .select({ id: schema.games.id })
      .from(schema.games)
      .where(eq(schema.games.id, amano.id));
    expect(giochi).toEqual([]);
  });

  it('riapre HLTB dopo l’arrivo dell’id di un negozio e accoda IGDB', async () => {
    const { giusto, amano } = await coppia();
    await setSource({ gameId: giusto.id, source: 'hltb', status: 'not_found' });
    await db.insert(schema.externalIds).values({
      gameId: amano.id,
      source: 'steam',
      externalId: '1',
    });

    await mergeGames(await createUser(), giusto.id, amano.id);

    const [fonte] = await db
      .select()
      .from(schema.gameSources)
      .where(
        and(
          eq(schema.gameSources.gameId, giusto.id),
          eq(schema.gameSources.source, 'hltb'),
        ),
      );
    expect(fonte!.status).toBe('pending');
    expect(enqueueEnrichment).toHaveBeenCalledWith('igdb', giusto.id);
  });

  it('rifiuta due giochi con igdbId, lo stesso gioco e un gioco che non c’è, senza scrivere', async () => {
    const a = await createGame();
    const b = await createGame();
    const userId = await createUser();
    await riga(userId, b.id);
    const admin = await createUser();

    expect((await mergeGames(admin, a.id, b.id)).status).toBe('both_linked');
    expect((await mergeGames(admin, a.id, a.id)).status).toBe('same_game');
    expect(
      (await mergeGames(admin, a.id, '00000000-0000-4000-8000-000000000000'))
        .status,
    ).toBe('not_found');
    expect((await backlogDi(userId))[0]!.gameId).toBe(b.id);
  });

  it('rifatta a cose fatte non trova più l’assorbito e non scrive', async () => {
    const { giusto, amano } = await coppia();
    const userId = await createUser();
    await riga(userId, amano.id);
    const admin = await createUser();

    await mergeGames(admin, giusto.id, amano.id);
    const seconda = await mergeGames(admin, giusto.id, amano.id);

    expect(seconda.status).toBe('not_found');
    expect(await backlogDi(userId)).toHaveLength(1);
  });
});

describe('previewMerge', () => {
  it('dice cosa farebbe la conferma, e non scrive', async () => {
    const { giusto, amano } = await coppia();
    const soloAmano = await createUser();
    const entrambi = await createUser();
    const soloGiusto = await createUser();
    await riga(soloAmano, amano.id);
    await riga(entrambi, giusto.id, { status: 'playing', rating: 3 });
    await riga(entrambi, amano.id, { status: 'excluded' });
    await riga(soloGiusto, giusto.id);

    const anteprima = await previewMerge(amano.id, giusto.id);

    expect(anteprima.status).toBe('ok');
    expect('preview' in anteprima && anteprima.preview).toMatchObject({
      survivor: { id: giusto.id },
      absorbed: { id: amano.id },
      moved: 1,
      onlySurvivor: 1,
      both: [
        {
          statuses: ['playing', 'excluded'],
          status: 'excluded',
          ratings: [3, null],
          rating: 3,
        },
      ],
    });
    expect(await db.select().from(schema.games)).toHaveLength(2);
    expect((await backlogDi(soloAmano))[0]!.gameId).toBe(amano.id);
  });
});
