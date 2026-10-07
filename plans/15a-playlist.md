# Step 15a — Playlist

Filtri del backlog salvati con un nome, dinamici, con rotte loro. Le decisioni
di base sono in [docs/ordine-sviluppo.md](../docs/ordine-sviluppo.md) (step 15,
06/10/2026). Qui sotto: cosa si fa, in che ordine, e — man mano — cosa è
andato diversamente.

## Lotto A — Server

1. **Tabella `playlists`**
   ([packages/db/src/schema/playlists.ts](../packages/db/src/schema/playlists.ts)):
   `id`, `userId` (cascade), `name`, `query` (jsonb), `timestamps`. Unico su
   `(userId, lower(name))`, come `user_tags`. Migration da `pnpm db:generate`.
2. **Contratto**: `PlaylistQuerySchema` = `BacklogFilterSchema` senza `hidden`,
   più `sort` e `direction`. Niente `limit` e `offset` (paginazione) e niente
   `hidden` (è una vista). Router `playlists`: `list`, `get`, `create`,
   `update`, `remove`.
3. **Servizio** `apps/api/src/services/playlists.ts`: ogni lettura e scrittura
   parte da `userId`. `get` esegue la query salvata con `searchBacklog` e
   restituisce `missingTags`: i tag salvati per id che non esistono più (o non
   sono dell'utente) si tolgono dalla query prima di eseguirla, non la
   svuotano.
4. **Esportazione dell'account** (step 16): `playlists` nel file, con i tag
   per **nome** e non per id, come il resto dell'esportazione. La cancellazione
   passa da sola dalla FK in cascade.
5. **Test** su Postgres vero: isolamento fra utenti, nome unico senza
   distinzione di maiuscole, tag cancellato ignorato e segnalato, campo
   sconosciuto scartato da Zod senza rompere la playlist, esportazione.

## Lotto A — fatto

Commit `60f1c54`. Suite api verde (44 file, 651 test). La migration è la 0039;
sul database di sviluppo si applica con `pnpm db:migrate`.

## Lotto B — Schermate

Proposta e wireframe, **prima del codice**:
[15a-playlist.excalidraw](15a-playlist.excalidraw) (si apre trascinandolo su
excalidraw.com). Il disegno parte dal codice di `/backlog`, non da uno
screenshot: l'app non era in esecuzione.

### Proposta

Tre schermate nuove o toccate, e un punto nel menu.

1. **`/backlog`: «Salva come playlist»** (disegno 1, 1b, 1c). Un bottone in
   toolbar dopo «Filtri», che compare **solo con almeno un filtro acceso**: una
   playlist senza filtri è il backlog intero. Su telefono è solo l'icona, nella
   stessa riga. Apre un dialog con il campo Nome.
   - Salva i criteri e l'ordinamento (`toQueryInput` senza `hidden`, `limit`,
     `offset`). Non la pagina né la vista.
   - Se il nome esiste (il server risponde `CONFLICT`) il dialog lo dice e offre
     **«Sostituisci i filtri di “Brevi”»**, che chiama `update` con l'id. È
     l'unico modo di cambiare i filtri di una playlist: niente modalità di
     modifica a parte.
2. **`/playlist`, l'elenco** (disegno 2b). ~~Una riga per playlist, con nome e
   «N filtri».~~ **Cambiato il 07/10/2026, dopo averlo visto: come la home**,
   una fascia per playlist che scorre di lato, nello stesso ordine per nome
   (decisione sotto, nessun disegno nuovo: il frame 2 del disegno è superato).
   Vuoto: un testo che manda a `/backlog`. **Niente «Nuova playlist» qui**: si
   crea da `/backlog`, coi filtri già impostati.
   - **La fascia**: il nome (link a `/playlist/$id`), «N giochi», il menu ⋯
     (Rinomina, Elimina, con conferma) e le frecce da `$md`. Le prime **20**
     card, le stesse della home (`HomeCard`): una riga di backlog è un gioco con
     il suo stato, quindi ogni card porta stato e voto.
   - **Le azioni sulle card non ci sono**: le fasce servono a sfogliare, la
     gestione sta nella playlist aperta (il nome è «Vedi tutto»).
   - **Una playlist vuota resta in elenco**, con «Nessun gioco corrisponde»:
     senza, non si potrebbe né rinominare né eliminare.
   - **Una query per fascia** (`playlists.get` con limite 20), in parallelo
     dopo l'elenco. Se le playlist diventassero decine, una procedura sola alla
     `games.home` è un lavoro a parte.
