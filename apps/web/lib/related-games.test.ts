import type { RelatedGame } from '@repo/contracts';
import { describe, expect, it } from 'vitest';

import { splitRelated } from './related-games';

function row(kind: RelatedGame['kind'], igdbId: number): RelatedGame {
  return {
    kind,
    igdbId,
    name: `Gioco ${igdbId}`,
    coverImageId: null,
    gameId: null,
    slug: null,
    owned: false,
    status: null,
  };
}

const related = [
  row('parent', 1),
  row('remake', 2),
  row('expanded', 3),
  row('similar', 4),
];

describe('splitRelated', () => {
  it('di un contenuto aggiuntivo il padre è il gioco principale', () => {
    const { mainGame, versions, similar } = splitRelated('expansion', related);

    expect(mainGame.map((game) => game.igdbId)).toEqual([1]);
    expect(versions.map((game) => game.igdbId)).toEqual([2, 3]);
    expect(similar.map((game) => game.igdbId)).toEqual([4]);
  });

  it("di un'altra versione il padre esce per primo fra le versioni", () => {
    const { mainGame, versions } = splitRelated('expanded_game', related);

    expect(mainGame).toEqual([]);
    expect(versions.map((game) => game.igdbId)).toEqual([1, 2, 3]);
  });

  it('un tipo che non conosciamo tiene il padre come gioco principale', () => {
    expect(
      splitRelated(null, related).mainGame.map((game) => game.igdbId),
    ).toEqual([1]);
  });
});
