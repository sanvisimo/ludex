import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchNintendoPlayHistory,
  fetchNintendoVgc,
  NintendoAuthError,
  type NintendoPlayedTitle,
  type NintendoVgcEntry,
} from '../external/nintendo';
import { importLibrary } from './library-import';
import {
  buildNintendoEntries,
  importNintendoLibrary,
  toPlatformSlug,
} from './nintendo-import';
import {
  nintendoCredentials,
  requireReauth,
  type StoreAccountRow,
} from './store-accounts';

vi.mock('../external/nintendo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/nintendo')>()),
  fetchNintendoPlayHistory: vi.fn(),
  fetchNintendoVgc: vi.fn(),
}));
vi.mock('./library-import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./library-import')>()),
  importLibrary: vi.fn(),
}));
vi.mock('./store-accounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store-accounts')>()),
  nintendoCredentials: vi.fn(),
  requireReauth: vi.fn(),
}));

// La parte pura prova cosa diventa un possesso, e non c'è Nintendo da stubbare.
// L'orchestrazione sta sotto, con le due fonti e l'import stubbati al confine del
// modulo.

const ZELDA = '01007ef00011e000';
const MK8 = '0100152000022000';

function giocato(over: Partial<NintendoPlayedTitle> = {}): NintendoPlayedTitle {
  return {
    titleId: MK8,
    name: 'Mario Kart 8 Deluxe',
    platform: 'HAC',
    playtimeMinutes: 472,
    lastPlayedAt: new Date('2023-12-07T00:00:00Z'),
    firstPlayedAt: new Date('2022-03-02T00:00:00Z'),
    ...over,
  };
}

function carta(over: Partial<NintendoVgcEntry> = {}): NintendoVgcEntry {
  return {
    applicationId: MK8,
    name: 'Mario Kart 8 Deluxe',
    platform: 'NX',
    hasApplication: true,
    ownerNaId: '3247fa748f1dd367',
    userNaId: '3247fa748f1dd367',
    isLending: false,
    imageUrl: 'https://atum-img-lp1.cdn.nintendo.net/i/c/abc_512',
    ...over,
  };
}

describe('buildNintendoEntries', () => {
  it('una licenza digitale giocata prende le ore dallo storico, ed è digitale', () => {
    const { entries, digitali, fisici } = buildNintendoEntries(
      [giocato()],
      [carta()],
    );

    expect(digitali).toBe(1);
    expect(fisici).toBe(0);
    // Una voce sola: l'id è lo stesso da tutte e due le parti.
    expect(entries).toEqual([
      {
        externalId: MK8,
        name: 'Mario Kart 8 Deluxe',
        platformSlug: 'nintendo_switch',
        playtimeMinutes: 472,
        lastPlayedAt: new Date('2023-12-07T00:00:00Z'),
        medium: 'digital',
        imageUrl: 'https://atum-img-lp1.cdn.nintendo.net/i/c/abc_512',
      },
    ]);
  });

  it('un acquisto mai avviato entra: è la ragione per cui le Virtual Game Cards ci sono', () => {
    // Hyrule Warriors: Age of Calamity e Blanc: comprati e mai lanciati.
    const { entries } = buildNintendoEntries(
      [],
      [
        carta({
          applicationId: '01002b00111a2000',
          name: 'Hyrule Warriors: Age of Calamity',
        }),
      ],
    );

    expect(entries).toEqual([
      expect.objectContaining({
        externalId: '01002b00111a2000',
        medium: 'digital',
        playtimeMinutes: null,
        lastPlayedAt: null,
      }),
    ]);
  });

  it('un titolo nello storico e non fra le licenze è una cartuccia', () => {
    const { entries, fisici } = buildNintendoEntries(
      [
        giocato({
          titleId: '0100a3d008c5c000',
          name: 'The Legend of Zelda: Tears of the Kingdom',
        }),
      ],
      [carta()],
    );

    expect(fisici).toBe(1);
    expect(entries.find((e) => e.name.includes('Tears'))).toMatchObject({
      medium: 'physical',
      playtimeMinutes: 472,
    });
  });

  it('una voce di soli contenuti aggiuntivi non è una copia del gioco', () => {
    // Zelda: Breath of the Wild è la cartuccia; la voce delle Virtual Game Cards
    // è l'aggiornamento gratuito. Digitale + fisico farebbe un doppione falso.
    const { entries, soloContenuti, digitali } = buildNintendoEntries(
      [
        giocato({
          titleId: ZELDA,
          name: 'The Legend of Zelda: Breath of the Wild',
        }),
      ],
      [
        carta({
          applicationId: ZELDA,
          name: 'The Legend of Zelda: Breath of the Wild',
          hasApplication: false,
        }),
      ],
    );

    expect(soloContenuti).toBe(1);
    expect(digitali).toBe(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ externalId: ZELDA, medium: 'physical' });
  });

  it('i soli contenuti di un gioco mai avviato non lasciano traccia', () => {
    // Come un disco PSN mai avviato: la cartuccia non ha nessuna fonte.
    const { entries } = buildNintendoEntries(
      [],
      [
        carta({
          applicationId: '0100b04011742000',
          name: 'MONSTER HUNTER RISE',
          hasApplication: false,
        }),
      ],
    );
    expect(entries).toEqual([]);
  });

  it("l'id si confronta senza guardare le maiuscole", () => {
    const { entries } = buildNintendoEntries(
      [giocato({ titleId: MK8.toUpperCase() })],
      [carta()],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]!.externalId).toBe(MK8);
  });

  it('senza le Virtual Game Cards non dichiara né fisico né digitale', () => {
    // Dire «fisico» sarebbe falso per quasi tutta la libreria digitale giocata.
    const { entries, fisici } = buildNintendoEntries([giocato()], null);

    expect(fisici).toBe(0);
    expect(entries[0]).not.toHaveProperty('medium');
    expect(entries[0]).toMatchObject({ externalId: MK8, playtimeMinutes: 472 });
  });

  it('non dichiara abbonamento né data d’acquisto', () => {
    // Il primo avvio non è la data d'acquisto: scritto lì farebbe arretrare
    // `backlog.added_at` su un'informazione che non è quella.
    const { entries } = buildNintendoEntries([giocato()], [carta()]);

    expect(entries[0]).not.toHaveProperty('subscription');
    expect(entries[0]).not.toHaveProperty('acquiredAt');
  });

  it('salta con una traccia un codice che non sa tradurre, dalle due fonti', () => {
    const { entries, scartate } = buildNintendoEntries(
      [
        giocato({
          titleId: '0100000000000001',
          name: 'Dallo storico',
          platform: 'BEE',
        }),
      ],
      [
        carta({
          applicationId: '0100000000000002',
          name: 'Dalle carte',
          platform: 'ZZZ',
        }),
      ],
    );

    expect(entries).toEqual([]);
    expect(scartate).toEqual(['Dalle carte [ZZZ]', 'Dallo storico [BEE]']);
  });

  it('la Switch 2 delle Virtual Game Cards è OUNCE', () => {
    const { entries } = buildNintendoEntries(
      [],
      [
        carta({
          applicationId: '0100aaaaaaaaa000',
          name: 'Mario Kart World',
          platform: 'OUNCE',
        }),
      ],
    );
    expect(entries[0]).toMatchObject({ platformSlug: 'nintendo_switch2' });
  });

  it('conta i giochi in prestito senza trattarli', () => {
    const { entries, nonTue } = buildNintendoEntries(
      [],
      [
        carta({ isLending: true }),
        carta({
          applicationId: '0100bbbbbbbbb000',
          name: 'Di un altro',
          ownerNaId: 'altro',
        }),
      ],
    );
    expect(nonTue).toBe(2);
    expect(entries).toHaveLength(2);
  });

  it('non filtra le app dell’abbonamento: cadono fra gli irrisolti da sole', () => {
    // Nessun campo le distingue da un gioco.
    const { entries } = buildNintendoEntries(
      [
        giocato({
          titleId: '0100000000000003',
          name: 'Game Boy – Nintendo Classics',
        }),
      ],
      [],
    );
    expect(entries).toHaveLength(1);
  });
});

