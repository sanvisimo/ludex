# Le librerie si aggiornano quando apri Ludex

**Stato: fatto** (chiuso il 07/11/2026), voce `librarySyncOnOpen` della
roadmap. Piano e wireframe approvati il 07/11/2026. Branch
`claude/library-sync-new-server-gvkq3n`, PR #113 e #115.

## La richiesta

La prima notte sul VPS: giochi comprati su Steam e GOG verso mezzanotte, e al
mattino le librerie dicono «aggiornata 10 ore fa», senza quei giochi. La
spazzata aveva girato alle 22:40, e la soglia di 7 giorni li rimanda alla
settimana dopo.

Il commento di `AUTO_SYNC_EVERY_DAYS` diceva che un gioco comprato oggi che
compare fra qualche giorno «non toglie niente a cosa gioco stasera». **È
falso** (l'utente, 07/11/2026): chi compra un gioco spesso lo vuole giocare
subito. I tre casi:

- lo compro e ci gioco;
- lo compro, torno a casa e lo voglio vedere nel backlog;
- lo compro la mattina, la sera cerco nel backlog e non c'è.

## Decisioni

- **Sync all'apertura dell'app**, non una soglia più corta nella spazzata. Una
  soglia di un giorno non copre il terzo caso (il giro dell'account può cadere
  la sera tardi) e paga sette import alla settimana anche per chi non apre mai
  l'app. Così il costo segue gli utenti **attivi**.
- **Soglia di un'ora**: si accodano gli account il cui `last_sync_at` è più
  vecchio di un'ora. Un import a libreria invariata costa una chiamata al
  negozio e un confronto col DB (gli id noti si risolvono da `external_ids`).
- **La spazzata delle 6 ore resta com'è**, a 7 giorni e 3 su PSN: tiene vivi
  token e librerie di chi non apre l'app. Una spazzata notturna per tutti
  concentrerebbe gli import nella stessa ora, con un worker che ne fa uno alla
  volta.
- **Niente conto alla rovescia in secondi**: la durata dipende dal negozio, dai
  giochi nuovi e da quanti import di altri ci sono davanti. Si mostra
  **«1 di 3»**, le librerie finite su quelle da fare. La posizione in coda si
  aggiunge quando la coda ci sarà davvero.
- **Il backlog si aggiorna già da solo**: `useLiveUpdates` rilegge backlog,
  playlist e pagine dei giochi a ogni import finito. Non c'è da aggiungere
  niente.

## Passi

1. **Il servizio.** Una funzione in `services/library-sync.ts` che accoda gli
   import di **un** utente con la soglia in ore. Stesse regole di
   `findAccountsDueForImport` (collegamento `ok`, i due interruttori accesi,
   niente EA né CSV), da cui si estrae il predicato comune invece di
   copiarlo. Contro i doppioni basta la deduplicazione per account di
   `enqueueImport`. Test contro Postgres: chi è dovuto, chi no (un'ora non
   passata, interruttore spento, `needs_reauth`, EA, CSV), e due chiamate di
   fila che accodano una volta sola.
2. **La procedura oRPC** in `packages/contracts` e in `apps/api`, protetta
   dalla sessione. Restituisce gli account accodati.
3. **Il web.** La chiama il guscio all'apertura e quando la scheda torna in
   primo piano (`visibilitychange`): chi ha Ludex già aperto sul telefono e ci
   torna la sera non ricarica la pagina. Le chiamate ripetute non costano: la
   soglia la applica il server.
4. **Il segnale in `/backlog`**, secondo il wireframe
   ([sync-all-apertura.excalidraw](sync-all-apertura.excalidraw)), dopo la sua
   approvazione. Lo guidano gli account `syncing`, chiunque abbia fatto
   partire l'import: l'apertura, il sync a mano, la spazzata.
5. **Il commento di `AUTO_SYNC_EVERY_DAYS`** in
   `packages/contracts/src/vocabulary.ts` e **`docs/negozi.md`** («L'aggiornamento
   automatico») corretti: la spazzata tiene vivi i collegamenti, la freschezza
   la dà l'apertura.
6. **La roadmap**: la voce `librarySyncOnOpen`, «in corso» da adesso, «fatto»
   quando il lotto è pronto.

## Il segnale: proposta

- **Dove**: nella riga del sottotitolo di `/backlog`, dopo il numero dei giochi.
  Nessuna striscia in più: il segnale compare e sparisce, e non deve spostare
  la pagina.
- **Cosa dice**: uno spinner e «Aggiorno le librerie · 1 di 3». Al passaggio
  del mouse, o al tocco, i negozi: quelli finiti con la spunta, quelli in
  corso con lo spinner.
- **Quando finisce**: sparisce. I giochi nuovi compaiono da soli nell'elenco,
  e il numero nel sottotitolo cresce.
- **Il «di 3»**: gli account in importazione più quelli finiti da quando il
  segnale è comparso. Un account che parte a metà, per esempio dal sync a
  mano in un'altra scheda, allunga il totale.
- **Su telefono**: la riga va a capo sotto il numero dei giochi.
- **Un limite da sapere**: a libreria invariata il segnale compare per pochi
  secondi, una volta all'ora al massimo. È lo stato vero.

Lo screenshot di partenza non c'è: la sessione in cui è nato il piano non aveva
Docker, quindi niente stack. La
testata del wireframe è ricostruita dal codice di `_app._private.backlog.tsx`.

## Com'è andata (07/11/2026)

- **Passi 1–3 e 5–6 fatti.** `enqueueImportsOnOpen` e `findAccountsDueOnOpen`
  in `services/library-sync.ts`, con `selectAccountsDue` come predicato comune
  a spazzata e apertura; `accounts.syncOnOpen` nel contratto e nel router;
  `useSyncOnOpen` nel guscio (`apps/web/src/use-sync-on-open.ts`).
- **Una cosa in più del piano, perché senza era rotto**: la soglia su
  `last_sync_at` non ferma un negozio che non risponde, perché la data resta
  vecchia e ogni ritorno sulla scheda riaccoderebbe l'import. Una chiave in
  Redis per utente, di un'ora (`claimOnce` in `lib/redis.ts`), tiene
  l'apertura a un giro all'ora su qualunque dispositivo. Si prende solo se c'è
  qualcosa da accodare.
- **Passo 4, il segnale** (`components/library-sync-signal.tsx`, il giro in
  `lib/sync-batch.ts` coi suoi test). Rispetto al wireframe:
  - al passaggio del mouse i negozi stanno nel `Tooltip`, **al clic o al
    tocco nella stessa riga** («— GOG: in corso, …»), come il «Che cos'è?»
    dell'aggiornamento automatico. Un popover sopra la pagina in `@repo/ui`
    non c'è, e il `Tooltip` sul telefono non compare;
  - su telefono il segnale segue il numero nella stessa riga e va a capo
    dove finisce lo spazio, invece di andare sempre sotto;
  - il nome dell'account compare solo se nel giro ci sono due account dello
    stesso negozio.
- **Provato** sull'app in locale con Playwright, desktop e iPhone 13: «0 di 3»
  all'apertura, «1 di 3» quando Steam finisce, con il suggerimento e la riga
  al tocco. Gli import erano finti (account senza negozio vero, worker
  spento): la fine di Steam simulata togliendo la sua chiave di
  deduplicazione e pubblicando l'evento. Il segnale che sparisce a giro chiuso
  è provato solo dai test di `lib/sync-batch.ts`.
- **Test**: `library-sync.test.ts` 22 (6 nuovi), web 68 (4 nuovi). Typecheck
  ed ESLint puliti su api, web e contracts.

## I commenti dopo averlo visto sul telefono (07/11/2026)

Sul VPS, con nove account: il tocco apriva insieme il suggerimento e la riga,
e «updating / updated» scritti in fila non si leggevano. Deciso con l'utente:

- **niente suggerimento**: il bottone apre e chiude l'elenco, uguale su
  desktop e telefono;
- **un'icona colorata per ogni libreria**, sempre, col nome accanto e senza lo
  stato scritto: ✓ verde aggiornata, ⟳ blu in aggiornamento, orologio ambra in
  coda. Il nome dello stato è l'etichetta dell'icona (`role="img"`);
- **l'elenco sotto la riga**, una libreria per voce, che va a capo;
- **«in coda» e «in aggiornamento» li distingue il server**: `syncPhase` su
  `StoreAccount`, dallo stato del job di BullMQ (`importPhase` in
  `queue/imports.ts`): attivo è `running`, il resto — in attesa, o un
  tentativo fallito da riprovare — è `queued`;
- **il blu entra nel design system** come quarto stato, «informazione»
  (`palettes.ts`): il teal dell'accento accanto al verde si confondeva. I temi
  passano da 48 a 56, le definizioni da 82 a 96 KB.

Provato in locale con Playwright, desktop chiaro e iPhone scuro: un account in
lavorazione (un worker finto che tiene il job), uno finito, tre in coda.

## Verificato in uso

- [x] Sul VPS: comprare un gioco, aprire Ludex dopo un'ora dall'ultimo
      aggiornamento, vederlo comparire con il segnale. Provato dall'utente il
      07/11/2026: OK.
