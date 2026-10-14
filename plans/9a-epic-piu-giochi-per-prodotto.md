# 9a — Epic: più giochi nello stesso prodotto

Correzione dell'import Epic nata dal confronto con l'export di Playnite del
14/10/2026 (`202608_playnite_epic.csv`).

## Il problema

L'import Epic tiene **un gioco per `productId`** (`pickEpicGames` in
[`external/epic.ts`](../apps/api/src/external/epic.ts)): è l'id che scrive in
`external_ids`, e serviva a far collassare un gioco e i suoi DLC in una riga
sola. Ma un prodotto Epic può contenere più voci che il catalogo chiama
`games`, e l'import ne tiene la **prima che arriva** e butta le altre **senza
dirlo**.

Misurato sulla libreria dell'utente (717 prodotti-gioco): **23 prodotti** hanno
più voci `games` distinte, **37 voci in più**:

| Cosa sono            | Quante | Esempi                                                                                                                                       |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| giochi a sé          | 3–4    | Delores (in Thimbleweed Park), Telltale Batman Season 2, HITMAN 1 Complete First Season (in HITMAN 3), forse Ethan Carter accanto alla Redux |
| beta e rami di prova | 7      | Barony (Beta), Galactic Civilizations III (Test branch), Chivalry 2 - Public Testing, MythForce PTR                                          |
| DLC ed espansioni    | ~12    | AMAZONS (TROY), Map Pack (Tropico 5), Control Expansion 2 AWE, Dying Light The Following                                                     |
| extra                | ~8     | colonne sonore, sfondi, art book, Glove Skin                                                                                                 |
| strumenti            | 6      | Football Manager Editor e Resource Archiver                                                                                                  |

Due difetti, non uno:

1. **I giochi a sé si perdono.** Delores e Batman Season 2 nella libreria Epic
   hanno un posto loro, in ludex non compaiono e niente lo dice.
2. **La voce principale è a caso.** «La prima che arriva» dipende dall'ordine
   di Epic. Sul mini PC, import da zero: TROY è entrato come «AMAZONS» e la
   ricerca per nome l'ha agganciato ad _Amazon_; Tropico 5 come «Map Pack» e
   Chivalry 2 come «Chivalry 2 - Public Testing», finiti negli scarti. In
   locale erano giusti solo perché il collegamento c'era già.

**Il catalogo non distingue un gioco a sé dal resto.** Verificati categorie,
`sandboxType`, `unsearchable`, `applicationId`, `customAttributes`, date: una
colonna sonora è `games` come Delores. Importarle tutte in automatico vorrebbe
dire una trentina di voci spazzatura per tre o quattro giochi, e alcune
(«AMAZONS», «Map Pack») si aggancerebbero per nome a giochi sbagliati. Scartato.

## La decisione

Si replica la libreria Epic: le beta si possono saltare, un doppione va bene,
**una voce che sparisce senza dirlo no**.

### 1. La voce principale, con una regola

Fra le voci `games` dello stesso prodotto, in ordine:

1. la **acquistata per prima** (il DLC si compra dopo: AMAZONS 26/09/2020, TROY
   13/08/2020);
2. a pari data, quella il cui **titolo è l'inizio degli altri** («Chivalry 2» in
   «Chivalry 2 - Public Testing», «Football Manager 2024» in «… Resource
   archiver»), confrontati senza spazi né punteggiatura;
3. quella che il catalogo segna come gioco da avviare (`PresenceId` fra i
   `customAttributes`): Tropico 5 sì, Map Pack no;
4. il titolo più corto, poi il `catalogItemId`, perché la scelta sia stabile.

Sui 23 prodotti dell'utente: **23 giusti**, misurato con `pickEpicGames` vero
sulla libreria e sul catalogo scaricati il 14/10/2026. Una prima prova
guardava il solo giorno d'acquisto e sbagliava HITMAN («HITMAN 1 GOTY Upgrade»
invece di «HITMAN 3», stesso giorno): con l'ora è giusto. Provata su una
libreria sola: su altre ne sbaglierà qualcuno, e quelli si vedono al punto 3.

La voce principale tiene il `productId` come id, quindi i collegamenti che
esistono non cambiano. Un collegamento già scritto vince sul nome: TROY →
Amazon sul mini PC va corretto a mano dall'admin. Gli scarti invece si
ricercano per nome a ogni import, quindi «Map Pack» e «Public Testing»
tornano come «Tropico 5» e «Chivalry 2» e si risolvono da soli.

