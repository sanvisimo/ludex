# Step 9e — Xbox

**Stato: passi 1–6 fatti (20/10/2026).** Il probe
(`apps/api/src/scripts/xbox-probe.ts`) è stato lanciato dall'utente, le
decisioni prese sui suoi dati («Le misure» e «Decisioni»), il lato server e la
scheda in `/account` sono scritti e testati. Manca la prova con un account vero
dall'app, e il passo 7 (documentazione).

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
   - ~~giocato, non in Collections, non nel Game Pass → `medium: physical`, come
     lo storico Nintendo senza licenza digitale~~. **Smentita dalla misura del
     19/10/2026**, e sostituita dal punto 5: vedi «Le misure».
3. **Play Anywhere sono due copie**, PC e Xbox, come il cross-buy PSN: due possessi
   e una sola riga di `backlog`.
4. **Gli Xbox 360 retrocompatibili si recuperano**: ordini e storico come candidati,
   e la conferma di `productActions` per ciascuno, con un tetto di richieste.

### Decise dopo il probe (19/10/2026)

5. **Giocato, non in Collections.** I titoli dello storico che hanno come
   dispositivo **solo `Win32`** non entrano mai: sono giochi di altri negozi
   (Steam, GOG…) che l'app Xbox per PC registra, con zero minuti. Gli altri sono
   giochi del Game Pass (EA Play compreso), anche quelli usciti dal catalogo, ed
   **entrano tutti** con una copia `game_pass`: posseduto è ciò che sta in
   Collections, tutto il resto giocato è Game Pass. **Gli elenchi pubblici del
   Game Pass all'import non si usano** (19/10/2026): il catalogo non entra mai,
   entra solo ciò che si è giocato. Servivano al probe per misurare.

   Al collegamento una spunta, **«Ho il Game Pass attivo»**, decide lo stato
   **alla nascita** di quelle righe, con lo stesso meccanismo dell'import da CSV
   (`LibraryEntry.status`): sì → lo stato normale di un import; no → `played`.
   Mai `completed`, che nessun import imposta. Una riga che c'era già resta com'è,
   e riattivare l'abbonamento dopo non cambia gli stati: cosa succede quando un
   abbonamento finisce o riparte è lo step 14, e la spunta è il dato che gli
   servirà (per PSN lo dà l'API con `isPlus`). Scartate: «da sistemare» con una
   tab «abbonamenti» (lì sta ciò che l'import non ha risolto, questi sono
   risolti, e anticiperebbe il 14).

6. **Le piattaforme le spunta l'utente** al collegamento (19/10/2026, al posto
   della «console di default»): PC, Xbox, Xbox 360, Xbox One, Xbox Series. Il
   catalogo da solo non decide (60 giochi Xbox su 61 sono
   `ConsoleGen8+ConsoleGen9`). È un pezzo dell'[idea delle piattaforme
   dell'utente](piattaforme-dell-utente.md), limitato all'account Xbox.

   **Confermato dall'utente il 20/10/2026**: ogni gioco prende una
   copia **per ogni piattaforma spuntata su cui gira** — PC se il catalogo lo dà
   per Windows, One e Series da `ConsoleGen8`/`ConsoleGen9`, i 360
   retrocompatibili su 360, One e Series; per lo storico, i dispositivi su cui
   si è giocato. Due copie con lo stesso `productId` ci sono quindi solo con più
   spunte, e `importLibrary` le deve reggere (oggi due voci con lo stesso id
   irrisolte rompono l'upsert degli scarti). L'Xbox originale non è nelle
   misure: come lo chiama lo storico non si sa.

7. **I 360 retrocompatibili** vanno su `xbox360`, che è la loro scheda IGDB
   (se spuntato; vedi il punto 6).
8. **Le ore** (`MinutesPlayed` è per titolo, non per dispositivo) vanno su una
   copia sola, la console più recente fra quelle spuntate.
9. **La regola 3 per le console Xbox**: una copia `xbox_series` vale anche per
   i giochi che IGDB dà su One, 360 e Xbox; una `xbox_one` anche per 360 e Xbox
   (`copy-platforms.ts`, come i visori VR). Senza, un gioco One giocato su
   Series e trovato per nome finirebbe fra i «da sistemare».

## Come si innesta (da confermare leggendo il codice al passo giusto)

- **Identità.** L'id esterno è il `productId` (12 caratteri, in maiuscolo).
  `IGDB_SOURCES` ha già `xbox: 11`, e **gli uid della sorgente 11 sono i
  `productId` in maiuscolo** (misurato: 66 su 88, il 75%, nessuno in minuscolo);
  il resto passa dal nome. Lo storico porta il `titleId`, e il `productId` sta in
  `detail.availabilities` per 123 titoli su 164 (i 41 senza sono i `Win32`
  e uno solo in più).
- **Credenziale**: il refresh token di `login.microsoftonline.com`, cifrato in
  `store_accounts` come GOG, Epic e PSN (`OAUTH_STORES`); XBL e XSTS si rifanno a
  ogni import e non si salvano. Rinnovo rifiutato → `needs_reauth`. **Il refresh
  token cambia a ogni rinnovo** (misurato): va salvato quello nuovo ogni volta.
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
| `displaycatalog`                               | 1 ogni 20 prodotti circa | piattaforme, Play Anywhere, One contro Series, DLC travestiti                                                        |
| ordini + `productActions`                      | poche pagine + al più 30 | quanti 360 retrocompatibili                                                                                          |
| IGDB, sorgente 11                              | 1 ogni 200 id            | la forma degli uid e quanti `productId` trova                                                                        |
| `userstats` (`MinutesPlayed`)                  | 1, per ultima            | se le ore arrivano                                                                                                   |

### Dove si è lanciato

L'ha lanciato l'utente, da una macchina col `.env` del progetto (le credenziali
IGDB c'erano: la sorgente 11 è misurata), e ha confermato lui il codice.

**I giri sono stati due, non uno.** Il primo si è fermato alla prima
`productActions`: 400 `{"MissingHeader":["Header MS-CV is missing"]}`. Unifideck
non manda quell'header su quell'endpoint (`ownership/backcompat.py`, branch
`staging`): probabilmente l'endpoint lo chiede da dopo le loro misure. Era un rifiuto
di una richiesta incompleta, non un avviso sull'account; il probe si è fermato
come previsto, senza ritentare. Aggiunto `MS-CV`, il secondo giro, concordato, è
arrivato in fondo: **37 richieste con l'account** più 3 interrogazioni del
device code, 10 pubbliche. Un terzo avvio, lanciato da Claude mentre l'utente
lanciava il secondo, è stato fermato prima della conferma: ha solo interrogato
il device code in attesa.

Prima del primo giro il probe era stato allineato a Unifideck: niente rinnovo
senza refresh token, `userstats` per ultima (è la richiesta meno provata, e se
fallisce si perdono solo le ore), e gli header che loro mandano
(`User-Agent: XboxReplay; XboxLiveAuth/3.0` e `Accept-Language` su `user.auth`
e XSTS, `MS-CV` su Collections, `Accept: application/json` dappertutto).

## Le misure (19/10/2026)

Su un account vero, con abbonamenti Game Pass passati e nessuno attivo oggi.

- **Login**: il device code col client di xbox.com funziona da casa, confermato
  dopo 3 interrogazioni; scope `XboxLive.signin`, access token di 3599 s. Il
  **rinnovo funziona e il refresh token cambia a ogni rinnovo**; la sua durata
  Microsoft non la dichiara. `user.auth` va con `d=` al primo colpo; fascia d'età
  `Adult`.
- **Collections**: 223 voci in 3 pagine, di cui 92 `Game`: **49 posseduti, 41
  Games with Gold, 2 inattivi**. Il resto sono 81 app, 25 `Durable` (DLC), 20
  abbonamenti, 3 estensioni del browser, 2 consumabili. `acquisitionType` è
  sempre nullo, ma **`acquiredDate` c'è su tutte le voci** (dal 2013), cioè la
  data d'acquisto. **I free-to-play ci sono** (Candy Crush, Rocket League).
- **Catalogo**: 90 prodotti su 90. Il filtro su demo e DLC ne toglie 2, tutti e
  due demo. Piattaforme dei restanti 88: 56 Xbox, 15 PC + Xbox, 8 PC, **5 Play
  Anywhere**, 4 senza (bundle o senza catalogo). One contro Series: **60 su 61**
  dei giochi Xbox sono `ConsoleGen8+ConsoleGen9`, quindi il catalogo non decide.
  14 dei posseduti sono oggi anche nel Game Pass.
- **Storico**: 164 titoli, tutti `Game`. Dispositivi: 44 `PC+XboxOne+XboxSeries`,
  44 `XboxOne+XboxSeries`, **40 solo `Win32`**, 15 `PC+XboxSeries`, 10 con
  `Xbox360`, 6 `PC`, 3 `XboxSeries`, 2 `XboxOne`. **Solo 11 sono in
  Collections**: 45 sono oggi nel Game Pass e 108 sarebbero diventati «fisici».
- **I «fisici» non lo sono.** I 40 `Win32` sono giochi di altri negozi (Portal,
  Hollow Knight, Death Stranding, Stray…) che l'app Xbox per PC registra, tutti a
  zero minuti. Gli altri sono Game Pass: Clair Obscur (5765 minuti), Sea of
  Stars (4018), NORCO e Cocoon, che sugli elenchi pubblici di oggi (mercato IT)
  **non ci sono più**; e It Takes Two, che c'è (EA Play) ma con il `productId`
  di un'altra edizione rispetto a quello dello storico.
- **Xbox 360**: 194 ordini in 8 pagine, 19 candidati fuori da Collections, **14
  posseduti** secondo `productActions` (Orcs Must Die!, Catherine, Injustice,
  Ikaruga…).
- **IGDB, sorgente 11**: **66 su 88 (75%)**, uid in maiuscolo. I non agganciati
  sono soprattutto giochini dello store Windows (Simple Minesweeper, Zombie
  Tsunami), un bundle con la console (FIFA 17 + Xbox One 500GB), l'app EA Access
  Hub, un episodio Telltale.
- **Ore**: `MinutesPlayed` arriva per 83 titoli su 164.

## I passi

Uno alla volta, ognuno col suo ok, e dopo ciascuno ci si ferma.

1. **Probe in sola lettura** — **fatto, lanciato il 19/10/2026**:
   `apps/api/src/scripts/xbox-probe.ts` e la voce `xbox:probe`, con le regole
   sopra. Per il Game Pass usa gli elenchi pubblici (`catalog.gamepass.com/sigls`)
   e non la decorazione `gamepass` di titlehub, che nessuno dei progetti letti
   usa: una richiesta non provata in meno sull'account. Lo storico chiede solo
   `decoration/detail`, come Playnite, e il `productId` lo prende da
   `detail.availabilities`, come Unifideck. I risultati in «Le misure». La
   roadmap è passata a «in corso», col testo nuovo.
2. **Decisioni dai dati** — **fatto**: i punti 5–8 delle decisioni, e la riga Xbox
   della tabella in [negozi](../docs/negozi.md) corretta (senza riscrivere in
   silenzio la vecchia, come per PSN ed EA).
3. **Vocabolario e migration** — **fatto (19/10/2026, migration 0059)**: `game_pass` e `games_with_gold` in
   `subscriptionValues`, con le etichette nei due file dei messaggi, migration da
   drizzle-kit. `'xbox'` in `linkableStoreValues` aspetta il passo 5, come per EA.
4. **`external/xbox.ts`** — **fatto (19/10/2026)**: device code, rinnovo,
   XBL/XSTS con le due relying party, Collections, titlehub, userstats,
   catalogo, ordini e `productActions`. Test con risposte simulate
   (`xbox.test.ts`). I 360 sono «al meglio»: ordini illeggibili o un
   `productActions` che non risponde non fanno fallire l'import.
5. **Login e import** — **fatto (20/10/2026)**:
   - `accounts.xboxLogin.{start,status}` (`services/xbox-login.ts`): la sessione
     del device code in memoria nel processo dell'API, come il QR di Steam; il
     server interroga Microsoft al ritmo che chiede, e a conferma scrive
     l'account (lo xuid, col gamertag come nome) e accoda l'import. Le
     piattaforme spuntate e «Game Pass attivo» stanno **nel credenziale**, come
     il paese di Nintendo: cambiarle è ricollegare;
   - `services/xbox-import.ts`: `buildXboxEntries`, pura, con le regole dei
     punti 5–8, e `importXboxLibrary`. Le ore e i 360 sono al meglio; i 360 si
     cercano solo con una console spuntata;
   - `importLibrary` cerca, collega e ricorda fra gli scarti **una voce per
     id**, e scrive una copia per voce: due voci con lo stesso `productId` su
     due piattaforme non rompono più l'upsert degli scarti;
   - la regola 3 per le console Xbox (`copy-platforms.ts`) e il link della
     copia su xbox.com (`storePageUrl`);
   - test contro Postgres, Microsoft stubbato al confine (`xbox-import.test.ts`,
     `xbox-login.test.ts`, più tre casi in `library-import.test.ts`).

   **Non ancora**: `'xbox'` in `linkableStoreValues` e in
   `AUTO_SYNC_EVERY_DAYS` (quindi niente aggiornamento automatico), che
   entrano col passo 6: aggiunto prima, `/account` mostrerebbe Xbox fra i
   negozi con il modulo da incollare degli altri. Nessuno dei sorgenti mappa
   ancora la prima Xbox (`xbox`): la spunta c'è, ma non produce copie.

6. **La scheda in `/account`**: il codice da mostrare e il link, l'elenco
   delle piattaforme da spuntare e la spunta del Game Pass sono un modulo
   nuovo, quindi **si vede prima del codice** (proposta scritta e wireframe).
7. **Documentazione**: `docs/negozi.md` (sezione Xbox, la tabella, il rischio),
   `docs/ordine-sviluppo.md` (9e), `apps/api/CLAUDE.md` (il probe); la roadmap
   passa a «in corso» col passo 1 e a «fatto» quando dici che il lotto è pronto.

## Passo 6 — la scheda in `/account` (proposta, 20/10/2026)

È una schermata nuova, quindi **prima si vede**: questa proposta e il wireframe
([9e-xbox.excalidraw](9e-xbox.excalidraw): si apre trascinandolo su
excalidraw.com). Il codice dopo l'approvazione, una volta sola.

**Come è oggi**, letto dal codice e non da uno screenshot
([add-store-account.tsx](../apps/web/components/add-store-account.tsx),
[steam-qr-panel.tsx](../apps/web/components/steam-qr-panel.tsx),
[store-account-card.tsx](../apps/web/components/store-account-card.tsx)):
«Aggiungi libreria» apre un dialogo con la tendina del negozio e sotto un
modulo, quello da incollare per tutti tranne Steam, che ha un corpo suo (il QR
o il profilo). La scheda dell'account ha nome, menu ⋮ («Dai un nome»,
«Ricollega» se serve, «Scollega»), lo stato, «Aggiorna» e l'aggiornamento
automatico; su Steam anche un badge che dice come è collegato.

**La proposta, punto per punto** (i numeri sono quelli del wireframe):

1. **Le scelte prima del codice** (pannello 1). Scelto Xbox, il dialogo
   chiede «Su cosa giochi?» con le cinque piattaforme da spuntare, **nessuna
   spuntata all'inizio** (①), poi «Ho il Game Pass attivo» con una riga che
   dice cosa cambia (②), il nome facoltativo, e **Continua**, spento finché
   non c'è almeno una piattaforma (③). Le scelte vanno prima perché il server
   le salva al momento della conferma, insieme al token.
2. **Il codice nello stesso dialogo** (pannello 2), come il QR di Steam: il
   codice grande con **Copia** (④), il bottone che apre microsoft.com/link in
   una scheda nuova, i tre passi, e quanto vale ancora il codice. «← Indietro»
   torna alle scelte. Si chiede lo stato al server ogni due secondi, e chiudere
   il dialogo smette di chiedere (⑤).
3. **Gli stati** (pannello 3, al posto dell'attesa ⑤): fatto (il dialogo si
   chiude, toast, la scheda compare con «Importazione…»), scaduto («Nuovo
   codice»), «Nega» premuto («Riprova»), Xbox che non fa entrare l'account
   (senza profilo, paese, minore: «← Indietro»), e l'account sbagliato su un
   ricollegamento (⑥).
4. **La scheda dice le scelte** (⑦): una riga «PC · Xbox Series · Game Pass
   attivo» sotto il nome, come il badge del login sulla scheda Steam. Per
   questo `StoreAccountSchema` prende le scelte, lette dal credenziale come oggi
   `loginKind` (mai il token).
5. **«Cambia piattaforme» nel menu ⋮** (⑧) apre il pannello 5: le scelte di
   adesso già spuntate (⑨) e **Salva e aggiorna**, che le riscrive e accoda
   l'import. **Senza codice**: è una scelta nostra, non un login.
   «Ricollega», solo da scaduto, apre invece il pannello 1 con le scelte di
   adesso, poi il codice.
6. **Togliere una piattaforma non toglie le copie già importate** (⑩), e il
   pannello lo dice: l'import non pota le copie, come per ogni negozio. Si
   tolgono dalla scheda del gioco («Togli una copia»). E «Game Pass attivo»
   vale solo per i giochi che arrivano dopo: gli stati delle righe che ci sono
   non cambiano (è lo step 14).

**Due scelte da fare** (la mia per prima):

- **Cambiare piattaforme**: (a) **una mutazione che riscrive le scelte nel
  credenziale e accoda l'import**, senza passare da Microsoft; (b) ricollegare
  con un codice nuovo, che c'è già e non costa codice nuovo ma chiede di
  confermare su Microsoft per spuntare una casella. Propongo (a).
- **Le copie di una piattaforma tolta**: (a) **restano, e il pannello lo dice**
  (⑩); (b) l'import di quell'account le pota, con la regola della famiglia
  Steam (resta l'ultima copia di una riga con dati dell'utente). Propongo (a):
  la (b) è un pezzo di logica nuovo su dati dell'utente, per un gesto raro.

**Cosa tocca, se approvi** (oltre alla UI): `'xbox'` in `linkableStoreValues`
e in `AUTO_SYNC_EVERY_DAYS` (sette giorni) e fuori da `GuidedStore` (non ha un
modulo da incollare); le scelte su `StoreAccountSchema`; con la (a) del primo
punto la mutazione `accounts.xboxSettings`; i componenti nuovi (le scelte, il
pannello del codice, il dialogo «Cambia piattaforme») e il ramo Xbox in
«Aggiungi libreria» e nella scheda; i testi in `it.json` e `en.json`.

**Fatto il 20/10/2026**, con la struttura del wireframe e le due (a): «Cambia
piattaforme» senza codice, e le copie di una piattaforma tolta che restano.

- **Backend**: `'xbox'` in `linkableStoreValues` e in `AUTO_SYNC_EVERY_DAYS`
  (sette giorni), fuori da `GuidedStore`; `accounts.link` su Xbox è un
  `BAD_REQUEST`. Le scelte su `StoreAccountSchema` (`xbox`), lette dal
  credenziale in `listStoreAccounts` come il login Steam.
  `accounts.xboxSettings` (`updateXboxSettings`): riscrive le scelte nel
  credenziale senza toccare il token e accoda l'import; `CONFLICT` con un
  import in corso, `FORBIDDEN` da ricollegare. Quattro test in
  `xbox-login.test.ts`.
- **Web**: [xbox-choices.tsx](../apps/web/components/xbox-choices.tsx) (le
  spunte, usate in due posti), [xbox-code-panel.tsx](../apps/web/components/xbox-code-panel.tsx)
  (il codice, «Copia», «Apri microsoft.com/link», il conto alla rovescia, gli
  stati), [xbox-link.tsx](../apps/web/components/xbox-link.tsx) (scelte, poi
  codice) e [xbox-settings-dialog.tsx](../apps/web/components/xbox-settings-dialog.tsx).
  Nella scheda: la riga delle scelte, «Cambia piattaforme» nel menu, e
  «Ricollega» che riparte dalle scelte di adesso. L'interruttore «Auto» ora
  scrive la riga che torna **sopra** quella di prima: senza, perdeva ciò che la
  lista ricava dal credenziale (le scelte Xbox, e il tipo di login Steam).
- **Provata in un browser vero** (Playwright, utente di prova poi cancellato):
  le due schede finte iniettate nella lista, il dialogo con le scelte, il
  codice, «senza profilo Xbox», «Indietro», «Cambia piattaforme» fino al
  salvataggio (la richiesta porta le piattaforme nell'ordine dell'elenco) e
  «Ricollega» con le scelte già spuntate. `xboxLogin` e `xboxSettings` erano
  intercettati: **nessuna richiesta è partita verso Microsoft**. Nessun errore
  di pagina. **Non provato**: un collegamento vero dall'app.

## Fuori da questo lotto

- la **wishlist Xbox** (15e): nessuno dei progetti la legge, e non è stato trovato
  un endpoint;
- l'**[idea delle piattaforme dell'utente](piattaforme-dell-utente.md)**, che vale
  per tutti i negozi;
- il mobile, che riuserà lo stesso device code.

## Verifica

`pnpm --filter api test`, `pnpm lint`, `pnpm check-types`. Il probe, una volta sola
e concordato: `pnpm --filter api xbox:probe`.
