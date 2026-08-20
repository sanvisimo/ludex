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
  provider sta dietro un'interfaccia interna stretta, la scelta si fa allo step 13.

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
  Eccezione ammessa: un microservizio Python isolato allo step 13 _solo_ se servissero
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
  durata e voti servono _prima_ dell'acquisto. È lo **step 15**.
- **stato**: `backlog` / `playing` / `played` / `dropped` / `excluded`. `excluded`
  ("non voglio giocarlo") è uno stato, non una tabella: è un segnale negativo
  esplicito e allo step 13 vale più di molte valutazioni positive.

#### Import di librerie

Le librerie importate aggiungono tre cose al modello, decise allo step 4:

- **`store_accounts`**: l'account dell'utente su un negozio, uno per `(utente,
  negozio, account)` — **non uno per negozio**: due account Amazon sono un caso
  vero, e ci sono utenti con due Steam. Non è una colonna su `user` perché
  `auth.ts` è generato e viene riscritto. Allo step 4 teneva solo l'identità
  pubblica dell'account, perché a Steam basta uno SteamID64; dallo step 9 tiene
  anche i token, e come sono fatti lo dice «Le altre librerie» qui sotto.
- **abbonamento su `ownerships`**: `subscription`, nullo se la copia è comprata.
  Vedi «un gioco a cui puoi giocare stasera ma che non è tuo», più sotto: è la
  risposta parziale che il 9b ha dovuto dare, non un campo in più.
- **ore giocate su `ownerships`**, non su `backlog`: sono una proprietà di
  _quella copia_, e lo stesso gioco su GOG avrebbe le sue. Sono dato oggettivo
  del negozio, non un campo personale dello step 5. **Non si usano per indovinare
  lo stato**: due ore su un GDR da sessanta non vogliono dire "giocato", e
  `played` allo step 13 pesa.
- **`unresolved_imports`**: le voci che l'import non ha saputo legare a un gioco.
  Dal 9b portano anche la **piattaforma**, quando il negozio la dice: senza,
  risolvere a mano uno scarto PS5 non saprebbe su quale console scrivere il
  possesso, e `platformFor('psn')` alzerebbe — com'era giusto facesse finché
  nessuno aveva risposto a quella domanda.
  Stanno lì e **non in `games` come righe non risolte**, perché `games` è
  condivisa fra tutti gli utenti: su una libreria vera gli scarti sono client
  beta e "Friend's Pass", e riversarli nel catalogo di tutti per un problema di
  uno è sbagliato. L'utente le vede e le risolve a mano. Sono **per account**,
  non per negozio, o gli scarti del secondo Amazon sovrascriverebbero quelli del
  primo.

##### Ciò che non voglio vedere (questione aperta)

Il documento la rimanda già due volte — lo step 5 sui possessi («prima serve una
logica di scarto/nascondi, che è ancora da pensare») e lo step 11 sugli scarti —
e il 9b la rende concreta: la libreria PSN porta Netflix, YouTube, Spotify, Prime
Video, MUBI, DAZN e il lettore multimediale, che **nessun campo dell'API
distingue** da un gioco. Cadono negli irrisolti, che è dove devono stare, ma non
ci restano: `dismissUnresolvedImport` **cancella la riga**, e il prossimo import
la riporta.

Sono due gesti su due oggetti diversi, e vanno tenuti distinti:

- **una voce che non è un gioco** — Netflix. Sta in `unresolved_imports` e lì
  resta; si vuole solo che smetta di comparire fra i «da sistemare».
- **un gioco vero che non voglio in lista** — *Horizon Forbidden West*, finito e
  archiviato. Sta in `backlog`, il possesso è suo, e domani si può volerlo
  rivedere.

**Non è un problema di import, ed è la cosa da non sbagliare in partenza.**
L'import non ricrea ciò che c'è già: `ensureBacklogEntries` fa
`onConflictDoNothing` e una riga di backlog esistente non la tocca affatto,
mentre l'upsert degli scarti riscrive solo nome, piattaforma e ore. Un campo
messo su quelle righe sopravvive da sé, senza che il job debba sapere che
esiste. Ciò che non sopravvive è **cancellare** — ed è esattamente l'errore che
`dismiss` fa oggi, e la ragione per cui lo step 5 dice che togliere un possesso
non basta.

