# Step 9f — Steam con login e Family

**Fatto sul branch `feat/9f-steam-login` e provato (05/10/2026), ma NON rilasciato**:
dopo la prova vera Steam ha bloccato temporaneamente l'account dell'utente, e finché
non si sa se un login da server è accettato resta fermo. Vedi «Il blocco
dell'account» in [docs/negozi.md](../docs/negozi.md). Le misure su cui poggia sono
nella stessa pagina, «Steam Family e il login Steam».

## Contesto

Oggi Steam si collega incollando il profilo: nessuna credenziale, `GetOwnedGames`
con la nostra chiave, solo profili pubblici. Il 9f aggiunge un secondo modo,
**«Accedi con Steam»**, che salva una credenziale e porta con sé la libreria
della famiglia. Il collegamento col solo profilo resta com'è.

## Cosa dicono le misure delle decisioni prese

Le tre decisioni reggono. Tre cose da sapere, perché le misure o la lettura del
codice le hanno precisate:

1. **Login col QR: confermato.** Il refresh token dura 212 giorni, l'access token
   24 ore e mezza, e l'access token ricavato dal refresh token è accettato da
   `IFamilyGroupsService` e da `GetOwnedGames`. Il `webapi_token` che legge
   Playnite dalla pagina dello store non serve: stessa audience, stessa durata.
2. **«Si saltano quelli che possiedo già» è necessario, e si calcola da una
   chiamata sola.** `include_own=false` non toglie le app che possiedo anche io:
   70 delle sue 343 sono in `GetOwnedGames`. Con `include_own=true` basta
   guardare `owner_steamids`: se c'è il mio SteamID l'app è mia, altrimenti è
   solo della famiglia (**271** sul mio account, per inferenza: vedi
   docs/negozi.md). `exclude_reason` resta come guardia, ma nella chiamata base
   compare solo con `include_own=true` (42 app, tutte col valore `3`).
3. **«Se ne va al reimport» non è già vero, e va costruito.** `importLibrary` non
   toglie mai un possesso che non torna più: toglie solo gli scarti. Per questo
   il passo 4 ha una potatura dedicata. Vedi «Il punto da confermare».

## Profilo, login o entrambi (richiesta del 05/10/2026)

I due modi non sono alternativi e non duplicano niente: **un account Steam è una
riga sola per SteamID**, e il login è una credenziale facoltativa su quella
riga. Il vincolo è già `unique(user_id, store, external_account_id)` su
`store_accounts`, e il login rende lo stesso SteamID64 che il profilo risolve.

| Cosa fa l'utente                         | Cosa succede                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| incolla il profilo                       | come oggi: una riga senza credenziale, libreria con la chiave                                                                                                    |
| fa il login                              | una riga con credenziale, l'SteamID viene dal login: libreria propria e famiglia                                                                                 |
| profilo **e poi** login (o il contrario) | la stessa riga: il login aggiunge la credenziale, il profilo non la cancella. **Niente giochi doppi**, perché i possessi hanno la riga dell'account nella chiave |
| toglie il solo login                     | la credenziale se ne va, il profilo resta e i giochi propri pure; le copie `steam_family` escono, perché senza login la famiglia non si legge più                |

Con il login i giochi propri si leggono come prima (`GetOwnedGames`, stessi 453
della chiave); in più arrivano la famiglia e le date d'acquisto. Un solo import,
una sola libreria.

Due conseguenze:

- **«Togli il login»** non c'era nel piano e ora c'è, nel passo 5: azzera la
  credenziale e pota le copie `steam_family` con la stessa regola della potatura
  del passo 4 (famiglia vuota), senza scollegare l'account.
- **Solo login con il profilo privato.** La chiave non legge la libreria di un
  profilo privato, e se nemmeno il token la legge (misura che manca) la libreria
  propria si ricava lo stesso da `GetSharedLibraryApps` con `include_own=true`:
  le app dove io sono proprietario, con le mie ore (448 delle 453 con i filtri
  di default, tutte con `include_free`). È un ripiego, non il percorso normale.

## Il punto da confermare

