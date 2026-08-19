import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { describe, expect, it } from 'vitest';

import { createGame } from '../../test/factories';
import { saveScores } from './scores';

function scoreRows(gameId: string) {
  return db
    .select()
    .from(schema.gameScores)
    .where(eq(schema.gameScores.gameId, gameId));
}

function gameRow(gameId: string) {
  return db.query.games.findFirst({ where: eq(schema.games.id, gameId) });
}

describe('saveScores', () => {
  it('sceglie il voto denormalizzato per precedenza fra le fonti', async () => {
    const game = await createGame();

    await saveScores(game.id, 'igdb', [{ score: 87 }]);
    expect(await gameRow(game.id)).toMatchObject({
      criticScore: 87,
      criticScoreSource: 'igdb',
    });

    // Metacritic scavalca IGDB, e OpenCritic scavalca Metacritic: conta
    // l'ordine, non chi ha scritto per ultimo.
    await saveScores(game.id, 'metacritic', [{ score: 90 }]);
    expect(await gameRow(game.id)).toMatchObject({
      criticScore: 90,
      criticScoreSource: 'metacritic',
    });

    await saveScores(game.id, 'opencritic', [{ score: 89.5 }]);
    expect(await gameRow(game.id)).toMatchObject({
      criticScore: 89.5,
      criticScoreSource: 'opencritic',
    });
  });

  it('non lascia che un voto per piattaforma finisca in cima', async () => {
    const game = await createGame();

    await saveScores(game.id, 'metacritic', [
      { score: 66, reviewCount: 33 },
      { platformSlug: 'pc_windows', score: 88, reviewCount: 27 },
    ]);

    // Il caso Mafia: la riga di testa vale 66 e quella PC 88. Su `games`, che
    // è condivisa fra utenti e non sa su cosa si gioca, va il complessivo.
    expect(await gameRow(game.id)).toMatchObject({ criticScore: 66 });
    expect((await scoreRows(game.id)).length).toBe(2);
  });

  it('riscrive in blocco: quello che la fonte non dà più sparisce', async () => {
    const game = await createGame();

    await saveScores(game.id, 'metacritic', [
      { score: 90 },
      { platformSlug: 'pc_windows', score: 87 },
      { platformSlug: 'nintendo_switch', score: 90 },
    ]);
    expect((await scoreRows(game.id)).length).toBe(3);

    await saveScores(game.id, 'metacritic', [
      { score: 91 },
      { platformSlug: 'pc_windows', score: 88 },
    ]);

    const righe = await scoreRows(game.id);
    expect(righe.length).toBe(2);
    expect(righe.find((riga) => riga.platformSlug === null)?.score).toBe(91);
    expect(
      righe.find((riga) => riga.platformSlug === 'nintendo_switch'),
    ).toBeUndefined();
  });

  it('tocca solo la fonte che sta scrivendo', async () => {
    const game = await createGame();
    await saveScores(game.id, 'igdb', [{ score: 87 }]);

    await saveScores(game.id, 'opencritic', [{ score: 89.5 }]);

    const righe = await scoreRows(game.id);
    expect(righe.map((riga) => riga.source).sort()).toEqual([
      'igdb',
      'opencritic',
    ]);
  });

  it('azzera il voto denormalizzato quando la fonte lo ritira', async () => {
    const game = await createGame();
    await saveScores(game.id, 'igdb', [{ score: 87 }]);

    // Una lista vuota è la cancellazione, e va distinta dal non chiamare
    // affatto: qui il numero deve tornare nullo, non restare l'87 di prima.
    await saveScores(game.id, 'igdb', []);

    expect(await scoreRows(game.id)).toEqual([]);
    expect(await gameRow(game.id)).toMatchObject({
      criticScore: null,
      criticScoreSource: null,
    });
  });
});
