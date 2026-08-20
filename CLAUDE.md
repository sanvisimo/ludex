# CLAUDE.md

## Cos'è questo progetto

Game library manager multi-piattaforma. **Non è un tracker**: il cuore è un motore
decisionale che risponde a "cosa gioco adesso" in base a tempo disponibile,
piattaforma e mood. Ogni feature va valutata rispetto a questo obiettivo — se non
aiuta a decidere cosa giocare, è secondaria.

Nasce dall'assenza di un equivalente mobile di Playnite.

## Stack

- **Backend**: **Hono**, Drizzle ORM, PostgreSQL + pgvector
- **API layer**: **oRPC** — tipizzazione end-to-end tra backend e client, senza codegen
- **Auth**: **Better Auth**. Il suo core è un handler `fetch` standard, quindi su
  Hono si monta nativamente senza adapter. Vincolo fermo: gli utenti stanno **nel
  nostro Postgres** (per questo Clerk è escluso).
- **Job queue**: BullMQ + Redis
- **Web**: Next.js + React
- **Mobile**: Expo + React Native
- **Monorepo**: pnpm + Turborepo
- **LLM**: nessun provider vincolato (Anthropic, OpenAI, llama locale o altro). Il
  provider sta dietro un'interfaccia interna stretta, la scelta si fa allo step 12.

I due usi dell'LLM **non sono sostituibili allo stesso modo**:

- **Ragionamento**: provider intercambiabile a costo quasi nullo.
- **Embedding**: cambiarlo significa cambiare la dimensione della colonna vettoriale
  e **rigenerare gli embedding di tutta la tabella `games`**. Va quindi salvato
  accanto al vettore _quale modello l'ha prodotto_, così la migrazione resta
  gestibile. Nota: Anthropic non espone un endpoint di embeddings.

Tutto TypeScript/Node. Non introdurre altri linguaggi nello stack.

### Scelte già valutate e scartate

- **NestJS** (con adapter Fastify o Express): scartato in favore di Hono. La
  struttura che offre pesa più di quanto renda su un progetto portato avanti da una
  persona sola, e l'integrazione Better Auth su Nest + Fastify è in beta mentre su
  Hono è nativa.
- **Express**: scartato. Non dà nulla che Hono o Fastify non abbiano, ed è più
  lento e più debole su TypeScript.
- **tRPC**: era scartato perché si sovrapponeva a NestJS. Caduto NestJS, la
  motivazione decade: adottiamo **oRPC**, stessa categoria, con in più la
  compatibilità Web-standard e la generazione OpenAPI.
- **Fine-tuning per le raccomandazioni**: scartato in favore di RAG (vedi sotto).
- **Prisma al posto di Drizzle**: scartato. Prisma non ha un tipo scalare `vector`
  (solo `Unsupported`, escluso dal client tipizzato) e costringe a `$queryRaw` per
  la similarity search. La query di raccomandazione compone filtri hard _dinamici_
  - JOIN + ranking vettoriale: con Drizzle resta una singola query tipizzata, con
    Prisma diventa SQL costruito a stringhe. Non riproporlo.
- **Backend in Python** (FastAPI/SQLAlchemy): scartato. L'ecosistema ML di Python
  qui non verrebbe usato — gli embedding sono chiamate HTTP, la similarity search
  la esegue pgvector nel DB, il ragionamento è un'altra chiamata HTTP. In cambio si
  perderebbero i tipi condivisi con il frontend, che è vincolato a TypeScript.
  Eccezione ammessa: un microservizio Python isolato allo step 12 _solo_ se servissero
  modelli di embedding locali.

## Struttura del monorepo

| Workspace            | Contenuto                                                           |
| -------------------- | ------------------------------------------------------------------- |
| `apps/api`           | Hono. Contiene **due entrypoint**: server HTTP e worker BullMQ      |
| `apps/web`           | Next.js, applicazione web                                           |
| `apps/mobile`        | Expo / React Native                                                 |
| `packages/db`        | schema Drizzle + client, **unica fonte di verità**. Dipendenze Node |
| `packages/auth`      | istanza Better Auth (server) + `authClient` per web e mobile        |
| `packages/contracts` | router oRPC + schemi Zod condivisi                                  |

