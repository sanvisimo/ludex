import { describe, expect, it } from 'vitest';

import { parseRangeInput } from './range-input';

const hours = { min: 0, max: 100, step: 0.5 };
const rating = { min: 0.5, max: 5, step: 0.5 };
const year = { min: 1970, max: 2026, step: 1 };

describe('campo numerico accanto a uno slider', () => {
  it('vuoto vuol dire nessun limite', () => {
    expect(parseRangeInput('', hours)).toBeNull();
    expect(parseRangeInput('   ', hours)).toBeNull();
  });

  it('ciò che non è un numero non cambia il filtro', () => {
    expect(parseRangeInput('abc', hours)).toBeUndefined();
    expect(parseRangeInput('12 ore', hours)).toBeUndefined();
    expect(parseRangeInput('Infinity', hours)).toBeUndefined();
  });

  it('un numero dentro gli estremi resta com’è', () => {
    expect(parseRangeInput('12', hours)).toBe(12);
    expect(parseRangeInput('2000', year)).toBe(2000);
  });

  it('la virgola vale come il punto', () => {
    expect(parseRangeInput('2,5', hours)).toBe(2.5);
    expect(parseRangeInput('4,5', rating)).toBe(4.5);
  });

  it('si porta al passo dello slider', () => {
    expect(parseRangeInput('0.3', hours)).toBe(0.5);
    expect(parseRangeInput('0.2', hours)).toBe(0);
    expect(parseRangeInput('2.25', rating)).toBe(2.5);
    expect(parseRangeInput('1999.6', year)).toBe(2000);
  });

  it('il passo parte dal minimo, non da zero', () => {
    // Il voto va da 0,5 a 5 a passi di 0,5: 1 è un passo valido, 1,2 no.
    expect(parseRangeInput('1', rating)).toBe(1);
    expect(parseRangeInput('1.2', rating)).toBe(1);
  });

  it('sta dentro gli estremi', () => {
    expect(parseRangeInput('150', hours)).toBe(100);
    expect(parseRangeInput('-3', hours)).toBe(0);
    expect(parseRangeInput('0', rating)).toBe(0.5);
    expect(parseRangeInput('1960', year)).toBe(1970);
    expect(parseRangeInput('2031', year)).toBe(2026);
    expect(parseRangeInput('1e3', hours)).toBe(100);
  });

  it('niente scarti della virgola mobile', () => {
    expect(parseRangeInput('0.8', { min: 0, max: 1, step: 0.1 })).toBe(0.8);
    expect(
      parseRangeInput('0.30000000000000004', { min: 0, max: 1, step: 0.1 }),
    ).toBe(0.3);
  });
});