Quando un gioco esce dalla famiglia la copia se ne va, come hai deciso. Ma la
riga di `backlog` che resta **senza nessun possesso** non è uno stato legittimo
(vedi «L'ultimo possesso non si toglie» in
[docs/import-librerie.md](../docs/import-librerie.md)), e cancellarla porta via
voto, note e tag. Il default che propongo:

- la copia `steam_family` sparita **si toglie**;
- la riga di backlog si toglie **solo se resta orfana e senza niente di tuo**
  (voto, note, tag, stato diverso da `backlog`: lo stesso `personale` di
  `orphanEntries`);
- se ha dati tuoi, **la copia resta** com'è e il rapporto dell'import la conta
  fra quelle «rimaste perché hai dati tuoi».

Il contrario (cancellare sempre, come fa lo scollegamento «purge») perde il voto
di un gioco che ti era piaciuto perché un parente ha tolto la licenza.

## Passi

Ordine pensato perché ogni passo si provi da solo. Il passo 6 comincia da un
wireframe e **si ferma lì** finché non lo approvi; i passi 1–5 sono codice senza
interfaccia.

### Passo 1 — il valore `steam_family`

- `subscriptionValues` in [vocabulary.ts](../packages/contracts/src/vocabulary.ts)
  diventa `['ps_plus', 'steam_family']`; aggiornato il commento, che parla solo
  di Sony.
- `pnpm db:generate` produce la migration (`ALTER TYPE … ADD VALUE`).
- Le etichette in `apps/web/messages/{it,en}.json`, accanto a `ps_plus`:
  «Famiglia Steam» e «Steam Family».

Verifica: `pnpm check-types`, `pnpm --filter api test` (il global setup migra il
database di test).

**Fatto il 05/10/2026**, sul branch `feat/9f-steam-login`. Migration
`0033_subscription_steam_family`, rinominata da drizzle-kit con `--name` perché
quelle del repo hanno nomi descrittivi. Il valore c'è nel database di test
(`{ps_plus,steam_family}`). **Il database di sviluppo non è migrato**: non serve
finché nessun codice scrive `steam_family`, e `pnpm db:migrate` lo fa al passo 4.

### Passo 2 — la credenziale Steam

Steam entra nel modello di GOG, Epic e PSN, non in uno nuovo.

- `external/steam-auth.ts` (nuovo): `SteamCredentials`
  `{ accessToken, refreshToken, expiresAt, refreshExpiresAt }`, `SteamAuthError`,
  e `refreshSteamTokens(refreshToken)`, che usa `renewRefreshToken()` di
  `steam-session` (`MobileApp`): rende un access token nuovo e, **se Steam lo
  emette**, anche un refresh token nuovo. Un rifiuto definitivo diventa
  `SteamAuthError`; una rete che cade resta un errore qualunque, come sugli
  altri.
- `OAUTH_STORES` in [store-accounts.ts](../apps/api/src/services/store-accounts.ts)
  prende `steam`. `storeAccessToken` riscrive il credenziale **prima** di
  usarlo, come per gli altri: se Steam emette un refresh token nuovo il vecchio
  muore subito.
- **Ricollegare col profilo non cancella più il credenziale.** `upsertAccount`
  scrive `credentials = null` quando non ne riceve, e oggi un secondo
  «collega col profilo» su un account con login lo butterebbe via. Con
  `credentials` assente nel valore passato si lascia la colonna com'è.
- Cosa conta come rifiuto definitivo (quali `EResult` di Steam) **non è
  misurato**: un token invalido non si può provare senza scadenza. Parto da
  `AccessDenied` e `Expired` e lo verifico a mano, vedi «Verifiche».

Verifica: test su `refreshSteamTokens` con `steam-session` stubbato al confine
del modulo; test su `storeAccessToken` per `steam`; il caso del profilo
ricollegato.

**Fatto il 05/10/2026.** [steam-auth.ts](../apps/api/src/external/steam-auth.ts)
con i suoi test; `steam` in `OAUTH_STORES` e `upsertAccount` che non cancella la
credenziale in [store-accounts.ts](../apps/api/src/services/store-accounts.ts),
con sette casi nuovi in `store-accounts.test.ts` contro Postgres. Il test sul
profilo ricollegato è stato provato a rovescio: senza la correzione fallisce.

