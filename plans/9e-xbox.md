# Step 9e — Xbox

**Stato: studio fatto e decisioni prese (17/10/2026). Nessun codice, nessuna
richiesta a Microsoft.** Il prossimo passo è il probe, che vuole un «ok, procedi».

## Contesto

`docs/ordine-sviluppo.md` dice del 9e «ciò che torna è giocato, non posseduto», e
la tabella dei negozi in [negozi](../docs/negozi.md) scrive «chiave OpenXBL, o XSTS
in proprio». Erano scritti guardando Playnite. Lo studio li supera tutti e due:
**la libreria posseduta si legge**, ma solo con il client di xbox.com.

## Cosa dicono le fonti (lette, **non provate**)

**Playnite** ([XboxLibrary](https://github.com/JosefNemec/PlayniteExtensions/tree/master/source/Libraries/XboxLibrary),
letto dal sorgente):

- login OAuth su `login.live.com`, `client_id` `38cd2fa8-66fd-4760-afb2-405eb65d5b0c`,
  scope `Xboxlive.signin Xboxlive.offline_access`, `redirect_uri`
  `https://login.live.com/oauth20_desktop.srf`: l'utente atterra su una pagina
  Microsoft con `?code=` nell'indirizzo, cioè «incolla l'URL» come GOG;
- catena: token Microsoft → `user.auth.xboxlive.com/user/authenticate`
  (`RpsTicket: d=<token>`) → `xsts.auth.xboxlive.com/xsts/authorize` con relying
  party `http://xboxlive.com`. Dall'XSTS escono `uhs` e `xid` (lo xuid), e l'header
  è `Authorization: XBL3.0 x={uhs};{token}`, `x-xbl-contract-version: 2`;
- libreria: solo `titlehub.xboxlive.com/users/xuid({xuid})/titles/titlehistory/decoration/detail`,
  cioè **ciò che si è avviato almeno una volta**. `devices` dice `PC`, `Xbox360`,
  `XboxOne`, `XboxSeries`; ore da `userstats.xboxlive.com/batch`
  (`MinutesPlayed`, che «per alcuni torna vuoto», dice il commento).

**Unifideck** ([mubaraknumann/unifideck](https://github.com/mubaraknumann/unifideck),
GPL-3, `stores/microsoft/`), con misure dichiarate su account veri dal 02 al
04/10/2026. È la fonte che cambia il quadro:

- **i posseduti**: `POST collections.mp.microsoft.com/v7.0/collections/query`, con
  un XSTS per la relying party `http://mp.microsoft.com/`, ricavato dallo stesso
  token utente di `xboxlive.com`. Confrontato con le schede «Owned games» e «Games
  with Gold» della console: coincide titolo per titolo;
- **la risposta dipende dal client che ha fatto il login**: col client dell'app Xbox
  su `login.live.com` (`000000004C12AE6F`) la lista è **vuota**; col **client di
  xbox.com** (`1f907974-e22b-4810-a9de-d9647380c97e`) è la libreria vera. Il client
  di Playnite non è provato, ma è dello stesso tipo;
- **il login di xbox.com è un device code**: `POST
login.microsoftonline.com/consumers/oauth2/v2.0/devicecode` (scope
  `XboxLive.signin offline_access`) rende un codice breve; l'utente apre
  `microsoft.com/link`, anche dal telefono, e preme «Consenti»; il server interroga
  `…/oauth2/v2.0/token` finché l'utente non risponde (il codice vive circa 15
  minuti). Con questo client il `RpsTicket` è `d=`;
- **le voci di Collections**: posseduto = `productKind: Game`, `status: Active`, non
  trial, non un pass (`CFQ7TTC0…`). `licensingRequired: true` = **Games with Gold**,
  giocabile solo con l'abbonamento. `acquisitionType` è sempre nullo. A pagine da 100
  con `continuationToken`; limite documentato di circa 100 richieste ogni 5 minuti per
  utente;
- **cosa manca a Collections**: il Game Pass, e gli **acquisti Xbox 360
  retrocompatibili**. Questi si trovano fra gli ordini
  (`purchase.mp.microsoft.com/v7.0/users/me/orders`) e nello storico con `Xbox360`,
  e si confermano uno per uno con
  `emerald.xboxservices.com/xboxcomfd/productActions/{productId}`: «Install» senza
  «BuyToOwn» né «NotSoldSeparately» vuol dire posseduto. 12 su 12 sul loro account,
  fino a 30 richieste per import. Un 360 mai comprato in negozio e mai avviato (un
  vecchio Games with Gold del 360) non si trova da nessuna parte;
- **il catalogo**: `displaycatalog.mp.microsoft.com`, pubblico, dà titolo e
  piattaforme. `Windows.Desktop`/`Windows.Universal` è PC, `Windows.Xbox` o
  `XboxConsoleGenCompatible` è console, `XboxXPA` è Play Anywhere; un bundle prende
  le piattaforme dalle sue parti. Alcuni DLC sono catalogati come `Game` (artbook,
  upgrade, season pass) e si riconoscono solo dal titolo; `IsDemo` toglie le demo;
- **il Game Pass**: titlehub ha la decorazione `gamepass`, e il catalogo pubblico
  `catalog.gamepass.com/sigls/v2` elenca i giochi dell'abbonamento.

**Scartate**: un'app Azure nostra (redirect vero, ma «riservata ai partner
approvati» secondo [XboxReplay](https://github.com/XboxReplay/xboxlive-auth), e
Collections è partizionata per client, quindi quasi certamente vuota); OpenXBL (un
terzo che terrebbe i token dei nostri utenti, circa 150 richieste l'ora);
TrueAchievements, che importa i posseduti ma è un partner ufficiale.

## Decisioni (17/10/2026)

1. **Il login è il device code col client di xbox.com.** Un codice da confermare,
   niente URL da incollare. Ha la stessa forma del QR di Steam (il server avvia, il
   client mostra, il server interroga) e va bene identica dal mobile. La regola di
   [negozi](../docs/negozi.md) resta: la mutazione che collega non sa chi ha
   confermato il codice.
2. **Il significato, coerente con Nintendo:**
   - Collections, posseduto → copia comprata, `medium: digital`;
   - Collections, `licensingRequired` → abbonamento nuovo **`games_with_gold`**;
   - giocato (titlehub), non in Collections, e oggi nel Game Pass → abbonamento
     nuovo **`game_pass`**, accanto a `ps_plus`;
   - giocato, non in Collections, non nel Game Pass → **`medium: physical`**, come
     lo storico Nintendo senza licenza digitale. Si accettano i falsi, come per
     Nintendo: un free-to-play che Collections non elencasse, un gioco uscito dal
     Game Pass dopo averlo giocato, uno in prestito risultano «fisici».
3. **Play Anywhere sono due copie**, PC e Xbox, come il cross-buy PSN: due possessi
   e una sola riga di `backlog`.
4. **Gli Xbox 360 retrocompatibili si recuperano**: ordini e storico come candidati,
   e la conferma di `productActions` per ciascuno, con un tetto di richieste.

### Ancora aperte, si decidono dopo il probe

- **Xbox One o Series.** Collections non dice su che console si gioca, e un gioco
  comprato una volta gira su tutte e due. Proposta: `xbox_series` se il catalogo lo
  dice compatibile con la Series, `xbox_one` altrimenti; da confermare coi dati del
  catalogo. L'[idea delle piattaforme dell'utente](piattaforme-dell-utente.md)
  la renderebbe una scelta dell'utente.
- **La piattaforma dei 360** (`xbox360`, che è la scheda IGDB, o la console su cui
  girano oggi).
- **Le ore di un gioco Play Anywhere**: `MinutesPlayed` è per titolo, non per
  dispositivo. Su una copia sola (quale?) o su nessuna.

## Come si innesta (da confermare leggendo il codice al passo giusto)

- **Identità.** L'id esterno è il `productId` (12 caratteri, in maiuscolo).
  `IGDB_SOURCES` ha già `xbox: 11`: se gli uid della sorgente 11 sono proprio i
  `productId`, la risoluzione costa poche richieste da 200 id come GOG. Lo storico
  porta il `titleId`: si traduce in `productId` con la decorazione `productId` di
  titlehub o con `detail.availabilities`. **Da misurare.**
- **Credenziale**: il refresh token di `login.microsoftonline.com`, cifrato in
  `store_accounts` come GOG, Epic e PSN (`OAUTH_STORES`); XBL e XSTS si rifanno a
  ogni import e non si salvano. Rinnovo rifiutato → `needs_reauth`.
- **Account**: lo `xuid` (`xid` dell'XSTS) come `externalAccountId`, il gamertag
  (`gtg`) come nome leggibile.
- **Gli errori XSTS che vogliono dire «questo account non può usare Xbox»**
  (`XErr` 2148916233 nessun profilo Xbox, 2148916235 paese, 2148916238 account di
  un minore) si dicono all'utente al collegamento, non diventano un job che riprova.
- **Aggiornamento automatico** a sette giorni come gli altri, se il refresh token
  regge (da misurare: durata e se cambia a ogni rinnovo).

## Regola di prudenza: l'account dell'utente non si stressa

Le stesse del 9d, dopo il blocco di Steam:

1. **Un solo giro di misura**, con l'account dell'utente, e prima di lanciarlo si
   dice cosa manda a Microsoft. Il codice lo conferma l'utente.
2. **Le richieste contate in anticipo**, nessun rilancio «per sicurezza».
3. **Nessuna misura degli errori con l'identità dell'utente**: i rifiuti si guardano
   dal codice dei client di riferimento e da test con risposte simulate.
4. **Il probe non scrive nel DB e non stampa token.**
5. **Dopo un errore o un avviso di Microsoft ci si ferma.**
6. Il rischio di prodotto resta quello di Nintendo, da scrivere in `docs/`: è un
   client non nostro (quello di xbox.com), e il rinnovo per molti utenti da un solo
   indirizzo non è misurato. Non rilasciarlo agli altri utenti senza averci pensato.

## La misura: `xbox:probe`

`pnpm --filter api xbox:probe`, in sola lettura. Stampa codice e link, l'utente
conferma su `microsoft.com/link`, e poi:

| Richiesta                                      | Quante                   | Risponde a                                                                                                           |
| ---------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `devicecode` e poi `token` (interrogato)       | 1 + una ogni 5 s         | il device code col client di xbox.com funziona **dal nostro server**                                                 |
| `token` col refresh token                      | 1                        | il rinnovo funziona, quanto dura il refresh token, se cambia                                                         |
| `user.auth` + due XSTS (`xboxlive`, `mp`)      | 3                        | xuid, gamertag, il token del negozio                                                                                 |
| Collections                                    | 1 per pagina da 100      | quante voci, di che tipo (posseduti, Gold, trial, non giochi); se c'è una data d'acquisto; se i free-to-play ci sono |
| titlehub, storico con `productId` e `gamepass` | 1                        | quanti giocati, quanti non in Collections, quanti nel Game Pass                                                      |
| `userstats` (`MinutesPlayed`)                  | 1                        | se le ore arrivano                                                                                                   |
| `displaycatalog`                               | 1 ogni 20 prodotti circa | piattaforme, Play Anywhere, One contro Series, DLC travestiti                                                        |
| ordini + `productActions`                      | poche pagine + al più 30 | quanti 360 retrocompatibili                                                                                          |
| IGDB, sorgente 11                              | 1 ogni 200 id            | la forma degli uid e quanti `productId` trova                                                                        |

## I passi

Uno alla volta, ognuno col suo ok, e dopo ciascuno ci si ferma.

1. **Probe in sola lettura**: `apps/api/src/scripts/xbox-probe.ts` e la voce
   `xbox:probe`, con le regole sopra. I risultati in questo piano.
2. **Decisioni dai dati**: le tre aperte qui sopra, e la riga Xbox della tabella in
   [negozi](../docs/negozi.md) corretta (senza riscrivere in silenzio la vecchia,
   come per PSN ed EA).
3. **Vocabolario e migration**: `game_pass` e `games_with_gold` in
   `subscriptionValues`, con le etichette nei due file dei messaggi, migration da
   drizzle-kit. `'xbox'` in `linkableStoreValues` aspetta il passo 5, come per EA.
4. **`external/xbox.ts`**: device code, rinnovo, XBL/XSTS con le due relying party,
   Collections, titlehub, userstats, catalogo, ordini e `productActions`. Test con
   risposte simulate.
5. **Login e import**: le mutazioni «avvia» e «controlla» del device code; la
   riduzione a `LibraryEntry[]` con le regole delle decisioni e `importLibrary`.
   Test contro Postgres, Microsoft stubbato al confine del modulo di servizio.
6. **La scheda in `/account`**: il codice da mostrare e il link sono un modulo
   nuovo, quindi **si vede prima del codice** (proposta scritta e wireframe).
7. **Documentazione**: `docs/negozi.md` (sezione Xbox, la tabella, il rischio),
   `docs/ordine-sviluppo.md` (9e), `apps/api/CLAUDE.md` (il probe); la roadmap
   passa a «in corso» col passo 1 e a «fatto» quando dici che il lotto è pronto.

## Fuori da questo lotto

- la **wishlist Xbox** (15e): nessuno dei progetti la legge, e non è stato trovato
  un endpoint;
- l'**[idea delle piattaforme dell'utente](piattaforme-dell-utente.md)**, che vale
  per tutti i negozi;
- il mobile, che riuserà lo stesso device code.

## Verifica

`pnpm --filter api test`, `pnpm lint`, `pnpm check-types`. Il probe, una volta sola
e concordato: `pnpm --filter api xbox:probe`.
