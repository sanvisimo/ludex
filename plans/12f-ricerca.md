# Step 12f — La ricerca globale, e lo slug dei giochi

**Approvato il 04/10/2026**, senza wireframe: in questa sessione l'utente non
può vederli, e la struttura è stata decisa per iscritto. Sotto ogni passo, man
mano, cosa è stato fatto e cosa l'ha smentito.

## Contesto

Lo step 12 elencava il 12f fra i lotti (vedi
[12a](12a-design-system.md)), ma non era mai stato fatto. Oggi l'unica
ricerca è quella del backlog
([backlog-search.ts](../apps/api/src/services/backlog-search.ts),
`ilike` sul titolo, solo fra i giochi dell'utente) e quella IGDB della
finestra «Aggiungi» (`games.search`, solo da loggati, perché consuma il rate
limit delle nostre credenziali).

Dentro questo lotto c'è anche lo **slug nei link al posto dell'UUID**,
rimandato dal [12e](12e-home.md) a un lotto a parte, con uno slug nostro.

## Decisioni prese

- **Due gruppi, sempre**: prima i giochi di Ludex, poi quelli IGDB che non
  abbiamo, tolti per `igdbId` quelli che ci sono già. Non «IGDB solo se da noi
  non c'è niente»: cercando «Zelda» due risultati nostri ci sono quasi
  sempre, e gli altri trenta non si vedrebbero mai.
- **Da loggato** si cerca ovunque, prima i nostri poi IGDB. **Da ospite** solo
  i nostri.
- **La riga in `games` nasce al click, non mentre si cerca**: le righe di
  `games` non si cancellano, e una per ogni risultato visto riempirebbe la
  tabella condivisa di giochi che nessuno ha scelto. Il click su un risultato
  IGDB passa da `games.fromIgdb`, che riusa la riga se c'è o la crea e accoda
  l'enrichment, e poi apre la pagina del gioco.
- **IGDB con un ritardo dopo la digitazione**, non a ogni tasto: il limite è
  di 4 richieste al secondo per tutto il server.
- **Nella tendina**: copertina, titolo, anno. Dieci posti, prima i nostri
  (punto 7).
- **La pagina dei risultati è la griglia del backlog, non le sue tre viste**:
  righe e compatta mostrano dati dell'utente (possessi, voto, tag, menu delle
  azioni) che un gioco non suo non ha. Le card sono quelle della home, e ogni
  card porta al gioco.
- **Slug nostro**, dal nome, in una colonna unique di `games`. Si calcola
  quando la riga nasce e **non cambia più**, nemmeno se l'enrichment corregge
  il nome: un link non deve rompersi.
- **I doppioni prendono l'anno di uscita** (`god-of-war-2018`). Il primo
  arrivato tiene lo slug pulito. Se anche l'anno coincide, o manca, si
  aggiunge l'id IGDB; per un gioco non risolto, che non ha né l'uno né
  l'altro, un pezzo del suo UUID.
- **Nessuna compatibilità con i link a UUID**: non ci sono link condivisi né
  segnalibri, quindi niente redirect.

## Passi

