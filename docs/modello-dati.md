# Modello dati

Parte della documentazione in `docs/`, spostata dal CLAUDE.md della radice. Gli altri file: [modello-dati](modello-dati.md), [import-librerie](import-librerie.md), [negozi](negozi.md), [ordine-sviluppo](ordine-sviluppo.md), [scelte-scartate](scelte-scartate.md).

`games` contiene il gioco e i suoi embedding. `backlog` contiene possesso, stato e
`userId`. Il filtro per utente si fa con una **JOIN `backlog` → `games`**, mai
mettendo `userId` su `games`.

## `games` è condiviso tra tutti gli utenti

Se l'utente 2 importa un gioco già presente, **riusa la riga esistente**: il costo
di enrichment si paga una volta sola. È il vantaggio che cresce col numero di
utenti, e vincola l'identità dei giochi:

- `games` ha un UUID interno e **`igdbId` come chiave esterna canonica** (unique).
- `external_ids` (`gameId`, `source`, `externalId`) mappa Steam appid, GOG, PSN,
  Xbox… **tutti sulla stessa riga `games`**. Ogni nuova libreria importabile
  aggiunge righe qui, non colonne a `games`.

Flusso di risoluzione, all'inserimento (manuale o da import):

1. cerca in `games`; se c'è, collega e usa i dati esistenti
2. se non c'è, cerca su IGDB
3. se il risultato è ambiguo, **mostra all'utente una lista di scelta**

Un gioco senza `igdbId` è quindi semplicemente un gioco non ancora risolto:
**nessuna query può assumere che i metadata siano popolati**.

### Che cos'è la scheda: `game_type`

IGDB non indicizza solo giochi: la stessa tabella tiene DLC, espansioni,
bundle, remaster e port, e un import che aggancia per nome può benissimo
prendere la scheda del DLC. In lista quel DLC è identico a un gioco, e da fuori
non c'è modo di accorgersene.

Quindi `games` porta **`game_type`** — un insieme chiuso in `gameTypeValues`,
tradotto dai numeri di IGDB in un punto solo (`gameTypeFromIgdb`) — e
**`parent_igdb_id`**, il gioco a cui un DLC è attaccato. Tre cose da tenere
insieme:

- **è un dato, non una preferenza.** Che sia un DLC lo dice IGDB; che non lo si
  voglia vedere lo dice l'utente, ed è `backlog.hidden_at`. Non vanno confusi.
- **`main_game` è esplicito, null vuol dire «non lo so»**: un gioco non ancora
  arricchito, o un tipo che IGDB ha aggiunto dopo di noi. La UI non mostra
  niente in nessuno dei due casi.
- **l'id del padre è quello di IGDB, non il nostro UUID**: il gioco padre può
  non essere ancora in `games`, e una FK verso una riga che non c'è impedirebbe
  di scrivere il figlio.

Nessuno nasconde né esclude i DLC da solo: un'espansione come *Phantom Liberty*
si gioca eccome. Il tipo si **mostra** — un badge accanto al titolo quando non è
un gioco principale — e si **filtra**, ma nessun filtro è acceso di default.

Il filtro è in **OR**, come lo stato e al contrario di tutto il resto del
pannello: una riga ha esattamente un tipo, quindi l'AND darebbe sempre zero. E
un gioco **senza** tipo non risponde a nessuna spunta, perché null vuol dire
«non lo so» e non «è un gioco»: senza filtro c'è, con «Gioco» spuntato no. È la
stessa regola dei NULL che vale per la durata.

Allo step 13 il tipo dirà se un DLC è un candidato a sé o solo insieme al suo
gioco.

## `backlog` = possesso

Se esiste la riga in `backlog`, l'utente possiede il gioco. Punto: nessun flag di
possesso. Conseguenze:

- **una riga per gioco/utente**, con stato e valutazione. I possessi stanno in una
  **tabella a parte** collegata a `backlog`, così stato e voto non si duplicano.
  Ogni riga è `(backlog, piattaforma, store)`: **piattaforma e store sono campi
  distinti** — su PC lo stesso gioco può stare su Steam _e_ GOG. La piattaforma è
  il filtro hard ("stasera ho la Switch accesa"), lo store dice da dove lanciarlo
  e da quale import proviene, e può restare vuoto sugli inserimenti manuali.
- **la wishlist è una tabella separata**, non giochi "non posseduti" dentro
  `backlog`. Così ogni query su `backlog` resta semplice. Comprato il gioco, la
  riga migra. Anche i giochi in wishlist puntano a `games` e vanno arricchiti:
  durata e voti servono _prima_ dell'acquisto. È lo **step 15**.
