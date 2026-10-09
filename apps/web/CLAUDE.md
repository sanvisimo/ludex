# apps/web

Le regole dei componenti stanno in [packages/ui/CLAUDE.md](../../packages/ui/CLAUDE.md).

**Come si costruisce sul web.** `apps/web` è TanStack Start su Vite, e il
compilatore di Tamagui è un plugin di Vite (`@tamagui/vite-plugin`) in
`apps/web/vite.config.ts`. Tre cose di quella config che non si indovinano:

- **gli alias li scriviamo noi**, non il plugin (`disableResolveConfig`):
  `react-native` → `react-native-web` e l'SVG delle icone, per nome nudo. Quelli
  del plugin puntano ai build CommonJS, che sul server non trovano `module`.
- **Tamagui sul server passa da Vite** (`ssr.noExternal`): lasciato a Node,
  importerebbe il `react-native` vero, in Flow. `react-native-web` invece resta
  a Node.
- **la config impacchettata** finisce in `apps/web/.tamagui/` (ignorata da git)
  e da lì risolve `@tamagui/core` e `@tamagui/web`, per questo devDependency di
  `apps/web`. Senza, la build passa lo stesso ma l'ottimizzazione salta in
  silenzio: si vede solo dall'errore nel log.

La build (`vite build`) produce un gestore `fetch` in `dist/server/server.js`,
e in produzione lo serve `srvx` (`pnpm --filter web start`). Le liste nella
query string sono separate da virgole e non in JSON, per `stringifySearch` in
`apps/web/src/router.tsx`.

**`/backlog` tiene tutto nell'URL** (`apps/web/lib/backlog-filter.ts`): i
filtri, l'ordinamento, la vista (`view`: griglia di default, poi righe e compatta), la pagina
(`page`) e quanti giochi per pagina (`size`, di default 14: il numero _chiesto_,
vedi sotto).
Ogni `setFilter` riporta a pagina 1 e non
lascia voci nella cronologia; `goToPage` sì, perché «indietro» deve tornare
alla pagina di prima. Una pagina oltre la fine torna alla prima e non
all'ultima: con `count(*) over()` e nessuna riga restituita il server risponde
`total: 0`, e l'ultima non la sa.

**Test del web**: `pnpm --filter web test`. Vitest in Node, solo la logica pura di
`lib/` (conversioni dei filtri, numeri per pagina, ore giocate): niente DOM e
nessun componente, che si provano a occhio. Non carica `vite.config.ts`, quindi
né il compilatore di Tamagui né il plugin di TanStack Start. Una logica nuova in
`lib/` porta il suo `*.test.ts` accanto.

**Quanti giochi per pagina seguono le colonne** (`lib/page-size.ts`,
`components/grid-columns.tsx`): un multiplo delle colonne che si vedono, così ogni
pagina finisce a riga piena e non solo l'ultima. Il menu offre colonne × 1, 2, 5,
10, 15, 20 righe; `size` nell'URL è il numero chiesto e la pagina lo porta al
multiplo più vicino (`snapPageSize`), quindi un link con `size=14` su 3 colonne
chiede 15. Cose che non si indovinano:

- **Le colonne si misurano, non si calcolano**: `GridProbe` è una griglia vuota,
  invisibile e fuori dal flusso, con lo stesso `GRID_TEMPLATE` della griglia vera,
  e `useGridColumns` ne legge le colonne risolte dal browser. Serve una sonda e
  non la griglia vera perché questa compare con la prima risposta, che dipende
  proprio da quanti giochi chiedere. Una griglia `auto-fill` senza figli ha comunque
  le sue colonne (provato in Chrome). La lista **non chiede finché non ha
  misurato**, o farebbe due richieste.
- **Le viste righe e compatta** hanno una colonna sola, e usano il passo di una
  griglia larga (7): stessi numeri nel menu, senza pagine di un'altra misura.
- **Ridimensionare la finestra** (o cambiare vista) fino a cambiare il numero
  per pagina rilegge la lista, e `useReanchorPage` porta la pagina a quella che
  tiene in vista il primo gioco di prima (`reanchorPage`). Aspetta che le colonne
  siano misurate, o il passaggio dal numero provvisorio a quello vero sembrerebbe
  una scelta di chi guarda. Costa una richiesta in più, con la pagina vecchia.
  Una scelta dal menu riporta a pagina 1 e non passa di qui.

