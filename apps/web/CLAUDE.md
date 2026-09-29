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
- **le soglie guardano la finestra, non la pagina**: da `$md` il guscio se ne
  prende 240, quindi a 900 px una pagina ha lo spazio di una finestra da 612.
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
pagina piena. `AppShell` disegna **due forme della stessa navigazione** —
barra laterale da `$md` in su, barra in alto col menu che apre lo `Sheet` sotto
— e **le sceglie il CSS**, non JavaScript: tutte e due sono nell'HTML del
server, e leggere la larghezza darebbe un primo render sbagliato da correggere
all'idratazione. Tre pezzi che una pagina nuova usa:

- **`Page`** (`apps/web/src/components`): `<main>`, larghezza massima,
  titolo, sottotitolo e azioni. Una pagina non scrive più il suo contenitore.
- **`NavLink`**: `NavItem` di `@repo/ui` legato al router. Una voce nuova
  della barra passa da qui, e `NavTarget` dice quali pagine la barra conosce.
- **`takeLinkClick`**: la regola dei modificatori (nuova scheda, tasto
  centrale) per ogni `<a href>` che naviga nell'app, `ButtonLink` compreso.


Dall'identità, la parte che è del web:

- **`theme-color` sta nel `<head>` di `__root.tsx`** e non in `head()`: il
  router tiene una sola `meta` per `name`, e quella del tema chiaro spariva.