Quindi la forma è **un flag per riga, in due tabelle**, e nient'altro:
`unresolved_imports` per non vederla più fra gli scarti, `backlog` per non
vedere il gioco in lista. Stessa parola per lo stesso intento, e le liste che
filtrano di default.

Tre cose che qualunque versione dovrà rispettare:

- **Il possesso resta.** Nascondere non è dire «non ce l'ho»: il gioco è tuo, e
  allo scollegamento dell'account va contato fra quelli che spariscono. Il flag
  sta su `backlog`, non su `ownerships`.
- **Serve un posto dove ripensarci**, perché riattivare è metà del gesto: un
  gioco nascosto per sbaglio, senza una vista dei nascosti, sparisce per sempre.
  È l'unico pezzo di interfaccia che questa cosa richiede davvero.
- **`excluded` non è la stessa cosa** e non va riusato. Vuol dire «non voglio
  giocarlo», è un giudizio sul gioco e allo step 13 pesa più di molte
  valutazioni positive; nascondere è una preferenza di vista. Fondendoli, un
  gioco nascosto perché è spazzatura insegnerebbe al motore che non ti piace
  quel genere.

Resta aperta una domanda sola, e non è urgente: **è roba di uno o di tutti?**
Che Netflix su PSN non sia un gioco è vero per chiunque, e come l'enrichment si
paga una volta sola potrebbe pagarsi una volta sola anche il contrario — con
l'admin dello step 11 che promuove a globale ciò che un utente ha già bocciato.
Il rovescio è quello già scritto per i tag: una decisione di uno che tocca la
libreria di sconosciuti vuole una moderazione da inventare. L'ordine però è
chiaro e non costa niente: **per utente adesso, promuovibile dopo**. Un flag per
utente lo si promuove quando si vuole; una lista globale scritta subito la si
smonta con una migrazione e con la domanda «di chi era questa decisione?», a cui
nessuna riga saprebbe rispondere.

Due conseguenze minori, scritte perché si scoprono altrimenti a cose fatte:

- una voce nascosta **continua a costare la sua ricerca IGDB** a ogni import,
  perché il matcher non sa che l'hai bocciata. Su PSN sono undici ricerche: un
  costo noto, non un motivo per mettere le mani nell'import. Semmai è
  un'ottimizzazione di dopo.
- se IGDB un giorno impara a riconoscere una voce nascosta, quella smette di
  essere uno scarto e diventa un gioco in backlog: il nascondere **non la
  segue**, perché l'oggetto è cambiato. Ricomparirà una volta, e lì si nasconde
  di nuovo — dall'altro lato.

##### Come si chiama un account, quando ne hai due

`store_accounts` porta **due** nomi, e sono di due persone diverse:

