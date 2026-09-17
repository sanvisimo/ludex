import { describe, expect, it } from 'vitest';

import type { PsnLibraryEntry, PsnPlayedTitle } from '../external/psn';
import { buildPsnEntries } from './psn-import';

// Pura: qui si decide cosa diventa un possesso, e non c'è Sony da stubbare.

function acquisto(over: Partial<PsnLibraryEntry> = {}): PsnLibraryEntry {
  return {
    conceptId: null,
    name: 'Death’s Door',
    platform: 'PS5',
    titleId: 'PPSA05304_00',
    entitlementId: null,
    subscription: 'NONE',
    ...over,
  };
}

function giocato(over: Partial<PsnPlayedTitle> = {}): PsnPlayedTitle {
  return {
    titleId: 'PPSA01521_00',
    name: 'Horizon Forbidden West',
    playtimeMinutes: 173,
    lastPlayedAt: new Date('2025-01-01T00:00:00Z'),
    category: 'ps5_native_game',
    service: 'other',
    conceptId: '10000886',
    ...over,
  };
}

describe('buildPsnEntries', () => {
  it('fa entrare un disco: giocato `other` e assente dagli acquisti', () => {
    const { entries, dischi } = buildPsnEntries([], [giocato()]);

    expect(dischi).toBe(1);
    expect(entries).toEqual([
      {
        externalId: 'PPSA01521_00',
        name: 'Horizon Forbidden West',
        platformSlug: 'sony_playstation5',
        playtimeMinutes: 173,
        lastPlayedAt: new Date('2025-01-01T00:00:00Z'),
        subscription: null,
        medium: 'physical',
        // Risolto per concept, non per nome: è un id esatto.
        igdbLookup: { source: 36, uid: '10000886' },
      },
    ]);
  });

  it('non fa entrare i giocati che non sono `other`', () => {
    // Un Plus scaduto e un acquisto sparito dal negozio: di tuo non hanno
    // niente, o non ne sappiamo abbastanza per dirlo.
    const { entries, dischi } = buildPsnEntries(
      [],
      [
        giocato({ titleId: 'CUSA11608_00', service: 'none_purchased' }),
        giocato({ titleId: 'PPSA09912_00', service: 'ps_plus' }),
      ],
    );

    expect(dischi).toBe(0);
    expect(entries).toEqual([]);
  });

  it('un `other` che è anche fra gli acquisti non si sdoppia', () => {
    // Elden Ring: `other` fra i giocati e comprato. Il diritto digitale copre
    // il disco, e la voce c'è già dagli acquisti.
    const { entries, dischi } = buildPsnEntries(
      [acquisto({ titleId: 'PPSA04609_00', name: 'ELDEN RING' })],
      [giocato({ titleId: 'ppsa04609_00', name: 'ELDEN RING' })],
    );

    expect(dischi).toBe(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ medium: 'digital' });
  });

  it('gli acquisti non prendono il concept, nemmeno se avviati', () => {
    // La Master Collection di Metal Gear: acquisti separati, uno per gioco,
    // tutti sotto il concept della raccolta. Per concept diventerebbero la
    // raccolta; per nome ciascuno resta il suo gioco.
    const { entries } = buildPsnEntries(
      [
        acquisto({
          titleId: 'PPSA14405_00',
          name: 'METAL GEAR SOLID 3: Snake Eater - Master Collection Version',
        }),
        acquisto({
          titleId: 'PPSA14408_00',
          name: 'Metal Gear & Metal Gear 2: Solid Snake',
        }),
      ],
      [
        giocato({
          titleId: 'PPSA14408_00',
          name: 'METAL GEAR SOLID: MASTER COLLECTION Vol. 1',
          service: 'none(purchased)',
          playtimeMinutes: 413,
          conceptId: '10007607',
        }),
      ],
    );

    expect(entries.map((entry) => entry.igdbLookup ?? null)).toEqual([
      null,
      null,
    ]);
    // Le ore sì: quelle si agganciano per titleId, che è la copia esatta.
    expect(entries.map((entry) => entry.playtimeMinutes)).toEqual([null, 413]);
  });

  it('decora gli acquisti con le ore, e marca l’abbonamento', () => {
    const { entries } = buildPsnEntries(
      [acquisto({ subscription: 'PS_PLUS' })],
      [
        giocato({
          titleId: 'PPSA05304_00',
          service: 'ps_plus',
          playtimeMinutes: 969,
          conceptId: '10003808',
        }),
      ],
    );

    expect(entries).toMatchObject([
      { subscription: 'ps_plus', playtimeMinutes: 969, medium: 'digital' },
    ]);
  });

  it('un disco senza concept si cercherà per nome', () => {
    const { entries } = buildPsnEntries([], [giocato({ conceptId: null })]);
    expect(entries).toMatchObject([{ medium: 'physical', igdbLookup: null }]);
  });

  it('salta con un log il disco di cui non sa dire la console', () => {
    const { entries, scartate, dischi } = buildPsnEntries(
      [],
      [giocato({ titleId: 'NPEB01234_00', category: 'ps3_game' })],
    );

    expect(entries).toEqual([]);
    expect(dischi).toBe(0);
    expect(scartate).toEqual(['Horizon Forbidden West [ps3_game]']);
  });
});