Regole di confine:

- **I job BullMQ non girano nel processo che serve le richieste HTTP.** Stesso
  codebase `apps/api`, due file di ingresso: `server.ts` avvia Hono, `worker.ts`
  crea i Worker BullMQ e non espone HTTP. Entrambi importano le stesse funzioni di
  servizio. Serve a scalare e deployare le due cose separatamente: uno scrape
  pesante non deve degradare le API. In sviluppo si lanciano insieme.
- **`apps/mobile` non importa mai `packages/db`**, o il driver Postgres finisce nel
  bundle React Native. Se serve un tipo derivato dallo schema, va ri-esportato come
  tipo puro da `packages/contracts`.
- **Web e mobile non condividono componenti UI.** Sono due app distinte con UI
  propria; si condividono solo tipi e client API. Non introdurre un layer di
  componenti cross-platform senza una decisione esplicita.

Da rimuovere quando si inizia: `apps/docs` e i componenti demo di `packages/ui`,
residui dello scaffold `create-turbo`.

## Fonti dati esterne

- **IGDB** — metadata primario
- **STEAMGRIDDB** — copertine alternative, per sostituire quella di IGDB. Arriva
  allo **step 5**, con la modifica del gioco: non serve prima, perché prima non
  c'è nessun posto da cui scegliere.
- **OpenCritic** — punteggi critica. Niente più accesso anonimo: si passa da
  RapidAPI, e il piano gratuito dà **200 richieste e 25 ricerche al giorno**,
  dichiarate negli header di ogni risposta. Le ricerche sono la risorsa scarsa,
  e per questo l'identità dei giochi **non si cerca**: vedi Wikidata.
- **Metacritic** — punteggi critica, **per piattaforma**. Nessuna API pubblica:
  stesso trattamento di HLTB, l'endpoint che usa il loro sito e il risultato
  sempre in DB. Lo slug si prende, quando c'è, dal link che la scheda Steam
  dichiara — ma va verificato come un candidato qualunque, perché mente
  (BioShock Remastered punta alla raccolta, Kingdom: Classic a un altro gioco).
- **Wikidata** — non è una fonte di dati, è un'**anagrafe di identificativi**:
  tiene sullo stesso item lo slug IGDB (P5794) e l'id OpenCritic (P2864). Una
  query SPARQL aggancia centinaia di giochi senza spendere una ricerca: sulla
  libreria di prova 262 su 446, e 180 su 228 fra i giochi dal 2016 in poi. Si
  interroga **in blocco e di rado**, mai dentro un job per gioco: il servizio è
  gratuito e ogni tanto è in affanno.
