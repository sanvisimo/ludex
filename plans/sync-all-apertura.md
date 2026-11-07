# Le librerie si aggiornano quando apri Ludex

**Stato: piano approvato il 07/11/2026, wireframe da approvare.** Branch
`claude/library-sync-new-server-gvkq3n`.

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
