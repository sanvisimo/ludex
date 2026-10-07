import { describe, expect, it } from 'vitest';

import { latestPlaytime } from './playtime';

const day = (value: string) => new Date(value);

describe('ore giocate nel backlog', () => {
  it('senza ore non si mostra niente: zero e «non lo so» non sono ore', () => {
    expect(latestPlaytime([])).toBeNull();
    // Le ore di un inserimento a mano sono `null`, perché nessuno le ha scritte.
    expect(
      latestPlaytime([{ playtimeMinutes: null, lastPlayedAt: null }]),
    ).toBeNull();
    expect(
      latestPlaytime([{ playtimeMinutes: 0, lastPlayedAt: day('2026-01-01') }]),
    ).toBeNull();
  });

  it('con una copia sola, quella', () => {
    expect(
      latestPlaytime([
        { playtimeMinutes: 360, lastPlayedAt: day('2026-01-01') },
      ]),
    ).toBe(360);
  });

  it("vince l'ultima partita, non le ore", () => {
    expect(
      latestPlaytime([
        { playtimeMinutes: 2400, lastPlayedAt: day('2019-05-01') },
        { playtimeMinutes: 360, lastPlayedAt: day('2026-10-01') },
      ]),
    ).toBe(360);
  });

  it('una data vale più di nessuna data', () => {
    expect(
      latestPlaytime([
        { playtimeMinutes: 9000, lastPlayedAt: null },
        { playtimeMinutes: 60, lastPlayedAt: day('2020-01-01') },
      ]),
    ).toBe(60);
  });

  it('senza date, o a pari data, decidono le ore', () => {
    expect(
      latestPlaytime([
        { playtimeMinutes: 60, lastPlayedAt: null },
        { playtimeMinutes: 600, lastPlayedAt: null },
      ]),
    ).toBe(600);
    expect(
      latestPlaytime([
        { playtimeMinutes: 60, lastPlayedAt: day('2026-01-01') },
        { playtimeMinutes: 90, lastPlayedAt: day('2026-01-01') },
      ]),
    ).toBe(90);
  });

  it('una copia con la data più recente ma zero ore non toglie il posto alle altre', () => {
    expect(
      latestPlaytime([
        { playtimeMinutes: 0, lastPlayedAt: day('2026-12-01') },
        { playtimeMinutes: 120, lastPlayedAt: day('2020-01-01') },
      ]),
    ).toBe(120);
  });
});
