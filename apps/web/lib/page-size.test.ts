import { describe, expect, it } from 'vitest';

import {
  defaultPageSize,
  pageRows,
  pageSizeOptions,
  pageStep,
  reanchorPage,
  snapPageSize,
} from './page-size';

// Si testa ciò che, sbagliando, mostra una pagina storta senza dirlo: un numero
// per pagina che non è un multiplo delle colonne, uno che il server rifiuta, una
// pagina che non tiene in vista il gioco di prima.

describe('numero per pagina', () => {
  it('le voci del menu sono righe × colonne', () => {
    expect(pageSizeOptions(7)).toEqual(pageRows.map((r) => r * 7));
    expect(pageSizeOptions(3)).toEqual(pageRows.map((r) => r * 3));
  });

  it('ogni voce del menu è già un multiplo, qualunque siano le colonne', () => {
    for (let columns = 1; columns <= 7; columns++)
      for (const option of pageSizeOptions(columns))
        expect(snapPageSize(option, columns)).toBe(option);
  });

  it('il default si porta al multiplo più vicino', () => {
    expect(snapPageSize(defaultPageSize, 7)).toBe(14);
    expect(snapPageSize(defaultPageSize, 3)).toBe(15);
    expect(snapPageSize(defaultPageSize, 2)).toBe(14);
    expect(snapPageSize(defaultPageSize, 5)).toBe(15);
    expect(snapPageSize(defaultPageSize, 6)).toBe(12);
  });

  it('mai meno di una riga', () => {
    expect(snapPageSize(1, 7)).toBe(7);
  });

  it('mai più del tetto del contratto, che è 200', () => {
    expect(snapPageSize(200, 7)).toBe(196);
    expect(snapPageSize(10_000, 3)).toBe(198);
  });

  it('le voci del menu stanno sotto il tetto con le colonne che la pagina può avere', () => {
    // La pagina è larga al più 1280 px: 7 colonne.
    for (let columns = 1; columns <= 7; columns++)
      for (const option of pageSizeOptions(columns))
        expect(option).toBeLessThanOrEqual(200);
  });

  it('la griglia usa le colonne, le altre viste un passo fisso', () => {
    expect(pageStep(true, 3)).toBe(3);
    expect(pageStep(true, 0)).toBe(1);
    expect(pageStep(false, 3)).toBe(7);
  });
});

describe('riancorare la pagina', () => {
  it('tiene in vista il primo gioco di prima', () => {
    // Pagina 3 da 14: il primo gioco è il 29° (indice 28). Da 15 sta nella 2.
    expect(reanchorPage(3, 14, 15)).toBe(2);
    // Da 7 sta nella 5.
    expect(reanchorPage(3, 14, 7)).toBe(5);
  });

  it('la prima pagina resta la prima, e il numero uguale non sposta niente', () => {
    expect(reanchorPage(1, 14, 35)).toBe(1);
    expect(reanchorPage(4, 15, 15)).toBe(4);
  });

  it('il primo gioco della pagina nuova è quello di prima o uno prima', () => {
    for (const [from, to] of [
      [14, 15],
      [15, 12],
      [35, 14],
      [14, 35],
      [7, 105],
    ] as const)
      for (let page = 1; page <= 9; page++) {
        const firstBefore = (page - 1) * from;
        const next = reanchorPage(page, from, to);
        const firstAfter = (next - 1) * to;
        expect(firstAfter).toBeLessThanOrEqual(firstBefore);
        expect(firstBefore).toBeLessThan(firstAfter + to);
      }
  });
});
