import { describe, expect, it } from 'vitest';

import { gogLoginUrl, parseGogAuthCode } from './gog';

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