- `display_name` è come lo chiama il **negozio**: `personaname` su Steam,
  `username` su GOG (da `userData.json`, l'unico posto dove GOG dica qualcosa di
  leggibile — lo scambio del token dà solo l'id), il display name su Epic, il
  nome di battesimo su Amazon. Si prende **al collegamento** e non a ogni import:
  è decorazione, e un nome cambiato nel frattempo non vale una richiesta in più
  per libreria. Se la richiesta non riesce si mette null e si tira avanti — un
  collegamento riuscito non deve fallire perché non sappiamo come chiamarlo.
- `label` è come lo chiama **l'utente**, ed è l'unica cosa che risolve il caso
  per cui esiste: due account Amazon della stessa persona rendono lo **stesso**
  `given_name`, misurato su due account veri. Nessun dato dell'API li separa, e
  l'unico che sa quale dei due è «quello di famiglia» è chi li ha collegati.

La precedenza è `label → display_name → external_account_id`, scritta una volta
sola in `storeAccountName` dentro `packages/contracts`, perché la usano la lista
degli account, i badge dei possessi e i log del worker.

Da qui discende una regola per i negozi che verranno: **non si va a caccia
dell'email** per distinguere gli account. GOG ce l'ha, Amazon la nasconde dietro
uno scope che non abbiamo, EA e Nintendo non danno niente — e anche prendendola
tutta si resterebbe con due account che si chiamano uguale. L'etichetta funziona
ovunque e costa zero richieste.

Attenzione a un tranello di GOG: `userData.json` porta un `userId` che **non è**
quello che salviamo. Il nostro `external_account_id` viene dallo scambio del
token ed è il `galaxyUserId`. Di quella risposta si prende il nome e nient'altro,
o l'identità dell'account cambierebbe sotto ai possessi che ci puntano.

##### Il possesso sa da quale account viene

`ownerships` porta uno `store_account_id`, nullo sugli inserimenti manuali. Non è
un di più: senza, due account dello stesso negozio collassano nella stessa riga
per il vincolo unique, e da lì discendono due cose che non si possono più fare —
sapere **da quale dei due lanciare il gioco**, e sapere **quali possessi erano di
un account** quando lo si scollega. `store` resta accanto e non è ridondante: è
l'unica cosa che c'è sugli inserimenti manuali, ed è la colonna su cui filtra la
ricerca dello step 7.

L'account entra anche **nella chiave del vincolo**, e questo ha una conseguenza
da tenere a mente: un possesso «PC / Amazon» scritto a mano e lo stesso portato
dall'import sarebbero due righe. Per questo `ensureOwnerships` prima **adotta**
il possesso senza account invece di sdoppiarlo — l'adozione è ristretta a
`store_account_id is null`, perché una riga che porta già l'id di un *altro*
account è il caso vero dei due Amazon e non si tocca.

**Scollegare è una domanda, non un bottone**, ed è l'unica risposta al buco che
il CLAUDE.md dichiarava aperto sui possessi. Le due strade non sono la stessa
cosa con un'etichetta diversa:

- **tieni i giochi** — restano nel backlog come se fossero stati inseriti a mano.
  La riga di `store_accounts` **non si cancella**: passa a `unlinked` e perde le
  credenziali. Sopravvive perché i possessi puntano a lei, ed è l'unica cosa che
  ancora ricordi da quale dei due account veniva un gioco. Cancellarla e mettere
  a nullo i possessi ricreerebbe esattamente il buco appena chiuso.
- **cancella i giochi** — i possessi di quell'account se ne vanno, e con loro le
  righe di `backlog` che restano senza nessun possesso: voto, note e tag
  compresi, senza eccezioni. Qui la riga dell'account si cancella davvero, perché
  non è rimasto niente da ricordare.

In entrambi i casi **`games` non si tocca mai**: la scheda, i metadata e la
mappatura in `external_ids` restano nel catalogo condiviso, e il prossimo utente
che importa quel gioco non ne ripaga l'enrichment perché qualcun altro ha
scollegato un account. E in entrambi i casi gli scarti se ne vanno: senza
l'account sono voci di una libreria che non sappiamo più leggere.

Poiché «cancella» è irreversibile e la sua portata **non si vede da fuori** — un
gioco che sta anche su GOG non sparisce — il dialogo conta prima di eseguire:
quanti possessi, quanti giochi uscirebbero davvero dal backlog, e quanti di
quelli hanno qualcosa che ha messo l'utente.

Lato web tutto questo vive in **`/account`**: una **lista di account collegati**
più un «aggiungi un account» dove si sceglie il negozio, lo stato dell'import
mentre gira, e la lista degli scarti da sistemare o scartare. `linkableStoreValues`
non sparisce, cambia mestiere: non è più l'elenco delle schede — una per negozio
non poteva rappresentare due account Amazon — ma l'elenco di quella tendina. Il
collegamento resta lo stesso gesto per tutti (si incolla l'URL del profilo, lo
SteamID64 o il nome scelto — lo SteamID su Steam non è in vista da nessuna
parte). Che un import sia in corso si legge **dalla coda** e non da
`last_sync_at`, che al primo giro è ancora nullo e non avrebbe niente da dire.

L'ordine dei passi dell'import è esso stesso una regola: **prima il nostro DB**
(gli appid già in `external_ids` non costano niente), **poi IGDB** e solo per il
resto, in blocchi — su 452 giochi sono quattro richieste. Risoluzione ed
enrichment restano due cose distinte: la prima è sincrona e in blocco, il secondo
è un job per gioco.

Il job d'import porta **l'id dell'account e nient'altro**: da lì si leggono
negozio, utente e identità pubblica. Era `{ store, userId }`, che è anche la
vecchia chiave di deduplicazione, e con due account sullo stesso negozio si
escludevano a vicenda — il secondo veniva scartato in silenzio e l'utente
aspettava una libreria che non arrivava. Il credenziale non è mai nel job: chi
esegue va a leggerlo, o si scriverebbe un refresh token in chiaro nella
cronologia di Redis.

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
| PSN | refresh token da npsso, **10 giorni** | **nessuno**: vedi sotto | parziali |
| EA | sessione corta, si sgancia sempre | nessuno | sì |
| Nintendo | cookie di sessione | nessuno | no |
| Xbox | chiave OpenXBL, o XSTS in proprio | `titleId` → ProductId via `displaycatalog`, sorgente 11 | sì |

Le prime due colonne sono state scritte **prima** di provare, e il 9b ha
smentito quella su PSN in tutte e due i campi. Restano qui corrette e non
riscritte in silenzio, perché il modo in cui ci si sbaglia su un negozio è esso
stesso un'informazione: si sbaglia guardando cosa l'API *espone*, invece di
guardare cosa *restituisce*.

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

**PSN è Epic una seconda volta, e stavolta la trappola era scritta nel campo
giusto.** IGDB ha una sorgente PS Store con quindicimila righe, e i suoi uid
sono i `conceptId` numerici dello store — *Dying Light 2* è `232374`. La
libreria dell'utente porta invece `titleId` come `CUSA12555_00`, che lì dentro
non esiste. Il `conceptId` **c'è** fra i campi che la risposta di Sony dichiara,
ed è per questo che sembrava risolvibile: arriva `null` su ogni riga, 336 su
336, misurato. Esiste un'altra operazione GraphQL (`getUserGameList`) che quel
campo lo popola davvero, ma è una *persisted query* il cui hash non è pubblico —
si cattura solo dal traffico del browser — e un job non si appoggia a una cosa
del genere. Quindi PSN si risolve **per nome**, come Epic e Amazon: 88% su 256
nomi distinti, e metà degli irrisolti sono Netflix, Spotify e YouTube, che
giochi non sono e che nessun campo dell'API distingue da un gioco.

Sempre di PSN, quattro cose che si pagano care se si scoprono tardi:

- **Il gateway GraphQL rifiuta le richieste «semplici»**, e non è un problema di
  autenticazione: è Apollo con la protezione CSRF attiva, che risponde **400** a
  una GET i cui header un `<form>` HTML avrebbe potuto produrre da solo.
  `Authorization` non conta. Serve un header non-semplice — noi mandiamo
  `x-apollo-operation-name`, che è la forma documentata — e senza si passa un
  pomeriggio a cercare l'errore nella query, che è giusta.
- **`me` non è un alias valido.** Gli endpoint vogliono l'`accountId` numerico,
  che sta nell'`id_token` restituito insieme al token e va usato **lui** come
  `external_account_id`: l'`onlineId` leggibile Sony lascia cambiarlo, e un
  utente che si rinomina si ritroverebbe due account collegati.
- **Le ore stanno su un secondo elenco**, quello dei giochi giocati, che copre
  solo PS4/PS5 e solo ciò che si è avviato — da qui il «parziali» della tabella.
  Si aggancia in modo **esatto** e senza match per titolo, ma la chiave è
  nascosta: l'elenco degli acquisti non dichiara il `titleId` come campo suo, lo
  porta dentro l'`entitlementId` (`UP3971-PPSA33764_00-WALKWALKWALKWALK`, il
  pezzo di mezzo). Su una libreria vera 31 dei 49 giocati trovano così il loro
  possesso; gli altri 18 sono roba giocata e non posseduta, che **non entra**.
