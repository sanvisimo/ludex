# Associazione giochi — 13 novembre 2026

Piano approvato in chat, esteso dopo la verifica dei sei flussi che usano il
selettore IGDB. Copertine del negozio e dei candidati importanti per riconoscere
lo stesso gioco quando titolo, marchi o nomi delle edizioni differiscono.

## Intervento

- Dialog fino a 960 px e confronto in due colonne da 1024 px quando c'è una
  voce di origine; una colonna su mobile. Riepilogo della voce visibile durante
  lo scorrimento desktop, risultati con scorrimento contenuto.
- Ricerca e pulsante sulla stessa riga, filtro piattaforma separato, invio
  esplicito, stati di caricamento, errore con riprova e vuoto con suggerimenti.
- Copertine ingrandibili da mouse e tastiera, senza ritaglio, con ritorno del
  focus e ripiego per immagini mancanti. Dettagli del negozio richiudibili e ID
  selezionabile e copiabile.
- Selezione visibile e distinta dalla scrittura. La modifica della ricerca o
  del filtro azzera la scelta, così il footer non conferma candidati nascosti.
- Libreria, wishlist, associazione admin per tutti e collegamento IGDB hanno
  un footer con riepilogo e conferma. La correzione admin conserva l'anteprima
  degli effetti; la segnalazione usa l'invio esistente come conferma.
- Nessuna modifica agli endpoint, all'algoritmo di ricerca o alle regole delle
  associazioni. Etichette italiane e inglesi.

## Verifiche

- [x] Typecheck e lint web, controllo formattazione e build client/server.
- [x] 59 casi Chromium sui componenti reali con dati fittizi e API intercettate:
      sei flussi, due temi, 320/390/768/1023/1024/1280/1440 px, desktop basso,
      titoli lunghi, copertine assenti, ricerca vuota/errore/caricamento,
      selezione e conferma, filtri, copia ID, ingrandimento e ritorno del focus.
- [x] 24 scansioni axe WCAG A/AA sulle dialog: nessuna violazione rilevata.
- [x] Banco temporaneo rimosso; nessuna modifica a dati utente.

Riscontri e limiti delle prove: [report e anteprime](../docs/brand/pilecue/game-match-review/README.md).

## Ritocchi approvati dopo la prova in uso

- Copia ID con sola icona, tooltip ed etichetta accessibile, accanto al valore.
- Set ID per HowLongToBeat, Metacritic e OpenCritic con lo stesso confronto a
  due colonne, copertine ingrandibili e dettagli secondari richiudibili.
  Selezione e salvataggio separati; ID/URL manuali verificati con il lookup
  esistente prima del salvataggio. Gli ID condivisi restano consentiti con
  avviso, la ricerca OpenCritic resta esplicita con costo e quota visibili.
- Correzione admin: risultato già collegato identificato dall'ID IGDB,
  evidenziato in blu con badge e scelta disabilitata. Riepilogo del collegamento
  attuale distinto dalla nuova selezione; anno della selezione anche nel footer.

- [x] Typecheck, lint, formattazione e build web client/server.
- [x] 42 casi Chromium aggiuntivi, con tre fonti, ID/URL manuali, avvisi su ID
  condivisi, quota ed errori, titoli uguali con ID IGDB diversi, copia da
  tastiera, breakpoint e temi. 22 scansioni axe senza violazioni.
- [x] Banco temporaneo rimosso, nessun dato utente modificato.

[Riscontri dei ritocchi](../docs/brand/pilecue/game-match-review/tweaks-report.json).