### 2. Le altre voci del prodotto, negli scarti

Le altre voci `games` del prodotto escono dall'import Epic come voci proprie,
con il **`catalogItemId`** come id e il `productId` della principale accanto.

- **Niente ricerca per nome** per queste: è quella che farebbe di «AMAZONS»
  _Amazon_. Si riconoscono solo per id, cioè se qualcuno le ha già risolte.
- Non riconosciute, vanno in `unresolved_imports` con il prodotto di
  provenienza (colonna nuova, nullable).
- Risolta a mano — «è un gioco a sé» — diventa un collegamento
  `epic` + `catalogItemId` in `external_ids` e una copia, come ogni scarto.
  Al reimport è riconosciuta per id.
- Nascosta, resta nascosta ai reimport, con i motivi che ci sono già:
  `prerelease` per le beta, `dlc`, `extra`, `app` per gli strumenti.

### 3. Dove si vede

In **account → da sistemare**, due tab: «Non riconosciute» (la lista di oggi)
e **«Possibili doppioni»**, ciascuna col suo numero; il totale in alto le
comprende. La tab nuova si vede solo se ha almeno una voce. Una scheda per
prodotto:

- in testa il gioco che ludex ha importato, col link alla sua pagina in ludex;
  se non è collegato (import da zero, voce fra le «Non riconosciute»), il
  titolo del negozio senza link;
- sotto, le altre voci del prodotto, con copertina, titolo e data d'acquisto;
- per voce: «È un gioco a sé» (il «Collega» di oggi, ricerca IGDB) e
  «Nascondi ▾», coi motivi di oggi;
- per scheda: **«Nascondi tutte ▾»**, un motivo solo per tutte le voci (le
  quattro voci extra di Death Stranding). La scheda sparisce quando tutte le
  voci sono sistemate.
- **«Cerca su Epic ↗»**, una ricerca nel negozio col titolo: l'indirizzo della
  pagina del prodotto né la libreria né il catalogo lo danno (14/10/2026,
  campi di Thimbleweed Park e Delores letti per intero), come già in admin.
  **Il link vero va preso da IGDB** (decisione dell'utente, 14/10/2026): i
  `websites` del gioco principale, che portano la pagina Epic. È il lavoro dei
  «link della pagina del gioco», il prossimo in
  [ordine-sviluppo](../docs/ordine-sviluppo.md); fino ad allora resta la
  ricerca.

Sulla libreria dell'utente sono 37 voci in 23 prodotti da guardare una volta;
poi compaiono solo le nuove.

Wireframe:
[`9a-epic-piu-giochi-per-prodotto.excalidraw`](9a-epic-piu-giochi-per-prodotto.excalidraw),
partito dallo screenshot di «da sistemare» e «Nascosti» del 14/10/2026.

## Passi

- [x] la regola della voce principale in `pickEpicGames`, con i test sui casi
      veri (TROY/AMAZONS, Tropico 5/Map Pack, Chivalry 2, Barony, Batman)
- [x] screenshot di «da sistemare» e wireframe della tab; struttura approvata
      (14/10/2026: «Possibili doppioni», con «Nascondi tutte»)
- [x] le altre voci del prodotto: `fetchEpicLibrary` le restituisce, l'import
      non le cerca per nome, colonna del prodotto in `unresolved_imports` +
      migration (`pnpm db:generate`)
- [x] test: voce in più negli scarti, risolta e riconosciuta al reimport,
      nascosta e rimasta nascosta, nessuna ricerca per nome
- [x] la tab in «da sistemare», contracts e messaggi; «Nascondi tutte» manda
      una richiesta per voce, senza una procedura nuova
- [x] `docs/negozi.md`: i prodotti con più giochi, e Dark and Darker che la
      libreria non restituisce

## Verifica

`pnpm --filter api test`, `pnpm check-types`, `pnpm lint`. In locale: reimport
Epic, e Delores e Batman Season 2 compaiono nella tab. Sul mini PC: deploy,
reimport, Tropico 5 e Chivalry 2 escono dagli scarti; TROY → Amazon corretto
a mano dall'admin.

Misurato in locale il 14/10/2026, ripassando all'import vero la libreria e il
catalogo scaricati quel giorno (nessuna chiamata a Epic): 754 voci, 713 giochi
collegati, 41 scarti, cioè le 4 voci non riconosciute di prima più le 37 voci
in più. In «da sistemare» 70 voci, di cui 37 possibili doppioni in 23 prodotti.