- **Il credenziale dura dieci giorni**, non due mesi. Se la finestra rotoli a
  ogni rinnovo o sia fissa dal login non è ancora deciso: con una misura sola le
  due ipotesi danno lo stesso numero, e serve rilanciare `psn:probe` a distanza
  di giorni. Se è fissa, PSN è l'unico negozio che va **ricollegato a mano a
  scadenza**, e avvisare prima vorrebbe dire tenere quella data in una colonna
  interrogabile: `credentials_expire_at` oggi è la scadenza dell'*access token*,
  che è un'altra cosa e vale un'ora.

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
giochi. Per le console la piattaforma la dice la fonte, riga per riga: dal 9b
`LibraryEntry` la porta, e `platformFor` è diventata il ripiego per chi non ce
l'ha invece che la regola. Continua ad alzare per i negozi che non hanno né
l'una né l'altra, che è il modo giusto di accorgersi di un negozio aggiunto a
metà. Se ne porta una che non sappiamo tradurre, la voce si **salta con un log**:
il possesso ha una FK su `platforms`, e ripiegare su PS4 vorrebbe dire
proporre all'utente un gioco che non può avviare.

Da lì discende una regola del matcher che sembra un dettaglio e non lo è. Il
**cross-buy** fa arrivare lo stesso gioco due volte, PS4 e PS5, con lo stesso
identico titolo — 80 gruppi su 256 nomi. La rete tesa dopo i 266 «Live» di Epic
scartava i nomi ripetuti, e così com'era avrebbe buttato metà libreria PSN in
silenzio. La regola giusta è: un nome ripetuto è ambiguo **solo se si ripete
sulla stessa piattaforma**. Sui negozi PC la piattaforma è una sola per tutta la
libreria, quindi lì non cambia niente; su PSN due console sono due copie dello
stesso gioco, si cerca una volta e si scrivono **due possessi** e due righe in
`external_ids` — una per `titleId`, o al reimport quella PS4 ricomprerebbe una
ricerca.

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

