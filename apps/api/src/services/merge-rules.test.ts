import { describe, expect, it } from 'vitest';

import {
  mergeAddedAt,
  mergeHiddenAt,
  mergeNotes,
  mergeRating,
  mergeStatus,
  pickSurvivor,
} from './merge-rules';

const prima = new Date('2024-01-01');
const dopo = new Date('2025-01-01');

describe('mergeStatus', () => {
  it('excluded vince su tutto: è un giudizio esplicito', () => {
    for (const altro of [
      'backlog',
      'playing',
      'played',
      'completed',
      'dropped',
    ] as const) {
      expect(mergeStatus('excluded', altro)).toBe('excluded');
      expect(mergeStatus(altro, 'excluded')).toBe('excluded');
    }
  });

  it('altrimenti vince il più avanzato, in qualunque ordine', () => {
    const ordine = [
      'backlog',
      'dropped',
      'playing',
      'played',
      'completed',
    ] as const;
    for (const [i, a] of ordine.entries())
      for (const [j, b] of ordine.entries())
        expect(mergeStatus(a, b)).toBe(i >= j ? a : b);
  });
});

describe('mergeRating', () => {
  const riga = (rating: number | null, updatedAt: Date) => ({
    rating,
    createdAt: prima,
    updatedAt,
  });

  it('se ce n’è uno solo, quello', () => {
    expect(mergeRating(riga(null, dopo), riga(4, prima))).toBe(4);
    expect(mergeRating(riga(3.5, prima), riga(null, dopo))).toBe(3.5);
    expect(mergeRating(riga(null, prima), riga(null, dopo))).toBeNull();
  });

  it('se sono due, quello della riga modificata per ultima', () => {
    expect(mergeRating(riga(2, prima), riga(5, dopo))).toBe(5);
    expect(mergeRating(riga(2, dopo), riga(5, prima))).toBe(2);
  });
});

describe('mergeNotes', () => {
  const riga = (notes: string | null, createdAt: Date) => ({
    notes,
    createdAt,
    updatedAt: createdAt,
  });

  it('concatena, la più vecchia per prima', () => {
    expect(mergeNotes(riga('nuova', dopo), riga('vecchia', prima))).toBe(
      'vecchia\n\nnuova',
    );
  });

  it('una sola se sono uguali, o se l’altra è vuota', () => {
    expect(mergeNotes(riga('uguale', prima), riga(' uguale ', dopo))).toBe(
      'uguale',
    );
    expect(mergeNotes(riga(null, prima), riga('solo', dopo))).toBe('solo');
    expect(mergeNotes(riga('solo', prima), riga('  ', dopo))).toBe('solo');
    expect(mergeNotes(riga(null, prima), riga(null, dopo))).toBeNull();
  });
});

describe('mergeHiddenAt e mergeAddedAt', () => {
  it('nascosto solo se lo sono entrambe', () => {
    expect(mergeHiddenAt(prima, null)).toBeNull();
    expect(mergeHiddenAt(null, dopo)).toBeNull();
    expect(mergeHiddenAt(dopo, prima)).toEqual(prima);
  });

  it('addedAt è il più vecchio', () => {
    expect(mergeAddedAt(dopo, prima)).toEqual(prima);
  });
});

describe('pickSurvivor', () => {
  const gioco = (igdbId: number | null, createdAt: Date) => ({
    igdbId,
    createdAt,
  });

  it('sopravvive quello con igdbId', () => {
    const a = gioco(null, prima);
    const b = gioco(10, dopo);
    expect(pickSurvivor(a, b)).toEqual({ survivor: b, absorbed: a });
    expect(pickSurvivor(b, a)).toEqual({ survivor: b, absorbed: a });
  });

  it('senza igdbId, il più vecchio', () => {
    const a = gioco(null, dopo);
    const b = gioco(null, prima);
    expect(pickSurvivor(a, b)).toEqual({ survivor: b, absorbed: a });
  });

  it('con due igdbId non si fonde', () => {
    expect(pickSurvivor(gioco(1, prima), gioco(2, dopo))).toBeNull();
  });
});
