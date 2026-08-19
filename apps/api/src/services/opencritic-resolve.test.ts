import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame, setSource } from '../../test/factories';
import { fetchOpenCriticIdsBySlug } from '../external/wikidata';
import { resolveOpenCriticIds } from './opencritic-resolve';

vi.mock('../external/wikidata', () => ({
  fetchOpenCriticIdsBySlug: vi.fn(),
}));

const mockedWikidata = vi.mocked(fetchOpenCriticIdsBySlug);

beforeEach(() => {
  mockedWikidata.mockReset();
});

function sourceRow(gameId: string) {
  return db.query.gameSources.findFirst({
    where: and(
      eq(schema.gameSources.gameId, gameId),
      eq(schema.gameSources.source, 'opencritic'),
    ),
  });
}

/** Lo slug non passa da `createGame`: lo scrive l'enrichment IGDB. */
async function withSlug(gameId: string, slug: string) {
  await db
    .update(schema.games)
    .set({ igdbSlug: slug })
    .where(eq(schema.games.id, gameId));
}

describe('resolveOpenCriticIds', () => {
  it("scrive l'indirizzo e lascia il voto a chi arricchisce", async () => {
    const game = await createGame({ name: 'Hollow Knight' });
    await withSlug(game.id, 'hollow-knight');
    mockedWikidata.mockResolvedValue(new Map([['hollow-knight', 4002]]));

    const report = await resolveOpenCriticIds();

    expect(report).toMatchObject({ candidati: 1, conMappa: 1, agganciati: 1 });
    // `pending`, non `ok`: qui si è scritto solo dove andare a guardare.
    expect(await sourceRow(game.id)).toMatchObject({
      status: 'pending',
      externalId: '4002',
      syncedAt: null,
    });
  });

  it('lascia stare i giochi senza slug, che a Wikidata non si possono chiedere', async () => {
    await createGame({ name: 'Gioco Non Arricchito' });
    mockedWikidata.mockResolvedValue(new Map());

    const report = await resolveOpenCriticIds();

    expect(report.candidati).toBe(0);
    expect(mockedWikidata).not.toHaveBeenCalled();
  });

  it('riapre un gioco chiuso, il giorno che Wikidata gli dà un indirizzo', async () => {
    const game = await createGame({ name: 'Half-Life' });
    await withSlug(game.id, 'half-life');
    // Chiuso perché la ricerca non aveva trovato niente — o, per un gioco del
    // 1998, perché non lo si cerca affatto.
    await setSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'not_found',
      attemptedAt: new Date(),
    });
    mockedWikidata.mockResolvedValue(new Map([['half-life', 1234]]));

    const report = await resolveOpenCriticIds();

    expect(report).toMatchObject({ candidati: 1, agganciati: 1 });
    // Avere un indirizzo è l'evento che riapre la fonte: senza questo, il
    // recupero non servirebbe a niente perché la spazzata salta i `not_found`.
    expect(await sourceRow(game.id)).toMatchObject({
      status: 'pending',
      externalId: '1234',
      error: null,
      attemptedAt: null,
    });
  });

  it('non tocca chi un indirizzo ce l\'ha già', async () => {
    const game = await createGame({ name: 'Hollow Knight' });
    await withSlug(game.id, 'hollow-knight');
    await setSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'ok',
      externalId: '4002',
    });
    mockedWikidata.mockResolvedValue(new Map([['hollow-knight', 1]]));

    const report = await resolveOpenCriticIds();

    expect(report.candidati).toBe(0);
    expect(await sourceRow(game.id)).toMatchObject({ externalId: '4002' });
  });

  it('sopravvive a due giochi che Wikidata manda sullo stesso id', async () => {
    const primo = await createGame({ name: 'BioShock' });
    await withSlug(primo.id, 'bioshock');
    const secondo = await createGame({ name: 'BioShock Remastered' });
    await withSlug(secondo.id, 'bioshock-remastered');
    mockedWikidata.mockResolvedValue(
      new Map([
        ['bioshock', 111],
        ['bioshock-remastered', 111],
      ]),
    );

    const report = await resolveOpenCriticIds();

    // Uno passa, l'altro lo respinge l'unique su (fonte, id esterno) — che è
    // il vincolo che impedisce a due nostri giochi di essere la stessa voce.
    // Il secondo non porta giù il primo, ed è per questo che si inserisce uno
    // alla volta invece che in blocco.
    expect(report).toMatchObject({ conMappa: 2, agganciati: 1, conflitti: 1 });
  });
});
