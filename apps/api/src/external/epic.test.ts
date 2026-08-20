import { describe, expect, it } from 'vitest';

import { epicLoginUrl, parseEpicAuthCode } from './epic';

// Puro: nessuna rete, nessun database. Epic è il negozio dove il gesto è più
// facile da sbagliare, perché quello che l'utente si trova davanti non è un
// indirizzo ma una **pagina JSON**.

describe('parseEpicAuthCode', () => {
  const codice = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

  it('accetta il JSON intero, che è quello che si vede a schermo', () => {
    expect(
      parseEpicAuthCode(
        `{"redirectUrl":"https://localhost/launcher?code=${codice}","authorizationCode":"${codice}","sid":null}`,
      ),
    ).toBe(codice);
  });

  it('accetta il solo codice, anche fra virgolette', () => {
    expect(parseEpicAuthCode(codice)).toBe(codice);
    expect(parseEpicAuthCode(`"${codice}"`)).toBe(codice);
    expect(parseEpicAuthCode(`  ${codice}  `)).toBe(codice);
  });

  it('rende null su un JSON senza il campo giusto', () => {
    // Succede se l'utente copia la pagina sbagliata: va distinto da un codice
    // illeggibile, perché il rimedio non è lo stesso.
    expect(parseEpicAuthCode('{"redirectUrl":"https://x","sid":null}')).toBe(
      null,
    );
    expect(parseEpicAuthCode('{ rotto')).toBe(null);
  });

  it('rende null su tutto ciò che codice non è', () => {
    expect(parseEpicAuthCode('')).toBe(null);
    expect(parseEpicAuthCode('   ')).toBe(null);
    // Un codice GOG: lungo, ma non 32 esadecimali. Incollare quello di un altro
    // negozio nel campo sbagliato è un errore che si fa davvero.
    expect(parseEpicAuthCode('GxRJzadTmNNIAmbXUdn0Y-5gsBlF4llYEkWAO_sEywg')).toBe(
      null,
    );
  });
});

describe('epicLoginUrl', () => {
  it('manda al login con il redirect che restituisce il codice', () => {
    const url = new URL(epicLoginUrl());

    expect(url.origin + url.pathname).toBe('https://www.epicgames.com/id/login');

    // Il redirect è una pagina di Epic, non nostra: come GOG e Amazon, la lista
    // dei redirect è legata al client_id del launcher. È composto da noi e non
    // preso da `legendary.gl/epiclogin`, che punta esattamente qui.
    const redirect = new URL(url.searchParams.get('redirectUrl')!);
    expect(redirect.origin + redirect.pathname).toBe(
      'https://www.epicgames.com/id/api/redirect',
    );
    expect(redirect.searchParams.get('responseType')).toBe('code');
    expect(redirect.searchParams.get('clientId')).toBeTruthy();
  });
});
