import { describe, expect, it } from 'vitest';

import { parsePosition, reorderPage } from './curated-order';

// Si testa ciò che, sbagliando, mostra un ordine diverso da quello che il server
// scriverà: il posto chiesto al server e i numeri sulle card.

const page = (names: string[], first = 0) =>
  names.map((name, index) => ({ name, position: first + index }));

describe('lo spostamento dentro la pagina', () => {
  it('in avanti e indietro, coi numeri della pagina', () => {
    expect(reorderPage(page(['A', 'B', 'C', 'D']), 0, 2)).toEqual({
      games: [
        { name: 'B', position: 0 },
        { name: 'C', position: 1 },
        { name: 'A', position: 2 },
        { name: 'D', position: 3 },
      ],
      target: 2,
    });
    expect(reorderPage(page(['A', 'B', 'C']), 2, 0)!.games).toEqual([
      { name: 'C', position: 0 },
      { name: 'A', position: 1 },
      { name: 'B', position: 2 },
    ]);
  });

  it('sulla seconda pagina il posto è quello della lista intera', () => {
    const moved = reorderPage(page(['X', 'Y', 'Z'], 50), 2, 0)!;
    expect(moved.target).toBe(50);
    expect(moved.games.map((g) => `${g.position}:${g.name}`)).toEqual([
      '50:Z',
      '51:X',
      '52:Y',
    ]);
  });

  it('allo stesso posto, o fuori dalla pagina, non succede niente', () => {
    expect(reorderPage(page(['A', 'B']), 1, 1)).toBeNull();
    expect(reorderPage(page(['A', 'B']), 0, 5)).toBeNull();
  });
});

describe('«Sposta alla posizione…»', () => {
  it('da 1 a N diventa da 0 a N-1', () => {
    expect(parsePosition('1', 100)).toBe(0);
    expect(parsePosition(' 100 ', 100)).toBe(99);
  });

  it('fuori da 1–N, o non un intero, non si conferma', () => {
    for (const text of ['0', '101', '', '3.5', '-2', 'tre'])
      expect(parsePosition(text, 100)).toBeNull();
  });
});