**Le playlist** (`/playlist` e `/playlist/$id`, step 15a) sono i filtri di
`/backlog` salvati con un nome: la query gira a ogni apertura. L'elenco è come
la home, una fascia di card per playlist (20 al massimo, una query per fascia),
e il nome porta alla playlist aperta. L'ordine è quello scelto dall'utente
(«Sposta su» e «Sposta giù» nel menu ⋯, `playlists.move`); le nuove vanno in fondo.
Si creano **solo**
da `/backlog`, col bottone «Salva come playlist» (`save-playlist-dialog.tsx`),
che compare con almeno un filtro acceso e, su un nome già preso, offre di
sostituire. Cose che non si indovinano:

- **Cosa si salva** è `toPlaylistQuery` di `lib/backlog-filter.ts`: criteri e
  ordinamento, **non** la pagina, la vista, `size` né `hidden`. Li toglie lo
  schema (`PlaylistQuerySchema`), non un elenco di esclusioni.
- **Lo stato sta in due modi.** Una playlist senza `status` non filtra per
  stato, mentre `/backlog` senza `status` nell'URL esclude `excluded`: quindi
  `playlistSearch` (da playlist a URL, per «Modifica filtri») scrive tutti gli
  stati.
- **«Modifica filtri» porta con sé la playlist**: `/backlog?playlist=<id>`
  (`playlistSearch(query, id)`). Non è un criterio e non conta fra i filtri
  accesi: serve al dialogo «Salva come playlist», che parte dal nome di quella
  playlist e, se il nome resta quello, la aggiorna invece di segnalare un
  conflitto. Cambiando nome si crea una playlist nuova.
- **`/playlist/$id` tiene nell'URL `view`, `page`, `size` e la vista di chi
  guarda**: la ricerca (`q`) e l'ordine (`sort`, `direction`), che coprono
  quelli salvati senza cambiarli (`validatePlaylistSearch`). I filtri sono
  quelli salvati, e si cambiano passando da `/backlog` e sostituendo. `sort` e
  `direction` non perdono il valore uguale al default di `/backlog`, perché il
  default è quello della playlist: la pagina toglie ciò che coincide con lei.
  Ricerca e tendina dell'ordine sono in `components/list-controls.tsx`, le
  stesse di `/backlog`.
- **Le card sono quelle di `/backlog`**, con gli stessi gesti: `ManagedEntries`
  (`components/entry-list.tsx`) le monta in tutte e due le pagine, coi dialoghi
  di modifica e rimozione. Una azione nuova nel menu di una card va lì.
- **Una playlist si rilegge dopo ogni mutazione**, da un punto solo: la
  `MutationCache` in `components/providers.tsx` invalida `playlists.get`. Una
  mutazione nuova non deve saperne niente.
- **I tag mancanti** (cancellati dal vocabolario) la playlist li ignora e li
  dice con un avviso: lo conta il server (`missingTags`).

**Il pannello dei filtri** (`FilterPanel`, nel drawer di `/backlog`) ha l'ordinamento
in cima, poi «Mai giocato» come spunta semplice fuori dalle sezioni, poi una
sezione per criterio: stato, piattaforme, store, abbonamenti, tipo, attributi,
tag, durata, il mio voto, **voto critica**, uscita. Lo stato ha le stesse sei
spunte dei bottoni in barra, sulla stessa selezione.

**Gli slider hanno anche i campi numerici** (`RangeFilter`, `NumberField`):
«Da» e «A», o «Minimo» per il voto critica. Il campo si applica **uscendo o con
Invio**, non a ogni tasto: scrivere «2000» passa da «2», che un campo con gli
estremi in testa riscriverebbe a «1970» sotto le dita. Vuoto vuol dire «nessun
limite», come la maniglia all'estremo (100 ore di massimo comprese); il testo si
porta al passo e agli estremi dello slider (`lib/range-input.ts`, con i suoi
test), e la virgola vale come il punto. «Salva come playlist» sta anche in fondo
al pannello: il dialogo vive nella pagina (`SavePlaylistDialog`), perché il
pannello smonta ciò che ha dentro quando si chiude, e il clic chiude il pannello
prima di aprirlo.

**«Gioco a caso»** (`RandomGameButton`, step 15c) sta fra le azioni in cima a
`/backlog`, e non nella vista dei nascosti. Chiede a `backlog.random` un gioco con
stato `backlog` e non nascosto, **senza guardare i filtri della pagina**, e apre la
scheda; con nessun candidato il server rende `null` e basta un avviso.