- **HowLongToBeat** — nessuna API ufficiale: scraping server-side (stesso approccio
  del plugin Playnite), risultati **sempre cachati in DB**. Mai scraping a runtime
  su richiesta utente. (ROMM gestisce le [API HLTB](https://github.com/rommapp/romm/blob/master/backend/handler/metadata/hltb_handler.py))

## Architettura del layer di raccomandazione

RAG, non fine-tuning. Il prompt si costruisce a runtime interrogando il DB
(profilo utente + backlog + metadata arricchiti).

Divisione delle responsabilità — è la regola più importante del progetto:

| Livello       | Responsabilità                                             |
| ------------- | ---------------------------------------------------------- |
| SQL           | filtri hard (`userId`, stato backlog, piattaforma, durata) |
| Vector search | ranking semantico sui candidati                            |
| LLM           | ragionamento contestuale sul set risultante                |

Non spostare i filtri hard nel vector search e non delegare all'LLM lavoro che
SQL può fare in modo deterministico.

### Embedding

- Vivono sulla tabella **`games`**, non su `backlog`.
- Generati come job BullMQ combinando IGDB + OpenCritic + HLTB. Mai a query time.
- L'enrichment è **per singola fonte e idempotente**, non un job monolitico: le
  fonti arrivano in step diversi (IGDB allo step 3, HLTB allo step 6) e i dati
  vanno riaggiornati nel tempo. Quando una fonte nuova popola un gioco già
  presente, **l'embedding va rigenerato**.
- «Da riarricchire» non vuol dire solo «mai arricchito»: la spazzata periodica
  deve pescare anche i giochi con `synced_at` più vecchio di una soglia **per
  fonte** (IGDB cambia spesso, HLTB pochissimo). Senza soglia la coda va in
  quiescenza appena tutto è sincronizzato una volta, e i dati invecchiano zitti.
- Un fallimento **definitivo** va distinto da uno temporaneo. Un `igdbId` che
  IGDB non conosce non riuscirà mai: la spazzata deve avere un tetto ai
  tentativi, o riaccoda per sempre lo stesso gioco irrisolvibile. I tentativi
  dentro un singolo job li governa BullMQ; questo è il livello sopra.
- «Definitivo» però non vuol dire eterno, ed è la parte che si scopre tardi: un
  `not_found` è definitivo **rispetto a ciò che sapevamo quando l'abbiamo
  scritto**. La spazzata giustamente non lo ripesca mai — quindi a riaprirlo
  dev'essere un **evento**, e l'evento è l'arrivo di un id nuovo in
  `external_ids`. Quando l'enrichment IGDB scrive l'appid Steam di un gioco che
  non ce l'aveva, HLTB e Metacritic vanno riaperti: è su quell'appid che
  entrambi verificano l'identità, e senza avevano solo il nome. OpenCritic no,
  lui l'appid non lo guarda. È lo stesso meccanismo che lo step 5 descrive per
  il ri-collegamento IGDB, con un secondo evento a innescarlo.
- A runtime si embedda **solo la query dell'utente** (stringa breve) per la
  similarity search.

### Modello dati

`games` contiene il gioco e i suoi embedding. `backlog` contiene possesso, stato e
`userId`. Il filtro per utente si fa con una **JOIN `backlog` → `games`**, mai
mettendo `userId` su `games`.

#### `games` è condiviso tra tutti gli utenti

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

#### `backlog` = possesso

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
  durata e voti servono _prima_ dell'acquisto. È lo **step 13**.
- **stato**: `backlog` / `playing` / `played` / `dropped` / `excluded`. `excluded`
  ("non voglio giocarlo") è uno stato, non una tabella: è un segnale negativo
  esplicito e allo step 12 vale più di molte valutazioni positive.

#### Import di librerie

Le librerie importate aggiungono tre cose al modello, decise allo step 4:

- **`store_accounts`**: l'account dell'utente su un negozio, uno per `(utente,
negozio)`. Non è una colonna su `user` perché `auth.ts` è generato e viene
  riscritto. Allo step 4 teneva solo l'identità pubblica dell'account, perché a
  Steam basta uno SteamID64; dallo step 9 tiene anche i token, e come sono fatti
  lo dice «Le altre librerie» qui sotto.
- **ore giocate su `ownerships`**, non su `backlog`: sono una proprietà di
  _quella copia_, e lo stesso gioco su GOG avrebbe le sue. Sono dato oggettivo
  del negozio, non un campo personale dello step 5. **Non si usano per indovinare
  lo stato**: due ore su un GDR da sessanta non vogliono dire "giocato", e
  `played` allo step 12 pesa.
- **`unresolved_imports`**: le voci che l'import non ha saputo legare a un gioco.
  Stanno lì e **non in `games` come righe non risolte**, perché `games` è
  condivisa fra tutti gli utenti: su una libreria vera gli scarti sono client
  beta e "Friend's Pass", e riversarli nel catalogo di tutti per un problema di
  uno è sbagliato. L'utente le vede e le risolve a mano.

Lato web tutto questo vive in **`/account`**: il collegamento (si incolla l'URL
del profilo, lo SteamID64 o il nome scelto — lo SteamID su Steam non è in vista
da nessuna parte), lo stato dell'import mentre gira, e la lista degli scarti da
sistemare o scartare. Che un import sia in corso si legge **dalla coda** e non da
`last_sync_at`, che al primo giro è ancora nullo e non avrebbe niente da dire.

L'ordine dei passi dell'import è esso stesso una regola: **prima il nostro DB**
(gli appid già in `external_ids` non costano niente), **poi IGDB** e solo per il
resto, in blocchi — su 452 giochi sono quattro richieste. Risoluzione ed
enrichment restano due cose distinte: la prima è sincrona e in blocco, il secondo
è un job per gioco.

#### Le altre librerie (step 9): il problema è il credenziale, non l'API

Steam è l'eccezione, non il modello: una chiave applicativa nostra, un profilo
pubblico, zero credenziali dell'utente. Nessun altro negozio funziona così.

Playnite li risolve tutti aprendo una webview, ma **la webview gli serve una
volta sola**: fatto il login tiene i cookie o i token su disco e da lì in poi usa
`HttpClient` normale, senza più aprire niente. Cioè l'**uso** è HTTP semplice
per tutti — un server lo fa identico. A dividerci da Playnite resta solo
l'**acquisizione**, perché una pagina web non può leggere l'URL né il corpo di
un'altra origine: è la same-origin policy, e non è aggirabile con un `iframe` o
un `window.open`.

La via d'uscita ovvia sarebbe un OAuth con `redirect_uri` nostro. **Non esiste, ed
è misurato**: GOG risponde `redirect_uri_mismatch` (dopo il login riuscito, quindi
non lo si scopre con un `curl`), Amazon risponde 404 a qualunque `openid.return_to`
fuori dai suoi domini. Sono i `client_id` dei loro launcher, con la lista dei
redirect già fissata. Non riproporlo.

Quindi: **l'utente incolla l'URL su cui è atterrato.** Si accetta l'URL intero e
non il codice estratto, come fa già `resolveSteamId` con il profilo Steam — qui
«incolla quello che hai sotto mano» è una convenzione, non un ripiego inventato
per l'occasione. È un gesto solo: da lì in poi il `refresh_token` rinnova da sé e
l'utente non lo rivede più.

Conseguenza di disegno da rispettare: **la mutazione che collega un account non
deve sapere chi le ha portato il codice.** Dal web lo incolla l'utente, da
`apps/mobile` una `WebView` nativa lo prenderà da sola, che è esattamente ciò che
fa Playnite. Se il collegamento viene disegnato *intorno* al copia-incolla, il
mobile poi lo trova incastrato.

`store_accounts` cresce di conseguenza: access token, refresh token, scadenza,
cifrati a riposo in **AES-256-GCM** con `STORE_TOKEN_KEY` (da dichiarare anche in
`globalEnv` dentro `turbo.json`), più uno stato esplicito «da ricollegare» —
perché quando il rinnovo fallisce non fallisce il job, fallisce l'utente, e
`/account` deve saperglielo dire.

Le due domande che decidono l'ordine sono **quanto dura il credenziale** e
**quanto costa risolvere l'identità**. Misurate su una libreria vera:

| Negozio | Credenziale | Id su IGDB | Ore |
| --------- | ------------------------------- | ------------------------------------------------- | --- |
| GOG | refresh token, non scade in pratica | product id, sorgente 5 — **94,5% su 435 giochi** | no |
| Epic | refresh token | **nessuno**: vedi sotto | no |
| Amazon | refresh token | **nessuno**: sorgente 23 ha 678 righe in tutto | no |
| PSN | refresh token da npsso, ~2 mesi | `conceptId` **è** l'uid della sorgente 36 | parziali |
| EA | sessione corta, si sgancia sempre | nessuno | sì |
| Nintendo | cookie di sessione | nessuno | no |
| Xbox | chiave OpenXBL, o XSTS in proprio | `titleId` → ProductId via `displaycatalog`, sorgente 11 | sì |

Dove l'id c'è l'import costa nulla: i 435 giochi GOG si risolvono in **tre**
richieste da 200 id, e il matcher per nome ne recupera altri 16, per un 98,2%
automatico e due sole scelte da fare a mano. Dove l'id non c'è si paga **una
ricerca IGDB per gioco**: Amazon sono 92 richieste per un 85,9%, Epic 705. Su
queste fonti gli scarti sono la regola, non l'angolo, e va messo un tetto ai
tentativi come già impone l'enrichment.

**Epic è il caso che inganna, e va scritto perché la trappola è ben nascosta.**
IGDB ha una sorgente Epic con diecimila righe, e i suoi uid hanno la stessa forma
degli id che il launcher restituisce — 32 esadecimali. Sono cose diverse: gli uid
di IGDB sono gli **offer id del negozio**, il launcher dà `catalogItemId`,
`namespace` e `productId`. Su una libreria vera nessuno dei tre trova niente,
**zero su 705**, misurato. In compenso il record di libreria porta già il titolo
in `sandboxName` — quindi niente chiamate al catalogo — e gioco e DLC
condividono il `productId`, che è ciò che li fa collassare: 836 voci diventano
705 giochi senza chiedere niente a nessuno.

Tre dettagli che si pagano se si scoprono tardi:

- **Amazon vive solo sul mercato americano.** `amzn1.adg` è registrato su
  `amazon.com` con `marketPlaceId=ATVPDKIKX0DER`; su `amazon.it` la stessa
  richiesta è un 404. Un account italiano si autentica benissimo lì, quindi il
  mercato si inchioda e non si parametrizza.
- **Amazon decora i titoli con l'edizione** (`- CE` per le Collector's Edition):
  nove dei tredici irrisolti sono quello. Toglierlo prima di cercare è una regola
  per `shortenTitle`, non un caso particolare.
- **GOG marca `isGame: true` anche i *goodies***, gli artbook e il REDkit di The
  Witcher 3. Non c'è un campo per filtrarli e non serve: cadono da soli negli
  irrisolti, che è dove devono stare.

La piattaforma resta **`pc_windows` fissa** su tutti i negozi PC, come per Steam,
e l'utente la corregge dalla schermata dello step 5. GOG dichiarerebbe anche
Mac e Linux in `worksOn`, ma sapere su cosa *girerebbe* non è sapere su cosa ci
giochi. Per le console la piattaforma la dice la fonte, riga per riga.

**Ubisoft Connect e Battle.net non si faranno mai**, ed è bene che sia scritto qui
perché sembrano possibili: Playnite li importa leggendo il file di cache del
client installato e il registro di Windows, non una API. Non c'è nessun
credenziale di rete da acquisire, da rinnovare o da cifrare — c'è un disco a cui
un server non è attaccato. Con Battle.net non c'è nemmeno il ripiego di un
endpoint pubblico: l'OAuth ufficiale di Blizzard esiste ma non espone la libreria
a nessuno.

Steam Family, quando si farà, **non porta credenziali nuove**: è lo stesso
`GetOwnedGames` chiamato su N SteamID64. Non è un problema di autenticazione: è
un problema di modello, e lo stesso di Xbox.

Che è la domanda lasciata aperta apposta, perché nessun negozio del 9a la pone:
**un gioco a cui puoi giocare stasera ma che non è tuo** — Game Pass, PS Plus, la
libreria di tuo fratello — sta in `backlog` o no? `backlog` oggi vuol dire
possesso, e non c'è una terza cosa. Si risponde quando si arriva alla famiglia o
allo Xbox, non prima, e la risposta decide `ownerships` — non si aggira
importando e sperando.

#### I voti della critica stanno in `game_scores`, non su `games`

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
dice una cosa che "vale 89" non dice, e allo step 12 pesa.

Su `games` resta il **denormalizzato**: `critic_score` e `critic_score_source`,
ricalcolati **nella stessa transazione** di ogni scrittura di `game_scores`
secondo una precedenza scritta in un punto solo — OpenCritic → Metacritic →
IGDB, che è un ordine di trasparenza su come i voti sono aggregati, non di
qualità. Serve allo step 7: il filtro "sopra 80" resta un confronto su una
colonna indicizzabile invece di tre sottoquery correlate nella query di ricerca.

Il voto **non si traduce e non si media fra fonti**: OpenCritic pesa i critici
di punta e sta sistematicamente qualche punto sotto Metacritic. La scheda del
gioco li mostra tutti, con la fonte accanto.

#### Due tassonomie separate, da non fondere

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

## Ordine di sviluppo

1. **Registrazione e auth**
2. **Inserimento manuale + prima UI web** — `backlog` con possesso, piattaforme e
   stato di completamento. Include la **ricerca IGDB** per scegliere il gioco da
   una lista, dato che il DB parte vuoto. **Niente voto, tag o categorie: sono lo
   step 5.**
3. **Recupero dati esterni** — l'**enrichment** vero e proprio: una fonte alla
   volta, IGDB per prima. Introduce la pipeline BullMQ e il worker.
4. **Import libreria Steam** — la prima libreria automatica. Riusa la pipeline
   dello step 3, che deve già esistere e reggere il volume. Porta con sé la
   scrittura idempotente dei possessi (`ensureOwnership`): un gioco già nel
   backlog, aggiunto a mano su un'altra piattaforma, deve prendersi il possesso
   `(pc, steam)` senza duplicare la riga di backlog né toccarne lo stato.
5. **Modifica del gioco** — le cose che hanno senso solo insieme, perché sono la
   stessa schermata:
   - **campi personali**: voto, note, tag e categorie. Il voto è da mezza stella
     a cinque, nullo finché non si vota — "non votato" non è "votato male". Le
     note sono l'unico testo libero ammesso, e proprio perché sono testo non
     diventano un campo su cui filtrare. Insieme **chiuso** di campi
     strutturati: l'utente non aggiunge un campo suo, i valori dei tag sì.
   - **possessi**: le mutazioni oRPC che espongono la scrittura già scritta allo
     step 4. Fino a qui l'unico modo di aggiungere una piattaforma era cancellare
     la riga e rifarla. **Solo aggiunta**: togliere un possesso non basta a farlo
     sparire, perché il prossimo import lo ricrea — prima serve una logica di
     scarto/nascondi, che è ancora da pensare.

   Due cose che si erano immaginate qui e stanno **fuori**, ciascuna perché è uno
   step suo e non un campo in più nel form:
   - **copertina da SteamGridDB**, per non subire quella di IGDB. Va deciso anche
     di chi è la scelta: `games` è condivisa fra tutti gli utenti, quindi o è un
     override per utente su `backlog`, o il primo che sceglie decide per tutti.
   - **ri-collegamento a IGDB**: correggere l'`igdbId` di un gioco risolto male, o
     collegarne uno inserito a mano che senza `igdbId` non verrà mai arricchito.
     Non è una modifica personale ed è più di una UPDATE: `games.igdbId` è unique,
     quindi se l'id di destinazione esiste già bisogna **fondere due righe
     `games`** — con i loro backlog, possessi ed `external_ids` — e le due righe
     di backlog dello stesso utente, decidendo quale stato, quale voto e quali tag
     sopravvivono. È anche l'evento che riapre un `game_sources` in `not_found`.

6. **Recupero HLTB**
7. **Filtraggio** — ricerca e filtraggio dei giochi, con possibilità di
   salvataggi.
8. **OpenCritic** — i voti della critica, e con loro **Metacritic**: sono la
   stessa schermata e lo stesso modello, e separarli avrebbe voluto dire
   scrivere due volte la stessa tabella. Porta `game_scores` (vedi sotto).
9.  **Altre librerie** — gli altri negozi, in cinque tempi. L'ordine non è per
    simpatia: è per quanto dura il credenziale e per quanto costa risolvere
    l'identità (vedi «Le altre librerie» sotto).
    - **9a — GOG, Epic, Amazon**: tutti PC, tutti un gesto solo che non si
      ripete. Qui si costruiscono i token cifrati, e la forma del provider si
      estrae da tre casi veri invece che da Steam più le ipotesi.
    - **9b — PSN**: prima console. Piattaforma per riga, possesso vero, id
      risolvibile.
    - **9c — EA**: non un account collegato ma un'**importazione una tantum**.
    - **9d — Nintendo**: barattolo di cookie, nessun id che IGDB conosca.
    - **9e — Xbox**: ciò che torna è «giocato», non «posseduto». Non si comincia
      prima di aver deciso cosa vuol dire — è la domanda in fondo a «Le altre
      librerie», e per ora è volutamente aperta.
10. **Import da file** — importazione di giochi da file CSV. 
11. **Admin** — dove finisce ciò che nessun automatismo ha saputo chiudere. Non
    è una cosa sola:
    - **giochi non collegati** (senza `igdbId`, quindi mai arricchiti) e gli
      **scarti d'import** rimasti in `unresolved_imports`.
    - **fonti in `not_found`**: il gioco è su IGDB, ma HLTB, OpenCritic o
      Metacritic non l'hanno trovato. È un mucchio a parte e molto più grande —
      sulla libreria di prova 455 righe contro 52 scarti d'import. Servono il
      ritentativo forzato e soprattutto **l'inserimento a mano dell'id
      esterno**: `game_sources.external_id` c'è già, e scritto lui il match non
      si rifà, si salta. È la valvola per ciò che nessuna euristica prenderà
      mai; l'alternativa è ritoccare le soglie del matcher finché non passa
      quel gioco lì, e romperne altri due.
    - **gestione degli utenti**.

    La riapertura *automatica* di un `not_found` non sta qui: è enrichment, e
    la sua regola sta scritta lassù. Qui c'è solo ciò che va deciso da un umano.
12. **Ui** — layout e design dell'applicazione. 
13. **AI** — layer di raccomandazione, scelta del provider LLM ed embedding. 
14. **Wishlist** — tabella separata da `backlog`, arricchita come i giochi
    posseduti.

Ricerca ed enrichment sono due usi distinti di IGDB e non vanno confusi: lo step 2
cerca e salva id e titolo, in modo sincrono e senza coda; lo step 3 scarica i
metadata completi in job asincroni.

Poi: mobile — che non è solo un'altra interfaccia, perché una `WebView` nativa
sblocca i negozi che dal web non si possono collegare (vedi «Le altre librerie»).

Non anticipare step successivi: se una feature appartiene allo step 12, non
implementarla mentre si lavora sull'1.

## Note operative

### Metodo di lavoro

Sempre in quest'ordine: **prima analisi, poi decisione, poi codice.**

Non scrivere né modificare codice prima di aver analizzato ciò che si sta per
toccare e aver concordato l'approccio. Vale anche per le modifiche che sembrano
banali: se non è stata analizzata, non si scrive.

In pratica: leggere il codice e il contesto esistente → esporre cosa si è trovato
e le opzioni → attendere la decisione → solo a quel punto implementare.

### Test

`pnpm test` (turbo) oppure `pnpm --filter api test`. Vitest, e **contro un Postgres
vero**: la logica che conta è fatta di upsert, vincoli unique e predicati con
LEFT JOIN, quindi mockare il DB testerebbe il mock. Le fonti esterne si stubbano
invece al confine del modulo di servizio — non su `fetch`, o ci si porta dietro il
rate limiter e il token in cache del client vero.

Il database è `ludex_test` (`TEST_DATABASE_URL`), nello stesso container. Lo crea
e lo migra il global setup, non serve prepararlo a mano; `test/env.ts` si rifiuta
di partire se punta allo stesso database dello sviluppo.

Tre cose del setup che non si indovinano rileggendolo:

- `DATABASE_URL` viene dirottata nel **config** di vitest, non in un setup file:
  `@repo/db` apre la connessione al momento dell'import, e qualunque altro punto
  sarebbe una corsa con gli import dei file di test.
- `platforms` è esclusa dal troncamento fra un caso e l'altro: è dato di
  riferimento seedato da una migration, e troncarlo lascerebbe un database rotto,
  non pulito. Ogni nuova tabella seedata va aggiunta a quella lista.
- `fileParallelism` è spento: i file condividono un database solo e si
  troncherebbero le tabelle a vicenda.

Niente inseguimento della copertura: si testano le scritture idempotenti e la
risoluzione dell'identità dei giochi, che sono le cose che rompendosi corrompono
dati condivisi fra tutti gli utenti.

### Ambiente

Node ≥ 24, pnpm 11, Docker. Primo avvio:

```bash
cp .env.example .env   # e genera BETTER_AUTH_SECRET con: openssl rand -base64 32
pnpm install
pnpm db:up             # Postgres in Docker
pnpm db:migrate
pnpm dev
```

Il `.env` sta **alla radice del repo** e lo leggono tutti i workspace: i task turbo
girano con cwd = cartella del package, quindi il path è sempre `../../.env`.

Porte: web 3000, api 3001, Postgres **5433** sull'host (la 5432 è occupata da un
altro progetto).