- **stato**: `backlog` / `playing` / `played` / `completed` / `dropped` /
  `excluded`. `completed` è il 100%, il platinato: `played` resta «finito», e
  «completato» dice di più (12d). Lo sceglie solo l'utente: dedurlo dai trofei
  PSN è un'altra storia. `excluded` ("non voglio giocarlo") è uno stato, non una
  tabella: è un segnale negativo esplicito e allo step 13 vale più di molte
  valutazioni positive.

## I voti della critica stanno in `game_scores`, non su `games`

Sono tre numeri diversi — IGDB, OpenCritic, Metacritic — e uno di loro **dipende
dalla piattaforma**. Il numero che Metacritic pubblica come voto del gioco è
quello della piattaforma capofila, non una media:

    mafia   titolo 66   PC 88 (27 rec.)   Xbox 66 (33 rec., capofila)

Il gioco che uno ha su PC vale 88 e il numero di testa dice 66. Una colonna su
`games` — che è condivisa fra tutti gli utenti e non sa su cosa si gioca —
avrebbe dovuto scegliere quale delle due bugie raccontare.

Quindi: una riga per `(gioco, fonte, piattaforma)`, con **`platform_slug` nullo
a significare il voto complessivo** — l'unico che IGDB e OpenCritic danno. Le
colonne sono l'**unione** di ciò che le fonti danno, non l'intersezione: `tier`
e `percentRecommended` esistono solo su OpenCritic, i conteggi
positivi/neutri/negativi solo su Metacritic. "Il 97% dei critici lo consiglia"
dice una cosa che "vale 89" non dice, e allo step 13 pesa.

Su `games` resta il **denormalizzato**: `critic_score` e `critic_score_source`,
ricalcolati **nella stessa transazione** di ogni scrittura di `game_scores`
secondo una precedenza scritta in un punto solo — OpenCritic → Metacritic →
IGDB, che è un ordine di trasparenza su come i voti sono aggregati, non di
qualità. Serve allo step 7: il filtro "sopra 80" resta un confronto su una
colonna indicizzabile invece di tre sottoquery correlate nella query di ricerca.

Il voto **non si traduce e non si media fra fonti**: OpenCritic pesa i critici
di punta e sta sistematicamente qualche punto sotto Metacritic. La scheda del
gioco li mostra tutti, con la fonte accanto.

E non si media nemmeno **dentro** la stessa fonte, perché capita che una fonte si
contraddica: su *Alien Breed* la stessa pagina Metacritic elenca due volte
`playstation-vita`, stesso nome e stesse nove recensioni, con voti diversi (64 e
68). Quella piattaforma si **scarta**, il resto della scheda si scrive. È la
stessa regola del giudice dei titoli — davanti a due candidati appaiati non si
sceglie — e le alternative sono peggiori: mediarli darebbe un 66 che nessuno ha
pubblicato, tenere il primo lascerebbe decidere all'ordine del loro JSON. Un
doppione *identico* invece non è una contraddizione: si tiene una riga sola.

La deduplicazione è obbligatoria, non un'accortezza: Postgres rifiuta una
`ON CONFLICT DO UPDATE` che tocchi la stessa riga due volte nello stesso comando,
quindi senza, quel gioco resta senza **nessun** voto — complessivo compreso — e
la spazzata ci riprova per sempre.

## Due tassonomie separate, da non fondere

- **generi e temi IGDB**: attributi del gioco, stanno su `games`, alimentano filtri
  ed embedding.
- **tag e categorie personali dell'utente** ("da rigiocare", "quando sono
  stanco"): scoped per utente, stanno lato `backlog`. Arrivati allo **step 5**,
  in `user_tags` (una tabella sola, distinta da `kind: tag | category`) più il
  raccordo `backlog_tags`. I **valori** li inventa l'utente, quanti ne vuole; ciò
  che è chiuso è l'insieme dei **campi** — l'utente non aggiunge un attributo suo
  con un valore arbitrario — e per questo niente JSONB e niente EAV. Il confronto
  sul nome è insensibile alle maiuscole, o "Da rigiocare" e "da rigiocare"
  spaccherebbero in due lo stesso mucchio.

  Il vocabolario è **per utente, non condiviso**, al contrario di `games`. Lì si
  condivide perché l'enrichment costa e va pagato una volta sola; un tag non
  costa niente da creare, quindi l'unico guadagno sarebbe suggerire agli altri le
  proprie parole — e in cambio rinominarne una o cancellarla diventerebbe un
  gesto che tocca la libreria di sconosciuti, con una moderazione da inventare.
  L'elenco è anche intimo ("da giocare con mia figlia"), e in una lista da
  spuntare lo si rilegge tutto ogni volta.

  Togliere la spunta e cancellare sono due gesti diversi: il primo stacca il tag
  da quel gioco e lo lascia nel vocabolario — se sparisse all'ultimo utilizzo la
  lista si svuoterebbe da sé — il secondo lo toglie **da tutti i giochi**, per
  cascade sul raccordo, ed esiste perché altrimenti un refuso resterebbe nella
  lista per sempre.
