import { storeGameUrl, storePageUrl } from '@repo/contracts';
import { describe, expect, it } from 'vitest';

import {
  type EaOwnedItem,
  type EaPlayTime,
  parseEaToken,
  reduceEaLibrary,
} from './ea';

// Puro: nessuna rete, nessun database. Le voci sono quelle della libreria
// misurata il 13/10/2026 (`ea:probe`, vedi `plans/9c-ea.md`), coi soli campi
// che la query chiede.

const voce = (
  originOfferId: string,
  gameSlug: string,
  name: string,
  ownershipMethods: string[],
  initialEntitlementDate: string,
  franchise: string | null = null,
): EaOwnedItem => ({
  originOfferId,
  product: {
    name,
    gameSlug,
    baseItem: {
      gameType: 'BASE_GAME',
      title: name,
      franchise: franchise ? { slug: franchise } : null,
    },
    gameProductUser: { ownershipMethods, initialEntitlementDate },
  },
});

// Un DLC come lo rende la query per esteso: l'offerta e nient'altro.
const dlc = (originOfferId: string): EaOwnedItem => ({
  originOfferId,
  product: null,
});

const nessunaCopertina = new Map<string, string>();
const nessunaOra = new Map<string, EaPlayTime>();

describe('parseEaToken', () => {
  it('accetta il JSON intero, che è quello che si vede a schermo', () => {
    const prima = Date.now();
    const token = parseEaToken(
      '{"access_token":"QVQxOjIuMDoz","token_type":"Bearer","expires_in":"14399"}',
    );

    expect(token).not.toBe(null);
    expect(token).not.toBe('not_logged_in');
    if (token === null || token === 'not_logged_in') return;
    expect(token.accessToken).toBe('QVQxOjIuMDoz');
    // Quattro ore meno il minuto di margine.
    expect(token.expiresAt).toBeGreaterThanOrEqual(prima + 14_339_000);
    expect(token.expiresAt).toBeLessThan(prima + 14_399_000);
  });

  it('riconosce il browser che su ea.com non è entrato', () => {
    expect(parseEaToken('{"error":"login_required"}')).toBe('not_logged_in');
  });

  it('rende null su tutto ciò che quel JSON non è', () => {
    expect(parseEaToken('')).toBe(null);
    expect(parseEaToken('QVQxOjIuMDoz')).toBe(null);
    expect(parseEaToken('{ rotto')).toBe(null);
    // Un JSON di Epic, incollato nel campo sbagliato.
    expect(parseEaToken('{"authorizationCode":"a1b2c3"}')).toBe(null);
    expect(parseEaToken('{"access_token":"QVQx"}')).toBe(null);
  });
});

