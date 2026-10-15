# La ricerca IGDB filtrata per piattaforma

Nato dalle correzioni a mano di [minipc-correzioni](minipc-correzioni.md): in
«Non è questo gioco» _Call of Duty: Modern Warfare 3_ dà la scheda del 2023,
quella del 2011, una stagione, il port per DS… e la scelta si fa leggendo le
piattaforme riga per riga. Serve poter dire «solo PS4».

## Il filtro sta nella query a IGDB, non sulla lista

IGDB dà i primi 20 risultati. Filtrare quelli dopo vorrebbe dire, con un titolo
comune, non trovare affatto la scheda giusta perché è la ventunesima. Il filtro
va nel `where` della ricerca (`platforms = (id)`), e allora i 20 sono tutti di
quella piattaforma.

## Passi

- [x] contratto: `games.search` accetta `platform`, opzionale, lo slug nostro
- [x] API: `searchGames` traduce lo slug nell'id IGDB con `platforms.igdb_id`,
      `searchIgdbGames` lo mette nel `where`. Per id o URL della scheda il filtro
      non conta: la scheda l'hai già detta. Uno slug senza id IGDB cerca senza
      filtro
- [x] web: in `IgdbPicker` un `PlatformCombobox` in riga col campo e «Cerca» (a capo sul telefono), vuoto, con le
      sole piattaforme che IGDB conosce. Il filtro sta nella chiave della query:
      sceglierlo rilancia la ricerca col testo già cercato — un'azione esplicita,
      una richiesta, come «Cerca»
- [x] test in `games.test.ts`, con IGDB stubbato

## Default dichiarati

- il filtro compare in tutti i punti che usano `IgdbPicker` (scarti, segnala
  un errore, wishlist, import da risolvere, «Non è questo gioco»)
- parte vuoto: niente precompilazione dalla piattaforma della copia
- niente wireframe (un campo in un dialogo che c'è) e niente voce in roadmap
