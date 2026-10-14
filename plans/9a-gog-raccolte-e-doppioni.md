# 9a — GOG: voci finite su una raccolta e voci che si fondono

Correzione dell'import nata dal confronto con l'export di Playnite del
14/10/2026 (`202608_playnite_gog.csv`), sulla scia di
[9a-epic-piu-giochi-per-prodotto](9a-epic-piu-giochi-per-prodotto.md).

## Il problema

ludex mostrava **436** giochi GOG, Playnite **439**. Locale e mini PC uguali.

| Passaggio                                                                                       | ludex | Playnite |
| ----------------------------------------------------------------------------------------------- | ----- | -------- |
| Voci nella libreria GOG                                                                         | 445   | —        |
| − voci che Playnite non importa (Overload Playable Teaser, Hello Neighbor Alpha, REDkit, extra) |       | **439**  |
| − 6 non riconosciute (4 pacchetti di extra, REDkit, Hello Neighbor Alpha)                       | 439   |          |
| − 3 voci fuse sul gioco di un'altra                                                             | 436   |          |

Le tre voci perse **non sono doppioni**: due voci GOG finiscono sullo stesso
gioco, la copia è una sola (vincolo unique di `ownerships`) e la seconda
sparisce **senza dirlo**. Due cause:

1. **IGDB collega l'id GOG di un gioco singolo a una raccolta** (`game_type`
   `bundle`). GOG li vende come raccolta ma in libreria li mostra separati:
   - Alone in the Dark 1 e 2 → _Alone in the Dark: The Trilogy 1+2+3_ (il 3
     invece è collegato al gioco singolo);
   - Hillsfar e Pools of Darkness → _Forgotten Realms: The Archives -
     Collection Two_.

   Lo stesso errore senza fusione, quindi invisibile al conteggio: _War of the
   Lance_ → _Silver Box Classics_, _Metro 2033 Redux_ → _Metro Redux_.

2. **Il nome tagliato aggancia un altro prodotto.** _Legend of Keepers:
   Prologue_, una demo alfa gratuita, IGDB non ce l'ha: `searchWithFallback`
   riprova col titolo tagliato ai due punti, «Legend of Keepers», trova il
   gioco completo con titolo identico e lo prende. Si fonde con _Legend of
   Keepers: Career of a Dungeon Manager_.

Le altre 56 voci GOG ed Epic collegate a una raccolta sono giuste: il prodotto
è davvero l'edizione completa (GOTY, Definitive, Complete).

### Misurato e lasciato fuori

**I seguiti col numero diverso.** Il matcher ha collegato per nome _Nioh: The
Complete Edition_ (Epic) a _Nioh 2: The Complete Edition_: confronta le coppie
di lettere, e il «The» che IGDB scrive solo su Nioh 2 pesa più del «2» (0,96
contro 0,91). Cercati su tutte le 1154 voci col titolo del negozio (439 GOG,
715 Epic) i titoli col numero diverso dal gioco: 15, e **un solo errore del
matcher di oggi**, Nioh. Non vale toccare un matcher che usano anche HLTB e
Metacritic: Nioh si corregge a mano. Gli altri negozi non hanno ancora il
titolo salvato e non si misurano.

**I collegamenti sbagliati del vecchio bug Epic** (una voce a caso del
prodotto): _Torchlight II_ → _Alabaster_, _Dragon Age: Inquisition GOTY_ →
_Dragon Age II_. Il matcher di oggi li risolve giusti, ma vince il
collegamento già scritto.

## La decisione

La libreria del negozio è la verità: **una voce della libreria è una scheda**,
come nella libreria GOG. Una regola per tutti, non casi speciali.

### Regola 1 — una voce non diventa una raccolta di IGDB

Quando una voce è collegata per id a un gioco `bundle`, l'import cerca anche
per nome il titolo del negozio (`resolveByName`, il matcher di oggi):

| Il nome trova…               | La voce va                |
| ---------------------------- | ------------------------- |
| la raccolta stessa           | sulla raccolta            |
| con sicurezza un altro gioco | su quel gioco             |
| niente                       | fra le «Non riconosciute» |

Si applica ai collegamenti **nuovi** e a quelli **già noti ma senza titolo del
negozio** (`store_title` nullo): sono quelli portati dall'enrichment IGDB, che
nessuna libreria ha confermato. Se la raccolta è stata arricchita prima che
qualcuno importasse AitD 1, l'id GOG di AitD 1 c'è già, collegato alla
raccolta. I collegamenti **col titolo** restano intoccabili: vince il già
scritto, come per TROY su Epic.

