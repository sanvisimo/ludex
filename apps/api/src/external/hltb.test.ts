import { describe, expect, it } from 'vitest';

import { hltbSearchCandidates } from './hltb';

// Puro: nessuna rete, nessun database. È la metà della scoperta che si può
// provare — l'altra ha bisogno che HLTB risponda, e quella la prova
// `hltb:endpoint` contro il sito vero.
//
// Le route sono quelle vere del `_buildManifest.js` di HLTB, sfoltite: ci sono
// dentro i due quasi-omonimi che una regola più larga prenderebbe per buoni.
const MANIFEST = `self.__BUILD_MANIFEST = {
  "/": ["static/chunks/3954jcw0cn1_d.js"],
  "/api/user": ["static/chunks/a.js"],
  "/api/logout": ["static/chunks/b.js"],
  "/api/forum/search": ["static/chunks/c.js"],
  "/api/search/users": ["static/chunks/d.js"],
  "/api/search/site": ["static/chunks/e.js"],
  "/api/search/site/init": ["static/chunks/f.js"],
  "/api/user/game_detail/[id]/[[...playstyle]]": ["static/chunks/g.js"]
};`;

describe('hltbSearchCandidates', () => {
  it('sceglie la route che ha un /init accanto, e solo quella', () => {
    // `/api/forum/search` e `/api/search/users` hanno "search" nel nome e non
    // sono lei: a distinguerle è il mint, non la parola.
    expect(hltbSearchCandidates(MANIFEST)).toEqual(['/api/search/site']);
  });

  it('non si fa spaventare dalle route con le parentesi', () => {
    // I segmenti dinamici di Next (`[id]`, `[[...playstyle]]`) sono metacaratteri
    // di regex: il confronto con la sorella è fra stringhe, e deve restarlo.
    expect(() => hltbSearchCandidates(MANIFEST)).not.toThrow();
  });

  it('mette davanti i candidati che hanno "search" nel nome', () => {
    const manifest = `"/api/aaa" "/api/aaa/init" "/api/search/site" "/api/search/site/init"`;

    // Non è una scelta, è un ordine di tentativo: chi decide è la ricerca vera.
    expect(hltbSearchCandidates(manifest)).toEqual([
      '/api/search/site',
      '/api/aaa',
    ]);
  });

  it('non restituisce niente se il manifest non ha nessun mint', () => {
    // Il caso in cui HLTB smette di usare la sessione: non si tira a indovinare.
    expect(hltbSearchCandidates('"/api/user" "/api/logout"')).toEqual([]);
  });
});
