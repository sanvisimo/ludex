import { describe, expect, it } from 'vitest';

import { parseNpsso, parsePlayDuration } from './psn';
import { toPlatformSlug } from '../services/psn-platforms';

// Puro: nessuna rete, nessun database. Su PSN quello che l'utente si trova
// davanti è una pagina JSON come su Epic, ma il campo che conta è uno solo.

describe('parseNpsso', () => {
  const npsso = 'HcJ2kQ8vT1nR5wLpY7bXeM0aZsD4gFhU3iOoK9lNqVrCtWyPjB6xEfAdSgZmIuTn';

  it('accetta la risposta JSON intera, che è quella che si vede a schermo', () => {
    expect(parseNpsso(`{"npsso":"${npsso}"}`)).toBe(npsso);
    expect(parseNpsso(`  {"npsso": "${npsso}"}  `)).toBe(npsso);
  });

  it('accetta il solo valore, anche con le virgolette appresso', () => {
    expect(parseNpsso(npsso)).toBe(npsso);
    expect(parseNpsso(`"${npsso}"`)).toBe(npsso);
    expect(parseNpsso(`  ${npsso}  `)).toBe(npsso);
  });

  it('rende null su un JSON senza il campo giusto', () => {
    // Succede copiando la pagina sbagliata, o copiandola da sloggati: Sony in
    // quel caso risponde `{"npsso":null}`, che è un JSON buono con dentro
    // niente. Va distinto da un valore illeggibile, perché il rimedio è un
    // altro — lì bisogna prima fare il login.
    expect(parseNpsso('{"npsso":null}')).toBe(null);
    expect(parseNpsso('{"error":"unauthorized"}')).toBe(null);
    expect(parseNpsso('{ rotto')).toBe(null);
  });

  it('rende null su tutto ciò che npsso non è', () => {
    expect(parseNpsso('')).toBe(null);
    expect(parseNpsso('   ')).toBe(null);
    // Un codice Epic: 32 esadecimali, troppo corto per essere un npsso.
    expect(parseNpsso('a1b2c3d4e5f60718293a4b5c6d7e8f90')).toBe(null);
  });
});

describe('parsePlayDuration', () => {
  it('legge la durata ISO che Sony usa per le ore giocate', () => {
    expect(parsePlayDuration('PT34H12M45S')).toBe(2053);
    expect(parsePlayDuration('PT1H')).toBe(60);
    expect(parsePlayDuration('PT45M')).toBe(45);
    // I giorni non compaiono nelle risposte viste, ma costano una riga e non
    // doverci tornare: un GDR da mille ore non deve diventare zero.
    expect(parsePlayDuration('P2DT3H')).toBe(3060);
  });

  it('rende null invece di zero su ciò che non sa leggere', () => {
    // Zero vorrebbe dire «giocato zero minuti», che è un'altra affermazione:
    // le ore nulle su `ownerships` sono in COALESCE e non cancellano quelle
    // che c'erano, uno zero sì.
    expect(parsePlayDuration(undefined)).toBe(null);
    expect(parsePlayDuration('')).toBe(null);
    expect(parsePlayDuration('34 ore')).toBe(null);
  });
});

describe('toPlatformSlug', () => {
  it('traduce le piattaforme che Sony dichiara', () => {
    expect(toPlatformSlug('PS5')).toBe('sony_playstation5');
    expect(toPlatformSlug('PS4')).toBe('sony_playstation4');
    expect(toPlatformSlug('ps3')).toBe('sony_playstation3');
    expect(toPlatformSlug('PSVITA')).toBe('sony_vita');
  });

  it('rende null su una piattaforma che non conosce', () => {
    // Non ripiega su PS4: la piattaforma è il filtro hard del motore
    // decisionale, e indovinarla vuol dire proporre un gioco che non si può
    // avviare. Chi chiama deve dirlo, non tirare a indovinare.
    expect(toPlatformSlug('PS6')).toBe(null);
    expect(toPlatformSlug('')).toBe(null);
  });
});
