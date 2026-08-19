import { describe, expect, it } from 'vitest';

import type { HltbSearchHit } from '../external/hltb';
import {
  normalizeTitle,
  pickByName,
  rankHltbCandidates,
  shortenTitle,
  titleSimilarity,
} from './hltb-match';

// Test puri: niente database, niente rete. I candidati qui sotto non sono
// inventati, sono le risposte vere di HLTB alle rispettive ricerche — è l'unico
// modo per sapere che il matcher regge i casi che esistono davvero.

const hit = (
  over: Partial<HltbSearchHit> & { hltbId: number; name: string },
): HltbSearchHit => ({
  alias: null,
  type: 'game',
  releaseYear: null,
  ...over,
});

// Cercando "Resident Evil 4". Due voci con lo stesso identico nome: è il caso
// che il match per sola somiglianza non può vincere.
const residentEvil4 = [
  hit({ hltbId: 108881, name: 'Resident Evil 4', releaseYear: 2023 }),
  hit({ hltbId: 7720, name: 'Resident Evil 4', releaseYear: 2005 }),
  hit({
    hltbId: 137868,
    name: 'Resident Evil 4 - Separate Ways',
    type: 'dlc',
    releaseYear: 2023,
  }),
  hit({
    hltbId: 66855,
    name: 'Resident Evil 4: Separate Ways',
    type: 'dlc',
    releaseYear: 2005,
  }),
];

// Cercando "The Witcher 3 Wild Hunt". Qui il rumore sono i DLC e un'edizione.
const witcher3 = [
  hit({ hltbId: 10270, name: 'The Witcher 3: Wild Hunt', releaseYear: 2015 }),
  hit({
    hltbId: 40171,
    name: 'The Witcher 3: Wild Hunt - Game of the Year Edition',
    releaseYear: 2016,
  }),
  hit({
    hltbId: 30003,
    name: 'The Witcher 3: Wild Hunt - Hearts of Stone',
    type: 'dlc',
    releaseYear: 2015,
  }),
];

describe('normalizeTitle', () => {
  it('fa coincidere la punteggiatura dei due cataloghi', () => {
    // IGDB e HLTB scrivono lo stesso gioco in due modi diversi, e senza questo
    // passo il confronto partirebbe già in svantaggio.
    expect(normalizeTitle('NieR: Automata')).toBe(
      normalizeTitle('Nier Automata'),
    );
    expect(normalizeTitle('Pokémon Rosso')).toBe('pokemon rosso');
    expect(normalizeTitle('Ratchet & Clank')).toBe('ratchet and clank');
  });
});

describe('titleSimilarity', () => {
  it('distingue un titolo dallo stesso titolo con un pezzo attaccato', () => {
    const base = normalizeTitle('The Witcher 3: Wild Hunt');
    const edizione = normalizeTitle(
      'The Witcher 3: Wild Hunt - Game of the Year Edition',
    );

    // Deve stare sotto la soglia: un contenimento di sottostringa direbbe 1.
    expect(titleSimilarity(base, edizione)).toBeLessThan(0.85);
    expect(titleSimilarity(base, base)).toBe(1);
  });
});

describe('rankHltbCandidates', () => {
  it("sceglie fra due omonimi guardando l'anno", () => {
    const originale = rankHltbCandidates(
      { name: 'Resident Evil 4', releaseYear: 2005 },
      residentEvil4,
    );
    const remake = rankHltbCandidates(
      { name: 'Resident Evil 4', releaseYear: 2023 },
      residentEvil4,
    );

    expect(pickByName(originale)?.hit.hltbId).toBe(7720);
    expect(pickByName(remake)?.hit.hltbId).toBe(108881);
  });

  it("non sceglie fra due omonimi quando l'anno non lo sappiamo", () => {
    const ranked = rankHltbCandidates(
      { name: 'Resident Evil 4', releaseYear: null },
      residentEvil4,
    );

    // Appaiati: il nome da solo non li distingue, e tirare a indovinare qui
    // vorrebbe dire scrivere in DB la durata di un altro gioco.
    expect(pickByName(ranked)).toBeNull();
  });

  it('butta i DLC, che affollano ogni ricerca', () => {
    const ranked = rankHltbCandidates(
      { name: 'The Witcher 3: Wild Hunt', releaseYear: 2015 },
      witcher3,
    );

    expect(ranked.map((row) => row.hit.hltbId)).not.toContain(30003);
    expect(pickByName(ranked)?.hit.hltbId).toBe(10270);
  });

  it('preferisce il gioco base alla sua edizione speciale', () => {
    const ranked = rankHltbCandidates(
      { name: 'The Witcher 3: Wild Hunt', releaseYear: 2015 },
      witcher3,
    );

    expect(ranked[0]?.hit.hltbId).toBe(10270);
  });

  it("guarda anche l'alias, non solo il nome principale", () => {
    const ranked = rankHltbCandidates(
      { name: 'Hollow Knight: Voidheart Edition', releaseYear: 2017 },
      [
        hit({
          hltbId: 26286,
          name: 'Hollow Knight',
          alias: 'Hollow Knight: Voidheart Edition',
          releaseYear: 2017,
        }),
      ],
    );

    expect(pickByName(ranked)?.hit.hltbId).toBe(26286);
  });
});