**Le ore giocate nel backlog** sono un tempo solo con l'orologio, quello della
copia giocata più di recente (`latestPlaytime` in `lib/playtime.ts`, mostrato da
`PlayedTime`): nella riga dei fatti di griglia e righe, e in una colonna della
compatta da `$md`. Le altre copie, con le date, sono nella scheda del gioco.

**Le liste a mano** (`/wishlist` e `/wishlist/$id`, step 15b) sono come le
playlist ma con giochi scelti: una fascia per lista, e la lista aperta con ricerca,
ordine (data di aggiunta, nome, uscita, durata, voto della critica), «per pagina» a
multipli delle colonne e, sotto ogni card, «Ce l'ho» (`AddGameDialog` con un
`trigger` suo: il dialogo del backlog, che chiede la piattaforma) e «Togli» (con
«Annulla»). Si aggiunge dalla scheda del gioco, **solo se non è nel backlog**
(`WishlistControl`): senza liste il primo «aggiungi» ne crea una che si chiama
«Wishlist». **Il cuore** (`WishlistHeart`, in `HomeCard`) sta sulle card dei giochi che non
hai nel backlog, da loggati: vuoto aggiunge alla prima lista (con «Annulla»), pieno
toglie se il gioco sta in una lista sola e apre il menu delle liste se ne ha più.
Lo dice `HomeGame.wishlisted`; la lista aperta e le fasce di `/wishlist` lo spengono
(`showWishlist={false}`). La card sono due link alla stessa scheda e un bottone
sovrapposto: un bottone non sta dentro un link. `SortSelect` prende `keys` per offrire solo gli ordini di una
lista, e le mutazioni invalidano le liste dalla `MutationCache`, perché un gioco
che entra nel backlog da qualunque strada esce dalle liste.

**Le playlist condivise** (`/shared/$token`, step 15d) sono **pubbliche**, sotto
`_app` e fuori da `_private`: le apre chiunque abbia il link, anche da anonimo,
con `noindex, nofollow`. Il server manda il nome e i giochi come li mostra il
catalogo, i filtri senza i tag e lo stato di _chi guarda_; il proprietario non
compare e nemmeno l'API lo restituisce. La pagina ha la paginazione e il
«per pagina» (multipli delle colonne, entro il tetto della rotta, 140, come
`/backlog`): chi apre non cerca né riordina. «Usa
questi filtri sul mio backlog» apre `/backlog` con `playlistSearch(query)`; da
anonimi porta all'accesso con `?next=` e torna qui. Chi condivide usa «Condividi…»
nel menu ⋯ (`ShareForm`): il dialogo dice cosa esce _prima_ di creare il link, e il
link sta in uno stato locale del modulo, non nel `shareToken` dell'elenco.

Sette cose che le schermate devono sapere, perché si scoprono solo a vederle:

- **un link che sembra un bottone è `ButtonLink`** (`apps/web/src/components`), non
  `<Button render={<Link />}>`: su un `styled()` di Tamagui un `render` con un
  componente passa al link le props di stile grezze, e il link esce nudo.
- **le view di Tamagui non si restringono** (`flex-shrink: 0`, come su React
  Native): un campo al 100% accanto a un bottone lo spinge fuori. Ci va `flex={1}`.
- **la config vuole le abbreviazioni**: `shrink`, non `flexShrink`; `grow`, non
  `flexGrow`; `sm:` di Tailwind è `$sm`.
- **`flex={1}` in una colonna ha base 0**, e dove l'altezza la decide il
  contenuto — una riga di griglia — Chrome la calcola da lì: schede alte pochi
  pixel. Per crescere senza schiacciare ci va `grow={1}`.
- **`flex={1}` in una fila che sotto una soglia diventa colonna** ha lo
  stesso problema: base 0, altezza zero, e il contenuto esce e copre ciò che
  viene dopo. Ci va `flexBasis: 'auto'` nella stessa media query che gira la
  fila.
- **una media query su un componente di `@repo/ui` si risolve a runtime**, e
  server e browser scrivono due classi diverse: l'idratazione non torna. Va su
  un `XStack` o `YStack` intorno, come fa il guscio.
- **Tailwind convive fino alla fine dello step 12**, sui `div` delle schermate e
  mai sui componenti di `@repo/ui`: gli stili di Tamagui stanno fuori da ogni
  layer, quelli di Tailwind 4 dentro, e vince sempre Tamagui. Una classe su un
  componente sparisce in silenzio.

