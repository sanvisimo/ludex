# Step 9c — EA

**Stato: analisi e misura finite (13/10/2026, tre giri di `ea:probe`, 23 richieste
a EA in tutto, nessun errore). Si comincia dal passo 1.** Nessun codice di
produzione scritto.

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
   - **«Game of the Year» → «GOTY» in `normalizeTitle`**, da tutte e due le
     parti: IGDB ha «Plants vs. Zombies: GOTY Edition» e la ricerca lo trova, ma
     il giudice lo rifiutava. È la funzione di HLTB e Metacritic: test in
     `title-match.test.ts`.

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

1. **Vocabolario e migration.** `'ea'` in `linkableStoreValues`, `'ea_play'` in
   `subscriptionValues`; la migration la genera drizzle-kit (`pnpm db:generate`).
   Il valore nuovo di un enum non si usa nella transazione che lo crea
   (`55P04`, vedi `docs/modello-dati.md`): qui nessuno lo usa.
2. **«Game of the Year» → «GOTY» in `normalizeTitle`**, con il test in
   `title-match.test.ts`. Tocca anche HLTB e Metacritic, che usano la stessa
   funzione.
3. **`external/ea.ts`.** Il client — parse del JSON incollato, identità, libreria
   a pagine con la query per esteso, copertine (`gameProducts`, `packArt`) e ore
   (`recentGames`), a blocchi di cento — e **una funzione pura** che riduce le
   voci a `LibraryEntry[]`: solo prodotto e `BASE_GAME`, una per `gameSlug`, il
   nome più corto del gruppo con l'anno fra parentesi tolto e passato come
   `releaseYear`, la data d'acquisto più vecchia, `ea_play` se **nessuno** dei
   modi di possesso del gruppo è un acquisto (`VAULT`, `XGP_VAULT`,
   `STEAM_VAULT`, `STEAM_SUBSCRIPTION`, `EPIC_VAULT`, `EPIC_SUBSCRIPTION`). Test
   della funzione pura su voci prese dalla misura.
4. **Collegamento e import.** `linkEaAccount`, `storeLoginUrl('ea')`,
   `linkStore`, `importEaLibrary` e il suo ramo nel worker, `ea: 'pc_windows'` in
   `STORE_PLATFORM`; il token scaduto che non diventa `needs_reauth`; EA fuori
   da spazzata, «aggiorna tutti» e aggiornamento automatico. Test sul Postgres
   vero, col client stubbato al confine del modulo.
5. **La scheda EA in `/account`.** Incolla il JSON, «Importa di nuovo», niente
   interruttore dell'aggiornamento automatico; i testi nei due file dei
   messaggi. Prima il wireframe, se l'utente lo vuole.

Poi `docs/negozi.md` (una sezione «EA (9c)») e la roadmap a «fatto» quando
l'utente dice che il lotto è pronto.