Due cose che restano **non misurate**, e lo dice il commento di `REFUSED`: quali
`EResult` Steam usi per un refresh token scaduto o revocato (la lista è quella
dell'enum e del README), e quando Steam comincia a emettere un refresh token
nuovo. Il primo si vede alla prima revoca vera, tolta da Steam Guard.

Ancora vecchi, da sistemare al passo 5: il commento di `storeLoginUrl` («Steam
non ha un login») e l'intestazione «nessun credenziale» sopra `linkSteamAccount`.

### Passo 3 — il client della famiglia

In [external/steam.ts](../apps/api/src/external/steam.ts):

- `fetchSteamFamilyLibrary(accessToken, steamId)`: `GetFamilyGroupForUser` →
  `family_groupid`, poi `GetSharedLibraryApps` con `include_own=true`. Rende le
  app e dice se l'utente è in un gruppo. `is_not_member_of_any_group` e un gruppo
  senza altri membri (`apps` assente) sono la famiglia **vuota**, non un errore.
- Un 401 con corpo HTML (la chiave sola, un token rifiutato) alza un errore
  che porta lo stato, invece di un errore di parsing del JSON. Su un token
  rifiutato a metà import l'import fa `requireReauth`, come PSN.
- `fetchSteamLibrary` accetta un token al posto della chiave, e col login lo si
  usa: a profilo privato la chiave risponde vuota, il token è l'utente stesso.

Verifica: test del client con `fetch` stubbato, che è l'unico posto dove si può.
Il servizio non va a leggere Steam davvero.

**Fatto il 05/10/2026**, in [steam.ts](../apps/api/src/external/steam.ts), con
dieci test nuovi in `steam.test.ts`. Rende `{ inGroup, apps }`, con per ogni app
`ownerSteamIds`, `excludeReason` (null se zero), minuti, `lastPlayedAt` e
`acquiredAt`. `SteamUnauthorizedError` (401 e 403, con lo stato e **mai l'URL**,
che porta il token) è distinto dal 500, che resta un errore qualunque e fa
riprovare il job. Provati a rovescio i due test che contano: con `include_own`
a `false` e senza il controllo dello stato prima di leggere il JSON falliscono.

Due scelte da conoscere. `language` è `english`: sono i nomi di `GetOwnedGames`, e
due lingue sulla stessa libreria non combaciano nel match per nome. E la guardia
sulle date d'ultima partita prima del 2004 (`1970-01-02` su Playnite) è **copiata
dal suo sorgente, non misurata da noi**.

**Provato contro Steam vera il 05/10/2026, in parte.** I percorsi d'errore sì,
senza login: un token inventato dà **401** su tutte e due le chiamate e finisce in
`SteamUnauthorizedError`; un refresh token falso dà `AccessDenied` e finisce in
`SteamAuthError`; una stringa che non è un JWT è rifiutata dal setter. Il percorso
felice (famiglia, libreria col token) lo copre la sezione «il nostro client» del
probe, **lanciata il 05/10/2026 con un login vero e a profilo privato**: tutti i
confronti coi numeri grezzi tornano (772 app, 501 con l'utente proprietario, **271
solo della famiglia**, 42 con `exclude_reason` **e nessuna di queste fra le 271**,
453 giochi propri col token, nessuno mancante).

### Passo 4 — l'import e la potatura

In [steam-import.ts](../apps/api/src/services/steam-import.ts):

- `buildSteamEntries(library, shared, steamId)`, **pura**, come
  `buildPsnEntries`. Una voce per app propria (da `GetOwnedGames`) e una per ogni
  app **solo della famiglia**: `subscription: 'steam_family'`,
  `storePage: app/{appid}`, `playtimeMinutes` da `rt_playtime`, `lastPlayedAt` da
  `rt_last_played`. Si saltano le app con `exclude_reason`, e quelle in cui il mio
  SteamID è fra i proprietari.
- **`acquiredAt`**: sulle copie mie da `rt_time_acquired`, solo dove l'utente è
  fra i proprietari (501/501 misurate; riscontro sulla pagina delle licenze fatto,
  vedi «Fatto» più sotto); **sulle copie della famiglia nullo**, perché la data è
  del proprietario e farebbe arretrare `backlog.added_at`.
- Una **sola** chiamata a `importLibrary` con tutto: la sua potatura degli scarti
  confronta con la libreria passata, e due chiamate si pesterebbero i piedi.
- La **potatura delle copie uscite**: dopo l'import, solo se tutte e due le
  letture sono riuscite, le copie `steam_family` di quell'account che non sono
  più nella famiglia si tolgono secondo la regola di «Il punto da confermare».
  Se la lettura della famiglia fallisce **non si pota niente**: un errore di rete
  non è un'uscita dalla famiglia.
- Un gioco comprato dopo averlo avuto dalla famiglia **non richiede niente di
  nuovo**: ha la stessa chiave del vincolo e `subscription` si riscrive senza
  COALESCE, quindi passa a nullo da solo.
- Senza credenziale l'import resta quello di oggi, riga per riga.
- **Profilo privato senza login: errore definitivo.** `SteamLibraryNotVisibleError`
  oggi è un errore qualunque: il worker riprova 3 volte (10 s, poi 20 s) per un
  profilo che non si aprirà da solo. Entra nell'`UnrecoverableError` di
  `worker.ts` accanto a `StoreReauthRequiredError`, e il suo messaggio dice cosa
  fare: rendere pubblici profilo e dettagli dei giochi, oppure accedere con
  Steam. Non si può provare dal vivo con l'account del proprietario della chiave
  (vedi docs/negozi.md), quindi lo copre un test.

Verifica: i test dell'import contro Postgres, che sono il cuore del lotto:

- famiglia ed entrate: possessi `steam_family`, nessuno dei miei, nessuno con
  `exclude_reason`;
- reimport idempotente: stessi possessi, niente righe doppie;
- un gioco esce dalla famiglia: copia e riga orfana se ne vanno; con un voto
  sopra la copia resta;
- un gioco comprato dopo: `subscription` torna nullo;
- lettura della famiglia fallita: niente potatura; famiglia vuota: tutte le
  copie `steam_family` escono;
- una copia tolta a mano non rientra (`ownership_rejections`).

**Fatto il 05/10/2026.** [steam-import.ts](../apps/api/src/services/steam-import.ts)
con `buildSteamEntries` (pura), `pruneFamilyCopies` e l'import col login;
[personal-data.ts](../apps/api/src/services/personal-data.ts) (nuovo) con la
regola «ha dati dell'utente», estratta da `orphanEntries` perché la usano lo
scollegamento e la potatura, e non devono tracciare la linea in due punti;
l'`UnrecoverableError` per `SteamLibraryNotVisibleError` in `worker.ts`, col
messaggio che dice di rendere pubblico il profilo o accedere con Steam. Quindici
test nuovi contro Postgres in `steam-import.test.ts`; la migration è applicata
anche al **database di sviluppo**.

Le cinque cose che proteggono i dati dell'utente sono state provate a rovescio,
una mutazione per ciascuna, e ogni volta fallisce il test che la riguarda: l'ordine
delle voci, la regola dei dati personali, il filtro su ciò che l'utente ha già, lo
scope della potatura all'account, il controllo delle altre copie.

Quattro decisioni prese lungo la strada, da conoscere:

1. **`acquiredAt` sulle copie proprie, non su quelle della famiglia.** All'inizio
   non lo scrivevo affatto: `backlog.added_at` si porta solo indietro, e una data
   antica e sbagliata non si corregge più. Il riscontro sulla pagina delle licenze
   è arrivato: _Portal_ e _Portal 2_ risultano del 2 luglio 2025, e col login
   _Portal_ dava `2025-07-02` con `include_own=true` e `2011-09-20` con
   `include_own=false`, cioè per un'app in comune con un parente la risposta con
   `include_own=true` rende la data **dell'utente**. Si scrive quindi solo dove
   l'utente è fra i proprietari. Il caso insidioso — un'app nella libreria propria
   che la famiglia elenca con un altro proprietario soltanto, e la **sua** data —
   resta senza data, ed è coperto da un test. Effetto da aspettarsi: al primo
   import col login `aggiunto il` arretra, per i giochi Steam, alle date d'acquisto
   vere. _Portal 2_ non era nel campione del probe: si controlla in pagina, dopo.
2. **L'ordine conta, e l'ho scoperto leggendo `fondiDoppioni`**: fonde le righe
   con la stessa chiave tenendo il `subscription` della **prima**. Con la
   famiglia davanti, un acquisto avrebbe preso `steam_family` e la potatura
   l'avrebbe buttato. Le voci proprie vanno per prime, e c'è un test.
3. **Una copia della famiglia non adotta i possessi scritti a mano.** Prima li
   adottava come ogni import, e il giorno che il parente toglieva il gioco la
   potatura butterebbe una riga che l'utente aveva scritto da sé. Ora restano due
   righe (la manuale e «Famiglia Steam»); se poi il gioco lo compri, la riga
   manuale si fonde con l'acquisto come sempre, e se la famiglia lo toglie esce
   solo la sua. È una condizione dentro `adottaPossessiMenoSpecifici`, valida solo
   per `subscription = 'steam_family'`: gli altri negozi non cambiano.
4. **Una riga sola per un gioco che hai tu e ha anche la famiglia.** Steam
   distingue le due copie (la schermata «Cambia copia preferita»), ma lo fa per i
   DLC, che Ludex non tiene. Una seconda riga Steam sullo stesso account vorrebbe
   dire cambiare la chiave del vincolo sui possessi, condivisa con tutti i negozi,
   e rovinerebbe il caso di PSN in cui comprare smette di dire «da abbonamento»,
   per una riga che non aiuta a rispondere a «cosa gioco adesso». Si può rivedere
   dopo il 9f, come lotto a sé.

Dal browser **non si può ancora provare**: il login col QR è il passo 5. L'import
col solo profilo è identico a prima.

### Passo 5 — il login col QR

Il collegamento non passa da `link(value)`: il QR non è un valore incollato, è
una sessione che il server tiene aperta mentre l'utente scansiona.

- `services/steam-login.ts` (nuovo): `startSteamLogin(userId, options)` apre una
  `LoginSession` `MobileApp` e rende `{ loginId, qrUrl, qrImage }`. `qrImage` è
  il QR già disegnato come **immagine in data URL** (`qrcode`, che passa da
  devDependency a dependency): web e mobile la mostrano senza una libreria in
  più, e `qrUrl` resta per il mobile, che potrà aprirlo nell'app invece di farlo
  scansionare a se stesso. `steamLoginStatus(userId, loginId)` rende
  `waiting | scanned | done | expired | failed`.
- A `done` il server ha già scritto l'account (`upsertAccount` con la
  credenziale). Su un ricollegamento controlla che il login sia fatto **con
  quell'account**, come gli altri (`StoreAccountMismatchError` → `CONFLICT`).
