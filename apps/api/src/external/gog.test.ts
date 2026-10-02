import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchGogAcquiredDates,
  fetchGogLibrary,
  gogCoverUrl,
  gogLoginUrl,
  parseGogAuthCode,
} from './gog';

// Puro: nessuna rete, nessun database. È il punto in cui il gesto dell'utente
// — «incolla quello che hai sotto mano» — diventa un codice, e sbagliarlo
// significa un messaggio d'errore incomprensibile davanti a un login riuscito.

describe('parseGogAuthCode', () => {
  const codice =
    'GxRJzadTmNNIAmbXUdn0Y-5gsBlF4llYEkWAO_sEywgLK69QqiE_3-qrVBSloI';

  it("prende il codice dall'URL di atterraggio incollato di peso", () => {
    expect(
      parseGogAuthCode(
        `https://embed.gog.com/on_login_success?origin=client&code=${codice}`,
      ),
    ).toBe(codice);
  });

  it('accetta anche il solo codice', () => {
    expect(parseGogAuthCode(codice)).toBe(codice);
    expect(parseGogAuthCode(`  ${codice}  `)).toBe(codice);
  });

  it("rende null quando nell'URL il codice non c'è", () => {
    // Il caso vero: l'utente incolla l'indirizzo *prima* di aver fatto il login,
    // o quello della pagina sbagliata. Va distinto da un codice illeggibile,
    // perché il rimedio è lo stesso ma il messaggio no.
    expect(parseGogAuthCode('https://embed.gog.com/on_login_success')).toBe(
      null,
    );
    expect(parseGogAuthCode('https://www.gog.com/account')).toBe(null);
  });

  it('rende null su tutto ciò che codice non è', () => {
    expect(parseGogAuthCode('')).toBe(null);
    expect(parseGogAuthCode('   ')).toBe(null);
    expect(parseGogAuthCode('non un codice')).toBe(null);
    // Troppo corto per essere un codice GOG: meglio rifiutarlo qui che mandarlo
    // a GOG e tornare con un `invalid_grant` da tradurre.
    expect(parseGogAuthCode('abc')).toBe(null);
    expect(parseGogAuthCode('http://[non-un-url')).toBe(null);
  });
});

describe('gogLoginUrl', () => {
  it('usa il redirect di GOG, non uno nostro', () => {
    const url = new URL(gogLoginUrl());

    // Non è una preferenza: con un redirect nostro GOG risponde
    // `redirect_uri_mismatch` **dopo** il login riuscito. Verificato contro il
    // servizio vero. Se un giorno qualcuno lo cambia, questo test lo ferma.
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://embed.gog.com/on_login_success?origin=client',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBeTruthy();
  });
});

describe('fetchGogAcquiredDates', () => {
  // Qui la rete c'è, e si stubba `fetch`: per questo client è il confine vero,
  // senza rate limiter né token in cache.
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const page = (body: unknown) =>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
    });

  it('tiene solo GOG, preferisce owned_since e segue le pagine', async () => {
    page({
      items: [
        // owned_since c'è: è la data vera, date_created è quando l'ha vista Galaxy.
        {
          platform_id: 'gog',
          external_id: '1207658924',
          owned_since: 1513036800,
          date_created: 1555718400,
        },
        // Un gioco Steam integrato in Galaxy: la sua data non dice niente.
        { platform_id: 'steam', external_id: '570', date_created: 1600000000 },
      ],
      next_page_token: 'due',
    });
    page({
      items: [
        // owned_since manca: si ripiega su date_created.
        {
          platform_id: 'gog',
          external_id: 1453375253,
          owned_since: null,
          date_created: 1609542452,
        },
      ],
      next_page_token: null,
    });

    const dates = await fetchGogAcquiredDates('token', '48628349957132247');

    expect(dates).toEqual(
      new Map([
        ['1207658924', new Date(1513036800 * 1000)],
        ['1453375253', new Date(1609542452 * 1000)],
      ]),
    );
    expect(String(fetchMock.mock.calls[1]![0])).toContain('page_token=due');
  });
});

describe('gogCoverUrl', () => {
  it('compone la copertina verticale dal percorso senza protocollo', () => {
    expect(gogCoverUrl('//images-1.gog-statics.com/c6e2d263')).toBe(
      'https://images-1.gog-statics.com/c6e2d263_glx_vertical_cover.webp',
    );
  });

  it('accetta anche un URL già intero', () => {
    expect(gogCoverUrl('https://images-2.gog-statics.com/abc')).toBe(
      'https://images-2.gog-statics.com/abc_glx_vertical_cover.webp',
    );
  });

  it('rende null senza immagine, e su ciò che indirizzo non è', () => {
    expect(gogCoverUrl(undefined)).toBeNull();
    expect(gogCoverUrl('')).toBeNull();
    expect(gogCoverUrl('/solo/un/percorso')).toBeNull();
  });
});

describe('fetchGogLibrary', () => {
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('porta la copertina e l’indirizzo di ogni prodotto, e null dove mancano', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        totalPages: 1,
        products: [
          {
            id: 1207658924,
            title: 'Daggerfall Unity',
            url: '/en/game/daggerfall_unity',
            image: '//images-1.gog-statics.com/aaa',
          },
          { id: 1453375253, title: 'Alder’s Blood Prologue' },
        ],
      }),
    });

    const library = await fetchGogLibrary('token');

    expect(library).toMatchObject([
      {
        externalId: '1207658924',
        storePage: '/en/game/daggerfall_unity',
        imageUrl:
          'https://images-1.gog-statics.com/aaa_glx_vertical_cover.webp',
      },
      { externalId: '1453375253', storePage: null, imageUrl: null },
    ]);
  });
});
