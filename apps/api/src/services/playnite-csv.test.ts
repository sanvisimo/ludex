import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PlayniteCsvError, parsePlayniteCsv } from './playnite-csv';

const fixture = (nome: string) =>
  readFileSync(new URL(`../../test/fixtures/${nome}`, import.meta.url), 'utf8');

describe('parsePlayniteCsv', () => {
  it('legge l’export Ubisoft con tutti i campi', () => {
    const rows = parsePlayniteCsv(fixture('playnite-ubisoft-2026-08.csv'));

    // 151 righe di testo, ma le descrizioni vanno a capo dentro le virgolette.
    expect(rows).toHaveLength(87);
    expect(rows.every((row) => row.store === 'ubisoft')).toBe(true);
    expect(rows.filter((row) => row.steamAppId)).toHaveLength(67);

    expect(
      rows.find((row) => row.name === 'Anno 1404 - History Edition'),
    ).toMatchObject({
      gameId: '16232',
      platforms: ['PC (Windows)'],
      releaseYear: 2020,
      steamAppId: '1281630',
      playtimeMinutes: null,
      status: 'backlog',
    });

    // Il tempo di gioco è in secondi.
    expect(
      rows.find((row) => row.name === "Assassin's Creed Valhalla"),
    ).toMatchObject({
      playtimeMinutes: 19763,
      lastPlayedAt: new Date(Date.UTC(2024, 3, 24)),
      status: 'played',
    });

    expect(
      rows.find((row) => row.name === 'Prince of Persia: The Lost Crown'),
    ).toMatchObject({ categories: ['worth to play'], status: 'backlog' });
    expect(rows.find((row) => row.name === 'The Crew')?.status).toBe(
      'excluded',
    );
    expect(rows.find((row) => row.name === "Assassin's Creed")?.status).toBe(
      'completed',
    );
  });

  it('legge un export con più negozi e più piattaforme', () => {
    const rows = parsePlayniteCsv(fixture('playnite-export-2026-08.csv'));

    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((row) => row.store))).toEqual(
      new Set(['amazon', 'xbox', 'ubisoft']),
    );
    expect(rows.some((row) => row.platforms.length > 1)).toBe(true);
  });

  it('vuole solo nome, id e sorgente', () => {
    const rows = parsePlayniteCsv(
      'Nome,Id del gioco,Sorgenti\nUNO,123,Ubisoft Connect\nGioco a mano,456,\n',
    );

    expect(rows).toEqual([
      expect.objectContaining({ name: 'UNO', store: 'ubisoft' }),
      expect.objectContaining({ name: 'Gioco a mano', store: null }),
    ]);
  });

  it('dice quali colonne obbligatorie mancano', () => {
    expect(() => parsePlayniteCsv('Nome,Generi\nUNO,Card\n')).toThrow(
      expect.objectContaining({
        reason: 'missing_columns',
        missing: ['Id del gioco', 'Sorgenti'],
      }) as PlayniteCsvError,
    );
  });

  it('rifiuta un file senza giochi', () => {
    expect(() => parsePlayniteCsv('Nome,Id del gioco,Sorgenti\n')).toThrow(
      PlayniteCsvError,
    );
  });
});