**Il web è su TanStack Start**, deciso prima del 12b e fatto nel 12b: web e
mobile condividono i componenti, non le rotte, e il grosso del progetto —
`/backlog` e il guscio — su telefono è per forza un'altra schermata. Il conto e
le ragioni sono nel piano del 12a, il passaggio nel piano del 12b.

**Il guscio** è il layout `_app` (`apps/web/src/routes/_app.tsx`), che avvolge
tutte le rotte tranne accesso e registrazione: quelle stanno sotto `_guest`, a
pagina piena. `AppShell` è **una barra sola** e un footer, senza barra
laterale né menu a scomparsa: a sinistra il nome, che porta al catalogo, o al
backlog da loggati; a destra l'avatar, col menu di home, backlog, account, tema, lingua e uscita, o da
anonimo tema, lingua, «Accedi» e «Registrati», che sotto `$md` in barra non
ci stanno e vanno in un foglio aperto da un'icona (`GuestSheet`). La barra resta sempre
visibile, col fondo della pagina e senza bordo: **in alto da `$md`, in basso
sotto**, dove arriva il pollice e i menu le si aprono sopra. La posizione la
sceglie il CSS, non JavaScript, come ogni forma del guscio: leggere la
larghezza darebbe un primo render sbagliato da correggere all'idratazione. Sul
telefono la pagina le lascia sotto la sua altezza (`BAR_HEIGHT`). `BackToTop` è la freccia che riporta in
cima: fissa in basso a destra, compare dopo un'altezza di finestra di
scorrimento e sul telefono sta sopra la barra. Due pezzi che una pagina nuova
usa:

- **`Page`** (`apps/web/src/components`): `<main>`, larghezza massima,
  titolo, sottotitolo e azioni. Una pagina non scrive più il suo contenitore.
  `hero` sta sopra, larga quanto la finestra: è l'immagine del gioco.
- **`takeLinkClick`**: la regola dei modificatori (nuova scheda, tasto
  centrale) per ogni `<a href>` che naviga nell'app, `ButtonLink` compreso.

**La home** (`/`, 12e) è il catalogo a fasce, **uguale per tutti**: da
loggati cambia solo l'etichetta dello stato sulle card dei giochi tuoi, e i
tuoi nascosti ci sono. Le fasce le sceglie il server (`games.home`,
`apps/api/src/services/home.ts`), comprese la rotazione del giorno e i tre
generi; la pagina le mostra nell'ordine in cui arrivano e non ne mostra una
vuota. I pezzi sono in `apps/web/components/home-band.tsx`. La riga che
scorre con le frecce è `ScrollRow` (`components/scroll-row.tsx`), la stessa
dei giochi legati nella pagina del gioco; nella home le frecce ci sono solo
da `$md` (`arrowsFromMd`). Il voto sulle card, qui come nel backlog, è
`criticScore`, che **non è mai OpenCritic** (vedi
[apps/api/CLAUDE.md](../api/CLAUDE.md)).

**La ricerca globale** (12f) cerca nel catalogo intero, non nel backlog:
prima i giochi di Ludex (`games.find`, pubblica, con lo stato di chi guarda),
poi, **solo da loggati**, quelli IGDB che Ludex non ha ancora
(`games.findOnIgdb`, che consuma il rate limit delle nostre credenziali). Un
risultato IGDB diventa una riga di `games` **al clic** (`games.fromIgdb`), mai
mentre si cerca: le righe di `games` non si cancellano. I pezzi sono in
`components/game-search.tsx`; il campo con la tendina è `SearchField` di
`@repo/ui`. La tendina ha dieci posti: prima i giochi di Ludex, e IGDB
riempie quelli che restano, chiesto dopo e solo se ne restano. In barra il
campo sta da `$md`; sotto c'è un'icona che porta a `/cerca`, la pagina con tutti i risultati: griglia con la card della home, a
pagine da 30, testo e pagina nell'URL come il backlog. Su `/cerca` la barra non
ha il campo, perché la pagina ha il suo. La scrittura aspetta 300 ms prima di
chiedere: IGDB regge quattro richieste al secondo per tutto il server.