Che è la domanda che nessun negozio del 9a poneva, e che **il 9b ha posto subito
e in grande**: un gioco a cui puoi giocare stasera ma che non è tuo — Game Pass,
PS Plus, la libreria di tuo fratello — sta in `backlog` o no? Su PSN non è un
caso di frontiera: sono **274 righe su 336**, l'81% della libreria.

La risposta presa, e il perché: **entrano, e il possesso si ricorda da dove
viene**. Entrano perché `backlog` serve a rispondere a «cosa gioco adesso», e un
gioco che stasera puoi avviare è esattamente ciò di cui quella domanda parla;
lasciarli fuori avrebbe tolto al motore decisionale i quattro quinti di una
console. Si ricorda da dove viene perché il giorno che l'abbonamento finisce
quelle righe cominciano a mentire, e a quel punto o si sa quali sono o si è
perso il dato per sempre. Cosa farne quel giorno è lo **step 14**, e non è
questa colonna a deciderlo.

Il posto è `ownerships.subscription`, nullo = comprato. Sta sulla copia e non
sul gioco per la stessa ragione delle ore: lo stesso titolo comprato su Steam
non diventa «da abbonamento» perché su PS5 ce l'hai col Plus. Al reimport si
riscrive **senza COALESCE**, al contrario delle ore, ed è voluto: il caso che
conta è quello in cui il valore sparisce — compri un gioco che avevi col Plus, e
il possesso deve smettere di dire che dipende dall'abbonamento.

Resta aperto il pezzo che PSN non pone: la libreria di **tuo fratello**, cioè
Steam Family e Xbox, dove ciò che torna non è nemmeno un abbonamento tuo. Lì la
risposta di oggi non si estende da sola.

**`store_account_id` non è quella risposta**, e non va scambiato per tale: dice
di chi è la copia, non se è tua — e ora nemmeno `subscription` va scambiata per
la stessa cosa, perché dice a che titolo ce l'hai, non di chi è l'abbonamento.

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
     scarto/nascondi, che è ancora da pensare: vedi «Ciò che non voglio vedere»,
     dove il 9b l'ha resa concreta. Lo scollegamento di un account è
     l'unico taglio che oggi regge, e regge proprio perché toglie *anche* la
     fonte che ricreerebbe la riga (vedi «Il possesso sa da quale account
     viene»).

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
    - **9b — PSN**: prima console, ed è quella che ha smentito due delle sue
      tre premesse. La piattaforma per riga sì, ed è entrata nel modello. Il
      possesso «vero» no: **274 righe su 336 vengono da PS Plus**. E l'id
      risolvibile nemmeno — vedi «PSN» qui sotto.
    - **9c — EA**: non un account collegato ma un'**importazione una tantum**.
    - **9d — Nintendo**: barattolo di cookie, nessun id che IGDB conosca.
    - **9e — Xbox**: ciò che torna è «giocato», non «posseduto». Non si comincia
      prima di aver deciso cosa vuol dire — è la domanda in fondo a «Le altre
      librerie», e per ora è volutamente aperta.