3. **`/playlist/$id`, una playlist aperta** (disegno 3). Titolo il nome,
   sottotitolo «N giochi», «‹ Playlist» per tornare. Sotto: l'avviso dei tag
   mancanti, **solo se `missingTags > 0`**; i filtri salvati come chip in sola
   lettura; la vista (griglia, righe, compatta) e le card **con le stesse
   azioni di `/backlog`** (stato, modifica, nascondi, togli); paginazione.
   - **Vista, pagina e quanti per pagina** stanno nell'URL come in `/backlog`
     (`view`, `page`, `size`).
   - **Ordine e ricerca sono liberi** (deciso il 07/10/2026, dopo averla
     vista): un campo di ricerca sul titolo e la tendina dell'ordine con la
     direzione, accanto alle viste. Stanno nell'URL (`q`, `sort`, `direction`)
     e **non si salvano**: coprono, per quell'apertura, ciò che la playlist ha
     salvato, che resta il default. Una `q` chiesta **sostituisce** quella
     salvata, non si somma; la `q` salvata si vede come chip. Per cambiare
     l'ordine salvato: «Modifica filtri», l'ordinamento nel pannello,
     «Sostituisci».
   - **«Modifica filtri»** apre `/backlog` con i filtri della playlist già
     impostati. Si salva col «Sostituisci» del punto 1. Serve il passaggio
     inverso, da `PlaylistQuery` a URL: un `status` assente nella playlist vuol
     dire tutti gli stati, mentre il default di `/backlog` esclude `excluded`,
     quindi lo stato va scritto per intero.
4. **Il menu**: «Playlist» dopo «Backlog», nel menu dell'avatar e nel foglio
   del telefono (disegno 2c).

### Valori di partenza

Proposti da me, da correggere sul disegno.

- **Rotte**: `/playlist` e `/playlist/$id`, dentro `_app/_private`. Con l'uuid e
  non con uno slug: il nome di una playlist è dell'utente e si cambia.
- **«N filtri»** si conta come `activeCount` di `/backlog`, ma su
  `PlaylistQuery`: una funzione sola, usata dall'elenco.
- **Azioni sulle card**: i gestori di `/backlog` (stato, modifica, nascondi,
  togli) si estraggono e li usano tutte e due le pagine, invece di copiarli.
- **Fuori da questo lotto**: la home non mostra le playlist; niente riordino a
  mano; niente condivisione; il mobile resta com'è.

### Fatto (codice, 07/10/2026)

Struttura approvata sul disegno, scritta una volta.

- **Logica dei filtri** in
  [backlog-filter.ts](../apps/web/lib/backlog-filter.ts): `toPlaylistQuery`,
  `fromPlaylistQuery`, `playlistSearch`,
  `countActiveCriteria` (la regola di `activeCount`, ora una funzione sola) e
  `validatePagingSearch`.
- **Pagine**: [`/playlist`](../apps/web/src/routes/_app._private.playlist.index.tsx),
  a fasce come la home (vedi il punto 2), e [`/playlist/$id`](../apps/web/src/routes/_app._private.playlist.$id.tsx).
- **Componenti**: `SavePlaylistButton` (toolbar di `/backlog`, solo con almeno
  un filtro acceso), `PlaylistMenu` (rinomina, elimina), `PlaylistChips`,
  e due pezzi tolti da `/backlog` per usarli in due posti: `ManagedEntries`
  (card, stato, modifica, nascondi, togli) e `PageSizeSelect`.
- **Voce «Playlist»** nel menu dell'avatar e nel foglio del telefono.

Cosa è andato diversamente dal piano:

- **I chip dei filtri** ora sono un dato (`clear`, la patch che li spegne)
  invece di una funzione: `/backlog` li spegne, la playlist li mostra e basta.
  Stessa funzione, `useFilterChips`.
- **Il filtro sullo stato non ha un chip** in `/backlog`, perché lì i bottoni
  sono sempre a vista. Nella playlist non ci sono, e una playlist «solo in
  corso» senza dirlo sarebbe ingannevole: `PlaylistChips` aggiunge un chip con
  gli stati, quando non sono quelli di default.
- **Lo stato di una playlist si legge in due modi.** Una playlist senza
  `status` non filtra per stato, mentre `/backlog` senza `status` nell'URL
  esclude `excluded`: «tutti e sei gli stati» per `/backlog` è una deviazione
  dal suo default. Trovato provando le conversioni, quando l'elenco contava i
  filtri e avrebbe detto «1 filtro» a una playlist senza filtri. Il conteggio è
  sparito con le fasce; resta che per l'URL lo stato va scritto per intero.
