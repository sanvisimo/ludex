# PileCue — palette UI

Riferimento: [mappa dei token](../docs/brand/pilecue/color-map.md).

- [x] Analizzare scale, template Tamagui e componenti reali.
- [x] Proporre scale a 12 passi e mapping semantico con contrasti misurati.
- [x] Approvazione della mappa.
- [x] Implementare i token e gli stati nei componenti condivisi.
- [x] Collegare CSS transitorio e theme-color.
- [x] Verifiche automatiche dei temi e degli stati, typecheck, lint e build.
- [x] Revisione del backlog con sessione QA reale (API, login e dati isolati).
- [x] Prova Expo Go sul Pixel 9a nei due temi e al cambio di schema.

Il marchio è già nel lotto separato pilecue-brand; nessuna modifica ai token
applicativi durante la preparazione di questa mappa.

## Implementazione e riscontri

- Scale originali navy/neutre e viola; un solo accento predefinito.
- Ruoli surface/action/selection nei temi condivisi, quattro stati Radix conservati.
- Card e intestazione compatta, Button selection, filtri e toggle di vista aggiornati.
- Colori espliciti delle icone su fondi accent9 allineati ad actionColor.
- Alias Tailwind sulle variabili Tamagui; meta theme-color allineate ai fondi.
- Il generatore arrotonda i valori HEX in HSL: i temi base preservano ora i
  primitivi esatti; i sottotemi di stato continuano a essere generati.
- La pagina Foundations/Colors supporta HEX e HSL per calcolare i contrasti.
- Il Wordmark non passa più accessibilityLabel al DOM web (solo a native).

## Verifiche

- Typecheck @repo/ui, web e mobile: riusciti.
- Lint @repo/ui e web, build web: riusciti.
- Sessione anonima: tema scuro/chiaro, cambio Sistema e viewport 390 px senza overflow.
- Primario reale in stato normale/hover/pressione: 5,59 / 6,82 / 4,81 scuro;
  5,31 / 6,57 / 6,24 chiaro.
- Screenshot della pagina pubblica in docs/brand/pilecue/ui.
- Suite UI finale: **153/153** dopo la correzione Gallery (bordi e scroll API).
- Backlog con account QA locale: verificato nei due temi e in tutte le viste, desktop/mobile.
- Expo: export finale Android/iOS/web riuscito; prova Pixel 9a completata.
- Corretto il Button nativo che conservava colori del tema precedente; barra di stato allineata.
- Pixel di pagina/scheda/primario verificati negli screenshot del dispositivo.

Il confronto con HEAD in una copia temporanea non ha avviato le storie: errore
di risoluzione del setup Storybook con node_modules condivisi. Non è quindi
accertato se ManyThumbnails fallisse già prima. Questo era il riscontro prima della correzione Gallery descritta nelle verifiche
finali; dopo la correzione tutti i 153 test passano.

Verifiche finali e chiusura dei difetti: [verification.md](../docs/brand/pilecue/verification.md).

## Revisione web completa (10/11/2026)

L’utente ha chiesto di concentrare il lavoro sul web e rimandare il mobile.
Verifica con account QA isolato, API reali, playlist/wishlist e giochi del
catalogo, nei due temi a 1440 e 390 px.

- Prima matrice: 112 combinazioni, nessun pageerror o overflow di pagina.
- Corretti: contrasti residui, fallback 404 fuori dal guscio, Select senza
  nome accessibile, focus dei dialoghi, margini, checkbox dei tag, liste e tabelle.
- Verificati: interazioni, otto moduli libreria, anteprima CSV, lingua, temi,
  guardie di accesso e sette sezioni admin in sola lettura.
- Esiti: 140 combinazioni di pagina, 60 di dialogo, 52 verifiche aggiuntive;
  154 test UI e 68 web, build, lint e typecheck riusciti.
- Lotto in attesa della revisione dell’utente; roadmap non marcata come conclusa.
- Gli identificatori tecnici e gli URL del repository restano Ludex.
