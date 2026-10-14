# 9b — PSN: giochi agganciati su una console dove non sono mai usciti

Correzione dell'import nata dal confronto con l'export di Playnite del
14/10/2026 (`202608_playnite_playstation.csv`), sulla scia di
[9a-gog-raccolte-e-doppioni](9a-gog-raccolte-e-doppioni.md).

## Il confronto

| Passaggio                    | ludex                                      | Playnite |
| ---------------------------- | ------------------------------------------ | -------- |
| Voci                         | **364**: 351 copie + 13 «Non riconosciute» | **363**  |
| Senza corrispondenza diretta | 31                                         | 30       |

Le differenze, piattaforma per piattaforma:

- **stesso gioco, nome diverso**: Alan Wake 2, Endling (PS4 e PS5), Ghost of
  Tsushima PS5 (in ludex il disco della Director's Cut), Skul, TESO Tamriel
  Unlimited, Tomb Raider I-III (PS4 e PS5), Uncharted 4: Fine di un ladro,
  WoodleTree, Frozen Free Fall (fra le «Non riconosciute»), Sackboy: Una
  grande avventura (era fra le «Non riconosciute» per il nome in italiano,
  collegata a mano dall'utente al gioco della copia PS4 che c'era già);
- **giocati e non posseduti**, che per regola non entrano: FIFA 19, WWE 2K18,
  Torment: Tides of Numenera, probabilmente Overcooked (in Playnite senza
  piattaforma, 201 ore);
- **PS3** (Injustice, Extreme Exorcism): non stanno fra gli acquisti che Sony
  ci restituisce, anche se le chiediamo (`PURCHASED_PLATFORMS`), e l'elenco dei
  giocati copre solo PS4 e PS5. Playnite li prende probabilmente dall'elenco
  dei trofei: non verificato, fuori da questo lotto;
- **PC** (God of War Ragnarök, Ghost of Tsushima, la seconda voce di Stellar
  Blade): l'import PSN porta solo le console;
- **SpongeBob PS5**: copia tolta dall'utente (`ownership_rejections`);
- **solo in ludex**: NBA 2K21 PS4, che Playnite non ha con nessun nome; le app
  nascoste (Netflix, YouTube, DAZN…); una voce Metal Gear in più, perché la
  Master Collection sono acquisti separati.

## I problemi

1. **Il nome tagliato ai due punti aggancia un gioco vecchio.** È il
   meccanismo del Prologue di Legend of Keepers, ma senza un'altra voce con cui
   scontrarsi, quindi la regola 2 della GOG non lo vede:

   | Voce PSN                                            | Finita su                      |
   | --------------------------------------------------- | ------------------------------ |
   | Harry Potter: Campioni di Quidditch (PS4 e PS5)     | _Harry Potter_, 2001, 248180   |
   | LEGO Star Wars: La Saga degli Skywalker (PS4 e PS5) | _LEGO Star Wars_, 2006, 285677 |
   | Aliens: Fireteam Elite (PS5)                        | _Aliens_, 1990, 13680          |

   Lo stesso su Epic: _Predator: Hunting Grounds_ → _Predator_ (1987), _Styx:
   Shards of Darkness_ → _Styx_ (1983). Scartare ogni risultato del titolo
   tagliato non si può: metà sono giusti (Fallout 2, Redout, Neurodeck…).

2. **Altri collegamenti su una console dove il gioco non è uscito**, trovati
   dalla seconda misura (sotto): _Dead Space_ del 2008 su PS5 (probabilmente il
   remake del 2023), _Call of Duty: Modern Warfare 3_ del 2011 su PS4 e PS5
   (probabilmente quello del 2023), _Game of Thrones_ RPG del 2012 su PS4
   (probabilmente il Telltale). Non tutti da titolo tagliato: il collegamento
   è scritto e nessun automatismo lo rivede.

3. **Edizione discutibile**, come Nioh: _Diablo III: Reaper of Souls –
   Ultimate Evil Edition_ → _Diablo III_; _FINAL FANTASY XIV: A Realm Reborn_
   PS4 → la _Collector's Edition_ (41839). **Nessun segnale automatico**: IGDB
   dà anche il gioco base su PS4, e resterebbe solo il nome, che su PSN non si
   salva (`store_title` su 0 collegamenti PSN di 1221, contro 432/435 GOG e
   673/673 Epic). E «il nome del negozio ha parole in più» vale anche per ogni
   GOTY giusta. Si correggono con «Segnala un errore» dalla pagina del gioco,
   che arriva in admin → Segnalati.

## Le misure (14/10/2026)

Ricerche IGDB con le funzioni vere dell'import, nessuna scrittura, nessuna
richiesta a PSN. Gli script stanno nella scratchpad della sessione, non nel
repo.

### Regola 3 all'import

Su 343 voci (66 nomi PSN da Playnite con i due punti, 277 voci GOG ed Epic col
titolo del negozio), **35** risolte solo col titolo tagliato:

| Esito                                                  | Voci                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| scartate (il gioco non è sulla piattaforma della voce) | Harry Potter, LEGO Star Wars, Predator, Styx: **le 4 sbagliate**                                                   |
| accettate                                              | 17, tutte uguali a oggi: Fallout 2, Redout, Neurodeck, Ozymandias, Siege of Avalon, Morrowind GOTY, TESO, MGS2 MC… |
| nessuna scelta                                         | 14, già oggi: la regola non le tocca                                                                               |

Per GOG ed Epic «PC» vuol dire Windows, DOS, Linux o Mac.

**Rifatta col codice nuovo** (14/10/2026): cambiano esattamente le 4 voci
scartate, che ora non hanno un gioco scelto; le altre 31 sono identiche. I prologhi
(Builders of Egypt, Vagrus, Siege Survival, Legend of Keepers) restano sul
gioco completo: stessa piattaforma, la regola non può niente. _Aliens:
Fireteam Elite_ non è misurato: col nome di Playnite IGDB lo trova al primo
tentativo, e il nome vero della voce PSN non lo conosciamo. Se è il titolo
tagliato, la regola lo scarta: _Aliens_ del 1990 non è su PS5.

### Le copie già scritte

Le 264 copie PSN con `igdbId`, contro le piattaforme di IGDB del gioco: **12**
su una console dove IGDB non lo dà.

| Esito               | Giochi                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| sbagliati, già noti | Aliens, Harry Potter, LEGO Star Wars                                                                                                          |
| sbagliati, nuovi    | Dead Space (2008), CoD: Modern Warfare 3 (2011), Game of Thrones (2012)                                                                       |
| da controllare      | Woodle Tree Adventures                                                                                                                        |
| falsi allarmi       | Moss, Astro Bot Rescue Mission, Paper Beast, Legendary Tales: VR, che IGDB mette su PS VR e non su PS4/PS5; MGS 1, voluto (Master Collection) |

Contando PS VR come PS4 e PS VR2 come PS5, gli allarmi scendono a 8, e almeno
6 sono errori veri.

### La lista su tutti i negozi

Query sul database locale dopo `igdb:platforms`, con le stesse piattaforme
valide di `copy-platforms.ts` (14/10/2026). Le valutazioni sono a occhio, da
confermare caso per caso dall'admin.

| Negozio  | Copie | Fuori | Giochi                                                                                                                                                                                                    |
| -------- | ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steam    | 719   | 2     | Jet Grind Radio (2000, Dreamcast), Resident Evil 4 (remaster 2011, solo console)                                                                                                                          |
| GOG      | 432   | 3     | Akalabeth, Ultima IV (IGDB solo Apple II), Dishonored: Definitive Edition (IGDB solo PS4/Xbox One)                                                                                                        |
| Epic     | 673   | 4     | Predator, Styx, Monument Valley 2+ (solo iOS), Dishonored: Definitive Edition                                                                                                                             |
| EA       | 41    | 0     |                                                                                                                                                                                                           |
| Amazon   | 461   | 9     | Last Resort, Mutation Nation, Over Top, Shock Troopers, Metal Slug 3 (Neo Geo), Indiana Jones and the Last Crusade (NES), Tempest (1981), Cars (2006, console), Star Wars: The Force Unleashed (senza PC) |
| PSN      | 351   | 12    | i 9 giochi di sopra                                                                                                                                                                                       |
| Nintendo | 35    | 4     | Bayonetta, Final Fantasy IX, Trine, Trine 2: IGDB non le dà su Switch                                                                                                                                     |

35 copie su 2712, 31 giochi. Tre tipi:

- **gioco sbagliato** (~13): i 6 PSN, Predator, Styx, Resident Evil 4,
  probabilmente Jet Grind Radio (su Steam c'è la riedizione HD), Indiana Jones
  (su PC è l'avventura grafica del 1989), Tempest (forse _Tempest: Pirate
  Action RPG_), Monument Valley 2+;
- **porting o edizione con una scheda sua** (~7): Trine, Trine 2, Final
  Fantasy IX, Bayonetta su Switch, Force Unleashed su PC (la _Ultimate Sith
  Edition_), Dishonored DE su GOG ed Epic (IGDB la tiene solo console). Si
  correggono allo stesso modo, o si accettano;
- **falso allarme, IGDB senza la piattaforma** (~11): i 5 Neo Geo di Amazon
  (le conversioni ACA per PC), Akalabeth, Ultima IV, Woodle Tree Adventures,
  Legendary Tales, MGS 1, forse Cars.

Una lista corta, e due terzi sono cose da correggere: il segnale regge. Il «Va
bene così» serve davvero, per un terzo delle righe.

## La decisione

Decisa dall'utente il 14/10/2026: regola 3 e lista in admin, nello stesso
lotto. È lo stesso segnale, «IGDB non dà il gioco su quella console»: la regola
ferma gli errori nuovi, la lista trova quelli già scritti.

### La piattaforma di una copia

Una funzione sola, usata da tutte e due: le piattaforme IGDB che valgono per
una copia.

- PS4: PS4 (48) e PS VR (165); PS5: PS5 (167) e PS VR2 (390). Id verificati
  su IGDB il 14/10/2026;
- PC (GOG, Epic, Steam, Amazon, EA): Windows (6), DOS (13), Linux (3), Mac
  (14), e il VR su PC, SteamVR (163) e Oculus VR (162), per la stessa ragione
  di PS VR;
- le altre: l'`igdb_id` della riga di `platforms`.

Un gioco senza piattaforme note su IGDB non dice niente: si accetta, e in lista
non entra. Sta in [copy-platforms.ts](../apps/api/src/services/copy-platforms.ts).

**Poi, le copie VR sulla piattaforma VR** (richiesta dell'utente, 14/10/2026):
_Moss_ e gli altri giochi VR la copia li mette su PS4, e la piattaforma giusta
sarebbe PS VR. Oggi `platforms` non ha una riga per il visore: da analizzare
dopo la lista (riga nuova in `platforms`, da cosa l'import riconosce un gioco
VR, cosa cambia nel filtro per piattaforma del backlog).

### Regola 3 — il nome vale solo sulla piattaforma della voce

In `resolveByName`: un risultato trovato per nome si accetta se IGDB dà quel
gioco sulla piattaforma della voce, una voce alla volta (in cross-buy si
scarta solo la console sbagliata). Altrimenti la voce va fra i «Da sistemare».

Nata per il solo titolo tagliato, **estesa a ogni voce trovata per nome**
(decisione dell'utente, 14/10/2026): Dead Space, MW3 e Game of Thrones erano
col nome pieno. Bloccare all'import invece di correggere dopo; la lista in admin
resta l'ultima spiaggia, per i collegamenti per id (Steam, GOG, dischi PSN) e
per quelli già scritti. Conseguenza vista nei test: su un negozio PC fra i due
Toki le recensioni scelgono l'arcade, che su PC non c'è, e la voce va nei «Da
sistemare» invece che sull'arcade.

### Le piattaforme su `games`

`games` non sa su cosa è uscito un gioco. Colonna nuova `platform_igdb_ids`
(`integer[]`, nulla = non ancora saputo), migration di drizzle-kit:

- la scrive l'enrichment IGDB: `platforms` si aggiunge a `DETAIL_FIELDS`, sulla
  chiamata che si fa comunque;
- per i 2332 giochi già arricchiti un arnese come `igdb:types`, cento id per
  richiesta (`fetchIgdbGamesMetadata`), in `apps/api/CLAUDE.md`.

### La lista in admin

Le copie su una piattaforma che il gioco non ha, raggruppate per gioco: nome,
anno, la console della copia, le piattaforme IGDB, quanti utenti. «Apri» porta
alla scheda admin del gioco, dove si corregge con «Non è questo gioco». È
calcolata, non una tabella: sparisce da sola quando il collegamento è giusto.
Per i falsi allarmi che restano (MGS 1) un «Va bene così» che la toglie: dove
salvarlo si decide col wireframe.

**Dove sta** si decide col wireframe, prima del codice (la regola delle
schermate). Proposta di partenza: un blocco in «Segnalati», sotto le
segnalazioni degli utenti, perché si lavora allo stesso modo.

### A mano

Gli id cercati su IGDB il 14/10/2026. Su IGDB molti giochi «falsi allarmi»
hanno una scheda **port** per la piattaforma giusta (_Akalabeth_ per PC,
_Bayonetta_ e _Final Fantasy IX_ per Switch, _Metal Slug 3_ per PC): il gioco
giusto c'è, è un'altra scheda.

Dalla lista in admin («Apri» → «Non è questo gioco»):

| Gioco collegato oggi                   | Negozio   | Gioco giusto (IGDB)                              |
| -------------------------------------- | --------- | ------------------------------------------------ |
| Akalabeth: World of Doom (2417)        | GOG       | 131719, il port PC/DOS                           |
| Ultima IV: Quest of the Avatar (2878)  | GOG       | nessuno per PC: «Va bene così»                   |
| Dishonored: Definitive Edition (20863) | GOG, Epic | 41590, la DE per PC (IGDB ci mappa già l'id GOG) |
| Monument Valley 2+ (210764)            | Epic      | 36749, _Monument Valley II_                      |
| Predator (15345)                       | Epic      | 118272, _Predator: Hunting Grounds_              |
| Styx (94476)                           | Epic      | 13554, _Styx: Shards of Darkness_                |
| Jet Grind Radio (1569)                 | Steam     | 21004, _Jet Set Radio_ (2012)                    |
| Resident Evil 4 (20065)                | Steam     | 145191, _Resident Evil 4_ (2005, PC)             |
| Bayonetta (2136)                       | Nintendo  | 279337, il port Switch                           |
| Final Fantasy IX (421)                 | Nintendo  | 205673, il port Switch                           |
| Trine (6247)                           | Nintendo  | 51800, _Trine Enchanted Edition_                 |
| Trine 2 (6250)                         | Nintendo  | 38932, _Trine 2: Complete Story_                 |

Dai «Da sistemare» dell'account (dopo il test da zero in locale; sul mini PC
sono ancora collegati, e vanno dalla lista in admin):

| Voce                                           | Gioco giusto (IGDB)                              |
| ---------------------------------------------- | ------------------------------------------------ |
| Harry Potter: Campioni di Quidditch (PS4, PS5) | 246166                                           |
| LEGO Star Wars: La Saga degli Skywalker        | 119305                                           |
| Call of Duty Modern Warfare 3 (PS4, PS5)       | 260780, _Modern Warfare III_ (2023)              |
| Game of Thrones (PS4)                          | 7610, il Telltale                                |
| Aliens (PS5, oggi sulla scheda 186868)         | 144153, _Aliens: Fireteam Elite_                 |
| Indiana Jones and the Last Crusade (Amazon)    | 186, _The Graphic Adventure_                     |
| Star Wars: The Force Unleashed (Amazon)        | 19637, _Ultimate Sith Edition_                   |
| Mutation Nation (Amazon)                       | 99477, _ACA Neo Geo: Mutation Nation_            |
| Metal Slug 3 (Amazon)                          | 347159, il port PC (o 88910, _ACA Neo Geo_)      |
| Diablo III (PS4, «Segnala un errore»)          | 47452, _Reaper of Souls – Ultimate Evil Edition_ |
| FFXIV: A Realm Reborn (PS4)                    | 386, _Final Fantasy XIV Online_                  |

### Poi: le copie VR sulla piattaforma VR (analisi, 14/10/2026)

Richiesta dell'utente: un gioco VR sta sulla piattaforma del visore. Cosa c'è:

- `platforms` non ha righe per il VR: è presa da Playnite, che non le ha. PS VR
  (165), PS VR2 (390), SteamVR (163), Oculus (162) andrebbero aggiunte con una
  migration;
- **solo VR** e non «anche VR»: IGDB mette sul visore anche giochi piatti con
  una modalità VR (_Resident Evil 7_, _Hitman 3_, _Ace Combat 7_). Un gioco è
  solo VR se IGDB lo dà sul visore e non sulla console. In locale sono 4 copie:
  _Astro Bot: Rescue Mission_, _Moss_, _Paper Beast_ (PSN, PS4) e _Carnival
  Games VR_ (Steam);
- **cambiare a mano non regge**: la piattaforma fa parte della chiave della
  copia, e il prossimo import ricreerebbe quella PS4 accanto. Deve deciderlo
  l'import, dopo aver risolto il gioco, e le copie esistenti si spostano una
  volta;
- **il filtro per piattaforma** cambia significato: chi filtra «PS4» non vede
  più _Moss_, e lo trova sotto «PS VR». È ciò che si vuole se il filtro dice
  «cosa posso avviare con quello che ho acceso».

## Passi

- [x] questo piano
- [x] misura della regola 3 su GOG, Epic e i nomi PSN
- [x] misura delle copie PSN già scritte
- [x] la piattaforma di una copia (la funzione) e la regola 3 nell'import, con
      i test: titolo tagliato sulla piattaforma giusta accettato, su un'altra
      negli scarti, ricerca piena non toccata, voce PC con un gioco solo su C64
      negli scarti, gioco VR su PS4 accettato; in più cross-buy con una sola
      console giusta, gioco solo DOS su GOG, gioco senza piattaforme note. Il
      test di «Scollega» (`admin-games.test.ts`) dava Legend of Keepers solo su
      Switch, un dato di comodo del caso Toki: ora è su Windows
- [x] `platform_igdb_ids` su `games`: migration
      ([0051](../packages/db/drizzle/0051_hesitant_spencer_smythe.sql)),
      enrichment (`platforms` in `DETAIL_FIELDS`), arnese `igdb:platforms`
      ([game-platforms.ts](../apps/api/src/services/game-platforms.ts)),
      lanciato in locale: 2330 giochi con le piattaforme, 2 senza. Le copie PSN
      su una console che il gioco non ha, contando PS VR, sono 9 giochi: gli 8
      della misura più _Legendary Tales_, che IGDB dà su PC, Android e Switch
      e non su PS5 o PS VR2 (un buco di IGDB)
- [x] misura della lista su tutti i negozi (sotto)
- [x] regola 3 estesa a ogni voce trovata per nome, con i test (Dead Space
      col titolo pieno, Toki su GOG)
- [x] test da zero di PSN e Amazon in locale (14/10/2026), rifatto una volta
      perché `tsx watch` non aveva ricaricato il worker. PSN: 326 copie + 40
      «Da sistemare» = 366 voci, Playnite 363; la regola ferma 9 voci, tutte
      giuste da fermare (Harry Potter e LEGO Star Wars PS4/PS5, CoD MW3
      PS4/PS5, Game of Thrones, il «Bonus content» della Master Collection,
      _Legendary Tales 2_), Dead Space finisce sul remake, nessun gioco giusto
      scartato. Amazon: 426 copie + 47 «Da sistemare» = 473, Playnite 452 (la
      differenza viene dai due account); i 9 Amazon della lista sono tutti fra
      i «Da sistemare», la regola ne ferma circa 4 (Indiana Jones, Force
      Unleashed, Mutation Nation, Metal Slug 3: solo l'ultimo è un falso
      allarme). Gli altri scarti dipendono dai nomi, non dalla regola. Esito
      dato per buono dall'utente
- [x] wireframe della lista in admin, approvato
      ([9b-psn-piattaforma.excalidraw](9b-psn-piattaforma.excalidraw)): blocco
      sotto le segnalazioni, «Apri» bottone pieno con icona anche nelle
      segnalazioni, niente testi di spiegazione
- [x] la lista: tabella `platform_mismatch_dismissals` (gioco + piattaforma,
      migration 0052), servizio
      [platform-mismatches.ts](../apps/api/src/services/platform-mismatches.ts)
      con i test, procedure `admin.platformMismatches.list`, `dismiss`,
      `restore`, componente
      [platform-mismatches.tsx](../apps/web/components/admin/platform-mismatches.tsx)
      in «Segnalati», testi. Una riga per gioco; «Va bene così» vale per le
      piattaforme della riga. In locale, dopo il test da zero: 12 giochi (Steam,
      GOG, Epic, Nintendo), nessun PSN né Amazon
- [x] roadmap: voce `wrongPlatform` «in corso» (`roadmap.ts`, `it.json`,
      `en.json`)
- [x] `docs/import-librerie.md` e `docs/negozi.md`: la regola 3, la lista, e
      perché PS3 e PC mancano rispetto a Playnite
- [x] il riempimento delle piattaforme nella spazzata dell'enrichment (ogni
      sei ore, `worker.ts`): dopo il deploy non serve lanciare
      `igdb:platforms`, e a regime è una query che non trova niente
- [ ] correzioni a mano, in locale e sul mini PC
- [x] VR, la parte di questo lotto (decisione dell'utente, 14/10/2026): le
      piattaforme nell'elenco, migration
      [0053](../packages/db/drizzle/0053_vr_platforms.sql) con PS VR (165), PS
      VR2 (390), SteamVR (163) e, per il Meta Quest Store in roadmap, Oculus
      Quest (384), Meta Quest 2 (386), Meta Quest 3 (471) e Oculus Rift (385)
- [ ] VR, lotto a parte: l'import mette sul visore i giochi solo VR, e sposta
      una volta le copie già scritte (4 in locale)

## Verifica

`pnpm --filter api test`, `pnpm check-types`, `pnpm lint`. Un reimport non
basta a vedere la regola, perché i collegamenti scritti vincono: la prova sui
casi veri è la misura rifatta col codice nuovo. La lista si verifica in locale:
dopo l'arnese, i 6 errori della misura PSN ci sono, i giochi VR no.