10. **Import da file** — importazione di giochi da file CSV. 
11. **Admin** — dove finisce ciò che nessun automatismo ha saputo chiudere. Non
    è una cosa sola:
    - **giochi non collegati** (senza `igdbId`, quindi mai arricchiti) e gli
      **scarti d'import** rimasti in `unresolved_imports`. Qui casca anche la
      terza domanda di «Ciò che non voglio vedere»: se una voce bocciata da uno
      possa valere per tutti, ed è questo il posto dove qualcuno lo deciderebbe.
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
14. **Gestione abbonamenti** — PS Plus, Game Pass e chi verrà. Nasce dal 9b,
    dove si è scoperto che l'abbonamento non è un caso di frontiera: su una
    libreria PSN vera è l'**81%** delle righe. Oggi quei giochi entrano in
    backlog e il possesso porta `ownerships.subscription` a dirlo; qui si
    decide cosa succede quando l'abbonamento **finisce**, che è l'unico momento
    in cui quelle righe cominciano a mentire.

    Le domande sono tre e nessuna ha una risposta ovvia: si cancellano, si
    nascondono o si lasciano lì marcate come «non più tuo»? Chi se ne accorge —
    l'import successivo, che non li vedrà più tornare, o un controllo esplicito
    dello stato dell'abbonamento (PSN lo dichiara: il profilo porta `isPlus`)?
    E il voto o i tag che l'utente ci ha messo sopra, che restano roba sua anche
    quando il gioco non c'è più?

    Una cosa che l'API **non** può aiutare a decidere, ed è misurata: Sony marca
    `PS_PLUS` tanto il gioco mensile riscattato — che resta tuo finché sei
    abbonato — quanto il catalogo Extra/Premium, che tuo non è mai stato. Quella
    distinzione lì dentro non c'è, e nessuna colonna nostra può inventarla.
15. **Wishlist** — tabella separata da `backlog`, arricchita come i giochi
    posseduti.

Ricerca ed enrichment sono due usi distinti di IGDB e non vanno confusi: lo step 2
cerca e salva id e titolo, in modo sincrono e senza coda; lo step 3 scarica i
metadata completi in job asincroni.

Poi: mobile — che non è solo un'altra interfaccia, perché una `WebView` nativa
sblocca i negozi che dal web non si possono collegare (vedi «Le altre librerie»).

Non anticipare step successivi: se una feature appartiene allo step 13, non
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
| `pnpm --filter api psn:probe [npsso]`       | giro a vuoto dell'import PSN: identità, libreria, piattaforme e ore, senza toccare il DB. Vuole l'npsso (o `PSN_TEST_NPSSO`) e usa `resolveByName`, cioè il matcher vero  |
| `pnpm --filter api backfill [n]`            | accoda l'enrichment di ciò che è dovuto. Non forza: rispetta le soglie di freschezza                                                                          |
| `pnpm --filter api queues`                  | dashboard Bull Board sulle code, su `localhost:3002`. Ascolta solo su localhost: non c'è ruolo admin e non lo si inventa qui, da remoto si passa da un tunnel |

Le variabili d'ambiente nuove vanno dichiarate anche in `globalEnv` dentro
`turbo.json`, altrimenti il lint fallisce e la cache di turbo non le considera.

### Schema

`packages/db/src/schema/auth.ts` è **generato** da `pnpm auth:generate` e viene
riscritto per intero: non modificarlo a mano e non metterci le nostre tabelle.
Quelle vanno in file propri dentro `src/schema/`, riesportati da `schema/index.ts`.
Le migration le produce **solo drizzle-kit**.
