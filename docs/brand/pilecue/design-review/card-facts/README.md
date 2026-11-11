# Etichette e fatti delle card — 11 novembre 2026

Ritocco della revisione web richiesto dopo le immagini di Monster Train 2,
FIFA 17 e Marvel’s Avengers. Conservata la disposizione dei pulsanti ai due
estremi del footer, introdotta dall’utente.

- Stato: etichetta opaca e staccata dall’angolo, icona e testo più leggibili;
  la variante originale rimane disponibile per i giochi correlati.
- Metadati: anno più discreto, durata HLTB con clessidra, voto su fondo distinto.
- Backlog: tempo giocato su una riga propria ed etichettata. Il voto personale
  rimane prioritario sulla critica e conserva la scala su cinque.

## Verifiche

Tipi e lint web/UI riusciti, cinque storie CornerLabel passate in Chromium,
68 test web passati e build di produzione riuscita.

[26 controlli sulle pagine reali](report.json): tre viste del backlog a 1440,
390 e 320 px nei due temi, etichette floating nella home, testo lungo e card
strette, voto personale e dati mancanti. Nessun pageerror o overflow; axe senza
violazioni sui casi chiaro e scuro.

Gli screenshot usano un account QA locale e giochi già presenti nel catalogo.
Solo possesso, stati, voto personale e tempi della fixture erano di prova;
nessuna modifica ai metadati condivisi o agli account esistenti. Account e
sessioni QA sono stati rimossi al termine.

## Confronti

- [Monster Train 2 nella home](monster-train-home-dark.png).
- FIFA 17: [desktop scuro](fifa-dark-1440.png),
  [telefono scuro](fifa-dark-390.png), [desktop chiaro](fifa-light-1440.png).
- Avengers: [scuro](avengers-dark.png), [chiaro](avengers-light.png).
- Home: [scuro](home-dark.png), [chiaro](home-light.png).