- Lo stato sta **in memoria nel processo dell'API**, con scadenza a 5 minuti e
  una sola sessione attiva per utente. Va bene per un'installazione sola
  (il minipc); con più repliche servirebbe Redis, e lo scrivo nel commento. Il
  job BullMQ non c'entra: è una richiesta dell'utente, non un lavoro.
- `removeSteamLogin(userId, accountId)`: azzera `credentials` e
  `credentialsExpireAt`, riporta lo stato a `ok` e pota le copie `steam_family`
  dell'account come se la famiglia fosse vuota. L'account e i giochi propri
  restano.
- Tre procedure oRPC in [contract.ts](../packages/contracts/src/contract.ts) e
  [router.ts](../apps/api/src/rpc/router.ts): `accounts.steamLogin.start`,
  `accounts.steamLogin.status` e `accounts.steamLogin.remove`, con gli schemi in
  `schemas.ts`.

Verifica: test sul servizio con `steam-session` stubbato (QR → scansionato →
fatto; scaduto; account sbagliato su un ricollegamento; una seconda sessione
annulla la prima; **login su un account che c'era col solo profilo: una riga e nessun
possesso doppio**; togliere il solo login); `pnpm check-types` sul contratto.

**Fatto il 05/10/2026.**
[steam-auth.ts](../apps/api/src/external/steam-auth.ts) con `beginSteamQrLogin`
(il solo punto che parla con `steam-session`, per il QR) e `SteamQrTimeoutError`;
[steam-login.ts](../apps/api/src/services/steam-login.ts) con `startSteamLogin`,
`steamLoginStatus` e `removeSteamLogin`; `linkSteamLogin` in `store-accounts.ts`;
le tre procedure `accounts.steamLogin.{start,status,remove}` nel contratto, negli
schemi e nel router. `qrcode` è passato da devDependency a dependency, perché il
QR lo disegna il server. Ventidue test nuovi (otto su `beginSteamQrLogin`, quattordici
contro Postgres sul servizio); le sei regole che contano sono state provate a
rovescio, una mutazione per ciascuna: una sola sessione per utente, le sessioni
sostituite che non scrivono, lo stato che non rivela quelle degli altri, il login
sul conto sbagliato, lo stato che torna `ok` alla rimozione, il controllo del
negozio. Verificato a runtime che il router carica con le tre procedure.