Confermato vuol dire anche **con una copia di quell'account sul gioco**,
aggiunto mentre lo si scriveva: Steam, Amazon e PSN il titolo non ce l'hanno
ancora su nessun collegamento, eppure vengono da import veri, e sul database
locale sono 56 raccolte possedute. Senza, il loro primo reimport le avrebbe
riverificate tutte. Da zero nessuna copia c'è, e la regola vale. I collegamenti
che la regola smentisce si cancellano: lasciati lì, lo scarto risolto a mano
troverebbe il posto occupato (`onConflictDoNothing`).

Misurato sulle 61 voci collegate oggi a una raccolta (ricerca IGDB, nessuna
scrittura):

- **cambiano gioco** 5: AitD 1 (1956), AitD 2 (1957), Pools of Darkness
  (12761), War of the Lance (50494), Metro 2033 Redux (80853);
- **fra le «Non riconosciute»** 9: Hillsfar, giusto, e 8 oggi accettabili —
  Mafia II (Classic), Quake II (Original), The Witcher 3 Remastered, Tomb
  Raider GOTY, Tomb Raider I-III (GOG ed Epic), XCOM Complete Pack, Telltale
  Batman Season 1. È il costo del primo utente che le importa: collegate una
  volta, valgono per tutti. Scartata una soglia di somiglianza fra voce e
  raccolta (Hillsfar 0,12, le altre 0,46–0,78): tarata su un caso solo;
- le altre 47 restano dove sono.