describe('pickByName', () => {
  it('preferisce il titolo identico a quello che gli somiglia tantissimo', () => {
    // Caso vero, pescato provando il matcher su una libreria: senza questa
    // regola il gioco giusto veniva scartato perché il suo seguito gli stava
    // troppo vicino di punteggio.
    const ranked = rankHltbCandidates(
      { name: 'Orcs Must Die!', releaseYear: 2011 },
      [
        hit({ hltbId: 6795, name: 'Orcs Must Die!', releaseYear: 2011 }),
        hit({ hltbId: 6796, name: 'Orcs Must Die! 2', releaseYear: 2012 }),
      ],
    );

    expect(pickByName(ranked)?.hit.hltbId).toBe(6795);
  });

  it("non basta il titolo identico se l'anno è di un altro gioco", () => {
    // "7 Days to Die": IGDB lo data alla 1.0, HLTB all'accesso anticipato.
    // Undici anni di scarto hanno la stessa forma dei due "Resident Evil 4", e
    // lì il nome non può decidere: decide l'appid, o non decide nessuno.
    const ranked = rankHltbCandidates(
      { name: '7 Days to Die', releaseYear: 2024 },
      [hit({ hltbId: 13500, name: '7 Days to Die', releaseYear: 2013 })],
    );

    expect(pickByName(ranked)).toBeNull();
  });

  it('non aggancia niente quando nessuno somiglia abbastanza', () => {
    const ranked = rankHltbCandidates(
      { name: 'Un Gioco Che Non Esiste', releaseYear: 2020 },
      witcher3,
    );

    expect(pickByName(ranked)).toBeNull();
  });

  it('su lista vuota non solleva', () => {
    expect(pickByName([])).toBeNull();
  });
});

describe('rankHltbCandidates, con searchedAs', () => {
  // Il caso vero che ha imposto la regola: sul titolo intero HLTB non
  // restituisce niente perché "3" non è "III", ma cercando la sola coda la voce
  // salta fuori — e a quel punto i due titoli interi si somigliano per lo 0.95.
  const gabrielKnight = [
    hit({
      hltbId: 3783,
      name: 'Gabriel Knight III: Blood of the Sacred, Blood of the Damned',
      releaseYear: 1999,
    }),
  ];
  const nostro = 'Gabriel Knight 3: Blood of the Sacred, Blood of the Damned';

  it('giudica sul titolo intero anche quando la ricerca è passata dalla coda', () => {
    const ranked = rankHltbCandidates(
      {
        name: nostro,
        searchedAs: 'Blood of the Sacred, Blood of the Damned',
        releaseYear: 1999,
      },
      gabrielKnight,
    );

    expect(pickByName(ranked)?.hit.hltbId).toBe(3783);
  });

  it('il termine cercato aggiunge un modo di somigliare, non ne toglie', () => {
    // Senza `searchedAs` il punteggio è già buono: la coda serviva a *trovare*
    // il candidato, non a riconoscerlo. Il massimo fra le due forme non può
    // quindi far perdere niente a chi già passava.
    const senza = rankHltbCandidates(
      { name: nostro, releaseYear: 1999 },
      gabrielKnight,
    );
    const con = rankHltbCandidates(
      {
        name: nostro,
        searchedAs: 'Blood of the Sacred, Blood of the Damned',
        releaseYear: 1999,
      },
      gabrielKnight,
    );

    expect(con[0]!.score).toBeGreaterThanOrEqual(senza[0]!.score);
  });
});

describe('shortenTitle', () => {
  it('taglia il sottotitolo dopo i due punti', () => {
    // I due casi veri: senza il taglio HLTB non restituisce niente, perché cerca
    // in AND su tutti i termini.
    expect(shortenTitle("The Witcher: Enhanced Edition Director's Cut")).toBe(
      'The Witcher',
    );
    expect(
      shortenTitle(
        'Gabriel Knight 3: Blood of the Sacred, Blood of the Damned',
      ),
    ).toBe('Gabriel Knight 3');
  });

  it('taglia il sottotitolo dopo i due punti, in entrambe le direzioni', () => {
    expect(
      shortenTitle("The Witcher: Enhanced Edition Director's Cut", true),
    ).toBe("Enhanced Edition Director's Cut");
    expect(
      shortenTitle(
        'Gabriel Knight 3: Blood of the Sacred, Blood of the Damned',
        true,
      ),
    ).toBe('Blood of the Sacred, Blood of the Damned');
  });

  it('non taglia sulla barra', () => {
    expect(shortenTitle('Rising Storm/Red Orchestra 2 Multiplayer')).toBeNull();
  });

  it('non taglia sul trattino', () => {
    // È il motivo per cui i separatori sono due e non tre: qui resterebbe "Half".
    expect(shortenTitle('Half-Life')).toBeNull();
    expect(shortenTitle('Spider-Man 2')).toBeNull();
  });

  it("non taglia quando non c'è niente da togliere", () => {
    expect(shortenTitle('Hollow Knight')).toBeNull();
    // Testa troppo corta: non sarebbe una ricerca, sarebbe un pescaggio a caso.
    expect(shortenTitle('F1: Manager')).toBeNull();
    expect(shortenTitle(': qualcosa')).toBeNull();
  });
});
