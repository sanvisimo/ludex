import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetStoreTokenKey } from '../lib/crypto';
import { amazonLoginUrl, parseAmazonAuthCode } from './amazon';

// Puro: nessuna rete, nessun database.

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
  it('usa il mercato americano e il return_to di Amazon', () => {
    const url = new URL(amazonLoginUrl('utente-1'));

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

  it('dà a ogni utente il suo client_id, sempre lo stesso', () => {
    const uno = new URL(amazonLoginUrl('utente-1'));
    const ancora = new URL(amazonLoginUrl('utente-1'));
    const due = new URL(amazonLoginUrl('utente-2'));

    const clientId = (u: URL) => u.searchParams.get('openid.oa2.client_id');
    const challenge = (u: URL) =>
      u.searchParams.get('openid.oa2.code_challenge');

    // Stabile: è ciò che permette di non tenere nessuno stato fra il momento in
    // cui si apre il login e quello in cui torna il codice — e fa sì che
    // ricollegare riscriva lo stesso dispositivo invece di accumularne uno per
    // tentativo.
    expect(clientId(uno)).toBe(clientId(ancora));
    expect(challenge(uno)).toBe(challenge(ancora));

    // E separato per utente: due account non condividono il dispositivo.
    expect(clientId(uno)).not.toBe(clientId(due));
    expect(challenge(uno)).not.toBe(challenge(due));
  });

  it('senza la chiave non compone niente', () => {
    delete process.env.STORE_TOKEN_KEY;
    resetStoreTokenKey();
    // Il verifier PKCE è derivato dalla chiave: senza, il link sarebbe
    // costruito su un segreto che non c'è.
    expect(() => amazonLoginUrl('utente-1')).toThrow('STORE_TOKEN_KEY');
  });
});
