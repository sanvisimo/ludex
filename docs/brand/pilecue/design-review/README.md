# Revisione header, home e backlog — 11 novembre 2026

Implementazione del design approvato in chat, sul branch
`codex/web-design-review`. Il piano e le decisioni sono in
[revisione-web.md](../../../../plans/revisione-web.md).

## Verifiche

- Typecheck e lint web riusciti; build di produzione client/server riuscita.
- 68 test web passati.
- [50 controlli in Chromium](report.json) passati, con API reali, nei temi
  chiaro/scuro e a 1440, 768, 390 e 320 px, senza overflow o pageerror.
- Provati logo verso la home, link Backlog, menu account e librerie, cambio
  tema/lingua, tre viste, stato salvato dal menu, apertura e focus dei dialoghi
  Modifica e playlist, filtri e chiusura del drawer con conteggio dei risultati.
- Verificato il mantenimento del gioco visibile passando dalla seconda pagina
  della griglia alla vista compatta, e la scelta casuale da una ricerca con un
  solo candidato. Aggiungi gioco resta disponibile anche su telefono.
- Nessuna violazione axe WCAG A/AA nel backlog popolato, prima e dopo
  l’integrazione del comando Scegli per me.

Le prove autenticate usano un account QA locale con venti giochi già presenti
nel catalogo: nessun import dai negozi. Account, sessioni e dati personali di
prova sono stati rimossi al termine; i giochi condivisi non sono stati modificati.
Gli screenshot restano come riferimento del risultato. La revisione della
struttura della pagina gioco è rinviata come concordato.

## Schermate

- Home: [scuro](home-dark-desktop.png), [chiaro](home-light-desktop.png).
- Backlog desktop: [scuro](backlog-dark-desktop.png),
  [chiaro](backlog-light-desktop.png).
- Backlog su telefono: [scuro](backlog-dark-mobile.png),
  [chiaro](backlog-light-mobile.png).
- [Menu Settings](settings-dark-desktop.png).

Lotto pronto per la revisione dell’utente; la roadmap rimane «in corso».
