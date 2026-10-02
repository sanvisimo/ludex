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
filtri, l'ordinamento, la vista (`view`: righe, griglia, compatta), la pagina
(`page`) e quanti giochi per pagina (`size`: 15, 30, 60 o 120, di default 15).
Ogni `setFilter` riporta a pagina 1 e non
lascia voci nella cronologia; `goToPage` sì, perché «indietro» deve tornare
alla pagina di prima. Una pagina oltre la fine torna alla prima e non
all'ultima: con `count(*) over()` e nessuna riga restituita il server risponde
`total: 0`, e l'ultima non la sa.

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
laterale né menu a scomparsa: a sinistra il nome, che porta al catalogo; a
destra l'avatar, col menu di backlog, account, tema, lingua e uscita, o da
anonimo tema, lingua, «Accedi» e «Registrati». La barra resta sempre
visibile, col fondo della pagina e senza bordo: **in alto da `$md`, in basso
sotto**, dove arriva il pollice e i menu le si aprono sopra. La posizione la
sceglie il CSS, non JavaScript, come ogni forma del guscio: leggere la
larghezza darebbe un primo render sbagliato da correggere all'idratazione. Sul
telefono la pagina le lascia sotto la sua altezza (`BAR_HEIGHT`). Due pezzi che
una pagina nuova usa:

- **`Page`** (`apps/web/src/components`): `<main>`, larghezza massima,
  titolo, sottotitolo e azioni. Una pagina non scrive più il suo contenitore.
  `hero` sta sopra, larga quanto la finestra: è l'immagine del gioco.
- **`takeLinkClick`**: la regola dei modificatori (nuova scheda, tasto
  centrale) per ogni `<a href>` che naviga nell'app, `ButtonLink` compreso.

**La pagina del gioco** (`/games/$id`) ha i suoi pezzi in
`apps/web/components/game-page.tsx`: la hero, che `Page` mette sopra il suo
contenitore a tutta larghezza, la gallery, durata e critica col dialog
«Dettagli», il blocco del backlog, remake e simili. Le colonne si affiancano
da `$lg`; sotto, la laterale viene **prima** nell'HTML — durata, critica e
stato sono ciò che serve a decidere — e `row-reverse` la rimette a destra sul
desktop.

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
  giorno. «Esporta» e «Cancella» sono solo la parte che si vede: la conferma
  della cancellazione la spegne `DELETION_AVAILABLE` in `account-data.tsx`, e la
  accende lo step 16.
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
- **Tailwind resta** in `resolve-import-dialog.tsx`, `store-link-form.tsx` e
  `unlink-account-dialog.tsx`: i dialoghi dell'account non sono ancora riscritti.

**Le pagine di servizio** — `/credits`, `/privacy`, `/terms` — stanno sotto
`_app` e sono pubbliche. Il loro link sta nel `Footer` di `app-shell.tsx`,
con la firma, e non nel menu. I dati dei crediti (servizi,
software, icone, indirizzo del sorgente, email di contatto) sono in
`lib/credits.ts`, e i testi di informativa e condizioni, in italiano e inglese,
in `lib/legal.ts`. **I testi legali descrivono ciò che Ludex raccoglie davvero**:
cambiano le colonne di `user`, `session` o `store_accounts`, un cookie, un
fornitore, e va aggiornato il testo con la sua data. Un link che esce
dall'app è `ExternalLink`. Per OpenCritic vincolano anche le schermate, non solo
il worker: vedi [apps/api/CLAUDE.md](../api/CLAUDE.md).

Dall'identità, la parte che è del web:

- **`theme-color` sta nel `<head>` di `__root.tsx`** e non in `head()`: il
  router tiene una sola `meta` per `name`, e quella del tema chiaro spariva.
