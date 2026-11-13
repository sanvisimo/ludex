# Dialog di associazione — 13 novembre 2026

Piano: [associazione-giochi-dialog](../../../../plans/associazione-giochi-dialog.md).

Il selettore condiviso separa la scelta del candidato dalla conferma. I sei
flussi verificati sono libreria, wishlist, associazione admin per tutti,
collegamento di giochi senza IGDB, correzione admin e segnalazione di errori.
Le ultime due conservano rispettivamente l'anteprima degli effetti e l'invio
come conferma finale.

Da 1024 px la voce di origine e la ricerca sono affiancate nella dialog da
960 px. Le copertine sono ingrandibili, anche da tastiera, senza ritaglio e
con ritorno del focus. I dettagli del negozio sono richiudibili, con ID
copiabile. I risultati scorrono e l'azione finale resta raggiungibile.

## Verifica

59 casi Chromium sui componenti reali, con dati fittizi e richieste API
intercettate: nessuna modifica a dati utente. Copertine schematiche per rendere
le prove indipendenti dai servizi esterni.

- 48 casi sui sei flussi, nei due temi, a 1440, 1024, 390 e 320 px: geometria,
  selezione, cambio candidato, assenza di scritture alla selezione e una sola
  azione alla conferma. Ingrandimento della copertina del negozio via tastiera,
  Escape e ritorno del focus.
- Quattro casi con titoli lunghi o copertine assenti, dettagli del negozio aperti.
- Ricerca vuota, errore con riprova, caricamento e riapertura con scelta azzerata.
- Tre casi a 1023, 768 e 1280 × 600 px.
- Filtro piattaforma con azzeramento della selezione, ingrandimento del candidato
  e ritorno del focus, copia dell'ID.
- Due verifiche delle etichette inglesi, desktop e mobile.

24 scansioni axe WCAG A/AA sulle dialog, a 1440 e 390 px nei due temi:
nessuna violazione rilevata. Nessun errore JavaScript nei casi verificati.

Il banco temporaneo è stato rimosso. Il [report](report.json) conserva gli esiti.
Typecheck e lint web, formattazione e build di produzione client/server riusciti.
Le prove non comprendono autenticazione, import dai negozi o modifiche reali
alle associazioni.

## Anteprime con dati di prova

- Desktop: [scuro](associazione-dark-1440.png), [chiaro](associazione-light-1440.png).
- Mobile: [scuro](associazione-dark-390.png), [chiaro](associazione-light-390.png).
- [Copertina ingrandita](copertina-ingrandita.png).

## Ritocchi dopo la prova in uso

Approvati in chat: copia ID con sola icona accanto al valore; Set ID allineata
al confronto delle associazioni; collegamento corrente riconoscibile nella
correzione admin.

Set ID usa lo stesso layout per HowLongToBeat, Metacritic e OpenCritic, con
copertine ingrandibili, dettagli richiudibili e salvataggio nel footer. Il
lookup esistente verifica l'ID prima di abilitare il salvataggio; un ID già
usato resta salvabile con avviso. La ricerca OpenCritic resta esplicita e
mostra costo e quota. Cambiare input o fonte azzera la selezione.

Il risultato corrente nella correzione admin è individuato dall'ID IGDB,
ha un badge blu «Già collegato» e non è selezionabile. Il riepilogo del
collegamento attuale resta distinto dalla nuova scelta, che mostra l'anno
anche nel footer.

42 casi Chromium aggiuntivi passati, con API intercettate e dati fittizi:

- 18 casi Set ID: tre fonti, due temi, 1440/390/320 px; nessuna ricerca
  automatica, selezione senza salvataggio, avviso su ID condivisi e conferma.
- Sei casi sulla correzione admin: titoli uguali con ID diversi, collegamento
  attuale disabilitato, anteprima e conferma sulla nuova scheda.
- Quattro casi sull'icona di copia: assenza di testo nel pulsante,
  allineamento al valore e contenuto degli appunti.
- Inserimento diretto di URL per tutte le fonti, selezione azzerata al cambio
  input/fonte, ricerca vuota, caricamento, errore e quota OpenCritic esaurita
  o servizio disabilitato.
- Titoli lunghi, immagini mancanti, candidati scartati, breakpoint 1023/1024 px
  e desktop basso; etichette inglesi, errori del lookup con riprova e recupero,
  copia da tastiera e tooltip.

22 scansioni axe aggiuntive senza violazioni. Il banco temporaneo è stato
rimosso. Nessun dato utente modificato. Typecheck, lint, formattazione e build
client/server riusciti. [Report dei ritocchi](tweaks-report.json).

Anteprime con dati di prova:
[Set ID desktop](set-id-hltb-dark-1440.png) ·
[Set ID mobile e quota OpenCritic](set-id-opencritic-light-390.png) ·
[Collegamento attuale](repoint-current-dark-1440.png) ·
[Copia ID](id-copy-dark-1440.png).