describe('reduceEaLibrary', () => {
  it('fa di più offerte dello stesso slug un gioco solo, col nome più corto', () => {
    const [dao] = reduceEaLibrary(
      [
        voce(
          'DR:149851500',
          'dragon-age-origins',
          'Dragon Age™: Origins Digital Deluxe Edition',
          ['ENTITLEMENT_GRANT'],
          '2009-11-19T00:00:00Z',
          'dragon-age',
        ),
        voce(
          'OFB-EAST:51582',
          'dragon-age-origins',
          'Dragon Age™: Origins',
          ['REDEMPTION', 'ENTITLEMENT_GRANT'],
          '2015-04-21T00:00:00Z',
        ),
        voce(
          'Origin.OFR.50.0001535',
          'dragon-age-origins',
          'Dragon Age™: Origins',
          ['ENTITLEMENT_GRANT'],
          '2023-04-13T00:00:00Z',
        ),
      ],
      nessunaCopertina,
      nessunaOra,
    );

    expect(dao).toMatchObject({
      externalId: 'dragon-age-origins',
      // La serie viene dall'offerta che la dice, anche se non è la prima.
      storePage: 'dragon-age/dragon-age-origins',
      name: 'Dragon Age™: Origins',
      releaseYear: null,
      subscription: null,
    });
    // La più vecchia delle tre.
    expect(dao?.acquiredAt?.toISOString()).toBe('2009-11-19T00:00:00.000Z');
  });

  it("toglie l'anno fra parentesi dal nome e lo usa come anno", () => {
    const [me, me2] = reduceEaLibrary(
      [
        voce(
          'OFB-EAST:55465',
          'mass-effect',
          'Mass Effect™ (2007)',
          ['PURCHASE', 'ENTITLEMENT_GRANT'],
          '2014-02-15T00:00:00Z',
        ),
        // Due offerte, una con l'anno e una senza: l'anno vale per il gioco.
        voce(
          'OFB-EAST:56694',
          'mass-effect-2',
          'Mass Effect™ 2 (2010)',
          ['REDEMPTION', 'ENTITLEMENT_GRANT'],
          '2015-04-21T00:00:00Z',
        ),
        voce(
          'DR:150421700',
          'mass-effect-2',
          'Mass Effect™ 2',
          ['REDEMPTION', 'ENTITLEMENT_GRANT'],
          '2014-02-16T00:00:00Z',
        ),
      ],
      nessunaCopertina,
      nessunaOra,
    );

    expect(me).toMatchObject({ name: 'Mass Effect™', releaseYear: 2007 });
    expect(me2).toMatchObject({ name: 'Mass Effect™ 2', releaseYear: 2010 });
  });

  it('butta i DLC, che arrivano col prodotto nullo', () => {
    const giochi = reduceEaLibrary(
      [
        dlc('OFB-MASS:34402'),
        voce(
          'Origin.OFR.50.0000489',
          'peggle',
          'Peggle®',
          ['REDEMPTION', 'ENTITLEMENT_GRANT'],
          '2015-04-21T00:00:00Z',
        ),
        dlc('SIMS4.OFF.SOLP.0x0000000000016390'),
      ],
      nessunaCopertina,
      nessunaOra,
    );

    expect(giochi.map((gioco) => gioco.externalId)).toEqual(['peggle']);
  });

  it('dice EA Play solo se nessun modo di possesso è un acquisto', () => {
    const giochi = reduceEaLibrary(
      [
        voce(
          'A',
          'solo-vault',
          'Solo Vault',
          ['VAULT'],
          '2024-01-01T00:00:00Z',
        ),
        voce(
          'B',
          'game-pass',
          'Game Pass',
          ['XGP_VAULT'],
          '2024-01-01T00:00:00Z',
        ),
        // Comprato e anche nell'abbonamento: è suo.
        voce(
          'C',
          'comprato',
          'Comprato',
          ['VAULT', 'PURCHASE'],
          '2024-01-01T00:00:00Z',
        ),
        // Il caso misurato di Mass Effect 2, da Steam e legato all'account EA.
        voce(
          'D',
          'da-steam',
          'Da Steam',
          ['ENTITLEMENT_GRANT', 'STEAM'],
          '2023-05-17T00:00:00Z',
        ),
      ],
      nessunaCopertina,
      nessunaOra,
    );

    expect(
      Object.fromEntries(giochi.map((g) => [g.externalId, g.subscription])),
    ).toEqual({
      'solo-vault': 'ea_play',
      'game-pass': 'ea_play',
      comprato: null,
      'da-steam': null,
    });
  });

  it("prende la copertina dell'offerta da cui viene il nome, e le ore dello slug", () => {
    const [da2] = reduceEaLibrary(
      [
        voce(
          'Origin.OFR.50.0004992',
          'dragon-age-2',
          'Dragon Age II: Ultimate Edition',
          ['ENTITLEMENT_GRANT'],
          '2023-02-09T00:00:00Z',
        ),
        voce(
          'OFB-EAST:59474',
          'dragon-age-2',
          'Dragon Age™ II',
          ['REDEMPTION', 'ENTITLEMENT_GRANT'],
          '2015-04-21T00:00:00Z',
        ),
      ],
      new Map([
        ['Origin.OFR.50.0004992', 'https://app-images.ea.com/ultimate.jpg'],
        ['OFB-EAST:59474', 'https://app-images.ea.com/base.jpg'],
      ]),
      new Map([
        [
          'dragon-age-2',
          {
            seconds: 7_290,
            lastPlayedAt: new Date('2024-01-03T16:58:16Z'),
          },
        ],
      ]),
    );

    expect(da2).toMatchObject({
      name: 'Dragon Age™ II',
      imageUrl: 'https://app-images.ea.com/base.jpg',
      playtimeMinutes: 122,
    });
    expect(da2?.lastPlayedAt?.toISOString()).toBe('2024-01-03T16:58:16.000Z');
  });

  it('senza ore da EA non scrive zero, scrive niente', () => {
    const [gioco] = reduceEaLibrary(
      [
        voce(
          'OFB-EAST:63039',
          'bejeweled-3',
          'Bejeweled 3',
          ['REDEMPTION', 'ENTITLEMENT_GRANT'],
          '2015-04-21T00:00:00Z',
        ),
      ],
      nessunaCopertina,
      nessunaOra,
    );

    expect(gioco?.playtimeMinutes).toBe(null);
    expect(gioco?.lastPlayedAt).toBe(null);
    expect(gioco?.imageUrl).toBe(null);
  });
});

describe('il link alla pagina del gioco', () => {
  // Misurati il 13/10/2026 con richieste anonime: il catalogo per slug su 44
  // giochi su 44, ea.com con la serie su 41 (non sui giochi di altri editori).
  it('la copia va sul catalogo di EA, con il solo slug', () => {
    expect(
      storePageUrl('ea', 'mass-effect/mass-effect-legendary-edition'),
    ).toBe(
      'https://store.ea.com/commerce/app/products/mass-effect-legendary-edition',
    );
    expect(storePageUrl('ea', 'nox')).toBe(
      'https://store.ea.com/commerce/app/products/nox',
    );
    expect(storePageUrl('ea', null)).toBe(null);
  });

  it('la card «Links» va su ea.com, che vuole anche la serie', () => {
    expect(
      storeGameUrl(
        'ea',
        'mass-effect-legendary-edition',
        'mass-effect/mass-effect-legendary-edition',
      ),
    ).toBe(
      'https://www.ea.com/games/mass-effect/mass-effect-legendary-edition',
    );
    // Senza serie l'indirizzo non si compone: a `/games/{slug}` le serie
    // grandi danno 404.
    expect(storeGameUrl('ea', 'battlefield-1', 'battlefield-1')).toBe(null);
    expect(storeGameUrl('ea', 'battlefield-1', null)).toBe(null);
  });
});
