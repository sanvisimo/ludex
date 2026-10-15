# 9f — Steam: i giochi gratuiti che mancano e le demo

Correzione dell'import nata dal confronto con l'export di Playnite del
14/10/2026 (`202608_playnite_steam.csv` e `202608_playnite_steam_family.csv`),
sulla scia di [9a-gog-raccolte-e-doppioni](9a-gog-raccolte-e-doppioni.md) e
[9b-psn-nomi-tagliati](9b-psn-nomi-tagliati.md).

**Lotto chiuso dall'utente il 15/10/2026**, voce della roadmap «fatta». Restano
le correzioni a mano sul mini PC, raccolte con quelle degli altri lotti in
[minipc-correzioni](minipc-correzioni.md).

## Il confronto (15/10/2026)

Il DB locale ha l'ultimo import del 12/10, account principale (`sanvitest` è
collegato ma senza giochi). Le voci sono abbinate per appid, preso dal link
Steam fra i «Collegamenti» di Playnite: è un dato dei metadati, non l'id della
libreria, quindi qualche link sbagliato (Tropico 2, Deus Ex: HR, Gremlins vs
Automatons) è stato controllato a mano. Nessuna richiesta a Steam.

**Propri**

| Passaggio                                                                | ludex   | Playnite |
| ------------------------------------------------------------------------ | ------- | -------- |
| Voci                                                                     |         | **501**  |
| − giochi che ludex non riceve da Steam (sotto, problema 1)               | −50     |          |
| − due appid sullo stesso gioco: Mass Effect 2, Metro Exodus, Little Hope | −3      |          |
| Copie                                                                    | **448** |          |

In più 4 voci fra gli scarti che Playnite non elenca: _Starbound – Unstable_,
_Conan Exiles Public Beta Client_ (nascosta come `prerelease`), _Little Hope –
Friend's Pass_, _Dungeon Alchemist_.

**Famiglia**: Playnite **275**, ludex 271 copie + 2 scarti (_Moonrise_,
_System Shock: Classic_). Mancano _Four Kings One War_ e _Gravity Wars_.

I 133 titoli scritti diversi sono tutti giusti; le 36 copie su una raccolta
(`bundle`) anche, tranne Metro.

## I problemi

1. **50 giochi propri mancano, senza dirlo.** Licenze gratuite: free-to-play
   mai avviati (Warframe, Path of Exile, Halo Infinite, RuneScape, World of
   Tanks Blitz, Fallout Shelter…), regali (Tell Me Why, Eschalon, Nubarron, i
   quattro SEGA…), prologhi, beta, Friend's Pass. `GetOwnedGames` con
   `include_played_free_games` dà i gratuiti solo giocati. 45 su 50 hanno zero
   ore in Playnite; 5 qualche minuto (Aperture Desk Job, Fallout Shelter, Halo
   Infinite, Space Runaway, We Were Here) e non arrivano lo stesso.
2. **_Castlevania: Belmont's Curse Demo_ → _Castlevania_ del 1986** (1114). Il
   titolo intero su IGDB non trova niente, quello tagliato ai due punti trova il
   1986, e la regola 3 lo accetta perché IGDB lo dà anche su PC (la conversione
   DOS). Il gioco vero su IGDB c'è: 389434 (2026).
3. **_Metro 2033 Redux_ (286690) → la raccolta _Metro Redux_**: lo mappa IGDB,
   come su GOG. La regola 1 non lo tocca perché la copia c'è.
4. **Dalla lista in admin, ancora lì**: _Jet Grind Radio_ e _Resident Evil 4_.

## Le misure

**`include_free_sub=1`** (15/10/2026, una `GetOwnedGames` con la chiave,
account principale): **455** giochi contro i 453 del 05/10. Delle 50 voci
compare solo _Magicka 2: Spell Balance Beta_, e non si sa se per il parametro.
Scartato: i gratuiti con la sola chiave non arrivano.

