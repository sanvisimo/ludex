# Step 12e — La home

**Chiuso il 03/10/2026**, quando l'utente ha detto che la home è pronta.
Struttura approvata sul wireframe
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
  Metacritic, altrimenti quello IGDB**: com'è andata a finire è il punto
  «OpenCritic fuori» qui sotto.
- **Rotazione giornaliera** per brevi, medi, lunghi e per la scelta dei tre
  generi: ogni giorno un'estrazione diversa, uguale per tutti e per tutto il
  giorno. Ultimi aggiunti e meglio votati non ruotano: il loro ordine è il
  loro senso.
- **OpenCritic fuori da `games.critic_score`** (deciso il 03/10, in due
  tempi). Prima la card del backlog, quando il voto scelto era OpenCritic,
  non mostrava niente. Il primo giro aveva aggiunto un **voto da card**
  calcolato leggendo, accanto a `critic_score`: card giuste, ma filtro e
  ordinamento del backlog su un altro numero (OpenCritic 91, card 87). Il
  secondo giro l'ha tolto e ha cambiato la precedenza di `critic_score` in
  **Metacritic → IGDB**: un numero solo per card, filtro, ordinamento e
  «Meglio votati». I giochi già scritti li ricalcola la migration 0028, solo
  quelli dove aveva vinto OpenCritic. OpenCritic resta in `game_scores` e
  sulla pagina del gioco.
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

   **Fatto.** [`home.ts`](../apps/api/src/services/home.ts) e 11 casi in
   [`home.test.ts`](../apps/api/src/services/home.test.ts); la suite è a 373,
   tutti verdi. La precedenza del voto è `CRITIC_PRECEDENCE` in
   [`scores.ts`](../apps/api/src/services/scores.ts); «Meglio votati» ordina
   su `critic_score`, e le 10 recensioni sono quelle della fonte che l'ha
   dato. La migration
   [0028](../packages/db/drizzle/0028_critic_score_without_opencritic.sql)
   è provata su un database con 10 giochi a OpenCritic: diventano 6
   Metacritic e 4 IGDB, e uno col solo OpenCritic resta senza voto.
   - **I tipi che entrano** sono un elenco di ciò che è un gioco
     (`main_game`, `standalone_expansion`, `remake`, `remaster`,
     `expanded_game`, `port`, `fork`), non di ciò che resta fuori: fuori
     restano anche `mod` e `update`, che il piano non nominava.
   - **Durate**: un gioco senza una fine (`hltbHasSolo` falso) non entra in
     nessuna delle tre, con la stessa regola del filtro del backlog
     (`haUnaFine`, ora esportata da `backlog-search.ts`).
   - **Il giorno** dell'estrazione è quello UTC.
   - Una cosa che non si indovina, trovata col voto da card poi tolto: dentro
     gli `extras` di una query relazionale Drizzle riscrive **ogni** colonna
     col nome della tabella che li ospita, anche quelle di un'altra tabella.

2. **La card** (`HomeCard`, in `apps/web/components`): copertina, le due
   etichette, titolo su due righe al massimo, anno · durata. Il voto riusa
   `CriticValue` di `entry-score.tsx`, che va esportato.

   **Fatto**, in [`home-band.tsx`](../apps/web/components/home-band.tsx).
   Larga 136 ovunque: sul telefono ne stanno due e mezza. Il voto sta su un
   riquadro col fondo della pagina, stessa misura di `CornerLabel` e raggi
   specchiati; `CriticValue` ha preso una variante `compact`. Anno e durata
   senza il «·», come nella griglia del backlog.

3. **La fascia** (`HomeBand`): titolo, frecce da `$md`, riga che scorre con
   `overflowX: 'auto'` e `scrollbarWidth: 'none'` (vedi
   [apps/web/CLAUDE.md](../apps/web/CLAUDE.md)). Skeleton durante il
   caricamento.

   **Fatto, con una scorciatoia**: la fila con le frecce c'era già, quella
   dei giochi legati nella pagina del gioco. È diventata
   [`ScrollRow`](../apps/web/components/scroll-row.tsx), che usano tutte e
   due; la pagina del gioco è rimasta com'era (verificato). Le frecce
   compaiono solo se la fila non ci sta, e nella home solo da `$md`.

4. **La pagina**: `_app.index.tsx` riscritta su Tamagui, senza Tailwind.
   Messaggi in italiano e inglese.

   **Fatto.** Larga come il backlog (`maxW={1280}`), non 896: le fasce vivono
   di card. Il titolo è «Catalogo» e il messaggio `catalog.unresolved` è
   uscito con la vecchia lista. L'aggiunta di un gioco e gli eventi dal vivo
   invalidano `games.home` invece di `games.latest`, che è uscito dal
   contratto alla chiusura del lotto: la home l'aveva sostituito.

5. **Verifica sulla pagina vera**, desktop e telefono, chiaro e scuro, da
   anonimo e da loggato; poi `apps/web/CLAUDE.md` con ciò che si è scoperto.

   **Fatto.** Guardata in Chromium su dati di prova (80 giochi, senza
   copertine): desktop e telefono, chiaro e scuro, da anonimo e da loggato,
   nessun errore in console; il backlog in griglia e i giochi legati della
   pagina del gioco come prima. `apps/web/CLAUDE.md` ha il paragrafo sulla
   home.

## Rimandato

- **Lo slug dei giochi** nei link, al posto dell'UUID: lotto a parte, con
  uno slug nostro (deciso col 12e).