**La pagina del gioco** (`/games/$slug`, lo slug di `games`, vedi
[modello-dati](../../docs/modello-dati.md)) ha i suoi pezzi in
`apps/web/components/game-page.tsx`: la hero, che `Page` mette sopra il suo
contenitore a tutta larghezza, la gallery, durata e critica col dialog
«Dettagli», il blocco del backlog, la card «Links» coi negozi dove il gioco c'è
(`StoreLinks`: `game.storeLinks`, un link per negozio, solo dove una pagina
ufficiale c'è — `storeGameUrl` in `@repo/contracts`), remake e simili. Le colonne si affiancano
da `$lg`; sotto, la laterale viene **prima** nell'HTML — durata, critica e
stato sono ciò che serve a decidere — e `row-reverse` la rimette a destra sul
desktop. Un gioco appena nato (id IGDB, dati non ancora arrivati, creato da
meno di 2 minuti) mostra lo skeleton con «Sto recuperando i dati da IGDB…» e
si rilegge ogni 5 secondi; oltre, la pagina com'è (`isEnriching`). Remake e
simili si aprono con la regola della ricerca: in catalogo sono un link, fuori
catalogo da loggati un bottone che li crea (`useOpenIgdbHit`), da ospiti
niente; attenuati se non sono tuoi.

**La pagina account** (`/account`) è un layout, `_app.account.tsx`, con quattro
sezioni che sono rotte figlie: `profilo`, `librerie`, `da-sistemare`, `nascosti`.
`/account` da solo rimanda al profilo (`replace`). Il menu è `AccountNav`: una
colonna da `$md`, una riga che scorre sotto, un `YStack` solo che cambia
direzione col CSS. Cose che non si indovinano:

- **I numeri nel menu** (`useAccountCounts`) contano le voci da sistemare e i
  nascosti — questi ultimi sono **voci d'import più giochi nascosti dal backlog**,
  perché la sezione li mostra insieme. Zero non si scrive.
- **Il profilo** usa Better Auth dal client (`updateUser`, `changePassword`,
  `listSessions`, `revokeSession`, `revokeOtherSessions`), non oRPC: le chiavi
  di query sono a mano (`['auth', 'sessions']`). L'ora delle sessioni è quella
  dell'**accesso**, perché Better Auth aggiorna la sessione al più una volta al
  giorno. «Esporta» scarica un JSON preparato dal server
  (`accountData.export`, senza token), e «Cancella» chiama `authClient.deleteUser`
  **con la password**: il server la pretende, e rifiuta l'ultimo admin
  (`LAST_ADMIN`). Step 16, fatto.
- **Le librerie** sono una griglia `repeat(auto-fill, minmax(240px, 1fr))`, una
  scheda per **account** (due account Amazon sono due schede). Stato e riga dei
  gesti stanno **ancorati in fondo** (`grow` sul contenuto, `mt="auto"` su un
  gruppo): la griglia allunga le schede di una riga alla più alta, e senza l'ancora
  le icone ↻ stanno ad altezze diverse. `STORE_BRAND` è in `lib/store-brand.ts`.
  Il ↻ gira con `Spinner` mentre quell'account importa.
- **Gli scarti d'import hanno copertina e link al negozio**, e vengono dall'import:
  `unresolved_imports.image_url` e `store_page`, riscritti a ogni reimport (vedi
  [import-librerie](../../docs/import-librerie.md)). Steam non salva niente: la
  copertina la compone `storeCoverUrl` dall'appid. Un'immagine che non si carica
  — un gioco ritirato da Steam dà 404 — cade sul riquadro con l'icona del negozio
  (`UnresolvedCover`), e l'icona accanto al nome è il link alla pagina dove un
  link c'è. Le righe già in tabella la prendono al prossimo import.
- **Nascosti** è a tab nell'URL (`?tipo=dlc`), e senza `?tipo` si apre il primo tab
  che ha qualcosa. «Non interessato» è l'unico con due mucchi, e li unisce per data
  di nascondimento; i giochi si portano al massimo 100 (`GAMES_LIMIT`), e il
  numero del tab è il totale vero.
- **Una barra di scorrimento non si ottiene con `overflow: scroll`**: su Windows
  disegna sempre i nastri grigi, anche quando non servono. Per una riga che scorre
  c'è `Tabs`, o `overflowX: 'auto'` con `scrollbarWidth: 'none'`.
- **Provarla con Playwright**: la pagina tiene aperta una connessione per gli
  eventi, quindi `networkidle` non scatta mai; si aspetta un selettore. L'accesso
  si fa con una `POST /api/auth/sign-in/email` dal contesto del browser: il cookie
  è per host e non per porta, quindi vale anche sul web.
- **Steam ha un corpo suo nel dialogo «Aggiungi libreria»** (`steam-link.tsx`): il
  login col QR sopra, il profilo sotto, e il nome facoltativo condiviso. Il QR è
  `steam-qr-panel.tsx`: lo chiede all'apertura e interroga `status` ogni due
  secondi, e **chiudere il pannello smette di chiedere**. La scheda dice se
  l'account ha il login (`hasLogin`) e il menu ha «Accedi con Steam» e «Togli il
  login». Un import fallito **non arriva alla schermata**, per questo il profilo
  privato si controlla al collegamento e l'avviso sta nel dialogo.
- **Tailwind resta** in `resolve-import-dialog.tsx`, `store-link-form.tsx` e
  `unlink-account-dialog.tsx`: i dialoghi dell'account non sono ancora riscritti.

**La sezione admin** (`/admin`, 11a) ha la cornice dell'account, più larga, e
rimanda via chi non ha `role = 'admin'`: è comodità, la sicurezza vera la fa il
middleware `admin` sul server. Il link «Admin» sta nel menu dell'avatar, e
«Apri nell'admin» sulla pagina di ogni gioco, solo per gli admin. Quattro
sezioni, rotte figlie: `mancanti`, `scarti`, `segnalati`, `utenti`, più la
scheda admin di un gioco, `/admin/giochi/$slug`. «Apri un gioco», la ricerca nel
catalogo, sta nell'intestazione. I pezzi stanno in `components/admin/`. Cose
che non si indovinano:

- **In `@repo/ui` una tabella non c'è**: `AdminTable` fa righe di `XStack` coi
  ruoli ARIA, come la vista compatta del backlog. Le colonne elastiche tagliano
  (`overflow="hidden"`) e i blocchi di testo accanto a una copertina vogliono
  `flex={1} minW={0}`, o il testo esce e finisce sopra la colonna accanto; le
  colonne fisse no, perché tengono i bottoni e tagliarle nasconderebbe l'anello
  del focus: la loro larghezza va data giusta.
- **La ricerca IGDB è `IgdbPicker`**, una sezione e non un dialogo: il dettaglio
  di uno scarto e «Non è questo gioco» la mettono sotto i dati, così si sceglie
  con la voce sotto gli occhi. `IgdbPickDialog` la avvolge per chi non ha altro
  da mostrare. Il dialogo dell'account (`resolve-import-dialog.tsx`) è ancora in
  Tailwind e non si estende.
- **«Inserisci id» ha due bottoni**: «Aggiungi» salva un id o un indirizzo e
  rifiuta un nome; «Cerca» usa il testo come nome sulla fonte. OpenCritic costa
  una delle 25 ricerche del giorno, e il dialogo lo dice prima.
- **Le copertine dei risultati di HLTB e Metacritic** arrivano dalla loro
  ricerca; quelle di OpenCritic no, e costerebbero il budget.

**Le pagine di servizio** — `/roadmap`, `/credits`, `/privacy`, `/terms` — stanno
sotto `_app` e sono pubbliche. Il loro link sta nel `Footer` di `app-shell.tsx`,
con la firma, e non nel menu. I dati dei crediti (servizi,
software, icone, indirizzo del sorgente, email di contatto) sono in
`lib/credits.ts`, e i testi di informativa e condizioni, in italiano e inglese,
in `lib/legal.ts`. **La roadmap** è una timeline sola (`_app.roadmap.tsx`): prima il futuro, poi il
fatto dal più recente. L'elenco è scritto a mano in `lib/roadmap.ts` — id, stato,
aree, mese — con i testi in `roadmap.items.<id>` nei due file dei messaggi. Il
colore è uno, il teal: gli stati si distinguono per come è riempito il pallino
e l'etichetta, mai per la tinta. **Segnalazioni e idee vanno alle issue di
GitHub** (`issuesUrl` in `lib/credits.ts`); la mail (`contactEmail`) resta solo
per informativa e condizioni, cioè per ciò che non può essere pubblico.
**I testi legali descrivono ciò che Ludex raccoglie davvero**:
cambiano le colonne di `user`, `session` o `store_accounts`, un cookie, un
fornitore, e va aggiornato il testo con la sua data. Un link che esce
dall'app è `ExternalLink`. Per OpenCritic vincolano anche le schermate, non solo
il worker: vedi [apps/api/CLAUDE.md](../api/CLAUDE.md).

Dall'identità, la parte che è del web:

- **`theme-color` sta nel `<head>` di `__root.tsx`** e non in `head()`: il
  router tiene una sola `meta` per `name`, e quella del tema chiaro spariva.
