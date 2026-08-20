import { afterEach, describe, expect, it } from 'vitest';

import {
  decryptCredentials,
  encryptCredentials,
  resetStoreTokenKey,
  sameCredentials,
} from './crypto';

// Non tocca il database e non esce in rete: è la parte che protegge i refresh
// token degli utenti, e va provata per quello che deve *rifiutare* più che per
// quello che accetta.

const CHIAVE_A = Buffer.alloc(32, 1).toString('base64');
const CHIAVE_B = Buffer.alloc(32, 2).toString('base64');

function conChiave(chiave: string | undefined) {
  if (chiave === undefined) delete process.env.STORE_TOKEN_KEY;
  else process.env.STORE_TOKEN_KEY = chiave;
  resetStoreTokenKey();
}

afterEach(() => conChiave(CHIAVE_A));

describe('cifratura dei credenziali', () => {
  it('va e torna, mantenendo la forma dell oggetto', () => {
    conChiave(CHIAVE_A);
    const credenziale = {
      accessToken: 'a'.repeat(64),
      refreshToken: 'r'.repeat(64),
      expiresAt: 1_760_000_000_000,
      userId: '50771470519354436',
    };

    expect(decryptCredentials(encryptCredentials(credenziale))).toEqual(
      credenziale,
    );
  });

  it('non produce due volte lo stesso record per lo stesso segreto', () => {
    conChiave(CHIAVE_A);
    const primo = encryptCredentials({ token: 'uguale' });
    const secondo = encryptCredentials({ token: 'uguale' });

    // L'IV è casuale: se due cifrature identiche dessero gli stessi byte, dalla
    // tabella si potrebbe leggere *quali utenti condividono un credenziale*
    // senza decifrare niente.
    expect(primo.equals(secondo)).toBe(false);
    expect(sameCredentials(primo, secondo)).toBe(true);
  });

  it('rifiuta un record a cui è stato cambiato un byte', () => {
    conChiave(CHIAVE_A);
    const record = encryptCredentials({ token: 'segreto' });
    // L'ultimo byte è testo cifrato, non IV né tag: senza autenticazione questa
    // sarebbe una decifratura riuscita con dentro spazzatura, che poi qualcuno
    // manderebbe a GOG come se fosse un token.
    const ultimo = record.length - 1;
    record[ultimo] = record[ultimo]! ^ 0xff;

    expect(() => decryptCredentials(record)).toThrow();
  });

  it('rifiuta un record cifrato con un altra chiave', () => {
    conChiave(CHIAVE_A);
    const record = encryptCredentials({ token: 'segreto' });

    conChiave(CHIAVE_B);
    // È il caso della chiave ruotata: deve rompersi in modo riconoscibile, così
    // chi legge può mandare l'utente a ricollegare invece di tirare avanti.
    expect(() => decryptCredentials(record)).toThrow();
  });

  it('rifiuta un record troncato', () => {
    conChiave(CHIAVE_A);
    const record = encryptCredentials({ token: 'segreto' });

    expect(() => decryptCredentials(record.subarray(0, 20))).toThrow(
      'troncata',
    );
  });

  it('si rifiuta di partire senza chiave o con una chiave della misura sbagliata', () => {
    conChiave(undefined);
    expect(() => encryptCredentials({})).toThrow('STORE_TOKEN_KEY');

    // Una passphrase corta: derivarla in silenzio darebbe una chiave debole
    // senza che nessuno se ne accorga, ed è esattamente ciò che non deve
    // succedere.
    conChiave(Buffer.from('troppo-corta').toString('base64'));
    expect(() => encryptCredentials({})).toThrow('32 byte');
  });
});