Cose da conoscere:

- **A `done` il server ha già scritto l'account e accodato l'import**: la schermata
  non deve fare altro che aggiornare l'elenco. Un accodamento che fallisce non
  rovescia un login riuscito (resta `done`, e l'errore va nel log).
- **Lo stato sta in memoria nel processo dell'API**, con scadenza a 5 minuti per il
  QR e 10 per ricordare l'esito: un riavvio costa un QR da rifare. Con più
  repliche servirebbe Redis; è scritto nel commento del servizio.
- **Una sessione di un altro utente o mai esistita rende `expired`**, la stessa
  risposta: un id indovinato non deve dire quali esistono.
- **`remove` pota prima la credenziale e poi le copie**: se la potatura fallisse a
  metà, con la credenziale ancora lì il prossimo import riscriverebbe le copie
  appena tolte. Richiamarla è sicuro (idempotente) e finisce il lavoro.
- **Non provato contro Steam vera**: serve la schermata, cioè il passo 6. Il QR
  col finto `steam-session` e le chiamate sono quelle del probe; quello che manca è
  vedere un login completo attraversare il router. Un solo caso, il rifiuto
  nell'app (l'utente tocca «Nega»), non so quale errore dia Steam: il servizio lo
  tratta come `failed`.
- **Non c'è ancora `hasLogin` sulla scheda dell'account**: la UI non può sapere se
  un account Steam ha il login. Sta nel passo 6, con il wireframe, perché è una
  decisione di cosa mostrare.

