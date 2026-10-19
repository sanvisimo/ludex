import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CsvFileError, parseCsvFile } from './csv-file';

const fixture = (nome: string) =>
  readFileSync(new URL(`../../test/fixtures/${nome}`, import.meta.url), 'utf8');

describe('parseCsvFile', () => {
  it('legge l’export di Playnite in italiano, con tutti i campi', () => {
    const rows = parseCsvFile(fixture('playnite-ubisoft-2026-08.csv'));

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
    const rows = parseCsvFile(fixture('playnite-export-2026-08.csv'));

    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((row) => row.store))).toEqual(
      new Set(['amazon', 'xbox', 'ubisoft']),
    );
    expect(rows.some((row) => row.platforms.length > 1)).toBe(true);
  });

  it('legge il CSV d’esempio che la pagina fa scaricare', () => {
    const rows = parseCsvFile(
      readFileSync(
        new URL(
          '../../../web/public/ludex-import-example.csv',
          import.meta.url,
        ),
        'utf8',
      ),
    );

    expect(rows).toEqual([
      {
        name: 'Valiant Hearts',
        gameId: '659',
        source: 'Ubisoft Connect',
        store: 'ubisoft',
        platforms: ['PC (Windows)'],
        releaseYear: 2014,
        steamAppId: '260230',
        playtimeMinutes: 300,
        lastPlayedAt: new Date(Date.UTC(2024, 3, 24)),
        status: 'completed',
        categories: ['worth to play'],
      },
      {
        name: 'Astro Bot',
        gameId: null,
        source: 'PlayStation',
        store: 'psn',
        platforms: ['Sony PlayStation 5'],
        releaseYear: 2024,
        steamAppId: null,
        playtimeMinutes: null,
        lastPlayedAt: null,
        status: 'backlog',
        categories: [],
      },
    ]);
  });

  it('legge la vista di LaunchBox incollata in un file di testo, in inglese e in italiano', () => {
    const inglese = parseCsvFile(fixture('launchbox.txt'));
    const italiano = parseCsvFile(fixture('launchbox.csv'));

    // A tabulazioni, con 35 colonne: si prendono le stesse cose.
    expect(inglese).toHaveLength(10);
    expect(italiano).toHaveLength(6);
    for (const rows of [inglese, italiano]) {
      expect(rows[0]).toEqual({
        name: 'Anno 1404 - History Edition',
        // Da `uplay://launch/16232`: lo stesso id di Playnite.
        gameId: '16232',
        source: 'Ubisoft Connect',
        store: 'ubisoft',
        platforms: ['Windows'],
        releaseYear: 2020,
        steamAppId: null,
        // `0h 00m 00s`: mai giocato, come lo zero di Playnite.
        playtimeMinutes: null,
        lastPlayedAt: null,
        status: 'backlog',
        categories: [],
      });
    }
    // Le date di LaunchBox sono quelle dell'uscita, non della riedizione.
    expect(
      inglese.find((row) => row.name === "Assassin's Creed Brotherhood")
        ?.releaseYear,
    ).toBe(2011);
  });

  it('il tempo di LaunchBox in ore, minuti e secondi', () => {
    const [row] = parseCsvFile(
      'Title\tSource\tPlay Time\nUNO\tUbisoft Connect\t12h 34m 30s\n',
    );

    expect(row!.playtimeMinutes).toBe(12 * 60 + 35);
  });

  it('vuole solo nome e sorgente, in inglese o in italiano', () => {
    expect(parseCsvFile('name,source\nUNO,Ubisoft\nGioco a mano,\n')).toEqual([
      expect.objectContaining({ name: 'UNO', gameId: null, store: 'ubisoft' }),
      expect.objectContaining({ name: 'Gioco a mano', store: null }),
    ]);
    expect(parseCsvFile('Nome,Sorgenti\nUNO,Ubisoft Connect\n')).toEqual([
      expect.objectContaining({ name: 'UNO', store: 'ubisoft' }),
    ]);
  });

  it('dice quali colonne obbligatorie mancano, coi nomi inglesi', () => {
    expect(() => parseCsvFile('Nome,Generi\nUNO,Card\n')).toThrow(
      expect.objectContaining({
        reason: 'missing_columns',
        missing: ['Sources'],
      }) as CsvFileError,
    );
  });

  it('rifiuta un file senza giochi', () => {
    expect(() => parseCsvFile('Name,Sources\n')).toThrow(CsvFileError);
  });
});
