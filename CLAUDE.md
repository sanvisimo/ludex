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
  provider sta dietro un'interfaccia interna stretta, la scelta si fa allo step 7.

I due usi dell'LLM **non sono sostituibili allo stesso modo**:

- **Ragionamento**: provider intercambiabile a costo quasi nullo.
- **Embedding**: cambiarlo significa cambiare la dimensione della colonna vettoriale
  e **rigenerare gli embedding di tutta la tabella `games`**. Va quindi salvato
  accanto al vettore *quale modello l'ha prodotto*, così la migrazione resta
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
  la similarity search. La query di raccomandazione compone filtri hard *dinamici*
  + JOIN + ranking vettoriale: con Drizzle resta una singola query tipizzata, con
  Prisma diventa SQL costruito a stringhe. Non riproporlo.
- **Backend in Python** (FastAPI/SQLAlchemy): scartato. L'ecosistema ML di Python
  qui non verrebbe usato — gli embedding sono chiamate HTTP, la similarity search
  la esegue pgvector nel DB, il ragionamento è un'altra chiamata HTTP. In cambio si
  perderebbero i tipi condivisi con il frontend, che è vincolato a TypeScript.
  Eccezione ammessa: un microservizio Python isolato allo step 7 *solo* se servissero
  modelli di embedding locali.

## Struttura del monorepo

| Workspace | Contenuto |
|---|---|
| `apps/api` | Hono. Contiene **due entrypoint**: server HTTP e worker BullMQ |
| `apps/web` | Next.js, applicazione web |
| `apps/mobile` | Expo / React Native |
| `packages/db` | schema Drizzle + client, **unica fonte di verità**. Dipendenze Node |
| `packages/auth` | istanza Better Auth (server) + `authClient` per web e mobile |
| `packages/contracts` | router oRPC + schemi Zod condivisi |

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
- **OpenCritic** — punteggi critica
- **HowLongToBeat** — nessuna API ufficiale: scraping server-side (stesso approccio
  del plugin Playnite), risultati **sempre cachati in DB**. Mai scraping a runtime
  su richiesta utente. (ROMM gestisce le [API HLTB](https://github.com/rommapp/romm/blob/master/backend/handler/metadata/hltb_handler.py))

## Architettura del layer di raccomandazione

RAG, non fine-tuning. Il prompt si costruisce a runtime interrogando il DB
(profilo utente + backlog + metadata arricchiti).

Divisione delle responsabilità — è la regola più importante del progetto:

| Livello | Responsabilità |
|---|---|
| SQL | filtri hard (`userId`, stato backlog, piattaforma, durata) |
| Vector search | ranking semantico sui candidati |
| LLM | ragionamento contestuale sul set risultante |

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
  distinti** — su PC lo stesso gioco può stare su Steam *e* GOG. La piattaforma è
  il filtro hard ("stasera ho la Switch accesa"), lo store dice da dove lanciarlo
  e da quale import proviene, e può restare vuoto sugli inserimenti manuali.
- **la wishlist è una tabella separata**, non giochi "non posseduti" dentro
  `backlog`. Così ogni query su `backlog` resta semplice. Comprato il gioco, la
  riga migra. Anche i giochi in wishlist puntano a `games` e vanno arricchiti:
  durata e voti servono *prima* dell'acquisto. È lo **step 8**.
- **stato**: `backlog` / `playing` / `played` / `dropped` / `excluded`. `excluded`
  ("non voglio giocarlo") è uno stato, non una tabella: è un segnale negativo
  esplicito e allo step 7 vale più di molte valutazioni positive.

#### Due tassonomie separate, da non fondere

- **generi e temi IGDB**: attributi del gioco, stanno su `games`, alimentano filtri
  ed embedding.
- **tag e categorie personali dell'utente** ("da rigiocare", "quando sono stanco"):
  scoped per utente, stanno lato `backlog`. Arrivano allo **step 5**.

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
5. **Modifica del gioco** — tre cose che hanno senso solo insieme, perché sono la
   stessa schermata:
   - **campi personali**: voto, tag e categorie. Insieme **chiuso** di campi
     strutturati, non campi arbitrari definiti dall'utente: niente JSONB o EAV.
   - **possessi**: le mutazioni oRPC che espongono la scrittura già scritta allo
     step 4. Fino a qui l'unico modo di aggiungere una piattaforma è cancellare
     la riga e rifarla.
   - **copertina**: scelta da SteamGridDB, per non subire quella di IGDB.
6. **Recupero HLTB**
7. **AI** — layer di raccomandazione, scelta del provider LLM ed embedding.
8. **Wishlist** — tabella separata da `backlog`, arricchita come i giochi
   posseduti.

Ricerca ed enrichment sono due usi distinti di IGDB e non vanno confusi: lo step 2
cerca e salva id e titolo, in modo sincrono e senza coda; lo step 3 scarica i
metadata completi in job asincroni.

Poi: mobile, e le altre librerie importabili (GOG, Epic, EA, Battle.net, Amazon,
PSN, Xbox, Switch) sul modello dello step 4.

Non anticipare step successivi: se una feature appartiene allo step 7, non
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

Introdotti **prima dello step 4**, perché l'import Steam è la prima cosa che non
si verifica guardando il DB a mano: deduplica fra utenti, idempotenza del
reimport e risoluzione appid → IGDB non si controllano rilanciando l'import
contro IGDB vero, si brucia solo rate limit.

Vitest, e **contro un Postgres vero** (`ludex_test` nello stesso container, le
stesse migration): la logica che conta è tutta fatta di upsert e vincoli unique,
quindi mockare il DB testerebbe il mock. Le fonti esterne invece si stubbano al
confine `fetch` — nei test non si esce in rete.

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

| Comando | Cosa fa |
|---|---|
| `pnpm dev` | avvia tutto (turbo) |
| `pnpm lint` / `pnpm check-types` | lint e typecheck sul monorepo |
| `pnpm db:up` / `pnpm db:down` | Postgres in Docker |
| `pnpm db:generate` | genera la migration dal diff dello schema |
| `pnpm db:migrate` | applica le migration |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm auth:generate` | rigenera lo schema Better Auth |

Le variabili d'ambiente nuove vanno dichiarate anche in `globalEnv` dentro
`turbo.json`, altrimenti il lint fallisce e la cache di turbo non le considera.

### Schema

`packages/db/src/schema/auth.ts` è **generato** da `pnpm auth:generate` e viene
riscritto per intero: non modificarlo a mano e non metterci le nostre tabelle.
Quelle vanno in file propri dentro `src/schema/`, riesportati da `schema/index.ts`.
Le migration le produce **solo drizzle-kit**.