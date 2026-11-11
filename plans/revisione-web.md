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