1. **Lo slug sullo schema.** Colonna `slug` unique e not null su `games`, con
   la migration di drizzle-kit che la riempie per le righe esistenti (SQL,
   con la stessa regola: anno ai doppioni, poi l'id). La funzione che lo
   calcola sta in un punto solo, in `apps/api`, e la usano i tre punti che
   creano un gioco in [games.ts](../apps/api/src/services/games.ts):
   `createGame`, `resolveGameFromIgdb`, `linkExternalGames`. L'anno, al
   momento della creazione, non c'è ancora su `games` (lo porta
   l'enrichment): `resolveGameFromIgdb` lo ha dal risultato IGDB, e per
   l'import si aggiunge `first_release_date` alla richiesta che risolve gli
   id dei negozi, che costa zero richieste in più. Due import che creano
   insieme due giochi con lo stesso nome non devono far fallire nessuno: chi
   perde il vincolo ricalcola lo slug e riprova.
   Test: doppioni con anno, con anno uguale, senza anno; la corsa.

   **Fatto.** Tre migration, tutte di drizzle-kit: la colonna nullable
   (0030), il backfill (0031, `--custom`), il not null (0032). Provata sul
   DB di sviluppo con dieci giochi costruiti apposta: «God of War» del 2018,
   che trova `god-of-war-2018` già preso da un gioco che si chiama proprio
   così, scende all'id IGDB. Il gioco non risolto, senza id IGDB, prende un
   suffisso casuale invece di un pezzo del suo UUID: l'id lo genera il
   database, e lo slug va scelto prima dell'INSERT. `linkExternalGames` ora
   legge prima i giochi che ci sono già, così lo slug si sceglie solo per chi
   nasce. Test in
   [game-slug.test.ts](../apps/api/src/services/game-slug.test.ts).

2. **I link.** `GameSchema` porta lo `slug`, la rotta diventa
   `/games/$slug`, `games.byId` diventa `games.bySlug`, e i cinque link
   (home, backlog, nascosti, gioco padre, giochi correlati) passano allo slug.
   I correlati hanno oggi il nostro id dalla LEFT JOIN: prendono lo slug allo
   stesso modo.

   **Fatto.** Gli eventi in push parlano di id e le schede si aprono per
   slug: `use-live-updates` riconosce la scheda da rileggere dal gioco che ha
   in cache.

3. **La ricerca sul server.** Una procedura `games.find` sul catalogo intero,
   pubblica, `ilike` sul titolo come il backlog, a pagine; e `games.search`
   (IGDB) che toglie gli `igdbId` già in `games`. Test sulla ricerca.

   **Fatto**, con una correzione: `games.search` resta com'è, perché la usa
   anche la finestra «Aggiungi», a cui servono pure i giochi che abbiamo
   già. La parte IGDB della ricerca globale è una procedura sua,
   `games.findOnIgdb`. L'ordine dei risultati: prima il titolo esatto, poi
   chi comincia con ciò che si è scritto, poi gli altri in ordine
   alfabetico. Servizio in
   [catalog-search.ts](../apps/api/src/services/catalog-search.ts).

4. **Il campo e la tendina.** Nella barra in cima, fra il logo e l'account:
   fino a 5 dei nostri, poi, da loggato, fino a 5 di IGDB, e «Tutti i
   risultati». Invio apre la pagina. Sul telefono la barra sta in basso e
   non c'è posto: lì un'icona porta alla pagina, col campo già attivo.

   **Fatto.** La tendina è un componente nuovo di `@repo/ui`,
   [`SearchField`](../packages/ui/src/components/search-field.tsx), con la
   sua storia e i test in Chromium (axe compreso): il `Combobox` sceglie un
   valore fra voci che ha già, qui le voci arrivano dal server e Invio cerca.
   All'inizio nessuna voce è evidenziata, così Invio porta alla pagina; la
   freccia giù entra nella lista. Sulla pagina `/cerca` la barra non ha il
   campo, perché la pagina ha il suo.

5. **La pagina `/cerca?q=…`**: la griglia dei nostri, a pagine, con la card
   della home; sotto, da loggato, i risultati IGDB nella stessa griglia, senza
   pagine (IGDB ne dà un numero fisso).

   **Fatto**, 30 giochi per pagina, con la griglia del backlog
   (`minmax(152px, 1fr)`) e la card della home, che ora sa anche riempire la
   cella (`fill`). Provata con Playwright da ospite, da loggato e a 390 px.
   **Non provato qui**: il clic su un risultato IGDB, perché in questo
   ambiente IGDB non ha credenziali. Fallisce con 403, e la pagina regge:
   mostra i giochi di Ludex e niente sezione IGDB.

6. **Chiusura**: `docs/modello-dati.md` (la colonna `slug`),
   [apps/web/CLAUDE.md](../apps/web/CLAUDE.md) (la ricerca e la rotta). Il
   lotto si chiude quando l'utente dice che la ricerca è pronta.

   **Documentazione fatta**, più una riga in
   [packages/ui/CLAUDE.md](../packages/ui/CLAUDE.md) sul `SearchField`. Il
   lotto resta aperto finché l'utente non dice che la ricerca è pronta.

## I commenti dopo averla vista (04/10/2026)

Fanno ancora parte di questo lotto.

7. **La tendina ha dieci posti, prima i nostri.** Erano 5 + 5; ora i giochi
   di Ludex prendono fino a dieci posti, e IGDB riempie quelli che restano.
   IGDB si chiede quindi **dopo** i nostri, e con dieci giochi nostri non si
   chiede affatto: costa un attimo di attesa in più sui risultati IGDB, e fa
   risparmiare richieste al rate limit. La pagina `/cerca` resta com'era.

   **Fatto** (`igdbFillsUpTo` in `useGameSearch`). Provato con Playwright:
   12 giochi «Zelda» in catalogo danno 10 voci e nessuna chiamata a IGDB;
   due «Hades» danno la chiamata.

8. **Remake e simili si aprono con la regola della ricerca.** La pagina del
   gioco li apriva solo se erano tuoi (12d, «finché non c'è la wishlist»);
   con la ricerca la pagina di un gioco non tuo esiste comunque. Ora: in
   catalogo, link alla sua pagina; non in catalogo e loggato, il clic lo
   crea con `games.fromIgdb` e lo apre; da ospite resta copertina e nome.
   L'aspetto attenuato e tratteggiato resta, perché dice «non ce l'hai».

   **Fatto.** Provato con Playwright: da ospite il simile in catalogo è un
   link e quello fuori catalogo no; da loggato quest'ultimo è un bottone, e
   il clic chiede `fromIgdb` (qui fallisce per le credenziali IGDB e mostra
   l'avviso).

9. **La pagina di un gioco appena entrato sembrava rotta.** Aperto dalla
   ricerca o da un simile, il gioco esiste ma l'enrichment IGDB arriva
   qualche secondo dopo: nell'attesa la pagina mostrava la cornice vuota —
   fondo scuro, copertina col trattino, «Nessun voto». Ora, finché il gioco
   ha un id IGDB, non ha ancora i dati ed è nato da meno di 2 minuti, la
   pagina è lo skeleton del caricamento, col nome e «Sto recuperando i dati
   da IGDB…». Il limite c'è perché con la coda ferma o IGDB giù lo skeleton
   resterebbe per sempre: passato, torna la pagina com'era, che lo dice. Nel
   frattempo la scheda si rilegge ogni 5 secondi, riserva dell'evento in push.

   **Fatto** (`isEnriching` in
   [\_app.games.$slug.tsx](../apps/web/src/routes/_app.games.$slug.tsx)).
   Provato con Playwright: un gioco appena creato mostra lo skeleton, e
   scritta a mano la sua riga IGDB in `game_sources` la pagina vera compare
   in 5 secondi; un gioco vecchio senza dati mostra la pagina di oggi.
