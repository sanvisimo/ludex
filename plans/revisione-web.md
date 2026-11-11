# Revisione web — header, home e backlog

Design approvato in chat l’11/11/2026 dopo due anteprime navigabili.
Branch: `codex/web-design-review`. Lotto in corso, da chiudere dopo la revisione
dell’utente sulla pagina reale.

## Decisioni

- Header desktop: logo verso la home, link Backlog, ricerca globale, dropdown
  Settings con tema e lingua, menu account con le destinazioni esistenti.
  Sul telefono restano la barra in basso e le preferenze nel foglio.
- Home: fasce del catalogo pubblico, card più ampie, copertine verticali intere,
  titolo su due righe riservate e informazioni su una superficie uniforme.
  Stato, wishlist e ranking restano disponibili dove previsti.
- Backlog: griglia più leggibile, fatti e comandi allineati. In tutte le viste
  lo stato resta un pulsante a icona che apre il menu; il menu ⋮ conserva
  modifica, playlist, nascondi e rimuovi. Nessuna scritta «Stato» sulle card.
- «Scegli per me» nell’intestazione riusa il dado e il filtro correnti; il
  comando flottante resta sulle altre pagine. «Aggiungi gioco» rimane disponibile.
- Filtri nel drawer, stati rapidi sopra la ricerca, ordinamento visibile
  nella barra desktop e nel drawer su telefono; chip rimovibili e URL invariati.
- La pagina gioco si approfondisce in seguito: nessuna revisione della sua
  struttura in questo intervento.

## Verifiche

- [x] Typecheck, lint, 68 test web e build di produzione client/server.
- [x] Pagine reali nei due temi, a 1440, 768, 390 e 320 px; guest e utente QA.
- [x] Settings, lingua, navigazione account, tre viste, filtri e menu delle card.
- [x] Paginazione dopo il cambio di larghezza/vista e menu verso i dialoghi.
- [x] Aggiungi gioco e scelta casuale da una ricerca con un solo candidato.
- [x] 50 controlli Chromium passati, nessun pageerror; axe sul backlog popolato.

Riscontri e screenshot in
[design-review](../docs/brand/pilecue/design-review/README.md).
Implementazione pronta per la revisione dell’utente: il lotto non è ancora chiuso.

Le modifiche al marchio e alle favicon già presenti all’apertura del branch
restano separate da questo intervento.

## Ritocchi a stato e fatti delle card (11/11/2026)

Richiesta dopo la prova in uso, conservando la miglioria dell’utente che separa
anno/durata dal voto e dispone stato e menu ai due estremi del footer.

- Etichetta di stato nella home più leggibile e staccata dall’angolo della
  copertina; la variante originale resta disponibile sui giochi correlati.
- Anno discreto, clessidra per la durata HLTB, base distinta per il voto.
- Tempo effettivamente giocato su una riga secondaria esplicita nel backlog;
  nella tabella compatta conserva la sua colonna. Il voto personale mantiene
  la precedenza su quello della critica, con icona e scala distinti.
- [x] 26 controlli su card popolate, due temi, etichette lunghe, voto personale
      e dati mancanti; nessun pageerror o overflow. Axe senza violazioni sulle card.
- [x] Tipi e lint web/UI, cinque storie CornerLabel, 68 test web e build.

Confronti su FIFA 17, Avengers e Monster Train 2 in
[card-facts](../docs/brand/pilecue/design-review/card-facts/README.md).

## Ordinamento dagli header della tabella

- Titolo, durata, ore giocate e stato alternano crescente/decrescente.
- «Voto» offre voto personale e critica, con direzione esplicita: le due scale
  restano distinte. Piattaforme resta un campo multiplo non ordinabile.
- URL, toolbar, paginazione e tabella condividono lo stesso ordinamento server;
  il componente vale anche per le playlist a filtro, senza modificare i filtri salvati.
- Verifiche limitate al flusso di ordinamento: tipi/lint, test SQL mirati e
  prova browser degli header, tastiera e reset della pagina.
- TanStack Table v8 adottato nella sola vista compatta del backlog, condivisa
  con le playlist a filtro. `AdminTable` è fuori dal perimetro concordato.
  Definizioni di colonna uniche per header, celle e layout responsive Tamagui;
  stato di ordinamento controllato da URL e query salvata, senza ordinamento
  o paginazione locali dei risultati già paginati dal server.
- [x] Migrazione: typecheck e lint web, build client/server; prova Chromium
  degli header, inversione, menu voti, tastiera, reset pagina e layout a 390 px.
  Playlist QA con ordine salvato visibile, override e reload coerenti, query
  salvata invariata; nessun errore JavaScript. Dati QA rimossi al termine.
