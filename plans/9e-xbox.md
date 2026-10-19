# Step 9e — Xbox

**Stato: passi 1 e 2 fatti (19/10/2026).** Il probe
(`apps/api/src/scripts/xbox-probe.ts`) è stato lanciato dall'utente, e le
decisioni aperte sono state prese sui suoi dati: vedi «Le misure» e «Decisioni».
Prossimo: il passo 3.

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
   **entrano tutti** con una copia `game_pass`. Il confronto con gli elenchi del
   Game Pass si fa sul **gioco IGDB**, non sul `productId`: lo storico porta
   l'id di un'edizione (It Takes Two) e gli elenchi un'altra.

   Al collegamento una spunta, **«Ho il Game Pass attivo»**, decide lo stato
   **alla nascita** di quelle righe, con lo stesso meccanismo dell'import da CSV
   (`LibraryEntry.status`): sì → lo stato normale di un import; no → `played`.
   Mai `completed`, che nessun import imposta. Una riga che c'era già resta com'è,
   e riattivare l'abbonamento dopo non cambia gli stati: cosa succede quando un
   abbonamento finisce o riparte è lo step 14, e la spunta è il dato che gli
   servirà (per PSN lo dà l'API con `isPlus`). Scartate: «da sistemare» con una
   tab «abbonamenti» (lì sta ciò che l'import non ha risolto, questi sono
   risolti, e anticiperebbe il 14).

6. **Xbox One o Series: lo sceglie l'utente** al collegamento, una console di
   default per l'account. Il catalogo non aiuta: 60 giochi Xbox su 61 sono
   `ConsoleGen8+ConsoleGen9`. È un pezzo dell'[idea delle piattaforme
   dell'utente](piattaforme-dell-utente.md), limitato all'account Xbox.
7. **I 360 retrocompatibili** vanno su `xbox360`, che è la loro scheda IGDB.
8. **Le ore di un Play Anywhere** (`MinutesPlayed` è per titolo, non per
   dispositivo) vanno sulla copia Xbox.

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
3. **Vocabolario e migration**: `game_pass` e `games_with_gold` in
   `subscriptionValues`, con le etichette nei due file dei messaggi, migration da
   drizzle-kit. `'xbox'` in `linkableStoreValues` aspetta il passo 5, come per EA.
4. **`external/xbox.ts`**: device code, rinnovo, XBL/XSTS con le due relying party,
   Collections, titlehub, userstats, catalogo, ordini e `productActions`. Test con
   risposte simulate.
5. **Login e import**: le mutazioni «avvia» e «controlla» del device code, con la
   console di default e la spunta «Ho il Game Pass attivo»; la riduzione a
   `LibraryEntry[]` con le regole delle decisioni (fuori i `Win32`, Game Pass
   confrontato sul gioco IGDB, lo stato alla nascita dalla spunta) e
   `importLibrary`.
   Test contro Postgres, Microsoft stubbato al confine del modulo di servizio.
6. **La scheda in `/account`**: il codice da mostrare e il link, la console di
   default e la spunta del Game Pass sono un modulo nuovo, quindi **si vede prima
   del codice** (proposta scritta e wireframe).
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
