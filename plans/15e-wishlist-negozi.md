# Step 15e — Wishlist dei negozi

**Piano approvato il 12/10/2026** (lista per negozio e account, sola lettura,
aggiornamento solo a mano). In roadmap «In corso» dal 12/10/2026; il lotto si
chiude quando l'utente dice che è pronto. Le fonti e ciò che non è misurato sono
in [docs/negozi.md](../docs/negozi.md#le-wishlist-dei-negozi-15e-da-fare); le liste
a mano su cui si appoggia sono la [15b](15b-wishlist.md).

## Cosa si fa

Portare dentro Ludex le wishlist di **Steam**, **GOG** e **PlayStation**, come
liste di sola lettura accanto a quelle fatte a mano. Xbox, Nintendo, Epic e gli altri
**non** sono nel primo giro: si valutano uno alla volta, dopo.

## Cosa hanno detto le misure (passo 1, 12/10/2026)

Il dettaglio è in [docs/negozi.md](../docs/negozi.md) («Misurato il 12/10/2026»).

| Negozio | Credenziale                                                              | Identità                               | Data di aggiunta  |
| ------- | ------------------------------------------------------------------------ | -------------------------------------- | ----------------- |
| Steam   | `access_token` del login, o la chiave API se il profilo è solo incollato | appid → `external_ids`                 | sì (`date_added`) |
| GOG     | Bearer di `auth.gog.com`, già salvato                                    | product id → `external_ids`            | no                |
| PSN     | Bearer del client mobile, già salvato, su `m.np.playstation.com`         | titleId → `external_ids`, poi per nome | no                |

Steam senza login legge la wishlist solo se «Dettagli dei giochi» è pubblico;
col token funziona anche con i dettagli privati (provato, come per la libreria).

## Decisioni (prese il 12/10/2026)

- **Una lista per negozio e account**, in `playlists` con un nuovo `tipo`
  (`store_wishlist`) e `store_account_id`. Separata dalle liste a mano.
  Scollegare l'account la cancella (cascade). **Si rinomina e si sposta** come le
  altre (corretto il 12/10/2026: all'inizio l'avevo esclusa senza un vero motivo);
  **non si cancella** da sola — la lista è legata all'account, e cancellarla
  lascerebbe i suoi non riconosciuti senza lista — e non ci si aggiunge né toglie
  giochi: la scrive solo l'import. Il nome lo compone il sistema **alla creazione**
  (`<Negozio> · <nome dell'account>`) e da lì è dell'utente: un aggiornamento non lo
  riscrive. Non è unico (l'indice sul nome è parziale, `where store_account_id is
null`), così due account con lo stesso nome non fanno fallire un import. In
  elenco stanno **dopo** quelle a mano, e `move` lavora dentro il proprio gruppo.
- **La lista nasce su richiesta** (precisato il 12/10/2026): non esiste finché
  l'utente non preme «Importa wishlist» sull'account. Non si crea al collegamento,
  non parte con l'import della libreria e non rientra nei sette giorni. La prima
  richiesta la crea, le successive la aggiornano.
- **Sola lettura da Ludex:** l'import allinea la lista alla wishlist del negozio.
  Un gioco tolto dal negozio esce dalla lista. Non si scrive mai sul negozio.
- **Liste a mano e liste di negozio si comportano diversamente con un gioco che hai
  già.** Nelle liste a mano un gioco nel backlog non c'è (regola di 15b: entrando nel
  backlog esce, e la lettura lo esclude con `NOT EXISTS`). **Nelle liste di negozio
  resta**, perché rispecchiano il negozio (scelta dell'utente, 12/10/2026): Hades
  messo in wishlist su Steam e poi regalato su Epic resta nella wishlist di Steam, e
  lo si vede con l'etichetta del suo stato, come sulle card. L'import quindi **non
  salta** i giochi che hai già, il conto è quello del negozio, e `wishlists.get`
  porta lo `status` di chi guarda. Come si vede l'etichetta, e se «Ce l'ho» sparisce
  su quelle card, si decide nel wireframe del passo 4.
- **Data di aggiunta:** quella di Steam (`date_added`) dove c'è, scritta solo
  all'inserimento. Per GOG e PSN, il momento del primo import che vede il gioco.
  Un reimport non riscrive mai `added_at`.
- **Credenziale di Steam:** il token se l'account ha il login, la chiave API se è
  solo il profilo incollato. Se la risposta è vuota il messaggio dice di
  controllare che i dettagli dei giochi siano pubblici (come per la libreria:
  la risposta non distingue «vuota» da «non visibile»).
- **Identità:** Steam e GOG passano da `external_ids` e, per gli id nuovi, da IGDB
  (stessa strada della libreria, e i giochi nuovi si arricchiscono da sé perché
  `games` è condivisa). **PSN si risolve per il `titleId`, poi per nome**
  (`resolveByName`). L'id della wishlist (`EP3643-PPSA06465_00-3571249245584917`) è
  un id di **prodotto**, lo stesso pezzo finale dell'indirizzo della pagina del
  negozio, e il suo pezzo di mezzo (`PPSA06465_00`) è il `titleId` che
  `external_ids` tiene per PSN: si cerca lì, e quando la voce si risolve (per nome
  o a mano) si scrive **quello**, mai l'id intero. **Correzione del 13/10/2026:**
  fino a qui il piano diceva che l'id di prodotto non c'entrava con `external_ids`
  e che PSN non doveva scriverci, ed era sbagliato; misurato su 336 copie PSN
  della libreria di sviluppo, in 335 il pezzo di mezzo della pagina coincide con un
  id già salvato (l'eccezione è un gioco su due console: il titleId è **per
  console**, e allora si ripiega sul nome). IGDB non si interroga per id, perché non
  conosce il titleId. Un id senza titleId (non visto finora) si lega per nome senza
  scrivere niente. La voce PSN è una sola anche se il gioco esce su PS4 e PS5, e la lista non porta
  la piattaforma: serve solo quando il gioco passa al backlog, e la sceglie
  l'utente.
- **Le voci non risolte hanno una tabella loro, `wishlist_unresolved`** (scelta
  dell'utente, 12/10/2026, dopo aver visto le alternative). Non vanno in
  `unresolved_imports`: quella tabella ha la chiave `(store_account_id,
external_id)` ed è quella delle voci della libreria, e a ogni import di
  libreria `importLibrary` cancella dagli scarti dell'account tutto ciò che non è
  nella libreria (`library-import.ts:765-778`): le voci della wishlist sparirebbero
  da sole, e un appid in wishlist e già in libreria si sovrapporrebbe. Le due
  cose si somigliano ma non devono toccarsi.
  - **Colonne:** utente, account del negozio (cascade), `external_id`, nome,
    copertina e indirizzo della pagina, la data di aggiunta del negozio dove c'è,
    `hidden_at` (nullo = da sistemare) e le date. Chiave unica
    `(store_account_id, external_id)`. Niente piattaforme: la lista non le porta.
  - **A ogni aggiornamento** le righe si riscrivono come per gli scarti della
    libreria (nome e copertina si aggiornano, `hidden_at` no); le voci che il
    negozio non ha più, o che ora si risolvono, se ne vanno.
  - **Collegare a mano** una voce a un gioco di IGDB (`IgdbPicker`, come per gli
    scarti): il gioco entra nella **lista di quell'account** (non nel backlog) e la
    riga sparisce. Per Steam e GOG scrive anche la mappatura in `external_ids`,
    come la libreria: da lì quell'id è risolto per tutti. **Per PSN no**, per la
    stessa ragione di sopra. Se il gioco è già nel backlog dell'utente non entra in
    lista (regola di 15b) e la riga sparisce lo stesso.
  - **Nascondere**, con la sola data `hidden_at` e senza i tipi di `hiddenKind`:
    serve a ciò che non è un gioco (un software, un bundle), che altrimenti
    tornerebbe a ogni aggiornamento. Niente «nascosti per tutti» né ruolo admin
    in questo lotto.
  - **Chi le vede:** sulla lista dell'account («N non riconosciuti», con l'azione
    per sistemarli), non in «Da sistemare» dell'account, che resta per la
    libreria. Il punto preciso si fissa col wireframe del passo 4.
- **Cadenza:** solo a mano, un pulsante «Importa wishlist» (poi «Aggiorna») sulla
  scheda dell'account, che accoda un job nella stessa coda degli import (i job non girano
  nel processo HTTP). Fuori dall'aggiornamento automatico dei sette giorni, che
  resta per la libreria. Una richiesta al negozio per aggiornamento.

## Passi

Ogni passo ha il suo «ok, procedi».

1. ~~**Misurare**, in sola lettura, **una richiesta per negozio** (sotto).~~
   **Fatto il 12/10/2026.**
2. ~~**Decisioni** sulle misure, e questo piano aggiornato.~~ **Fatto il
   12/10/2026**, sopra.
3. **Server:** migration (tipo e colonna di `playlists`, tabella
   `wishlist_unresolved`), un fetch per negozio in `external/`, il servizio (riusa
   la risoluzione della libreria e `resolveByName`), il job nella coda degli
   import, le procedure oRPC (aggiorna, elenca i non riconosciuti, collega,
   nascondi). Test contro Postgres: import idempotente, tolto dal negozio, gioco
   già nel backlog, voce non risolta che si riscrive e che sparisce quando si
   risolve, collegare a mano (con e senza `external_ids`, PSN compreso), nascondere,
   account scollegato. Esportazione e cancellazione dell'account.
4. **Web:** le liste di negozio in `/wishlist` accanto alle altre (dopo), con l'icona
   del negozio, con «Rinomina» e «Sposta» ma senza «Elimina»; il pulsante
   «Importa wishlist» nella scheda dell'account;
   i non riconosciuti sulla lista e il dialogo per collegarli (riusa
   `IgdbPicker`). **Prima il wireframe** (Excalidraw), poi il codice.
5. **Documentazione:** `docs/negozi.md`, `docs/ordine-sviluppo.md`,
   `apps/web/CLAUDE.md`.

## Passo 3 — avanzamento

**3a. Migration, fatta il 12/10/2026.** Due file, perché Postgres non lascia usare
un valore d'enum nella transazione in cui nasce **se il tipo esisteva già**:
`0044_playlist_kind_store_wishlist` aggiunge `store_wishlist`, `0045_store_wishlists`
fa il resto. Il drizzle-kit applica tutto ciò che manca in una transazione sola,
quindi `0045` **non può nominare `store_wishlist` come letterale d'enum**: a un
database con `0043` già applicato (sviluppo, test) darebbe `55P04`; da zero invece
passa, perché il tipo nasce nella stessa transazione, ed è per questo che una prova
su un database vuoto non lo mostra. L'indice parziale usa quindi
`store_account_id is null`, e il vincolo confronta `kind::text`.

- `playlists.store_account_id` (cascade), indice unico (una lista per account),
  indice del nome parziale, vincolo «`store_wishlist` se e solo se c'è l'account».
- Tabella `wishlist_unresolved` (utente, account, negozio, id, nome, copertina,
  indirizzo, `added_at`, `hidden_at`), chiave `(account, id)`.
- Provati a mano, in transazioni annullate: tipo senza account → rifiutato; account
  su una lista a mano → rifiutato; due liste per lo stesso account → rifiutato; due
  account con lo stesso nome → ammessi.
- Applicata al database di sviluppo; `pnpm --filter api test` (758) verde, con il
  database di test migrato da zero a ogni corsa.

**Ancora da fare nel passo 3**, in quest'ordine, ognuno col suo «ok, procedi»:

- ~~**3b. Letture:**~~ **fatto il 12/10/2026.** `listWishlists` (e quindi
  `wishlists.list`) e `openWishlist` (`wishlists.get`) includono le liste di negozio,
  con `store` e `storeAccountId`; si rinominano e si spostano (`renameWishlist`,
  `moveWishlist`, dentro il proprio gruppo). Aggiungere, togliere e cancellare
  restano delle sole liste a mano: per una lista di negozio rendono «non trovata».
  `wishlistedGameIds`, `wishlistsForGame` e `dropFromWishlists` non cambiano: il
  cuore e il menu sono per le liste a mano. In una lista di negozio aperta
  `wishlisted` è **falso**, perché il gioco può non stare in nessuna lista a mano.
  Un gioco che entra nel backlog **non** esce dalle liste di negozio e **si vede**,
  con lo stato (vedi sopra; cambiato lo stesso giorno, su proposta dell'utente). Dieci test nuovi in
  `wishlist.test.ts`, mordono (rotto di proposito l'elenco, ne falliscono 4).
- ~~**3c. Client dei negozi:**~~ **fatto il 12/10/2026.** `fetchSteamWishlist`
  (token se c'è, chiave altrimenti), `fetchGogWishlist` e `fetchPsnWishlist`, in
  `external/steam.ts`, `gog.ts` e `psn.ts`, con 14 test sul `fetch` finto che
  mordono (rotti di proposito redirect, host e controllo della forma). Tre cose che
  si scoprono solo rileggendo:
  - **Steam e GOG non dicono il nome**: rendono appid e id, e basta. Le voci portano
    «App <appid>» e «GOG <id>», come la libreria quando manca il titolo. Per le voci
    che si risolvono non importa (il nome è quello di IGDB); per quelle che **non**
    si risolvono, la voce da collegare a mano si vedrebbe come «GOG 1179418179», che
    non dice niente. Su Steam c'è almeno il link alla pagina del negozio
    (`app/<appid>`), su GOG la pagina vuole lo slug. **Da decidere nel 3d**, vedi
    sotto. Inoltre la ricerca per nome non si può fare per queste due.
    **Deciso e misurato il 12/10/2026 (strada 1):** per le sole voci non
    riconosciute dopo la ricerca per id, il nome si chiede a un endpoint pubblico —
    Steam `appdetails`, GOG `api.gog.com/products/<id>` — una richiesta per voce
    (misurate, vedi [docs/negozi.md](../docs/negozi.md)). Danno anche il tipo
    (`type`, `game_type`: scartare i DLC), l'indirizzo della pagina GOG (`slug`) e,
    per GOG, un'immagine (`images.logo2x`, un logo e non una copertina). Il nome
    ottenuto serve poi a `resolveByName`. Se la voce non risponde (app ritirata)
    resta «App <appid>» / «GOG <id>». Steam dichiara circa 200 richieste ogni
    cinque minuti: le richieste vanno in fila con una pausa e un tetto per
    aggiornamento. **Misurato il 13/10/2026:** 220 richieste in 377 s, nessun 429
    (al più circa 176 in cinque minuti): il nostro ritmo regge, la soglia non è
    stata raggiunta.
  - **Una risposta di forma diversa è un errore, mai una lista vuota**: GOG senza
    l'oggetto `wishlist`, PSN con errori GraphQL o senza `storeWishlist` (l'hash della
    query persistente che smette di valere). Una lista vuota svuoterebbe quella
    dell'utente.
  - **`boxArt` di PSN** lo leggo come `{ url }`. **Confermato il 13/10/2026**:
    `{"__typename":"Media","url":"…"}`, presente su tutti e tre gli elementi.
- ~~**3d. Il servizio**~~ **fatto il 12/10/2026.** `services/store-wishlist.ts`
  (`syncStoreWishlist`, `importStoreWishlist`) allinea la lista e riscrive
  `wishlist_unresolved`; `linkExternalGames` ha l'opzione `persistIds`, ora usata solo per
  le voci PSN senza titleId. Risoluzione: Steam e GOG per id, poi i nomi dagli
  endpoint pubblici (tetto 40 per aggiornamento, 1500 ms Steam e 300 ms GOG), poi
  `resolveByName`; PSN per titleId (`wishlistKey`, `services/wishlist-key.ts`) e poi
  per nome, **corretto il 13/10/2026** (prima era «solo per nome», vedi sopra). Una risposta vuota di Steam senza token alza
  `SteamWishlistNotVisibleError` e non tocca la lista; `requireReauth` segna
  `needs_reauth`. 31 test in `store-wishlist.test.ts`. **Prove di mutazione
  (13/10/2026):** 24 mutazioni del servizio (PSN per id, `persistIds`, filtro dei
  contenuti aggiuntivi e dei nomi ignoti, tetto e interruzione dei nomi, cancellazioni
  e date della lista, `hidden_at`, voci non riconosciute, auth e reauth dei tre negozi,
  enrichment, lista per account, nome della lista, copertina PSN, data Steam). Al
  primo giro ne sopravvissero cinque — nome ignoto cercato per nome, data più
  vecchia, reauth PSN, copertina PSN, data Steam — e per ognuna c'è ora un test;
  al secondo giro muoiono tutte.
- ~~**3e. Il job**~~ **fatto il 13/10/2026.** Nella coda degli import, ma come
  tipo a parte: `{ type: 'wishlist', storeAccountId }` (i job `{ storeAccountId }`
  già in Redis restano di libreria), nome del job `<negozio>:wishlist`, chiave di
  deduplicazione **sua** (`${id}:wishlist`: chiedere la wishlist mentre la libreria
  si importa non deve essere scartato). Le decisioni del job stanno in `services/import-jobs.ts`, non in `worker.ts`
  (che apre i Worker e Redis appena lo si importa, e un test non lo può caricare):
  `findLinkedAccount` rilegge l'account e scarta lo scollegato, per la libreria come
  per la wishlist, e `runWishlistImportJob` chiama `importStoreWishlist`. Il worker
  ha la sola colla. `StoreReauthRequiredError` e `SteamWishlistNotVisibleError` sono
  `UnrecoverableError` (riprovare non li cambia); ogni altro errore passa com'è e
  BullMQ riprova. **Evento a parte**,
  `{ type: 'wishlist', phase, storeAccountId }`, non `import`: la wishlist non
  tocca backlog e scarti, e il browser rilegge solo le liste (`use-live-updates.ts`,
  anche alla riconnessione). Procedura **`accounts.syncWishlist({ accountId })`**
  (`void`): `NOT_FOUND` (inesistente, di un altro, scollegato), `BAD_REQUEST` (negozio
  senza wishlist: `wishlistStoreValues` = Steam, GOG, PSN), `FORBIDDEN`
  (`needs_reauth`), `CONFLICT` (già in corso). La logica è in
  `requestWishlistImport` (`store-accounts.ts`), che rende l'esito e lascia al router
  il tradurlo. Undici test nuovi (tre su `requestWishlistImport`, uno sull'evento, sette in
  `import-jobs.test.ts`) e tredici mutazioni, tutte scoperte. **Non coperti da
  test:** la colla del worker (la scelta fra gli eventi `import` e `wishlist`, una
  riga) e il router, come per la libreria. **Rimandato
  al passo 4:** se la scheda dell'account debba sapere che la wishlist si sta
  importando (un `wishlistSyncing` accanto a `syncing`): lo decide la schermata.
- ~~**3f. Collegare e nascondere**~~ **fatto il 13/10/2026.** `services/wishlist-unresolved.ts`
  e, nel contratto, `wishlists.unresolved.{list, resolve, setHidden}`:
  - **`list({ listId })`**: le voci della lista di negozio, nascoste comprese, per
    nome; `NOT_FOUND` se non è una tua lista di negozio.
  - **`resolve({ id, igdbId })`**: il gioco entra nella lista di quell'account (con la
    data del negozio, se c'è) e la riga sparisce; Steam e GOG scrivono anche
    `external_ids` e riaprono le fonti (su PSN la chiave è il titleId, **corretto il
    13/10/2026**: prima PSN non scriveva). **Cambia rispetto a sopra:** un gioco
    che hai già nel backlog **entra lo stesso**, come all'import (la lista di negozio
    rispecchia il negozio, decisione del 3b), invece di sparire senza entrare.
    `NOT_FOUND` per una voce non tua o un id IGDB che non esiste.
  - **`setHidden({ id, hidden })`**: la sola data `hidden_at`, che si conserva se si
    ripete; `NOT_FOUND` per una voce non tua.
  - **Su PSN il collegamento a mano resta**, come su Steam e GOG: si scrive il
    `titleId`, quindi l'aggiornamento successivo riconosce la voce da lì. (Il primo
    giro di questo passo diceva il contrario, vedi la correzione del 13/10/2026 nelle
    decisioni.) Fa eccezione solo l'id senza titleId, che non si è mai visto.
  - Dieci test contro Postgres, quattordici mutazioni: dodici scoperte, due
    **equivalenti** (il filtro per tipo di lista e quello per utente sulle voci
    ripetono ciò che già garantiscono il vincolo `playlists_kind_store_account_check`
    e la proprietà dell'account) e lasciate come difesa. I test del router sono nella
    sezione «Test rimandati».
- ~~**3g. Esportazione e cancellazione dell'account**~~ **fatto il 13/10/2026.**
  - **Esportazione:** `AccountExport` ha una chiave nuova, `storeWishlists`: per
    ogni account, `store`, `account` (come l'utente lo chiama), `name`, i `games`
    in lista (nome, id IGDB, data) e le voci `unresolved` (nome, id del negozio,
    date, nascosta o no). Le liste a mano restano in `wishlists`, senza
    mescolarsi. Nessun segreto in più: la riga dell'account non porta credenziali.
  - **Cancellazione dell'utente:** nessun codice, il cascade basta (utente →
    liste → voci, utente → `wishlist_unresolved`). Ora lo prova il test esistente,
    con una wishlist di negozio nei dati di prova.
  - **Un buco trovato scollegando un account, e chiuso:** con **`keep`** la riga
    dell'account sopravvive (`unlinked`), quindi il cascade non scatta, e la lista di
    negozio — che non si cancella da sé — sarebbe rimasta **orfana e immutabile**,
    con le sue voci non riconosciute. Ora `unlinkStoreAccount` in `keep` toglie la
    lista e le voci non riconosciute di quell'account, come già faceva per gli
    scarti della libreria. Con `purge` ci pensa il cascade, e un test copre i due
    modi, con una seconda lista che deve restare.
  - Sette mutazioni, tutte scoperte (due sono sopravvissute finché l'esportazione
    era provata con una sola lista per utente; ora ce ne sono due). **Per il passo
    5:** `docs/import-librerie.md` («Scollegare è una domanda») e la sezione
    dell'esportazione in `docs/ordine-sviluppo.md` vanno aggiornati.
- **Test** contro Postgres lungo il percorso, come nel piano.

## Test rimandati

Decisione del 13/10/2026: non si fanno ora, si fanno in un giro a parte, e **non sono
un limite tecnico** (il router si prova con `call(...)` come in `rpc/context.test.ts`).

- **Router, `accounts.syncWishlist`:** i quattro esiti di `requestWishlistImport`
  diventano `NOT_FOUND`, `BAD_REQUEST`, `FORBIDDEN` e `CONFLICT`; con la coda
  stubbata come in `store-accounts.test.ts`. Più, quando ci sono, le procedure del 3f.
- **Worker, la scelta dell'evento:** estrarre in `import-jobs.ts` una funzione pura
  (`importEventType(job.data)`, `import` o `wishlist`) e provarla. La colla con
  Redis e BullMQ resta senza test.
- Con le solite mutazioni, e la nota in `docs/` se serve.

## Passo 1 — le misure

**Rischio, dichiarato prima:** ogni misura è una richiesta vera a un servizio
terzo. Steam ha già bloccato l'account dell'utente tre volte (vedi «Il terzo
blocco» in [negozi](../docs/negozi.md)), per login da server, non per la chiave.
Quindi:

- **una richiesta per negozio**, mai ripetuta «per sicurezza»; se risponde un
  errore d'autenticazione ci si ferma e si riferisce;
- **nessun login e nessun token inventato**: si usano credenziali già esistenti;
- **Steam: la chiave API**, che non apre sessioni, e **l'account di prova
  `sanvitest`**, non quello principale;
- ciò che esce dalle risposte si stampa **senza token né cookie**.

Cosa si vuole sapere:

| Negozio | Domande                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Steam   | forma della risposta di `GetWishlist` (appid, priorità, data di aggiunta); se serve il profilo pubblico; se accetta l'`access_token` a wishlist privata (**sì**: aggiunto `--account`, una richiesta in più, dopo) |
| GOG     | se `embed.gog.com/user/wishlist.json` accetta il Bearer di `auth.gog.com` o vuole i cookie; che forma ha; se gli id sono quelli delle copie                                                                        |
| PSN     | se il Bearer delle librerie basta per `metGetStoreWishlist`; la forma di `storeWishlist`; se l'hash della query persistente vale ancora. (La risoluzione per nome si misura nel passo 3, con `resolveByName`.)     |

L'esito è nella sezione sopra. Gli script stanno in `apps/api/src/scripts/` (`steam-wishlist-probe.ts`,
`gog-wishlist-probe.ts`, `psn-wishlist-probe.ts`), come gli altri probe: **non
scrivono nel DB**, non stampano segreti, e la parte che interpreta la risposta si
prova a vuoto con un `fetch` finto, mai con l'host vero. L'esito va in
`docs/negozi.md`.

## Fuori dal primo giro

Xbox, Nintendo, Epic, EA e gli altri negozi; l'aggiornamento automatico; qualunque
scrittura verso il negozio.
