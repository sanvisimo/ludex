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
- **Nella tendina**: copertina, titolo, anno.
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
5. **La pagina `/cerca?q=…`**: la griglia dei nostri, a pagine, con la card
   della home; sotto, da loggato, i risultati IGDB nella stessa griglia, senza
   pagine (IGDB ne dà un numero fisso).
6. **Chiusura**: `docs/modello-dati.md` (la colonna `slug`),
   [apps/web/CLAUDE.md](../apps/web/CLAUDE.md) (la ricerca e la rotta). Il
   lotto si chiude quando l'utente dice che la ricerca è pronta.
