import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStoreTokenKey } from '../lib/crypto';
import {
  AmazonAuthError,
  amazonLoginUrl,
  isAmazonRejection,
  isAmazonSerial,
  newAmazonSerial,
  parseAmazonAuthCode,
  refreshAmazonTokens,
} from './amazon';

// Nessuna rete e nessun database: dove serve si stubba `fetch`, che per questo
// modulo è il confine vero — non ha rate limiter né token in cache.

const CHIAVE = Buffer.alloc(32, 7).toString('base64');

beforeEach(() => {
  process.env.STORE_TOKEN_KEY = CHIAVE;
  resetStoreTokenKey();
});
afterEach(() => resetStoreTokenKey());

describe('parseAmazonAuthCode', () => {
  const codice = 'ANxVHkajCQQIUUzpykoQEfSt';

  it("prende il codice dall'URL di atterraggio incollato di peso", () => {
    expect(
      parseAmazonAuthCode(
        `https://www.amazon.com/?openid.assoc_handle=amzn_sonic_games_launcher&openid.oa2.authorization_code=${codice}&openid.mode=id_res`,
      ),
    ).toBe(codice);
  });

  it('accetta anche il solo codice', () => {
    expect(parseAmazonAuthCode(codice)).toBe(codice);
    expect(parseAmazonAuthCode(`  ${codice}  `)).toBe(codice);
  });

  it("rende null quando nell'URL il codice non c'è", () => {
    // Succede se si incolla l'indirizzo prima di aver completato il login.
    expect(parseAmazonAuthCode('https://www.amazon.com/')).toBe(null);
    expect(parseAmazonAuthCode('')).toBe(null);
    expect(parseAmazonAuthCode('no')).toBe(null);
  });
});

describe('amazonLoginUrl', () => {
  const serial = newAmazonSerial();

  it('usa il mercato americano e il return_to di Amazon', () => {
    const url = new URL(amazonLoginUrl('utente-1', serial));

    // Il mercato è inchiodato: l'assoc_handle del launcher esiste solo lì, e
    // su amazon.it la stessa richiesta è un 404. Verificato.
    expect(url.searchParams.get('marketPlaceId')).toBe('ATVPDKIKX0DER');
    expect(url.searchParams.get('openid.return_to')).toBe(
      'https://www.amazon.com',
    );
    expect(url.searchParams.get('openid.oa2.code_challenge_method')).toBe(
      'S256',
    );
  });

  const clientId = (u: string) =>
    new URL(u).searchParams.get('openid.oa2.client_id');
  const challenge = (u: string) =>
    new URL(u).searchParams.get('openid.oa2.code_challenge');

  it('a parità di utente e serial rende sempre lo stesso login', () => {
    // È ciò che permette di non tenere nessuno stato fra il momento in cui si
    // apre il login e quello in cui torna il codice: basta che torni il serial.
    const uno = amazonLoginUrl('utente-1', serial);
    const ancora = amazonLoginUrl('utente-1', serial);
    expect(clientId(uno)).toBe(clientId(ancora));
    expect(challenge(uno)).toBe(challenge(ancora));
  });

  it('dà a ogni collegamento il suo dispositivo, anche allo stesso utente', () => {
    // Il bug che c'era: il dispositivo dipendeva solo dall'utente, e il secondo
    // account Amazon della stessa persona lo toglieva al primo.
    const primo = amazonLoginUrl('utente-1', serial);
    const secondo = amazonLoginUrl('utente-1', newAmazonSerial());
    expect(clientId(primo)).not.toBe(clientId(secondo));
    expect(challenge(primo)).not.toBe(challenge(secondo));
  });

  it('non rende lo stesso verifier a due utenti con lo stesso serial', () => {
    expect(challenge(amazonLoginUrl('utente-1', serial))).not.toBe(
      challenge(amazonLoginUrl('utente-2', serial)),
    );
  });

  it('senza la chiave non compone niente', () => {
    delete process.env.STORE_TOKEN_KEY;
    resetStoreTokenKey();
    // Il verifier PKCE è derivato dalla chiave: senza, il link sarebbe
    // costruito su un segreto che non c'è.
    expect(() => amazonLoginUrl('utente-1', serial)).toThrow('STORE_TOKEN_KEY');
  });
});

describe('newAmazonSerial', () => {
  it('ha la forma che isAmazonSerial riconosce, e non si ripete', () => {
    const a = newAmazonSerial();
    expect(isAmazonSerial(a)).toBe(true);
    expect(newAmazonSerial()).not.toBe(a);
    expect(isAmazonSerial('non-un-serial')).toBe(false);
  });
});

describe('isAmazonRejection', () => {
  it('prende per rifiuto i 4xx, e per temporanei i guasti e i limiti', () => {
    for (const status of [400, 401, 403, 404]) {
      expect(isAmazonRejection(status)).toBe(true);
    }
    // Un loro guasto, un limite di frequenza o un timeout non dicono niente
    // sul credenziale: mandare l'utente a ricollegare sarebbe il bug.
    for (const status of [408, 429, 500, 502, 503]) {
      expect(isAmazonRejection(status)).toBe(false);
    }
  });
});

describe('refreshAmazonTokens', () => {
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });

  it('rende il token nuovo', async () => {
    reply(200, { access_token: 'nuovo', expires_in: 3600 });
    await expect(refreshAmazonTokens('refresh')).resolves.toMatchObject({
      accessToken: 'nuovo',
    });
  });

  it('su un rifiuto alza AmazonAuthError, che porta a ricollegare', async () => {
    reply(400, { error: 'invalid_grant' });
    await expect(refreshAmazonTokens('refresh')).rejects.toBeInstanceOf(
      AmazonAuthError,
    );
  });

  it('su un guasto di Amazon alza un errore qualunque, che il job riprova', async () => {
    reply(503, null);
    const errore = await refreshAmazonTokens('refresh').catch((e) => e);
    expect(errore).toBeInstanceOf(Error);
    expect(errore).not.toBeInstanceOf(AmazonAuthError);
  });

  it('un 200 senza token non è un rifiuto', async () => {
    reply(200, {});
    const errore = await refreshAmazonTokens('refresh').catch((e) => e);
    expect(errore).not.toBeInstanceOf(AmazonAuthError);
  });
});
