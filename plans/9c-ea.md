# Step 9c — EA

**Stato: analisi e misura finite (13/10/2026, tre giri di `ea:probe`, 23 richieste
a EA in tutto, nessun errore). Passi 1–5 fatti, sul branch `feat/9c-ea`: si aspetta la prova dell'utente.**

## Contesto

`docs/negozi.md` dà EA come «sessione corta, si sgancia sempre · nessun id su IGDB ·
ore sì», e `docs/ordine-sviluppo.md` come **importazione una tantum**. La roadmap
la dice «in corso» dal 13/10/2026, col testo «la libreria si importerà una volta
sola, quando vuoi tu».

## Cosa dicono le fonti (lette, **non provate**)

- **Playnite ha tolto il plugin Origin il 15/10/2025**
  ([commit](https://github.com/JosefNemec/PlayniteExtensions/commit/f61dfdcfad)):
  `api1.origin.com` (entitlement e ore) è morta con la chiusura di Origin, ad
  aprile 2025. Non è più un modello.
- Chi funziona oggi — [Lutris](https://github.com/lutris/lutris/blob/master/lutris/services/ea_app.py),
  il [plugin EA di Jeshibu](https://github.com/Jeshibu/PlayniteExtensions/blob/main/source/EaLibrary/Services/EaWebsite.cs),
  [backlogia](https://github.com/sam1am/backlogia/blob/main/web/sources/ea.py) —
  parla con un GraphQL solo, `service-aggregation-layer.juno.ea.com/graphql`,
  con un `Bearer` dell'utente.

| Cosa       | Dove                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| token      | `accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none`, aperto **dal browser già entrato su ea.com**: una pagina JSON con `access_token`, circa un'ora |
| rinnovo    | vuole i cookie di sessione di ea.com, che il server non ha: da qui la «una tantum»                                                                                                                               |
| identità   | `me { player { pd psd displayName } }`: `pd` è l'id stabile, `displayName` l'EA ID, che si cambia                                                                                                                |
| libreria   | `me.ownedGameProducts(storefronts, type, platforms, paging)`: `originOfferId`, `product.name`, `gameSlug`, `baseItem.gameType`, `gameProductUser.ownershipMethods` e `initialEntitlementDate`                    |
| ore        | `me.recentGames(gameSlugs)`: `totalPlayTimeSeconds`, `lastSessionEndDate`                                                                                                                                        |
| copertina  | `gameProducts(offerIds) { baseItem { packArt { largestImage { path } } } }`                                                                                                                                      |
| incertezza | Lutris manda la query per esteso, Jeshibu una persisted query con hash: quale passi va misurato                                                                                                                  |

La durata del token e le ore le ha smentite la misura: vedi più sotto.

## Decisioni (13/10/2026)

1. **Il credenziale è il JSON della pagina `connect/auth`, incollato.** Lo stesso
   gesto di Epic. La mutazione non sa chi l'ha portato: il mobile potrà leggerlo da
   una `WebView`.
2. **Entrano le copie dei tre negozi che EA elenca: EA, Steam ed Epic**
   (`storefronts: [EA, STEAM, EPIC]`). Un gioco comprato su Steam che si avvia solo
   dal programma EA — _Dragon Age: Origins - Ultimate Edition_ — lo si vede in
   entrambi, e così è in Ludex: una copia `steam` e una `ea`, due righe di
   `ownerships` perché negozio e account stanno nella chiave. Le ore di EA vanno
   sulla copia EA, quelle di Steam restano sulla sua. Scollegare EA toglie solo le
   copie EA.
3. **EA Play entra, marcato.** `VAULT`, `XGP_VAULT` (EA Play dentro Game Pass),
   `STEAM_VAULT`, `STEAM_SUBSCRIPTION` ed `EPIC_VAULT` diventano
   `subscription: 'ea_play'`, un valore nuovo di `subscriptionValues` (migration). È
   la stessa risposta del `ps_plus` al 9b; cosa farne quando l'abbonamento finisce
   resta lo step 14.
4. **L'id esterno è `gameSlug`** (deciso sulla misura). Uno per gioco:
   _Dragon Age: Origins_ è quattro offerte sotto lo stesso slug, _Mass Effect 2_
   tre. Con `originOfferId` i tre «Dragon Age™: Origins» omonimi cadrebbero tutti
   nella regola dei nomi ripetuti di `resolveByName`; per slug collassano a monte,
   come i `productId` di Epic. Lo stesso slug in più negozi (_Inquisition_ su EA ed
   Epic) è una copia `ea` sola.
5. **Due regole di nome**, misurate sui sette scarti del primo giro (solo IGDB):
   - **l'anno fra parentesi** («Mass Effect™ (2007)», «Syndicate™ (1993)») si
     toglie dal nome e diventa `releaseYear`. Recupera tre giochi, tutti giusti;
   - **«Game of the Year» → «GOTY» nel confronto**, da tutte e due le parti
     (vedi il passo 2): IGDB ha «Plants vs. Zombies: GOTY Edition» e la ricerca
     lo trova, ma il giudice lo rifiutava.

   Il nome che si cerca è il più corto del gruppo («Dragon Age™ II» e non
   «Dragon Age II: Ultimate Edition»). Resta fuori _Ultima Underworld 2_ («2»
   contro «II: Labyrinth of Worlds»): si collega a mano, due regole per un gioco
   non valgono.

   **Scartata: l'anno dalla data di uscita** (`lifecycleStatus.playableStartDate`),
   che doveva separare i titoli che su IGDB sono due giochi — _Need for Speed: Most
   Wanted_ 2005 e 2012, _Battlefront II_ 2005 e 2017. Il secondo giro l'ha
   smentita: è la data della riedizione, non dell'uscita (_Mass Effect 3_ vale
   2023, e con quell'anno il matcher lasciava il 75 del 2012 per un altro gioco).
   Quei due restano scarti da collegare a mano: si prevedono **41 su 44**.

## Come si innesta

- `'ea'` in `linkableStoreValues`, `ea: 'pc_windows'` in `STORE_PLATFORM`.
- `external/ea.ts`: il client (parse del JSON, identità, libreria a pagine, ore,
  copertine). `EaAuthError` su 401.
- `linkEaAccount` in `store-accounts.ts`: legge il JSON, chiede l'identità,
  `upsertAccount` con `externalAccountId = pd`, `displayName = displayName`, il
  token cifrato e la sua scadenza. Il ricollegamento controlla che `pd` sia lo
  stesso (`relinking`), come per gli altri.
- `importEaLibrary`: legge il token; se è scaduto **non** scrive `needs_reauth` —
  per EA scadere è la regola, non un guasto — ma finisce dicendolo. Riduce la
  risposta a `LibraryEntry[]` (solo le voci **con il prodotto** e `BASE_GAME`,
  una per `gameSlug`; `acquiredAt` da
  `initialEntitlementDate`, la più vecchia del gruppo; ore e ultima partita da
  `recentGames`, dove ci sono; `imageUrl` dal `packArt`) e chiama `importLibrary`.
  Risoluzione per nome: IGDB non ha una sorgente EA.
- **La query della libreria per esteso**, mai la persisted: l'hash cambia quando
  EA aggiorna il sito, ed è la ragione per cui PSN non usa `getUserGameList`. I
  negozi scritti nella query (`storefronts: [EA, STEAM, EPIC]`), mai in una
  variabile; tutte le pagine (sono da 70–90 voci anche chiedendone 100). Il filtro
  `type` della query **non** toglie i DLC: arrivano col prodotto nullo, e sono la
  gran parte delle voci (272 su 327).
- **Reimportare è ricollegare**: si incolla di nuovo il JSON sulla riga che c'è.
- **EA resta fuori** da: la spazzata automatica, «aggiorna tutti»
  (`syncAllStoreAccounts`), l'interruttore dell'aggiornamento automatico sulla
  scheda, le wishlist.
- **La scheda in `/account`**: «Importa di nuovo» al posto di «Aggiorna», con la data
  dell'ultimo import. Variante di una scheda che esiste: se serve un wireframe,
  prima del codice.

## La misura: `ea:probe`

`pnpm --filter api ea:probe` — [`ea-probe.ts`](../apps/api/src/scripts/ea-probe.ts).
Chiede di incollare la risposta di `connect/auth` (da stdin, non resta nella
cronologia), non scrive nel DB e non stampa il token. **Parla con l'account EA di chi
lo lancia**: identità, una o due pagine di libreria per negozio, le ore a blocchi di
cento slug, una richiesta di copertine. Un giro, non ripeterlo. Con `--query` fa solo
il secondo giro: al più quattro richieste, vedi sotto.

### Primo giro (13/10/2026, 10 richieste a EA, nessun errore)

Su un account vero: **57 voci** — 50 dal negozio EA, 1 da Steam, 6 da Epic.

| Domanda                                                    | Risposta                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Il token di `connect/auth` basta al GraphQL, e quanto dura | **Sì, e dura 4 ore** (`expires_in` 14399), non una                                                                                                                                                                                                    |
| `pd`, `psd`, `displayName`                                 | tutti e tre, dalla query `me.player`                                                                                                                                                                                                                  |
| Query per esteso o persisted                               | **la libreria per esteso è rifiutata** («Graphql validation error»), la persisted passa; **le ore per esteso passano**. Quindi l'errore era nella nostra query (sospetto: il tipo `[Storefront!]` della variabile, inventato). Da qui il secondo giro |
| Edizioni sotto lo stesso slug                              | **7 slug su 44 hanno più offerte** (DAO 4, ME2 3 contando Steam): 50 offerte EA, 41 slug                                                                                                                                                              |
| `gameType`                                                 | `BASE_GAME` su 57 su 57 (il filtro `type` toglie già i DLC)                                                                                                                                                                                           |
| `ownershipMethods`                                         | EA: `REDEMPTION+ENTITLEMENT_GRANT` 26, `PURCHASE+ENTITLEMENT_GRANT` 14, `ENTITLEMENT_GRANT` 7, `DIRECT_ENTITLEMENT` 3; Steam `STEAM`, Epic `EPIC`. **Nessun `VAULT`**: EA Play su questo account non c'è, la decisione 3 resta non misurata           |
| Data d'acquisto                                            | su 57 su 57; ma **26 voci portano il 21/04/2015**, che ha l'aria della migrazione di Origin più che di un acquisto                                                                                                                                    |
| Ore                                                        | **solo i giocati di recente**: `recentGames` su 44 slug rende **una riga**, `dragon-age-origins`. «Ore: sì» in `docs/negozi.md` va corretto in «solo i recenti»                                                                                       |
| _DAO Ultimate_ comprato su Steam                           | **non fra le voci Steam**: EA lo elenca come quattro offerte sue (due del 2009, una del 2015, una del 2023). Fra le voci Steam c'è solo _Mass Effect 2_, collegato nel 2023                                                                           |
| Copertina                                                  | indirizzo pronto, `app-images.ea.com/…-9x16.jpg`                                                                                                                                                                                                      |
| Risoluzione per nome su IGDB                               | **37 su 44 (84%)**. I 7 scarti e le loro cause sono nella decisione 5: con le regole tenute si prevedono **41 su 44**                                                                                                                                 |

### Secondo giro: `ea:probe --query`

La forma di Lutris (`storefronts: [EA, STEAM, EPIC]` scritto nella query), con i
campi aggiunti un pezzo alla volta — quella di Lutris, + nome e slug, + possesso e
data, + `lifecycleStatus` — fermandosi al primo rifiuto. Poi la risoluzione con le
regole nuove, due volte: con l'anno dalla data di uscita e senza. Deve rispondere:

Fatto il 13/10/2026, **4 richieste a EA**, nessun errore:

| Domanda                                                                           | Risposta                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La query della libreria per esteso passa, e con quali campi                       | **Sì, con tutti**: l'errore del primo giro era il tipo inventato della variabile                                                                                                    |
| `lifecycleStatus` c'è, e che tipi porta                                           | su **6 voci su 74**: `SELF` 6, `ORIGIN_ACCESS_BASIC` 4, `ORIGIN_ACCESS_PREMIER` 4                                                                                                   |
| L'anno dalla data di uscita aggancia NFS e Battlefront senza perdere altri giochi | **No**: è la data della riedizione. Su 6 giochi cambia un esito solo, _Mass Effect 3_, e in peggio. Scartata (decisione 5)                                                          |
| **Inatteso**                                                                      | la query rende **74 voci e altre pagine**, contro le 57 della persisted, e **solo 6** hanno nome, slug e `BASE_GAME`. Le due query non rendono la stessa cosa: da qui il terzo giro |

### Terzo giro: `ea:probe --voci`

Tre ipotesi per le voci in più e quelle senza prodotto: il `locale` (la persisted
chiedeva `en`, noi `DEFAULT`); il prodotto vuoto come forma normale, con i
dettagli da chiedere dopo a `gameProducts(offerIds)` come fa Lutris; il filtro
sugli `ownershipMethods` che la persisted applicava e noi no. Il giro legge tutte
le pagine con `DEFAULT` e stampa ogni voce, rifà la prima pagina con `en` e
chiede `gameProducts` per le voci senza prodotto: cinque o sei richieste a EA,
nessuna a IGDB.

Fatto il 13/10/2026, **9 richieste a EA**, nessun errore:

| Domanda                                                      | Risposta                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quante voci e pagine rende la query per esteso, e quali sono | **327 voci in 5 pagine** (74 + 89 + 80 + 72 + 12), 224 offerte distinte. **55 con il prodotto, tutte `BASE_GAME`** con nome e slug; 272 senza                                                                                                                                             |
| Le 55 sono le 57 della persisted                             | **Sì**. La persisted, chiesta un negozio alla volta, contava due volte i giochi su due negozi: qui sono una voce sola con i modi di possesso uniti (_Mass Effect 2_ `ENTITLEMENT_GRANT+STEAM`, _Squadrons_ `EPIC+REDEMPTION+ENTITLEMENT_GRANT`). _Inquisition_ resta due voci, EA ed Epic |
| Con `en` il prodotto arriva pieno                            | **No**: `en` e `DEFAULT` rendono la stessa prima pagina, 6 prodotti su 74. Il `locale` non conta                                                                                                                                                                                          |
| `gameProducts` dà i dettagli delle voci senza prodotto       | 186 su 272: `MICRO_CONTENT` 163, `BUNDLE_PACK` 17, `EXPANSION_PACK` 4, `CURRENCY` 1, `COLLECTION` 1. **Sono DLC, pacchetti e valuta**: il prodotto nullo vuol dire «non è un gioco», e si scartano senza chiedere altro                                                                   |

## I passi

Uno alla volta, ognuno col suo ok, e dopo ciascuno ci si ferma.

1. **Vocabolario e migration. Fatto (13/10/2026).** `'ea_play'` in
   `subscriptionValues`, con l'etichetta «EA Play» nei due file dei messaggi, e
   la migration `0047_ea_play.sql` generata da drizzle-kit (un solo
   `ALTER TYPE … ADD VALUE`, che nessuno usa nella stessa transazione: niente
   `55P04`). **`'ea'` in `linkableStoreValues` è passato al passo 4**: quella lista
   accende la scheda in `/account`, la voce del menu «Aggiungi» e la spazzata
   automatica, e aggiungerlo prima che esista `linkEaAccount` avrebbe mostrato un
   negozio che non si collega.
2. **«Game of the Year» → «GOTY» nel confronto. Fatto (13/10/2026).** Non in
   `normalizeTitle`, come era scritto qui: quella funzione fa anche il testo da
   cercare su IGDB, HLTB, Metacritic e OpenCritic, e «goty» al posto delle tre
   parole avrebbe cambiato ciò che quei motori trovano. La regola sta in
   `comparableTitle`, che usa solo `rankCandidates`: le ricerche restano quelle
   di prima, e PvZ si aggancia lo stesso, perché la ricerca su IGDB lo trovava
   già ed era il giudizio a rifiutarlo. Tre test in `title-match.test.ts`.
3. **`external/ea.ts`. Fatto (13/10/2026).** Il client — `parseEaToken`,
   `fetchEaIdentity`, `fetchEaLibrary` (libreria a pagine con la query per
   esteso, copertine da `gameProducts` e ore da `recentGames`, a blocchi di
   cento) — e la funzione pura `reduceEaLibrary`: solo prodotto e `BASE_GAME`,
   una voce per `gameSlug`, il nome più corto del gruppo con l'anno fra parentesi
   tolto e passato come `releaseYear`, la data d'acquisto più vecchia, `ea_play`
   solo se **tutti** i modi di possesso del gruppo sono di abbonamento, la
   copertina dell'offerta da cui viene il nome, le ore dove EA le dà (null, non
   zero, dove no). Sul modello di Epic, la riduzione sta nel client e rende
   voci già nella forma di `LibraryEntry`. Nove test in `external/ea.test.ts`, con
   le voci della misura. Due cose **non misurate**, scritte nel codice:
   - `parseEaToken` accetta solo il JSON intero, perché è lì che sta la
     scadenza; `{"error":"login_required"}` dice che il browser non è entrato su
     ea.com;
   - come si presenta un token scaduto: si prende per tale un 401/403 o un
     errore GraphQL che parli di token (`EaAuthError`).
4. **Collegamento e import. Fatto (13/10/2026).**
   - **vocabolario**: `'ea'` in `linkableStoreValues` e una lista nuova,
     `oneShotStoreValues = ['ea']`, con `isOneShotStore`: i negozi che si
     importano una volta sola. `AUTO_SYNC_EVERY_DAYS` non ha una riga per loro;
   - **collegamento**: `linkEaAccount` (`EaTokenError`, che distingue il browser
     non entrato su ea.com), `storeLoginUrl('ea')` = la pagina del token,
     `linkStore`. L'account è `pd`, il nome l'EA ID; il token si salva cifrato,
     con la sua scadenza, solo perché il job lo trovi senza passare da Redis;
   - **import**: `services/ea-import.ts`, `ea: 'pc_windows'` in `STORE_PLATFORM`,
     il ramo nel worker. Il token **si cancella** a fine import, e anche quando
     EA lo rifiuta; un errore di rete lo lascia, perché BullMQ riprova. Token
     scaduto o già usato: `EaTokenExpiredError`, che il worker fa
     `UnrecoverableError`, e l'account **resta `ok`**;
   - **fuori dal giro automatico**: la spazzata esclude EA a parte (un import
     fallito lascia `last_sync_at` nullo, e il «mai importato» lo riprenderebbe a
     ogni giro), «aggiorna tutti» lo salta, `accounts.sync` su EA è
     `BAD_REQUEST`. L'interruttore dell'aggiornamento automatico resta
     scrivibile ma non conta: lo nasconde il passo 5;
   - **web, solo dove i tipi lo obbligano**: la riga EA in `linkGuide` e i testi
     `account.stores.ea` (passi, segnaposto, errore, nota) nei due file dei
     messaggi; `checkPastedLogin` riconosce il JSON (`access_token`).
     **Da qui EA compare nel menu «Aggiungi» e si collega e importa davvero**,
     ma la sua scheda è ancora quella degli altri negozi, con «Aggiorna» (che
     risponde con un errore) e l'interruttore: è il passo 5;
   - **test** sul Postgres vero: `ea-import.test.ts` (copie EA su PC con
     abbonamento e ore, token cancellato; scaduto, già usato, rifiutato, errore
     di rete), il collegamento in `store-accounts.test.ts`, spazzata e
     «aggiorna tutti» senza EA, i campioni EA in `paste-check.test.ts`. Tutto il
     banco di `api`: 894 su 894.
5. **La scheda EA in `/account`. Fatto (13/10/2026)**, senza wireframe: è la
   scheda degli altri negozi con due cambi nella riga dei gesti
   (`store-account-card.tsx`, guidati da `isOneShotStore`, mai da `'ea'`):
   - al posto del ↻ **«Importa di nuovo»**, a parole, che apre il dialogo del
     ricollegamento con titolo e descrizione suoi (`reimport`, `reimportTitle`,
     `reimportDescription` nei due file dei messaggi) e lo stesso
     `StoreLinkForm`, sulla stessa riga; gira mentre l'import va;
   - **niente interruttore «Auto»**, né l'avviso dell'aggiornamento spento.

   Si verifica a occhio: i componenti non hanno test.

**Dalla prova dell'utente (13/10/2026).**

- **Uscendo e rientrando con un altro account, `/backlog` mostrava i dati del
  primo**, finché non si ricaricava la pagina. Non era EA: `useSignOut` faceva
  rileggere i loader ma non svuotava la cache di react-query, e le query restano
  fresche trenta secondi. Ora `queryClient.clear()` all'uscita
  (`user-menu.tsx`), e anche ad accesso e registrazione riusciti, per la
  sessione finita senza passare da «Esci». Lo faceva già la cancellazione
  dell'account. Gli aggiornamenti in push seguono già l'id dell'utente.

**La pagina del gioco su ea.com (quarto giro, `ea:probe --pagina`).** Dopo la
prova l'utente ha chiesto i link al negozio. Non si compongono dallo slug,
misurato con richieste anonime: i giochi del catalogo storico stanno a
`ea.com/games/{slug}` (_Dragon Age: Origins_, _Ultima VII_, _Syndicate_), quelli
delle serie grandi a `ea.com/games/{serie}/{slug}` e a `/games/{slug}` danno 404
(_Battlefield 1_, _Mass Effect Legendary Edition_, _The Sims 4_). La serie nei
dati letti non c'è. Il giro chiede al GraphQL lo schema del prodotto e del suo
`baseItem` (introspezione, due richieste) e, se è spenta, prova pochi campi
candidati; poi legge i valori dei campi che ci sono. Se la serie o l'indirizzo ci
sono, l'import li salva in `store_page` e `storePageUrl` compone il link; se no,
EA resta senza link come Epic e Amazon.

| Domanda                                           | Risposta |
| ------------------------------------------------- | -------- |
| L'introspezione è accesa                          | —        |
| Un campo dice la serie o l'indirizzo della pagina | —        |

**Da valutare in un lotto a parte (13/10/2026): un collegamento che si rinnova.**
Il login dell'app desktop EA (`JUNO_PC_CLIENT`, OAuth con PKCE, redirect a
`qrc:///html/login_successful.html`) dà anche un **refresh token**, che il server
potrebbe rinnovare da sé (`connect/token`, `grant_type=refresh_token`): lo fa il
plugin EA di GOG Galaxy (BellezaEmporium/galaxy-integration-ead). Letto, non
provato. Tre incognite: come l'utente prende il codice da un redirect a `qrc://`
che il browser non apre; il `pc_sign`, una firma dell'hardware che il login
chiede; quanto dura il refresh token e se EA accetta rinnovi da un server (la
lezione di Steam). Se regge, `oneShotStoreValues` si svuota e «Importa di nuovo»
torna ↻; il client, la riduzione e l'import restano.

Poi `docs/negozi.md` (una sezione «EA (9c)») e la roadmap a «fatto» quando
l'utente dice che il lotto è pronto.