**La verifica per nome si fa senza l'anno del negozio**, corretto dopo il test
da zero. GOG data il gioco originale, IGDB la raccolta quando è uscita:
_Shadow Warrior Classic Complete_ è 1997 su GOG e 2012 su IGDB, e la penalità
dell'anno affondava la raccolta giusta, finita negli scarti. Misurato con e
senza sulle 41 voci GOG collegate per id a una raccolta (libreria letta di
nuovo, IGDB, nessuna scrittura): cambiano 3 esiti, e senza anno sono giusti
tutti e tre (decisione dell'utente, 14/10/2026):

| Voce                                  | Con l'anno                    | Senza anno             |
| ------------------------------------- | ----------------------------- | ---------------------- |
| Shadow Warrior Classic Complete       | scarti                        | **raccolta**           |
| DOOM 3                                | Doom 3 rifatto (2012, 260028) | **Doom 3 (2004, 280)** |
| The Witcher 3: Wild Hunt — Remastered | The Witcher 3 (1942)          | **scarti**             |

DOOM 3 è come AitD: il negozio vende la riedizione con le espansioni, la
libreria GOG mostra il gioco. The Witcher 3 è un caso a sé: la Remastered ha
sostituito l'originale per chi l'aveva comprato prima di ottobre 2026, su tutti
i negozi, e si collega a mano.

Scartata una conferma «titolo identico alla raccolta → resta lì senza
cercare»: avrebbe tenuto DOOM 3 sulla raccolta.

### Regola 2 — una voce trovata per nome sul gioco di un'altra → «Possibili doppioni»

Una voce risolta **per nome** che finisce sul gioco di un'altra voce dello
stesso account, sulla stessa piattaforma e sullo stesso supporto (la chiave
della copia): va negli scarti con l'altra accanto (`same_product_as`), come le
voci in più di un prodotto Epic, e il suo collegamento **non si scrive** in
`external_ids`. Compare nella tab «Possibili doppioni», dove si nasconde (il
Prologue come `prerelease`) o si collega come gioco a sé.

**Solo per nome**, ristretta mentre la si scriveva (14/10/2026): due test Steam
fissano apposta che due appid che IGDB dà per lo stesso gioco restano una copia
con le ore sommate (447 appid per 445 giochi sulla libreria vera), e che un
appid proprio e uno della famiglia sullo stesso gioco sono una copia comprata.
Lì a dirlo è IGDB; a prendere un prodotto per un altro è il nome. Il caso che
motiva la regola, il Prologue, è per nome.

La principale è una voce risolta per id, se c'è; fra voci tutte per nome, la
acquistata per prima (GOG ha `acquiredAt`), poi l'id. Una voce per nome non è
mai già in `external_ids`, quindi i collegamenti scritti non li tocca.

Il cross-buy PS4/PS5 e disco più digitale non scattano: sono due copie. Su
GOG ed Epic la regola prende solo il Prologue.

### La tab

La scheda resta quella di Epic: in testa il gioco, sotto le altre voci. Cambia
**il testo**, che oggi parla di «prodotto Epic»: descrizione della tab e
riga sopra le voci diventano generici («più voci della libreria sono finite
sullo stesso gioco»). Nessun wireframe: la struttura non cambia.

## Il test da zero, in locale

1. [x] backup del database locale (`pg_dump`, dell'utente)
2. [x] GOG ed Epic scollegati togliendo anche i giochi (`purge`)
3. [x] `delete from external_ids where source in ('gog', 'epic')`: 1295 GOG
       e 719 Epic. Le righe di `games` restano
4. [x] ricollegati GOG ed Epic e importati; confronto con Playnite

Atteso: AitD 1 e 2, Pools of Darkness, War of the Lance e Metro 2033
come giochi a sé; Hillsfar e le 8 voci di sopra fra le «Non riconosciute»; il
Prologue fra i «Possibili doppioni». Su Epic, rispetto a prima: Torchlight II e Dragon Age: Inquisition giusti (il matcher di oggi), Nioh ancora su Nioh 2, Tomb Raider I-III e Telltale Batman fra le «Non riconosciute».

Esito (14/10/2026), dato per buono dall'utente:

- **GOG**: 445 voci, 430 collegate su 429 giochi (Mafia II Classic collegata a
  mano alla Definitive), 14 «Non riconosciute», 1 «Possibile doppione» (il
  Prologue). Contro i 439 di Playnite: 8 giochi veri fra le non riconosciute,
  il Prologue, Mafia II; Overload Playable Teaser solo in ludex, Warhammer
  Skulls solo in Playnite (in ludex fra le non riconosciute, giusto). Tutti i
  casi attesi tornano. Fuori dall'atteso: _Shadow Warrior Classic Complete_
  negli scarti per l'anno (corretto, vedi la regola 1); _Daggerfall Unity –
  GOG Cut_ e _Dragons of Flame_ negli scarti, ma né per id né per nome si
  trovano: è il matcher di oggi, non le regole.
- **Epic**: 754 voci, 673 collegate, 43 «Non riconosciute», 38 «Possibili
  doppioni»: le 37 voci in più dei prodotti più **Aiko's Choice**, che Epic
  chiama col nome del gioco base e che la regola 2 ora prende invece di
  fonderla con Shadow Tactics. Le 43 non dipendono dalle regole (su Epic la 1
  non scatta, la 2 dà solo doppioni): prima erano 4 grazie ai collegamenti
  fatti a mano o da import vecchi, cancellati per il test.

## Il mini PC, a mano

Dopo il deploy, dall'admin con «Non è questo gioco», perché i collegamenti col
titolo del negozio le regole non li toccano:

| Voce                                                                                                            | Gioco giusto (IGDB)                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Alone in the Dark 1                                                                                             | 1956                                                          |
| Alone in the Dark 2                                                                                             | 1957                                                          |
| Pools of Darkness                                                                                               | 12761                                                         |
| Hillsfar                                                                                                        | 8622                                                          |
| War of the Lance                                                                                                | 50494                                                         |
| Metro 2033 Redux                                                                                                | 80853                                                         |
| DOOM 3                                                                                                          | 280                                                           |
| The Witcher 3: Wild Hunt — Remastered, id `1495134320` (il prodotto GOTY; l'altro, `1207664643`, resta su 1942) | 415005, _The Witcher 3: Wild Hunt Remastered_, come in locale |
| Nioh: The Complete Edition (Epic)                                                                               | 68461                                                         |
| Torchlight II (Epic)                                                                                            | Torchlight II                                                 |
| Dragon Age: Inquisition GOTY (Epic)                                                                             | Dragon Age: Inquisition GOTY                                  |

Il Prologue resta fuso: il suo collegamento è scritto, e la regola 2 guarda
solo le voci trovate per nome in quell'import.

## Passi

- [x] questo piano
- [x] regola 1 nell'import, con i test: raccolta confermata, gioco diverso,
      nessun risultato, collegamento noto senza titolo, collegamento col titolo
      intoccato, collegamento senza titolo ma con una copia dell'account
- [x] regola 2 nell'import, con i test: voce in più negli scarti col
      `same_product_as`, nessun collegamento scritto, scelta della principale,
      due id sullo stesso gioco restano una copia, cross-buy non toccato
- [x] testi della tab resi generici e voce `gogCollections` «in corso» nella
      roadmap (`it.json`, `en.json`, `roadmap.ts`)
- [x] `docs/import-librerie.md` e `docs/negozi.md`: le due regole
- [x] test da zero in locale (sopra)
- [x] regola 1 senza l'anno del negozio, con il test su Shadow Warrior
- [ ] mini PC: deploy e correzioni a mano

## Verifica

`pnpm --filter api test`, `pnpm check-types`, `pnpm lint`. Poi il test da
zero: GOG torna a 439 voci, contate come Playnite.