### Passo 6 — l'interfaccia

È una schermata nuova, quindi **prima si vede**: questa proposta e il wireframe
([9f-steam-login.excalidraw](9f-steam-login.excalidraw): si apre trascinandolo su
excalidraw.com). Il codice dopo la tua approvazione, una volta sola.

**Come è oggi**, letto dal codice
([add-store-account.tsx](../apps/web/components/add-store-account.tsx),
[store-link-form.tsx](../apps/web/components/store-link-form.tsx),
[store-account-card.tsx](../apps/web/components/store-account-card.tsx)): «Aggiungi
libreria» apre un dialogo con la tendina del negozio e, sotto, un modulo. Per Steam
il modulo è un campo «Profilo Steam», il nome facoltativo e un suggerimento che dice
che il profilo deve essere pubblico. La scheda dell'account ha il nome, un menu ⋮
(«Dai un nome», «Ricollega» se serve, «Scollega»), lo stato e «Aggiorna» più
l'interruttore dell'aggiornamento automatico. Non ho uno screenshot: se vuoi
correggere partendo dalla schermata vera, mandamelo.

**La proposta, punto per punto** (i numeri sono quelli del wireframe):

1. **Due modi nello stesso dialogo, il login sopra** (①). Scelto Steam, il dialogo
   mostra un blocco «Consigliato» con il bottone **Accedi con Steam** e tre righe
   su cosa porta (famiglia, profilo privato, data d'acquisto), poi «— oppure —» e il
   campo del profilo di oggi, che resta com'è. Il **nome facoltativo vale per
   tutti e due** (②). Gli altri negozi non cambiano.
2. **Il QR sostituisce il modulo dentro lo stesso dialogo** (③): immagine del QR, i
   tre passi da fare nell'app, «Il codice vale 5 minuti» e «Genera un nuovo QR».
   «← Indietro» riporta ai due modi. Si interroga il server ogni due secondi, e
   chiudere il dialogo smette di interrogare (④).
3. **Gli stati del QR** (pannello 3): inquadrato («Conferma nell'app Steam»),
   scaduto, rifiutato, **account sbagliato** quando si ricollega, e fatto. A «fatto»
   il dialogo si chiude con un toast e la scheda compare con «Importazione…»: il
   server ha già scritto l'account e accodato l'import.
4. **La scheda dice come è collegato l'account** (⑥): un badge «Login attivo ·
   famiglia inclusa» oppure «Solo profilo» con accanto «Accedi con Steam».
5. **Il menu ⋮ ha due voci nuove, in blu** (⑦, ⑧): «Accedi con Steam» sul solo
   profilo (lo stesso QR, sulla stessa riga: niente doppioni) e «Togli il login»
   dove c'è. Con un login scaduto «Ricollega» apre **il QR**, non il modulo del
   profilo.
6. **«Togli il login» ha un dialogo di conferma** (pannello 5): l'account e i giochi
   restano, la famiglia esce tranne le righe con dati dell'utente. Senza numeri: per
   contarli servirebbe un'altra procedura, e il testo basta.
7. **Fuori dal lotto** (⑤): sul telefono il QR non si inquadra da sé. Il mobile
   avrà un gesto suo (aprire l'app), e non è provato.

**Il buco: un import fallito è silenzioso.** Cercandolo ho trovato che il fallimento
di un import **non arriva alla schermata**: l'evento `finished` fa solo ricaricare la
lista, e la scheda torna a «importata X fa». Quindi il messaggio sul profilo privato
(passo 4) non lo leggerebbe nessuno. Tre strade, e la scelta è tua:

- **A. Una colonna `last_error` su `store_accounts`**, scritta dal worker quando un
  import fallisce e svuotata quando riesce, e la scheda la mostra. È la risposta
  giusta in generale (vale per ogni negozio e ogni errore), ma è una colonna, una
  migration e un pezzo di scheda in più: un lotto suo.
- **B. Il controllo al collegamento (la mia scelta).** Collegando Steam col solo
  profilo, il server legge subito la libreria: se il profilo è privato, il
  collegamento **non si fa** e l'errore arriva nel dialogo (pannello 6, ⑨) con
  accanto il bottone «Accedi con Steam». Costa una chiamata in più, e non vede un
  profilo che diventa privato **dopo** il collegamento: in quel caso il guasto resta
  silenzioso, ma è raro e si ripara rifacendo il collegamento.
- **C. Niente.** Il messaggio del passo 4 resta nei log e nella dashboard delle code.

**Cosa tocca, se approvi** (oltre alla UI): `hasLogin` su `StoreAccountSchema`, letto
da `listStoreAccounts` (la UI deve sapere se un account Steam ha una credenziale);
due componenti nuovi, il pannello del QR e il dialogo di «Togli il login»; i testi
in `it.json` e `en.json`; e con la B il controllo in `linkSteamAccount`.

**Fatto il 05/10/2026**, con la struttura approvata sul wireframe e la **B** per il
buco. Backend: `hasLogin` su `StoreAccountSchema` (letto da `accountColumns` come
`credentials is not null`, mai la credenziale), il controllo in `linkSteamAccount`
(legge la libreria prima di collegare, salta se l'account ha già il login) e il
router che lo traduce in `PRECONDITION_FAILED`. Web:
[steam-link.tsx](../apps/web/components/steam-link.tsx) (i due modi, il nome
condiviso, l'avviso del profilo privato nel dialogo),
[steam-qr-panel.tsx](../apps/web/components/steam-qr-panel.tsx) (il QR, il
polling ogni due secondi, i cinque stati),
[remove-steam-login-dialog.tsx](../apps/web/components/remove-steam-login-dialog.tsx),
e le modifiche alla scheda (badge, due voci di menu, il QR al posto del modulo per
ricollegare) e a «Aggiungi libreria». Quattro test nuovi sul backend (467 in tutto);
le due regole del controllo, provate a rovescio.

**Provata in un browser vero** (Playwright, con un utente di prova e due account
Steam inseriti a mano, poi cancellati): il dialogo coi due modi, il QR vero generato
dal server, «Indietro», e il riaprire il dialogo che torna ai due modi; i quattro
stati del QR che non si possono far succedere con Steam (inquadrato, scaduto,
rifiutato, account sbagliato) con la risposta di `status` intercettata, e «Genera un
nuovo QR» / «Riprova» che riparte; l'avviso del profilo privato con `link` che
risponde 412; e **«Togli il login» per davvero**, fino al toast e alla scheda che
passa a «Solo profilo». Nessun errore di pagina. **Non provato**: la scansione con
un'app Steam vera, e un account con famiglia vera da togliere.

Cose da conoscere:

- **Un avviso di React** («`accessibilityLabel` on a DOM element») compare col toast
  di successo. È il componente toast di `@repo/ui`, che usa anche il resto della
  pagina: non è dei componenti nuovi, e non l'ho toccato.
- **Con il login scaduto il badge dice «Con login»**, non «Login attivo» come nel
  wireframe: dire «attivo» di un credenziale morto sarebbe falso, e il badge rosso
  «Da ricollegare» sotto dice già cosa fare.
- **Il controllo del profilo privato non si prova col tuo account**: la chiave è la
  tua, e vede i dati privati del suo proprietario. È coperto dal test, e si vedrà
  con un altro utente.

## Verifiche a mano, dopo i passi

La prova vera l'ha fatta l'utente, dal browser in locale, col suo account (login col
QR, poi l'import). Risultati, letti dal database di sviluppo:

- **Il conto**: **269** copie `steam_family` su 271 attese. Le altre 2 sono giochi
  della famiglia che IGDB non ha risolto: ora ci sono 6 voci fra gli scarti di Steam
  contro le 4 di prima, e 269 + 2 = 271. Nessuna copia della famiglia ha data.
- **Le copie proprie**: 446, **442 con la data d'acquisto**; le 4 senza sono quelle
  che la famiglia non elenca.
- **La data**: _Portal_ e _Portal 2_ risultano del 2025-07-02, come sulla pagina delle
  licenze di Steam, e `aggiunto il` è arretrato di conseguenza. L'ipotesi regge su
  due giochi.
- **La scheda del gioco**: le copie della famiglia compaiono come «PC (Windows) ·
  Steam · Famiglia Steam».
- **Il profilo privato**: misurato prima col nostro client: a profilo privato (da
  anonimo) il token legge i 453 giochi, gli stessi della chiave.
- **Cosa conta come revoca**: **non provato**. Era previsto togliere la sessione da
  Steam Guard e rilanciare l'import (deve finire in `needs_reauth`, e l'`EResult`
  va nei test del passo 2). Dopo il blocco dell'account non si fa, e resta aperto.

## Fuori dal lotto

- il **mobile**: il QR si scansiona con un telefono, non sullo stesso telefono, e
  lì servirà aprire `qrUrl` nell'app. Si decide col mobile, dopo lo step 13;
- chi è il **proprietario** di una copia della famiglia: `owner_steamids` c'è, ma
  nessuno ha chiesto di salvarlo e `ownerships` non ha dove metterlo;
- le restrizioni parentali che Playnite filtra con `IParentalService`;
- `steam-user` (le licenze via protocollo del client): serve solo se
  `rt_time_acquired` si rivelasse insufficiente, e le misure dicono di no;
- il rinnovo del refresh token: non sappiamo da quando Steam lo emette. Il
  codice lo gestisce quando succede; per quanto tempo basti, lo dirà l'uso.

## Documentazione

Fatta il 05/10/2026: la riga di `steam:family-probe` in
[apps/api/CLAUDE.md](../apps/api/CLAUDE.md), con l'avvertimento; «Come è fatto (9f)» e
«Il blocco dell'account» in [docs/negozi.md](../docs/negozi.md); `steam_family` in
`docs/import-librerie.md`; lo stato del 9f in `docs/ordine-sviluppo.md`; una voce in
`apps/web/CLAUDE.md`; e il commento di `OAUTH_STORES`.

## Cosa resta

- **Decidere se e come rilasciarlo**, dopo la risposta dell'Assistenza di Steam. Le
  strade: tenere il codice dietro un interruttore spento, restare col solo profilo
  pubblico (che non tocca l'account), o capire se questo tipo di login è accettato.
  Nessun probe o prova contro un account vero senza averlo concordato.
- Il commit e la PR, quando l'utente lo chiede. `apps/web/src/routes/_app.games.$slug.tsx`
  è una modifica dell'utente, non del lotto: non va nel commit.