describe('toPlatformSlug', () => {
  it('traduce HAC e NX in Switch, OUNCE in Switch 2, anche scritti diversamente', () => {
    expect(toPlatformSlug('HAC')).toBe('nintendo_switch');
    expect(toPlatformSlug(' nx ')).toBe('nintendo_switch');
    expect(toPlatformSlug('OUNCE')).toBe('nintendo_switch2');
  });

  it('rende null su tutto il resto', () => {
    expect(toPlatformSlug(null)).toBe(null);
    expect(toPlatformSlug('')).toBe(null);
    expect(toPlatformSlug('BEE')).toBe(null);
  });
});

describe('importNintendoLibrary', () => {
  const account = { id: 'acct-1' } as StoreAccountRow;
  const credentials = {
    accessToken: 'accesso',
    refreshToken: 'sessione',
    expiresAt: Date.now() + 840_000,
    accountId: '3247fa748f1dd367',
    idToken: 'idtoken',
    country: 'IT' as string | null,
  };

  beforeEach(() => {
    vi.mocked(nintendoCredentials).mockResolvedValue(credentials);
    vi.mocked(fetchNintendoPlayHistory).mockResolvedValue([giocato()]);
    vi.mocked(fetchNintendoVgc).mockResolvedValue([carta()]);
    vi.mocked(importLibrary).mockResolvedValue({} as never);
    vi.mocked(requireReauth).mockRejectedValue(new Error('needs_reauth'));
  });

  it('legge le due fonti, con l’id_token e il paese, e importa l’unione', async () => {
    await importNintendoLibrary(account);

    expect(fetchNintendoPlayHistory).toHaveBeenCalledWith('accesso');
    expect(fetchNintendoVgc).toHaveBeenCalledWith('idtoken', 'IT');
    const [, entries] = vi.mocked(importLibrary).mock.calls[0]!;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ externalId: MK8, medium: 'digital' });
  });

  it('senza paese salta le Virtual Game Cards e importa lo storico, senza dichiarare il supporto', async () => {
    vi.mocked(nintendoCredentials).mockResolvedValue({
      ...credentials,
      country: null,
    });

    await importNintendoLibrary(account);

    expect(fetchNintendoVgc).not.toHaveBeenCalled();
    const [, entries] = vi.mocked(importLibrary).mock.calls[0]!;
    expect(entries[0]).not.toHaveProperty('medium');
  });

  it('un token rifiutato manda l’account in needs_reauth', async () => {
    vi.mocked(fetchNintendoVgc).mockRejectedValue(
      new NintendoAuthError('rifiutato'),
    );

    await expect(importNintendoLibrary(account)).rejects.toThrow(
      'needs_reauth',
    );
    expect(requireReauth).toHaveBeenCalledWith(account);
    expect(importLibrary).not.toHaveBeenCalled();
  });

  it('un guasto delle Virtual Game Cards non degrada allo storico: il job riprova', async () => {
    // Senza le carte lo storico direbbe «fisico» di giochi digitali.
    vi.mocked(fetchNintendoVgc).mockRejectedValue(new Error('Nintendo: 500'));

    await expect(importNintendoLibrary(account)).rejects.toThrow('500');
    expect(requireReauth).not.toHaveBeenCalled();
    expect(importLibrary).not.toHaveBeenCalled();
  });
});