### Comandi

| Comando                          | Cosa fa                                   |
| -------------------------------- | ----------------------------------------- |
| `pnpm dev`                       | avvia tutto (turbo)                       |
| `pnpm lint` / `pnpm check-types` | lint e typecheck sul monorepo             |
| `pnpm test`                      | vitest sul monorepo (serve Postgres su)   |
| `pnpm db:up` / `pnpm db:down`    | Postgres in Docker                        |
| `pnpm db:generate`               | genera la migration dal diff dello schema |
| `pnpm db:migrate`                | applica le migration                      |
| `pnpm db:studio`                 | Drizzle Studio                            |
| `pnpm auth:generate`             | rigenera lo schema Better Auth            |

Tre arnesi che si lanciano a mano dal workspace `api` e non stanno fra i comandi
di turbo, perché non fanno parte di nessuna pipeline:

| Comando                                     | Cosa fa                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api platforms:audit [--all]` | confronta la tabella `platforms` con l'elenco vero di IGDB. Segnala, non scrive: le correzioni vanno in una migration                                         |
| `pnpm --filter api steam:probe [steamid64]` | giro a vuoto dell'import Steam: legge la libreria e prova a risolverla senza toccare il DB                                                                    |
| `pnpm --filter api hltb:probe [n\|titolo]`  | giro a vuoto del match HLTB: cerca e punteggia senza scrivere. La riga che conta è quella dei "da sistemare"                                                  |
| `pnpm --filter api opencritic:resolve [n]`  | aggancia in blocco gli id OpenCritic chiedendoli a Wikidata. Non chiama OpenCritic e non spende budget: scrive solo dove guardare                             |
| `pnpm --filter api metacritic:probe [n\|titolo]` | giro a vuoto del match Metacritic. Mostra anche se il link della scheda Steam regge e quali piattaforme non sappiamo tradurre                            |
| `pnpm --filter api backfill [n]`            | accoda l'enrichment di ciò che è dovuto. Non forza: rispetta le soglie di freschezza                                                                          |
| `pnpm --filter api queues`                  | dashboard Bull Board sulle code, su `localhost:3002`. Ascolta solo su localhost: non c'è ruolo admin e non lo si inventa qui, da remoto si passa da un tunnel |

Le variabili d'ambiente nuove vanno dichiarate anche in `globalEnv` dentro
`turbo.json`, altrimenti il lint fallisce e la cache di turbo non le considera.

### Schema

`packages/db/src/schema/auth.ts` è **generato** da `pnpm auth:generate` e viene
riscritto per intero: non modificarlo a mano e non metterci le nostre tabelle.
Quelle vanno in file propri dentro `src/schema/`, riesportati da `schema/index.ts`.
Le migration le produce **solo drizzle-kit**.
