# Step 9d — Nintendo

**Stato: passi 3, 4, 5 e 6 fatti (il 5 da guardare a schermo). Il codice è in `main`
(`cfd7568`) e dal 06/10/2026 è rilasciato sul mini PC**, per provarlo su un server
attivo; il rilascio agli altri utenti resta da decidere (vedi il punto 6 più sotto).
Il 9f è dentro (mergiato con la #36).
Le misure sono state fatte dall'utente, col suo account, in tre giri (`nintendo:probe`,
`nintendo:vgc-probe`, `nintendo:vgc-probe --app-token`): in tutto una manciata di
richieste a Nintendo, nessun errore. **Nessuna richiesta a Nintendo è stata fatta da
codice di produzione**: i test stubbano `fetch`.

## Contesto

`docs/ordine-sviluppo.md` dà Nintendo come «barattolo di cookie, nessun id che IGDB
conosca». Era una previsione scritta prima di misurare. Playnite non ha una libreria
Nintendo (c'è solo [una richiesta aperta](https://github.com/JosefNemec/PlayniteExtensions/issues/64),
senza approccio), quindi non c'è nulla da portare: lo spunto è la comunità, che
legge l'API delle app Nintendo.

## Cosa dicono le fonti (lette, **non provate**)

Da [nintendo-go](https://pkg.go.dev/github.com/wolveix/nintendo-go) e
[NSPlayTime](https://github.com/CafeAuLait-CC/NSPlayTime), due README terzi.

| Fonte                                                                                                     | Cosa dà                                                            | Limiti                                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Storico di gioco**: `mypage-api.entry.nintendo.co.jp/api/v1/users/me/play_histories`, bearer `id_token` | `titleId`, nome, minuti totali, primo e ultimo avvio, `deviceType` | solo ciò che è stato **avviato**; non è un elenco di acquisti |
| **Cronologia acquisti** sul sito                                                                          | nome, data, importo                                                | **ultimi due anni**, nessun id, sessione del sito             |

Login: PKCE su `accounts.nintendo.com`, l'utente accede **nel suo browser** e incolla
l'URL `npf://auth#session_token_code=…`. Il `session_token` dura circa due anni,
l'access token 900 s, e va mandato lo `User-Agent` dell'app. La stessa convenzione
«incolla l'URL» di GOG e Amazon in [negozi](../docs/negozi.md).

**Aggiornamento del 05/10/2026, dal sorgente di nintendo-go** (letto, non provato):
`client_id` `5c38e31cd085304b`, `redirect_uri` `npf5c38e31cd085304b://auth`, scope
`openid user user.mii user.email user.links[].id`, token con `grant_type`
`urn:ietf:params:oauth:grant-type:jwt-bearer-session-token`, e lo storico su
`https://app-api.znej.nintendo.com/api/v2.0/users/me/play_histories` con
`Gentry-Locale` e lo `User-Agent` `com.nintendo.znej/3.0.3` obbligatori. Sostituisce
il `mypage-api.entry.nintendo.co.jp` di NSPlayTime, che è più vecchio. Campi per
titolo: `titleId`, `titleName`, `platform`, `deviceType`, `firstPlayedAt`,
`lastPlayedAt`, `totalPlayedDays`, `totalPlayedMinutes`.

## Misurato il 05/10/2026 (`nintendo:probe`, un giro, tre richieste)

Su un account vero, **37 titoli**. Le richieste: `session_token`, `token`,
`play_histories` con l'access token; il ritentativo con l'`id_token` non è servito.

| Domanda                           | Risposta                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I valori del client terzo reggono | **Sì**: `client_id`, path, `User-Agent`, bearer = access token.                                                                                                                             |
| Durata dei credenziali            | session token **730 giorni**, access token **900 s**. L'`id_token` scade alla stessa maniera (0 giorni).                                                                                    |
| Switch contro Switch 2            | **`deviceType` assente su 37 righe su 37**. `platform` vale `HAC` (codice hardware della Switch 1) su tutte. Il valore della Switch 2 **non è misurato**: l'account non ha giochi Switch 2. |
| `titleId`                         | 16 esadecimali su 37 su 37, nessun nome ripetuto.                                                                                                                                           |
| Ore e date                        | `totalPlayedMinutes` > 0 e `firstPlayedAt` presenti su 37 su 37; `lastUpdatedAt` assente.                                                                                                   |
| Nascosti                          | `hiddenTitleList` vuota.                                                                                                                                                                    |
| Match per nome su IGDB            | **28 su 37**. I 9 irrisolti: 7 app NSO / Nintendo Classics (Mega Drive, N64, GBA, Game Boy, NES, SNES…), _Pikmin 4 Demo_ e _HentaiUni_. **Nessun gioco vero perso**.                        |
| Cartucce                          | **non verificato**: l'elenco non distingue fisico e digitale.                                                                                                                               |

## Decisioni del passo 2 (da confermare con l'ok al passo 3)

1. **Piattaforma**: `platform` `HAC` → `nintendo_switch`. Un codice che non si sa
   tradurre — la Switch 2, finché non lo si vede — **si salta con un log**, come
   PSN: il possesso ha una FK su `platforms`, e ripiegare su Switch 1 proporrebbe
   giochi che non si possono avviare. Se arriva un account con giochi Switch 2 il
   log lo dice, e il codice si aggiunge allora.
2. **Le app NSO e Classics non si filtrano**: nessun campo le distingue da un gioco.
   Cadono da sole negli irrisolti, come i _goodies_ di GOG e Netflix su PSN. Una
   demo (_Pikmin 4 Demo_) idem.
3. **Nessun `medium` e nessuna `subscription`**, come nella decisione di fondo.
4. **Id esterno**: il `titleId`. **Account**: il `sub` dell'`id_token` (l'id numerico
   dell'account Nintendo, non il nickname, che si può cambiare); si legge dal JWT
   senza richieste. Dedotto dal client di riferimento e dal formato dei JWT, **non
   verificato**: lo si controlla al primo collegamento vero.
5. **`firstPlayedAt` non è `acquired_at`**, e `lastPlayedAt` va su `lastPlayedAt`.
6. **Rinnovo**: la sola POST sul token endpoint, a ogni import. Il session token non
   sembra ruotare (il client di riferimento lo tiene fisso), quindi non serve il lock
   sulla riga di cui parla [negozi](../docs/negozi.md). **Non verificato**: se
   Nintendo lo ruotasse, il primo rinnovo lo mostrerebbe.

## Decisione di fondo: «giocato», non «posseduto» — **superata il 06/10/2026**

> Questa sezione descrive il piano con la sola fonte dello storico di gioco. Le
> Virtual Game Cards (vedi «Una fonte migliore») danno la libreria digitale, anche
> mai avviata: oggi gli acquisti mai avviati **ci sono**, e restano fuori solo le
> cartucce mai avviate. Quello che segue resta per la storia di come ci si è arrivati.

È la domanda del 9e, e qui ha una risposta più dura: **l'unica fonte che regge è lo
storico di gioco**, quindi un gioco entra se è stato avviato su questo account. In
cambio è l'unica traccia Nintendo che porta anche le cartucce, come i dischi `other`
di PSN. Il prezzo, da dire nell'interfaccia e in `docs/`:

- un acquisto **mai avviato non c'è**;
- un gioco avviato che non è tuo (prestito, console condivisa) **entra lo stesso**;
- non si distingue digitale da fisico, né un abbonamento (NSO) da un acquisto.

Quindi il possesso entra **senza `medium` e senza `subscription`**, e il rimedio per
ciò che manca è l'inserimento a mano o l'import da file dello step 10. La
cronologia acquisti dei due anni è scartata: id assenti, resa peggiore, sessione
del sito da conservare.

Il match con IGDB è **per nome**, come Epic, Amazon e PSN (il `titleId` Nintendo non
sta in nessuna sorgente IGDB: da confermare sul probe). Valgono le regole del 9b: un
nome ripetuto è ambiguo solo se si ripete sulla stessa piattaforma.

## Regola di prudenza: l'account dell'utente non si stressa

Dopo il blocco di Steam (vedi «Il blocco dell'account» in [negozi](../docs/negozi.md), 05/10/2026)
valgono per **tutto** il lotto, non solo per il probe:

1. **Un solo giro di misura**, con l'account dell'utente, e prima di lanciarlo si
   dice cosa manda a Nintendo. Il login lo fa l'utente nel suo browser.
2. **Tre richieste in tutto**, quattro solo se la lettura risponde 401 con
   l'access token (il client di riferimento ritenta una volta con l'`id_token`):
   scambio del `session_token`, access token, `play_histories`. Niente token falsi, niente QR o login ripetuti, niente rilancio
   «per sicurezza», niente probe a ogni modifica.
3. **Nessuna misura degli errori con l'identità dell'utente.** I rifiuti si
   guardano dal codice del client e da test con risposte simulate; il rinnovo
   fallito vero si vedrà quando capiterà.
4. **Il probe non scrive nel DB e non stampa token**: conteggi, valori di
   `deviceType`, un campione di nomi.
5. **Dopo un errore o un avviso di Nintendo ci si ferma**: nessuna richiesta finché
   l'utente non dice di riprendere.
6. Resta un rischio di prodotto, da scrivere in `docs/`: un client non ufficiale
   [può violare il contratto Nintendo](https://pkg.go.dev/github.com/wolveix/nintendo-go),
   e il rinnovo per conto di molti utenti da un solo indirizzo è la stessa
   domanda che ha fermato il 9f. **Non rilasciarlo agli altri utenti senza averci pensato**, e
   valutare un interruttore spento come per Steam. Sul mini PC è rilasciato dal
   06/10/2026, proprio per vedere come si comporta il rinnovo da server.

   Una precisazione sul perché il rischio è piccolo **in locale**: il login lo fa
   l'utente dal suo browser, ma il rinnovo lo fa il **server**, che non è il suo
   telefono. Se il server gira a casa sua (lo sviluppo, o un'installazione propria)
   l'indirizzo è lo stesso dello store Nintendo e il rischio è basso; su un server
   remoto no, ed è lì che serve decidere.

## Passi

Dopo ogni passo mi fermo e riferisco. Il passo 1 e il passo 3 vogliono un «ok,
procedi» ciascuno.

1. **Probe in sola lettura** — **fatto**: `apps/api/src/scripts/nintendo-probe.ts` e
   la voce `nintendo:probe` in `apps/api/package.json`, con le regole sopra. Avverte
   in testa ciò che manda a Nintendo e che può far scattare un blocco. I dati sono
   in «Misurato» qui sopra; passeranno in `docs/negozi.md` al passo 6.
2. **Decisioni dai dati** — **fatto**, qui sopra. Restano aperte la Switch 2 e le
   cartucce, che questo account non può dire.
3. **Client e login** — **fatto**: `external/nintendo.ts` (PKCE, scambio del token, rinnovo,
   `play_histories`) con test a risposte simulate; il `session_token` cifrato in
   `store_accounts` come GOG, Epic e PSN (`OAUTH_STORES`), e lo stato
   `needs_reauth` quando il rinnovo è rifiutato. Il collegamento riceve l'URL
   incollato senza sapere chi l'ha portato (regola di [negozi](../docs/negozi.md)).
4. **Import** — **fatto**: `services/nintendo-import.ts` che riduce lo storico a
   `LibraryEntry[]` e chiama `importLibrary`; `nintendo` nel vocabolario, nel
   contratto e nelle liste dei negozi (`packages/contracts`, `store-accounts.ts`,
   `store-links.ts`); le ore da `totalPlayedMinutes`, `lastPlayedAt`, la data del
   primo avvio **non** come `acquired_at` (è un'altra cosa, vedi la data d'acquisto
   in [negozi](../docs/negozi.md)). Test contro Postgres, Nintendo stubbato al confine del
   modulo di servizio e non su `fetch`.
5. **Schermata `/account`** — **a metà**: nessuna schermata nuova, la scheda e il
   modulo sono i generici, e per farli funzionare ho aggiunto i testi `account.stores.nintendo`
   (it/en) e la voce nei crediti. Ciò che resta, **da vedere prima del codice**: se la scheda
   Nintendo vuole qualcosa di suo (il passo «clic destro → copia l'indirizzo» è un'istruzione
   in un `hint`, e forse merita un'immagine): la scheda Nintendo con l'invito ad accedere e il
   campo per incollare. È una schermata nuova: **si vede prima del codice** (proposta
   scritta e wireframe), come dice il metodo del progetto.
6. **Documentazione** — **fatto**: `docs/negozi.md` (misure, la regola «giocato non posseduto»,
   il rischio), `docs/ordine-sviluppo.md` (9d), `apps/api/CLAUDE.md` (il probe).

## Una fonte migliore: le Virtual Game Cards (06/10/2026)

L'estensione Nintendo di Playnite
([XenorPLxx](https://github.com/XenorPLxx/playnite-library-nintendo)) non usa lo
storico di gioco: legge la pagina **«Virtual Game Cards»**
(`accounts.nintendo.com/portal/vgcs`), che elenca **tutte le licenze digitali
dell'account, anche mai avviate**, con `apparentPlatform` (`NX` Switch, `OUNCE`
Switch 2). Il percorso, letto nel suo codice e **non provato**: login in una
webview, cookie della sessione web salvati; poi `GET` della pagina, da cui si
estraggono `idToken`, `savannaClientId` e l'indirizzo GraphQL; poi `POST` GraphQL a
pagine da 300 con l'header `x-nintendo-savanna-client-id`. Il rinnovo dei cookie
apre di nuovo la pagina **in un browser nascosto**.

Il problema è l'acquisizione, non l'uso: i cookie sono **tutta la sessione web**
(pagamenti compresi) e per un server non è chiaro come rinnovarli. **Misurato il 06/10/2026** con `pnpm --filter api nintendo:vgc-probe`: una richiesta
GraphQL copiata dal browser, **senza cookie**, dalla macchina dell'utente. Nessun errore.

| Domanda                                       | Risposta                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Basta il solo `idToken`, senza cookie?        | **Sì**: HTTP 200, con l'header `x-nintendo-savanna-client-id`                                                                        |
| Dove sta il GraphQL                           | `wb.lp1.savanna.srv.nintendo.net/graphql`: **`*.srv.nintendo.net`, non nintendo.com**                                                |
| Quanto vive l'`idToken`                       | **14 minuti**; quello del portale si ricava dalla pagina, che vuole i cookie                                                         |
| Quanti titoli, che piattaforma                | **19**, tutti `apparentPlatform` `NX`. `OUNCE` (Switch 2, nel codice di Playnite) **non misurato**: l'account non ha giochi Switch 2 |
| Flag `hasApplication`, `hasNx*`               | **tutti falsi su 19 righe su 19**: la piattaforma si legge da `apparentPlatform`, non da loro                                        |
| `applicationId`                               | 19 su 19, 16 esadecimali: la forma dei `titleId` dello storico. Che **coincidano** è probabile ma **non verificato**                 |
| Inseriti in una console / prestiti / nascosti | 18 su 19 / 0 / 0                                                                                                                     |

**Le due fonti non coincidono, si completano.** Le Virtual Game Cards (19) sono la
libreria **digitale**, mai giocata inclusa; lo storico di gioco (37) include ciò che si
è giocato da **cartuccia**, che nelle Virtual Game Cards non c'è. È la stessa
situazione dei dischi PSN `other`. Ipotesi, **da verificare con l'utente**: un titolo
nello storico e **non** nelle Virtual Game Cards è con ogni probabilità fisico
(`medium: physical`), come su PSN. Non misurato: se fra i 19 ci sono giochi comprati e
mai avviati (l'utente lo sa, noi non possiamo vederlo senza l'elenco intero dello
storico).

**Il problema che resta è il rinnovo.** Un `idToken` da 14 minuti, ricavato dalla
pagina con la sessione web, non si rinnova da un server con le credenziali che già
abbiamo. Per questo la domanda successiva è una sola: il GraphQL accetta anche
**l'`id_token` del nostro login** (quello dell'app, con il session token da 730
giorni)? `nintendo:vgc-probe --app-token`: login nel browser come `nintendo:probe`, più
lo stesso cURL per indirizzo, header e query; **tre richieste** (`session_token`,
`token`, GraphQL), e prima di qualunque richiesta tutto si controlla in locale. Scritto,
**lanciato il 06/10/2026: sì** (vedi sotto). Se sì: libreria digitale con le credenziali che già gestiamo, senza
cookie. Se no: WebView sul mobile o cookie incollati, e il 9d resta con lo storico più
l'inserimento manuale.

### Misurato col login dell'app, e cosa ne è stato fatto (06/10/2026)

`nintendo:vgc-probe --app-token`: tre richieste (`session_token`, `token`, GraphQL).
**Il GraphQL accetta l'`id_token` del nostro login**: HTTP 200, gli stessi 19 titoli, senza
cookie. Il rinnovo del portale (14 minuti, pagina con cookie) non serve più.

Dalla risposta intera e dal cURL, e dalle risposte dell'utente:

- **Bayonetta** (codice con la cartuccia di Bayonetta 2) è nelle Virtual Game Cards;
  _Zelda: Tears of the Kingdom_ e _Super Mario Bros. Wonder_ sono cartucce e sono solo
  nello storico; _Hyrule Warriors: Age of Calamity_ e _Blanc_ sono comprati e mai
  avviati e sono nelle Virtual Game Cards. L'ipotesi «storico senza licenza = fisico»
  regge sui primi casi, **ma non su tutti**: vedi «Due domande aperte» qui sotto
  (_Tetris 99_).
- **Voci di soli contenuti aggiuntivi** (`hasReleasedApplication: false`):
  _Breath of the Wild_ (l'aggiornamento gratuito; il gioco è la cartuccia), _Monster
  Hunter Rise_, _Sparks of Hope_. Non sono una copia del gioco: **si saltano**.
- `ownerNaId` = `userNaId` = `3247fa748f1dd367`, lo stesso `sub` del login: l'identità
  dell'account è confermata.
- La query del portale usa `hasReleased*`, non i flag di Playnite: il primo giro del
  probe li aveva letti sbagliati (tutti falsi).

**Implementato**: `fetchNintendoVgc` e `fetchNintendoProfile` in `external/nintendo.ts`;
`nintendoCredentials` e il rinnovo che **si sovrappone** al credenziale (per tenere il
paese) in `store-accounts.ts`; `buildNintendoEntries` che unisce le due fonti; test.
**Il paese**: dalla claim `country` dell'`id_token` o da `GET /2.0.0/users/me` al
collegamento, **nessuno dei due misurato**. Senza paese l'import salta le Virtual Game
Cards (con un log) e non dichiara il supporto. È la cosa più probabile da scoprire al
primo collegamento vero dall'app, insieme a: la coincidenza `applicationId` /
`titleId`, e il header `x-nintendo-savanna-client-id` uguale per tutti.

## Da non dimenticare: i filtri (richiesta del 05/10/2026)

Piano a parte: [7-filtro-abbonamenti.md](7-filtro-abbonamenti.md). Nei filtri del
backlog va aggiunto il filtro **«Steam Family»** (la copia che viene
dalla famiglia, `ownerships.subscription = 'steam_family'`). Va fatto **quando si
aggiunge Nintendo ai filtri**, nello stesso lotto: oggi il filtro per negozio
(`stores` in `apps/web/lib/backlog-filter.ts`) esiste già e nessun filtro guarda
`subscription`, quindi i due vanno insieme. Non è nel 9d perché i filtri sono dello
step 7/12; qui resta la nota.

## Due domande aperte dopo il primo uso (06/10/2026), con l'esito

1. **Tetris 99 risulta fisico ed è digitale.** Fra le 19 licenze c'è _PAC-MAN 99_ e non
   _Tetris 99_; lo storico li ha. Il sospetto era che la query, con `isHidden: false`,
   escludesse una licenza **nascosta** dai download. **Smentito**:
   `nintendo:vgc-probe --hidden --find=tetris` rifà la richiesta con `isHidden: true` e
   rende **zero voci**, quindi sull'account non ci sono licenze nascoste e _Tetris 99_ non è
   fra le visibili né fra le nascoste. Perché non ci sia **non lo so**. La regola «storico
   senza licenza = fisico» sbaglia su questa classe (giochi gratuiti o legati
   all'abbonamento), e l'utente non può correggere il supporto. **Deciso dall'utente il 06/10/2026: si tiene «fisico» per lo storico senza
   licenza, accettando i falsi** (l'alternativa era dichiarare `medium` solo dove c'è una
   prova). Il prezzo: un gioco gratuito o dell'abbonamento giocato risulta fisico, e
   l'utente non può correggere il supporto di una copia. La correzione naturale, se la
   classe fosse larga, è renderlo modificabile dalla scheda del gioco (step 5). Misura:
   una richiesta, dalla macchina dell'utente.
2. **Una data d'aggiunta non c'è.** La query non ne riceve, e il portale ordina per
   `ACTIVATED_DATE`, quindi esiste sul server. `nintendo:vgc-probe --schema` manda
   un'introspezione senza token e il server risponde **HTTP 400**. Il probe non stampa il
   corpo dell'errore, quindi **la causa non è misurata** (verosimilmente l'introspezione è
   spenta). Non si insiste: l'unica altra via sono tentativi su nomi di campo che
   sembrano sondaggi. Il primo avvio non è un ripiego: non è la data d'acquisto, e scritto
   in `acquired_at` farebbe mentire `backlog.added_at`. **Nintendo non ha data
   d'aggiunta.**

## Passo 5: il collegamento guidato (06/10/2026)

**Scelto dall'utente: la proposta A, per tutti i negozi (Steam escluso). Scritto.**
Resta aperta la terza domanda, **la scheda dell'account senza nickname**
(«Account Nintendo» e gli ultimi quattro caratteri dell'id): non è stata decisa e non è
nel codice. Verificato: `check-types`, `lint`, `pnpm --filter api test` (542 verdi, 15 nuovi
sul controllo del campo); **non guardato a schermo**: il dialogo «Aggiungi libreria» sta
su `/account/libraries`.

**Cosa è stato fatto**

- `StoreLinkForm` a passi tutti visibili: un'`<ol>` con una frase per passo, il numero in
  un cerchio, il pulsante che apre il login nel passo giusto (`linkGuide.openAt`: il
  primo, tranne PSN, il secondo), l'ultimo passo è sempre «incolla» e fa da etichetta del
  campo. L'etichetta dell'account e «Da sapere» sono due `<details>` sotto.
- Il campo dice **mentre si incolla** se sembra giusto (`checkPastedLogin` in
  `packages/contracts`, `ok` / `wrong` / nullo), con il messaggio del negozio. Non blocca
  il pulsante: decide il server. È una funzione pura che **non è più severa del server**, e
  `apps/api/src/external/paste-check.test.ts` la confronta con i parser veri
  (`parseGogAuthCode`, `parseEpicAuthCode`, `parseAmazonAuthCode`, `parseNpsso`,
  `parseNintendoAuthCode`): quello che il server accetta, il campo lo chiama giusto.
  Vive nel contratto perché la userà il mobile; non c'è un banco di prova nel contratto
  né nel web, quindi si prova da `apps/api`.
- Il disegno del passo Nintendo: `NintendoLinkIllustration`, un pulsante e un menu,
  **schematico di proposito** (non riproduce né la pagina di Nintendo né il menu di un
  browser, che cambia: Chrome «Copia indirizzo del link», Edge «Copia collegamento») e
  con la didascalia che lo dice. Nascosto agli screen reader: il passo a parole dice la
  stessa cosa.
- I testi di tutti e cinque i negozi in it/en: `steps`, `openLabel`, `wrong`, `note`.
  Tolti `hint`, `inputLabel` dei quattro e `openLogin`, `pasteStep`, `pasteAddress`,
  `pasteContent` del modulo, che non servono più. **Steam non è toccato.**

**Da guardare a schermo**: il disegno (è l'unica cosa che ho costruito senza vederla), la
larghezza del dialogo con quattro passi (PSN), e i `<details>` nel tema scuro.

Wireframe: [9d-nintendo.excalidraw](9d-nintendo.excalidraw), si apre trascinandolo su
excalidraw.com. Tre tavole: **com'è oggi**, **la proposta A**, **la variante B**. Il
wireframe non è stato reso a schermo da me: le larghezze dei testi sono stimate.

### I commenti, punto per punto

**«Il testo di account è poco chiaro».** Letto dal codice (`store-link-form.tsx` e
`messages/*.json`), non da uno screenshot: se ho letto male, dimmelo.

- I passi numerati sono **due** («1. Apri il login», «2. Incolla qui l'indirizzo»), ma
  il gesto Nintendo è fatto di **tre**: entra, **clic destro** sul pulsante, incolla.
  Quello in mezzo è il più strano, e non ha un numero.
- L'etichetta del campo, «Indirizzo del link «Select this account»», è il testo di
  Nintendo e non il nostro, e non dice **cosa** si incolla.
- Il campo «Etichetta (facoltativa)» sta **fra** l'incolla e la spiegazione: si
  compila un campo prima di aver capito cosa si sta facendo.
- Se il profilo non risponde, la scheda dell'account mostra l'**id numerico**
  (`3247fa748f1dd367`), perché `storeAccountName` ripiega sull'id esterno.

**«Anche gli helper».** L'istruzione che conta («non cliccare, clic destro → copia
indirizzo del link») sta **in fondo**, dentro un paragrafo di sette righe che mescola
istruzioni, durata del collegamento e cosa legge Ludex. Tre cose diverse, un blocco
solo, dopo il pulsante.

**«Il passo guidato».** Un passo, una frase, un'azione, tutti visibili; per Nintendo il
passo del clic destro ha un **disegno schematico** (un pulsante e un menu, **non** la
pagina vera: non riproduco l'interfaccia di Nintendo), e il campo dice subito se quello
che hai incollato sembra giusto.

### Proposta A (consigliata): passi tutti visibili

Nel dialogo «Aggiungi libreria», sotto la scelta del negozio, la stessa forma per tutti i
negozi da collegare (Steam resta com'è, ha già il suo corpo):

1. **Apri il login** — la frase e il pulsante, nello stesso passo.
2. **I passi nel browser del negozio** — quante frasi servono, una per azione. Per
   Nintendo è qui il disegno.
3. **Incolla qui ...** — il campo e «Collega», con il controllo sotto.
4. L'**etichetta** e la nota «cosa legge Ludex» **richiudibili** sotto, non fra i passi.

Il controllo del campo è **locale** (una funzione pura nel web, nessuna richiesta, né a
Nintendo né a noi): per Nintendo dice «sembra l'indirizzo giusto» se contiene
`session_token_code=` e `state=`, e altrimenti «non sembra: hai cliccato il pulsante?
Serve l'indirizzo del link». Il server resta quello che decide, come oggi.

Il testo per Nintendo:

1. «Apri il login di Nintendo ed entra con il tuo account.» — [Apri il login]
2. «Alla pagina «Link an account» **non cliccare** il pulsante rosso: non succede
   niente. Fai clic destro sopra e scegli «Copia indirizzo del link».»
3. «Incolla qui quello che hai copiato. Vale dieci minuti.» — [campo] [Collega]

Sotto, richiudibile: «Cosa legge Ludex: i giochi digitali (anche mai avviati) e quelli
che hai avviato, cartucce comprese. Una cartuccia mai avviata non lascia traccia su
Nintendo e va aggiunta a mano. Il collegamento si fa una volta sola e dura circa due
anni.»

Gli altri, con la stessa forma (una frase per azione):

| Negozio | Passi                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GOG     | 1. Apri il login ed entra. 2. Atterri su una pagina bianca: copia l'indirizzo dalla barra del browser. 3. Incolla qui.                                                                                                                                                                            |
| Epic    | 1. Apri il login ed entra. 2. Compare un testo a schermo: selezionalo tutto e copialo. 3. Incolla qui.                                                                                                                                                                                            |
| Amazon  | 1. Apri il login ed entra (il negozio è quello americano, un account italiano va bene). 2. Atterri sulla home di amazon.com: copia l'indirizzo dalla barra. 3. Incolla qui. Nota: registra un dispositivo «AGSLauncher for Windows» sul tuo account Amazon, che puoi togliere dalle impostazioni. |
| PSN     | 1. Entra su playstation.com col browser e spunta «Fidati di questo browser». 2. Apri la pagina del codice: mostra una riga con `npsso`. 3. Copia tutta la riga. 4. Incolla qui. Nota: se non importi per dieci giorni il collegamento scade e va rifatto.                                         |

### Variante B: una pagina per volta

Il dialogo mostra un passo alla volta, con Indietro e «Fatto, avanti». È **più
guidato**, ma sono tre schermate dove A ne ha una, e c'è uno stato in più da testare (il
passo corrente) e da perdere se si chiude il dialogo. La sconsiglio per GOG ed Epic, che
hanno due gesti.

### Cosa mi serve da te

1. **A o B?** (A è la mia scelta.)
2. **Tutti i negozi o solo Nintendo?** Consiglio tutti: lo stesso schema con testi più
   chiari anche per gli altri, e un solo componente da tenere. Con «solo Nintendo» gli
   altri restano con il paragrafo unico.
3. **La scheda dell'account** quando il nickname manca: «Account Nintendo» e, accanto,
   gli ultimi quattro caratteri dell'id (`…d367`) invece dei sedici interi?

### Cosa tocca (da leggere dal codice, non fatto)

`apps/web/components/store-link-form.tsx` (i passi e il controllo del campo), un
componente piccolo per il disegno (`apps/web/components/`, non `packages/ui`: sa di
Nintendo), una funzione pura per il controllo con i suoi test, i testi
`account.stores.*` e `account.store.*` in it/en, e `storeAccountName` nel contratto per
il punto 3.

## Fuori da questo lotto

Cronologia acquisti dei due anni, l'aggiornamento automatico di Nintendo (si decide
col rinnovo del token, dopo il passo 3), il mobile e le notifiche di
`needs_reauth` (già in «da valutare» di [negozi](../docs/negozi.md)).

## Verifica

`pnpm --filter api test`, `pnpm lint`, `pnpm check-types`. Il probe, una volta
sola e concordato: `pnpm --filter api nintendo:probe`.
