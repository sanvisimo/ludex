# Step 12e — La home

**In progettazione.** Struttura approvata sul wireframe
([12e-home.excalidraw](12e-home.excalidraw): si apre trascinandolo su
excalidraw.com). Sotto ogni passo, man mano, cosa è stato fatto e cosa l'ha
smentito.

## Contesto

Oggi [`/`](../apps/web/src/routes/_app.index.tsx) è il catalogo pubblico:
una colonna di 24 card, gli ultimi giochi entrati in Ludex
(`games.latest`, [games.ts](../apps/api/src/services/games.ts)), con
copertina piccola, nome, anno e durata. È anonimo, non dice nulla di chi
guarda, e usa ancora Tailwind.

## Decisioni prese

- **Resta il catalogo di tutti i giochi Ludex**, non la libreria di chi
  guarda, ed è **uguale per tutti**, loggati e no: stesse fasce, stessi
  giochi. L'unica differenza è che da loggato, sulle card dei giochi che hai,
  c'è lo **stato** del tuo backlog; gli altri non hanno etichetta. Per questo
  i giochi che hai nascosto (`hidden_at`) in home ci sono.
- **A fasce**: righe di card che scorrono di lato, ognuna col suo titolo.
  1. **Ultimi aggiunti** — per data di ingresso in Ludex, come oggi.
  2. **Meglio votati** — per voto della critica, dal più alto.
  3. **Brevi** — durata main fino a 10 h.
  4. **Medi** — oltre 10 h e fino a 35 h.
  5. **Lunghi** — oltre 35 h.
  6. **Tre generi IGDB**, a rotazione.
- **La card**: copertina; **in alto a sinistra lo stato** (`CornerLabel`, che
  c'è già); **in alto a destra il voto** (coccarda + numero, come
  `EntryScore`); sotto la copertina il **titolo**, e sotto **anno · durata
  main**. Tutta la card è il link alla pagina del gioco. Niente quattro
  angoli: su una copertina da ~150 px coprono l'immagine e si leggono male.
- **Il voto è quello del backlog, e OpenCritic non c'è**: le condizioni
  della chiave vogliono nome e link accanto al voto complessivo, e su una card
  non c'è posto (vedi [apps/api/CLAUDE.md](../apps/api/CLAUDE.md)). Vale
  anche per l'ordinamento della fascia, non solo per ciò che si vede: una
  fascia «Meglio votati» ordinata sul voto OpenCritic e con le card senza
  numero non si capirebbe. Quindi il voto della home è **il complessivo
  Metacritic, altrimenti quello IGDB**, preso da `game_scores` e non da
  `games.criticScore`, che con OpenCritic presente punta a lui.
- **Rotazione giornaliera** per brevi, medi, lunghi e per la scelta dei tre
  generi: ogni giorno un'estrazione diversa, uguale per tutti e per tutto il
  giorno. Ultimi aggiunti e meglio votati non ruotano: il loro ordine è il
  loro senso.
- **Lo slug** nei link al posto dell'UUID: sì, ma in un **lotto a parte**,
  con uno slug nostro. Qui le card usano lo stesso link della pagina del
  gioco di oggi, così il passaggio allo slug tocca un punto solo.

## Valori di partenza

Proposti da me e approvati con la struttura.

- **Soglia di recensioni** per «Meglio votati»: almeno **10**. Senza, la
  fascia la apre un gioco con 2 recensioni a 95 (IGDB ne dà il conteggio,
  `aggregated_rating_count`).
- **Quali giochi entrano nelle fasce**: solo i giochi veri, cioè esclusi
  DLC, espansioni, pacchetti, bundle, episodi e stagioni (`game_type`). Un
  gioco senza tipo (non ancora arricchito) entra solo in «Ultimi aggiunti».
- **20 giochi per fascia**; una fascia vuota non si mostra.
- **Generi**: i tre del giorno si scelgono fra quelli con almeno 20 giochi,
  così la fascia è piena.
- **Le frecce ‹ ›** accanto al titolo della fascia, da `$md`: col mouse una
  riga che scorre di lato non si scorre. Sul telefono si scorre col dito e le
  frecce non ci sono.
- **Titolo della pagina**: resta «Catalogo» col sottotitolo di oggi.

## Piano

1. **API**: una procedura `games.home` (`maybeAuthed`, come `byId`) che
   restituisce le fasce, ognuna con tipo, nome (per i generi) e giochi. Ogni
   gioco porta i campi della card, il voto della home con la sua fonte e lo
   stato di chi guarda (`null` da anonimo o se non lo ha). Una query per
   fascia, in parallelo; i filtri sono tutti SQL, come vuole la regola del
   progetto. La rotazione è un ordinamento su un hash di id e data
   (`md5(id || current_date)`): deterministico nel giorno, senza tabelle né
   job. `games.latest` resta finché la home non è passata.
   - Test contro il Postgres vero: i bordi delle durate (600 minuti è breve,
     601 è medio), OpenCritic che non entra né nel voto né
     nell'ordinamento, la soglia di recensioni, i tipi esclusi, le stesse
     fasce da anonimo e da loggato, lo stato solo per chi ha il gioco, la stessa estrazione due
     volte nello stesso giorno.
2. **La card** (`HomeCard`, in `apps/web/components`): copertina, le due
   etichette, titolo su due righe al massimo, anno · durata. Il voto riusa
   `CriticValue` di `entry-score.tsx`, che va esportato.
3. **La fascia** (`HomeBand`): titolo, frecce da `$md`, riga che scorre con
   `overflowX: 'auto'` e `scrollbarWidth: 'none'` (vedi
   [apps/web/CLAUDE.md](../apps/web/CLAUDE.md)). Skeleton durante il
   caricamento.
4. **La pagina**: `_app.index.tsx` riscritta su Tamagui, senza Tailwind.
   Messaggi in italiano e inglese.
5. **Verifica sulla pagina vera**, desktop e telefono, chiaro e scuro, da
   anonimo e da loggato; poi `apps/web/CLAUDE.md` con ciò che si è scoperto.
