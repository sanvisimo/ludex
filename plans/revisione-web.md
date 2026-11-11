# Revisione web — header, home e backlog

Design approvato in chat l’11/11/2026 dopo due anteprime navigabili.
Branch: `codex/web-design-review`. Lotto chiuso dall’utente l’11/11/2026:
home, backlog, playlist, pagina del gioco e wishlist approvati.
Le sezioni dell’account sono il prossimo ambito da valutare.

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
  struttura nel primo intervento; seguito approvato l'11/11, descritto sotto.

## Verifiche

- [x] Typecheck, lint, 68 test web e build di produzione client/server.
- [x] Pagine reali nei due temi, a 1440, 768, 390 e 320 px; guest e utente QA.
- [x] Settings, lingua, navigazione account, tre viste, filtri e menu delle card.
- [x] Paginazione dopo il cambio di larghezza/vista e menu verso i dialoghi.
- [x] Aggiungi gioco e scelta casuale da una ricerca con un solo candidato.
- [x] 50 controlli Chromium passati, nessun pageerror; axe sul backlog popolato.

Riscontri e screenshot in
[design-review](../docs/brand/pilecue/design-review/README.md).
Revisione in uso completata e lotto approvato dall’utente l’11/11/2026.

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

## Pagina dettaglio (11/11/2026)

Perimetro approvato dopo la revisione della pagina attuale desktop e mobile:

- Hero desktop da 500 a 320 px; mobile con altezza minima adattabile al titolo.
- Fascia sotto la hero con stato a icona ed etichetta, voto modificabile,
  riepilogo possessi e ore giocate. Le copie, note e tag restano nel pannello
  dedicato, con modifica, nascondi e rimuovi.
- Durata HLTB distinta dalla critica, tempi più evidenti e voti con badge
  numerici su 100, conservando fonti e link.
- Ordine mobile: fascia personale, durata/critica, gallery/descrizione,
  copie/link, giochi correlati. Desktop a due colonne, senza duplicare DOM o
  controlli. Gallery, dialog dettagli e giochi correlati conservati.
- Verifiche mirate: tipi, lint, build; browser desktop/mobile con titolo lungo,
  visitatore e gioco posseduto, cambio stato/voto e dialoghi esistenti.
- [x] Typecheck, lint e build web client/server.
- [x] Chromium a 1440, 768 e 390 px: fascia personale unica, ordine dei
  contenuti, cambio stato e voto persistiti, dialog dettagli/modifica/rimozione,
  nascondi/mostra e avviso del gioco nascosto. Nessun overflow o pageerror.
  Utente e possessi QA rimossi al termine; nessun dato reale modificato.

### Fascia, copie e link: rifinitura approvata

- Fascia con stato a sinistra, voto centrale e riepilogo copie/ore a destra;
  su mobile il riepilogo va sotto. Il numero di copie è un collegamento al
  pannello dedicato, senza ripetere i badge dei possessi.
- Copie con conteggio nel titolo, superfici distinte e nomi espliciti di
  negozio/piattaforma; account, abbonamento, tempi e date secondari. Note,
  tag e azioni separati dai possessi. Senza URL la copia resta informativa.
- Link con sito ufficiale a tutta larghezza, negozi in due colonne e
  Wikipedia separata in fondo. Su schermi molto stretti i negozi passano a
  una colonna. Un solo negozio occupa tutta la riga; con più negozi le celle
  restano a metà larghezza, anche sull'ultima riga dispari, senza dare più peso
  a una destinazione. Conservati URL, icone, apertura esterna e focus visibile.
- Ritocco direttamente sui componenti reali, come concordato: nessun nuovo
  mockup parallelo. Verifica mirata con cinque copie e una sola copia.
- [x] Tipi/lint web e build client/server. Chromium con cinque copie di
  Dredge e una copia fisica senza tempi/URL: distribuzione della fascia,
  riepilogo non duplicato, collegamento al dettaglio e focus da tastiera,
  destinazioni esterne, due temi e mobile a 390/320 px. Nessun overflow o
  errore JavaScript; rimossi i dati QA al termine.

### Etichette dei giochi collegati

- Variante `floating compact` di CornerLabel per le copertine da 104 px:
  fondo neutro, bordo e testo di selezione, margine ridotto e icona compatta.
  Stato in alto e tipo di versione in basso; testo lungo con ellissi e titolo
  completo al passaggio del mouse.
- [x] Sei storie CornerLabel, inclusi testo lungo e due temi; tipi e lint
  UI/web. Pagina BioShock con stati QA brevi/lunghi nei due temi e a 390 px:
  etichette contenute nella copertina, nessun overflow o errore JavaScript.
  Dati QA rimossi al termine.

### Negozi a icone su card e righe (11/11/2026)

- Card: titolo di nuovo su due righe riservate (`minH` 40), così anno, durata
  e voto restano allineati fra le card della stessa fila.
- Footer della card: al massimo due elementi, allineati a sinistra fra stato e
  menu. Con tre o più negozi il primo logo e un «+N» (non «…», che accanto al
  ⋮ del menu si confondeva). Misura: a 176 px di card restano 84 px fra stato
  e menu, cioè due pulsanti da 32, non tre.
- «+N»: tooltip con icona e nome di ogni negozio. Il dialogo resta solo per
  chi non ha il mouse (`(hover: none)` letto alla pressione): titolo «Copie»,
  per ogni negozio icona e nome e sotto le copie. Toccando un logo qualsiasi o
  «+N» si apre lo stesso dialogo, con tutte le copie del gioco.
- `Tooltip` di `@repo/ui` accetta anche un contenuto composto (storia
  `RichContent`).
- Card: il badge del tipo passa sulla copertina, in basso a sinistra come nei
  giochi collegati; sotto il titolo i fatti stanno alla stessa altezza in tutta
  la fila.
- Vista a righe: voto accanto a durata; negozi a destra sotto stato e menu,
  anche qui al massimo due (68 px, quanto stato e menu: con quattro icone su un
  telefono al titolo restavano 80 px). La lista dei nascosti resta coi badge.
  Il titolo sta in un `YStack shrink={1} minW={0}`, come nella compatta: senza,
  sul telefono non andava a capo e passava sotto i bottoni.
- [x] Tipi e lint web/UI.
- [ ] Prova sulla pagina dell'utente: card con e senza badge del tipo, Dredge
  con «+3», righe, dialogo al tocco.