- **Le playlist si rileggono dopo ogni mutazione**, in un punto solo: la
  `MutationCache` di [providers.tsx](../apps/web/components/providers.tsx)
  invalida `playlists.get`. Le mutazioni del backlog invalidano ognuna
  `backlog.list` e non sanno delle playlist; undici punti da toccare erano il
  modo di dimenticarne uno. Gli eventi in push invalidano anche `playlists`.
- **Ricerca e ordine di una playlist** (`q`, `sort`, `direction` in
  `playlists.get`): ricerca e tendina dell'ordine sono estratte da `/backlog`
  in [list-controls.tsx](../apps/web/components/list-controls.tsx) e le usano
  tutte e due le pagine. `sort` e `direction` nell'URL tengono anche il valore
  uguale al default di `/backlog` (`addedAt`, `desc`): il default di una
  playlist è il suo, e `addedAt` può essere proprio la scelta su una salvata per
  durata. È la pagina a togliere ciò che coincide con la playlist.
- **`Page` ha una prop nuova, `eyebrow`**: la riga sopra il titolo, per il
  «‹ Playlist».

Verifiche:

- `pnpm lint`, `pnpm check-types` e `pnpm --filter web build` passano.
- **Il web non ha un banco di test**, e qui non l'ho aggiunto: le conversioni
  sono state provate con uno script una tantum (14 controlli: criteri
  conservati, `hidden`/`limit`/`offset` fuori, stato per intero verso l'URL,
  conteggi, pagine). Se serve un test fisso, vuol dire dare a `apps/web` il suo
  vitest.
- **Non l'ho vista a schermo.** La migration 0039 non è sul database di
  sviluppo, e provare l'app vuol dire un utente e dei giochi veri.

### Ritocchi dopo averla vista (07/10/2026)

Nello stesso lotto, dai commenti sul pannello e sul backlog:

- **Menu di `/playlist`**: la voce «Modifica filtri», prima di Rinomina. Nella
  playlist aperta non c'è, perché lì c'è il bottone.
- **Drawer dei filtri**: la sezione «Stato» (le stesse sei spunte dei bottoni
  in barra); «Altro» tolto; «Voto critica» sezione sua, dopo «Il mio voto»;
  «Mai giocato» spunta semplice sotto l'ordinamento.
- **«Modifica filtri» → «Salva come playlist»**: il backlog ricorda la
  playlist di partenza (`?playlist=<id>`) e il dialogo parte dal suo nome;
  lasciandolo, salvare ne sostituisce i filtri, cambiandolo si crea una playlist
  nuova. Resta senza una modalità di modifica a parte, com'era deciso.
- **Quanti per pagina seguono le colonne** (`lib/page-size.ts`,
  `grid-columns.tsx`): colonne × 1, 2, 5, 10, 15, 20 righe, per `/backlog` e per la
  playlist aperta. Le colonne si misurano con una griglia vuota (provato in
  Chrome: 1232 px → 7 colonne, 900 → 5, 700 → 4, 500 → 3, 327 → 2), e la lista
  non chiede prima di sapere quante sono. Il `size` dell'URL resta il numero
  chiesto e si porta al multiplo più vicino; il default è 14. Sostituisce i
  numeri fissi `[7, 14, 35, 70, 126]`.
- **Ore giocate nel backlog** (`lib/playtime.ts`, `PlayedTime`): il tempo della
  copia giocata più di recente, con l'orologio e senza data. Ci stavo per
  scrivere che il tempo di gioco non si mostra da nessuna parte; non era vero
  (la scheda lo mostra) e la decisione è l'opposto: si mostra anche qui.
  Decisione in [docs/import-librerie.md](../docs/import-librerie.md).

### Dopo l'approvazione

Il codice, una volta sola: rotte e pagine, bottone e dialog, estrazione dei
gestori e conteggio dei filtri, messaggi in italiano e inglese, e i test dove
c'è logica (conteggio dei filtri, passaggio da `PlaylistQuery` a URL e
ritorno). Lo scrivo a struttura approvata.

## Rimandato alla 15b

La wishlist riusa questa tabella come «lista con nome», ma non ha una
`BacklogQuery`: la migration della 15b rende `query` nullable o aggiunge un
tipo di lista. Qui `query` è obbligatoria.