**Come fa Playnite** (sorgente di `SteamLibrary`, `SteamServiceAggregator.cs`,
e la configurazione dell'utente: `ConnectAccount = true`, `IsPrivateAccount =
false`, `IncludeFreeSubGames = false`): **non è senza login**. Prende il
`webapi_token` dalla sessione dello store nel suo browser interno, poi:
`GetOwnedGames` col token; `IClientCommService/GetClientAppList`, che risponde
solo col client Steam acceso; se no `store.steampowered.com/dynamicstore/userdata/`
(`rgOwnedApps`), filtrato col suo backend sul tipo `game`. La famiglia con
`GetSharedLibraryApps`. Col solo profilo nemmeno Playnite li vede.

**`GetSharedLibraryApps` non serve a tutti**: vuole un `family_groupid`, e chi
non è in una famiglia non ce l'ha.

**`dynamicstore/userdata` col nostro login** (15/10/2026, `sanvitest`, che non è
in nessuna famiglia; token rinnovato con `getWebCookies()`, cookie
`steamLoginSecure` dello store; 4 richieste per giro, script nella scratchpad):

|                         | Primo giro | Dopo aver aggiunto _Path of Exile_ |
| ----------------------- | ---------- | ---------------------------------- |
| `GetOwnedGames`         | 0          | **0**                              |
| `rgOwnedApps`           | `[]`       | **`[238960]`**                     |
| `rgOwnedPackages`       | `[0]`      | `[0, 21357]`                       |
| `GetFamilyGroupForUser` | non membro | non membro                         |

La risposta è dell'utente e non anonima: `rgWishlist` ha i suoi 3 giochi.
`rgOwnedApps` porta **solo appid**: niente nome, ore, data, tipo. Dentro ci sono
anche DLC e non-giochi (Playnite li filtra).

**`dynamicstore/userdata` sull'account principale** (15/10/2026, deciso
dall'utente; le stesse 4 richieste, credenziale QR del DB locale, token
rinnovato non salvato; tutte 200):

| Cosa                                        | Quanti                       |
| ------------------------------------------- | ---------------------------- |
| `GetOwnedGames`                             | 455                          |
| `rgOwnedApps`                               | 1168 (`rgOwnedPackages` 512) |
| in `GetOwnedGames` e non in `rgOwnedApps`   | 1: la demo di Castlevania    |
| **appid in più**                            | **714**                      |
| dei 45 mancanti con appid, in `rgOwnedApps` | **44**                       |
| appid propri di Playnite in `rgOwnedApps`   | 488 su 489                   |

- **L'unione, non la sostituzione**: la demo è in `GetOwnedGames` e non fra le
  licenze.
- **_Crypt of the NecroDancer_ non è dell'utente**: non è in `rgOwnedApps`.
  Playnite lo mette fra i propri (probabilmente perché installato), ludex fra
  la famiglia, ed è ludex ad avere ragione. Tolto dai problemi.
- **_Four Kings One War_ e _Gravity Wars_ sono dell'utente**: sono in
  `rgOwnedApps`. Arrivano come propri, non serve toccare la famiglia.
- **I 714 appid in più, su IGDB** (in blocco, nessuna richiesta a Steam): 275
  noti — 124 `dlc`, 58 `pack`, 20 `expansion`, 17 `episode`, 6 `bundle`, 45
  `main_game` (40 dei mancanti più sotto-giochi di raccolte: Golden Axe e
  Sonic 2 dei SEGA Classics, Total War: Shogun 2…) — e **439 sconosciuti**. Dei
  44 mancanti IGDB ne conosce 42 (non _Citizens: Far Lands – Prologue_ e
  _NecroCity: Prologue_).
- **Il tipo di IGDB non basta come filtro**: lascia fuori 439 appid, e gli
  episodi che Steam vende come DLC (Hitman, Revelations 2, King's Quest) per
  IGDB sono `episode`, cioè giochi. Serve il tipo di Steam, come fa Playnite.
- Con `appdetails` sono **714 richieste** al primo import: a circa 200 ogni
  cinque minuti, quasi 20 minuti. Poi solo gli appid nuovi.

**Il tipo di Steam in blocco: `IStoreBrowseService/GetItems`** (15/10/2026,
anonimo: niente chiave, token o cookie). Prima 14 appid in una richiesta, poi i
714 in 8 blocchi da 100, tutte 200. Rende `type` e `name` (con
`include_basic_info` anche editori e `unlisted`); `type` 0 gioco, 1 demo, 4
DLC, 11 musica, 12 beta. _Castlevania: Belmont's Curse Demo_ è `1`; _Conan
Exiles Public Beta Client_ è `0`, quindi per le beta resta il nome.

| I 714 appid in più                   | Quanti  |
| ------------------------------------ | ------- |
| DLC (`4`)                            | 442     |
| **giochi (`0`)**                     | **52**  |
| musica, beta, pubblicità             | 7, 2, 1 |
| **nessuna risposta** (`success: 15`) | **210** |

- Dei 52 giochi, **40 sono fra i mancanti**. 4 stanno in Playnite con un nome
  diverso o senza link: _Gravity Wars_ e _Four Kings One War_ (lì nella
  famiglia), _Ash of Gods: The Way Prologue_, _Hex Reverse_. **8 non ci sono**:
  _Golden Axe_ e _Sonic the Hedgehog 2_ (dentro _SEGA Mega Drive and Genesis
  Classics_, 34270; tutti e tre `unlisted`), _Total War: Shogun 2_ e _Fall of
  the Samurai_ (`unlisted`), _Rising Storm GOTY_, _Company of Heroes 2 –
  Ardennes Assault_, _Descent: Road to Legend_, _RetroArch_.
- **Gli episodi venduti come DLC sono `4`** (Hitman, Revelations 2, King's
  Quest): il tipo di Steam li toglie, quello di IGDB no.
- Fra i 210 senza risposta ci sono **4 dei mancanti**, i regali SEGA (_Streets
  of Kamurocho_, _Armor of Heroes_, _Endless Zone_, _Golden Axed_): IGDB li
  conosce come `main_game`. Degli altri 206 IGDB ne conosce 2 (un `pack`, un
  `episode`).
- Totale: **44 dei 44** mancanti con appid si ritrovano, 40 dal tipo e 4 da
  IGDB.

## La proposta

### 1. I gratuiti, per chi ha fatto il login

Le voci proprie sono `GetOwnedGames` **più** gli appid di `rgOwnedApps` che
`GetOwnedGames` non ha. Una strada sola, con o senza famiglia.

- **`rgOwnedApps` dal cookie dello store**, ricostruito dall'access token che
  l'import ha già: `steamLoginSecure` vale `SteamID64||token`, ed è il cookie
  da cui `accessTokenFromCookies` prende il token. Nessuna richiesta di login in
  più. Col token web incollato (`webapi_token` dello store) dovrebbe valere lo
  stesso: da provare.
- **Il tipo da `GetItems`**, anonimo, a blocchi di 100 (8 richieste sulla
  libreria dell'utente), a ogni import: costa poco, e non serve ricordare le
  risposte negli scarti.
  - tipo **gioco** (`0`) → una voce, col nome di Steam;
  - **nessuna risposta** → una voce solo se IGDB riconosce l'appid come gioco
    (non `dlc`, `pack`, `expansion`, `episode`, `bundle`…): i quattro regali
    SEGA. Le altre si ignorano;
  - DLC, demo, musica, beta, il resto → si ignorano. Non sono voci della
    libreria neanche per Steam, che li mostra sotto il gioco.
- **Gli 8 giochi in più di Playnite entrano** (decisione dell'utente,
  15/10/2026): Steam li dà come giochi propri, e chi non li vuole li nasconde.
  Nota: l'Assistenza di Steam mostra _Golden Axe_ (34276) come **DLC** della
  raccolta SEGA, acquistato il 17/02/2016, mentre `GetItems` lo dà di tipo `0`.
  Accettato così.
- Le voci nuove hanno **ore 0**; la **data d'acquisto** la mette
  `buildSteamEntries` dalla risposta della famiglia, che per chi è in una
  famiglia elenca anche le app proprie con `rt_time_acquired` (i 501 della
  misura del 05/10). Fuori da una famiglia restano senza data. Per il resto
  passano dall'import di sempre (per id, poi per nome).
- `buildSteamEntries` toglie già dalla famiglia ciò che è dell'utente: un gioco
  che arriva da `rgOwnedApps` e che era `steam_family` diventa una copia propria
  (nessuno, sulla libreria dell'utente).
- **Chi usa solo il profilo resta com'è**, senza i gratuiti mai avviati; va
  scritto in [docs/negozi.md](../docs/negozi.md).
- `userdata` o `GetItems` che falliscono (cookie non accettato, HTML invece di
  JSON, 429) **non toccano niente**: si importa da `GetOwnedGames` come oggi, e i gratuiti già
  importati non si tolgono.

**Un gratuito che sparisce da `rgOwnedApps` resta**, come ogni gioco proprio:
l'import Steam non pota le copie proprie, solo quelle `steam_family`
(`pruneFamilyCopies`, solo dopo aver letto la famiglia per intero).

### 2. Demo e beta fra gli scarti come `prerelease`

Decisione dell'utente (15/10/2026). Una voce **non risolta per id** il cui nome
contiene la parola `Demo` non si cerca per nome: va fra gli scarti già nascosta
come `prerelease`. La stessa regola per `Beta`, `Playtest` e `Public Test`
(decisione dell'utente, 15/10/2026: _Conan Exiles Public Beta Client_, _Magicka
2: Spell Balance Beta_). Una voce risolta per id resta dove IGDB la mette.

Fatta in `library-import.ts` per tutti i negozi (`isPrereleaseName`, parola
intera: `demo`, `beta`, `playtest`, `public test`/`testing`). Lo scarto nasce
nascosto **solo all'inserimento**, come quello nascosto da un admin per tutti:
se l'utente lo rimette fra i «da sistemare» il reimport non lo rinasconde, e gli
scarti che già esistono restano come sono. Effetto anche su Epic: le voci in più
di un prodotto con quei nomi (_Barony (Beta)_, _Chivalry 2 - Public Testing_)
nascono nascoste invece che fra i «Possibili doppioni».

Il collegamento di _Castlevania_ è scritto: al reimport vince, e dall'admin non
si toglie («Scollega» rifiuta l'id unico, «Non è questo gioco» vuole un gioco
giusto, che per una demo non c'è). **Cancellato a mano in locale** il
15/10/2026, deciso dall'utente: la riga di `external_ids` (steam `5000760`), la
copia e la riga del backlog, che non aveva dati dell'utente (nessun voto, nota,
tag, rifiuto; nessun altro utente). La riga di `games` (1114) resta. Il mini PC
si guarda dopo. Fino alla regola nuova un reimport la ricollegherebbe:
l'auto-sync locale scatta a 7 giorni dal 12/10.

### 2b. La copertina degli scarti Steam

Visto in uso dall'utente (15/10/2026): _Hex Reverse_, _Moonrise_ e _System
Shock: Classic_ fra i «da sistemare» senza copertina. L'interfaccia la compone
da `steam/apps/{appid}/library_600x900.jpg`, e:

- _Moonrise_ e _System Shock: Classic_, vecchi e ritirati, la verticale non
  l'hanno mai avuta: 404; `header.jpg` allo stesso indirizzo c'è (200);
- _Hex Reverse_, del 2026, ha le immagini in una cartella con un codice
  (`steam/apps/5257350/0c22de2a…/library_capsule.jpg`, su
  `shared.akamai.steamstatic.com/store_item_assets/`): l'indirizzo fisso dà 404
  per entrambe.

Decisione dell'utente (strada B): dopo l'import Steam, per gli scarti
dell'account senza copertina, `GetItems` con `include_assets` (anonima, di solito
una richiesta) e l'indirizzo vero in `image_url`, verticale o orizzontale;
`storeCoverUrl` lo preferisce. Nell'interfaccia, se la copertina non si carica,
si prova `header.jpg` (`storeCoverFallbackUrl`) prima dell'icona.

### 2c. Uno scarto risolto a mano nasce come la copia dell'import

Visto in uso dall'utente (15/10/2026): _Moonrise_, della famiglia, risolto a
mano dai «da sistemare» è diventato un **acquisto**. `unresolved_imports` non
salvava abbonamento e supporto, e `resolveUnresolvedImport` scriveva la copia
senza `subscription`, `medium` e `store_page`. Il reimport non l'avrebbe
corretta: la copia `steam_family` non adotta righe (`adottaPossessiMenoSpecifici`),
e ne sarebbero rimaste due, con quella «comprata» che nessuna potatura toglie.
Vale per tutti i negozi (uno scarto del Plus, un disco PSN).

Correzione: `subscription` e `medium` su `unresolved_imports` (migration
[0054](../packages/db/drizzle/0054_fresh_bishop.sql); gli enum spostati da
`backlog.ts` a `games.ts`, perché `imports.ts` non può importare `backlog.ts`
senza un ciclo), scritte da `recordUnresolved` e passate alla copia da
`resolveUnresolvedImport`, con `store_page`. Gli scarti nati prima le prendono
al primo reimport. In locale: migration applicata, copia sbagliata di _Moonrise_
cancellata (la riga del backlog resta, senza dati dell'utente); mini PC da
vedere.

### 3. A mano, dall'admin

| Voce                      | Gioco giusto (IGDB)              |
| ------------------------- | -------------------------------- |
| Metro 2033 Redux (286690) | 80853                            |
| Jet Set Radio (205950)    | 21004 (dalla lista, già nel 9b)  |
| Resident Evil 4 (254700)  | 145191 (dalla lista, già nel 9b) |

### Fuori

- Le date dei gratuiti fuori da una famiglia: `userdata` non le ha.

## Passi

- [x] confronto con Playnite e misure (sopra)
- [x] questo piano, approvato (15/10/2026)
- [x] voce `steamFree` «in corso» nella roadmap (`roadmap.ts`, `it.json`, `en.json`)
- [x] Castlevania cancellato a mano in locale; mini PC da vedere
- [x] branch nuovo da `main`: `feat/9f-steam-gratuiti`
- [x] client: `fetchSteamOwnedAppIds` (`rgOwnedApps` col cookie ricostruito
      dall'access token) e `fetchSteamAppTypes` (`GetItems` a blocchi di 100)
- [x] import: appid in più filtrati per tipo (`licenseEntries` in
      `steam-import.ts`), con i test: gratuito nuovo
      importato a 0 ore, DLC ignorato, senza risposta e noto a IGDB come gioco
      importato, senza risposta e `pack` ignorato, `userdata` o `GetItems` che
      falliscono non cambiano niente, un gioco della famiglia che arriva fra le
      licenze diventa proprio
- [x] demo e beta come `prerelease`, con i test: demo non risolta per id negli
      scarti senza ricerca per nome, demo risolta per id lasciata lì
- [x] copertina degli scarti Steam: `fetchSteamAppCovers`,
      `fillUnresolvedCovers` in `steam-import.ts`, `storeCoverUrl` che preferisce
      `image_url`, `storeCoverFallbackUrl` e il ripiego in `UnresolvedCover`
- [x] scarto risolto a mano con abbonamento, supporto e pagina del negozio:
      migration 0054, `recordUnresolved`, `resolveUnresolvedImport`, test
      (famiglia Steam, Plus, disco); _Moonrise_ corretto in locale
- [x] `docs/negozi.md` e `docs/import-librerie.md`
- [x] misura sull'account principale (decisa dall'utente il 15/10/2026): 714
      appid in più, 44 dei 45 mancanti (sopra)
- [x] import locale col codice nuovo e confronto con i 501 di Playnite
      (15/10/2026, sotto)
- [ ] correzioni a mano, in locale e sul mini PC

## Il confronto dopo (15/10/2026)

Import locale col codice nuovo, account principale.

**Propri**: Playnite 501, ludex **499** copie. 490 uguali; 3 voci che per
Playnite sono due e per ludex una copia (Mass Effect 2, Metro Exodus, Little
Hope); 3 fra gli scarti (_Ash of Gods Prologue_ e _Hex Reverse_ visibili, IGDB
non li conosce; la demo di Castlevania nascosta come `prerelease`); _Jet Set
Radio_ ancora su _Jet Grind Radio_ (correzione a mano); _Crypt of the
NecroDancer_ nella famiglia, giusto; 3 ignorati (_Magicka 2: Spell Balance
Beta_, _Man of Medan – Friend's Pass_, _Gremlins vs Automatons_: né lo store né
IGDB li descrivono). In più gli 8 della decisione A, fra cui _Four Kings One
War_ e _Gravity Wars_ (per Playnite nella famiglia). Dei 45 mancanti con un
appid ne manca **0**.

**Famiglia**: Playnite 275, ludex **272** copie e 1 scarto (_System Shock:
Classic_). Tutto torna: 4 voci sembrano diverse solo per i link dei metadati di
Playnite (_Moonrise_, _Deus Ex: HR_, _City of Heroes_, _Tropico 2_), e _Four
Kings One War_ e _Gravity Wars_ stanno fra i propri.

## Verifica

`pnpm --filter api test`, `pnpm check-types`, `pnpm lint`. Poi, su
`sanvitest`, un import: _Path of Exile_ entra come copia propria a 0 ore.
