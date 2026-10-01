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
- **Web**: TanStack Start (Vite) + React
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

**Scelte già scartate, da non riproporre**: NestJS, Express, tRPC (sostituito da
oRPC), Prisma, backend Python, fine-tuning, Base UI + shadcn, react-strict-dom,
NativeWind, gluestack-ui, Panda CSS, DTCG / Style Dictionary. Le ragioni sono in
[docs/scelte-scartate.md](docs/scelte-scartate.md).

## Dove sta il resto

Questo file tiene solo ciò che serve sempre. Il resto:

- **CLAUDE.md di cartella**, caricati da soli quando si lavora lì:
  [apps/api](apps/api/CLAUDE.md) (fonti esterne, enrichment, arnesi),
  [apps/web](apps/web/CLAUDE.md) (build, guscio, `/backlog`, schermate),
  [packages/ui](packages/ui/CLAUDE.md) (design system, identità, componenti).
- **`docs/`, da leggere prima di toccare l'argomento**:

| Argomento                                                         | File                                               |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `games`, `backlog`, `game_type`, voti della critica, tag          | [docs/modello-dati.md](docs/modello-dati.md)       |
| import, possessi, account, scarti, nascondere, togliere una copia | [docs/import-librerie.md](docs/import-librerie.md) |
| i singoli negozi, token, aggiornamento automatico                 | [docs/negozi.md](docs/negozi.md)                   |
| gli step, uno per uno, con cosa contengono                        | [docs/ordine-sviluppo.md](docs/ordine-sviluppo.md) |
| le scelte tecniche scartate                                       | [docs/scelte-scartate.md](docs/scelte-scartate.md) |

## Struttura del monorepo

| Workspace            | Contenuto                                                           |
| -------------------- | ------------------------------------------------------------------- |
| `apps/api`           | Hono. Contiene **due entrypoint**: server HTTP e worker BullMQ      |
| `apps/web`           | TanStack Start (Vite), applicazione web                             |
| `apps/mobile`        | Expo / React Native                                                 |
| `packages/db`        | schema Drizzle + client, **unica fonte di verità**. Dipendenze Node |
| `packages/auth`      | istanza Better Auth (server) + `authClient` per web e mobile        |
| `packages/contracts` | router oRPC + schemi Zod condivisi                                  |
| `packages/ui`        | Tamagui, design system condiviso fra web e mobile                   |

Regole di confine:

- **I job BullMQ non girano nel processo che serve le richieste HTTP.** Stesso
  codebase `apps/api`, due file di ingresso: `server.ts` avvia Hono, `worker.ts`
  crea i Worker BullMQ e non espone HTTP. Entrambi importano le stesse funzioni di
  servizio. Serve a scalare e deployare le due cose separatamente: uno scrape
  pesante non deve degradare le API. In sviluppo si lanciano insieme.
- **`apps/mobile` non importa mai `packages/db`**, o il driver Postgres finisce nel
  bundle React Native. Se serve un tipo derivato dallo schema, va ri-esportato come
  tipo puro da `packages/contracts`.
- **Web e mobile condividono i componenti UI tramite `packages/ui`** (Tamagui),
  e condividono i componenti, **non le schermate**: sidebar, tabella densa e
  pannello dei filtri su un telefono diventano bottom tab, lista a schede e
  bottom sheet. `packages/ui` dipende da React e Tamagui e da nient'altro: niente
  router del web (`@tanstack/react-router`, `@tanstack/react-start`), che su
  React Native non esiste, e niente `@repo/contracts` né
  `@repo/db`, perché un componente che conosce `BacklogEntry` è una schermata e
  sta nell'app.

Le due regole su `packages/ui` e `apps/mobile` non sono solo scritte qui: le fa
rispettare `pnpm lint`, con `no-restricted-imports` in
`packages/eslint-config/boundaries.js`.

**Una React sola in tutto il repo**, alla versione che fissa la SDK di Expo:
`overrides` in `pnpm-workspace.yaml`. Metro compila il sorgente di `packages/ui`
risolvendone gli import dalla sua cartella, e due versioni nel repo diventano due
React nel bundle mobile, che rompono gli hook. Si alza insieme alla SDK.

**`apps/mobile` è per ora uno scheletro**: una schermata con i componenti di
`@repo/ui`, la prova che l'universale è universale. L'app mobile vera viene dopo
lo step 13.

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

## Modello dati, in breve

Le regole complete e il perché sono in [docs/modello-dati.md](docs/modello-dati.md)
e [docs/import-librerie.md](docs/import-librerie.md). Queste valgono sempre:

- **`games` è condivisa fra tutti gli utenti**: UUID interno, `igdbId` unique come
  chiave canonica, e gli id dei negozi in `external_ids`, mai come colonne. Il
  filtro per utente è una **JOIN `backlog` → `games`**, mai `userId` su `games`.
- **Nessuna query può assumere che i metadata siano popolati**: un gioco senza
  `igdbId` è solo non ancora risolto.
- **Una riga di `games` non si cancella**: le FK sono in cascade e si
  porterebbero via i backlog di tutti gli utenti.
- **`backlog` = possesso**: una riga per gioco e utente, con stato e voto. Le
  copie stanno in `ownerships` (piattaforma, negozio, account, supporto,
  abbonamento). La wishlist è una tabella a parte (step 15).
- **Stati**: `backlog` / `playing` / `played` / `completed` / `dropped` /
  `excluded`. `completed` è il 100%, il platinato, oltre `played`; nessun import
  lo imposta. `excluded` è un giudizio sul gioco; nascondere (`hidden_at`) è una preferenza di
  vista. Non vanno fusi.
- **Niente si cancella per non vederlo**: il prossimo import lo ricreerebbe. Si
  nasconde con `hidden_at`, e una copia tolta si ricorda in
  `ownership_rejections`.
- **I voti della critica** stanno in `game_scores`, per gioco, fonte e
  piattaforma. Non si traducono e non si mediano.
- **Generi e temi IGDB** stanno su `games`; **tag e categorie dell'utente** sono
  per utente, in `user_tags`.

## Ordine di sviluppo

Il dettaglio di ogni step è in [docs/ordine-sviluppo.md](docs/ordine-sviluppo.md).

1. Registrazione e auth
2. Inserimento manuale + prima UI web, con ricerca IGDB
3. Recupero dati esterni: enrichment, IGDB per primo, pipeline BullMQ
4. Import libreria Steam
5. Modifica del gioco: voto, note, tag, possessi
6. Recupero HLTB
7. Filtraggio
8. OpenCritic e Metacritic
9. Altre librerie: 9a GOG, Epic, Amazon · 9b PSN · 9c EA · 9d Nintendo ·
   9e Xbox · 9f Steam con login e Family
10. Import da file CSV — **in analisi**
11. Admin
12. UI
13. AI: raccomandazione, provider LLM, embedding
14. Gestione abbonamenti
15. Wishlist
16. Cancellazione ed esportazione dell'account

Poi il mobile. Non anticipare step successivi: se una feature appartiene allo
step 13, non implementarla mentre si lavora sull'1.

## Note operative

### Metodo di lavoro

Sempre in quest'ordine: **prima analisi, poi decisione, poi codice.**

Non scrivere né modificare codice prima di aver analizzato ciò che si sta per
toccare e aver concordato l'approccio. Vale anche per le modifiche che sembrano
banali: se non è stata analizzata, non si scrive.

In pratica: leggere il codice e il contesto esistente → esporre cosa si è trovato
e le opzioni → attendere la decisione → solo a quel punto implementare.

**Una schermata nuova o rifatta si vede prima del codice.** Correggere una
schermata già scritta vuol dire riscriverla, quindi la struttura si decide
prima, dove costa poco:

1. si parte dalla schermata che c'è e dai commenti dell'utente, con uno
   screenshot;
2. una proposta scritta, punto per punto sui commenti, e un **wireframe a bassa
   fedeltà** (Excalidraw: rettangoli ed etichette, niente stile). Si corregge
   lì finché la struttura non è approvata;
3. il codice, una volta sola. L'aspetto si rifinisce sulla pagina vera, senza
   rimettere in discussione la struttura.

Il Design canvas, cioè i mockup ad alta fedeltà, solo se l'utente lo chiede:
costa quanto il codice.

**Un lotto si chiude quando l'utente dice che è pronto**, non quando sono
fatti i passi del piano. I commenti che arrivano vedendolo in uso sono ancora
quel lotto: si aggiungono al suo piano, non ne aprono uno nuovo.

**I piani stanno in `plans/`**, uno per lotto, col nome del lotto
(`12a-design-system.md`). La modalità piano li scrive altrove, fuori dal repo:
a decisione presa il piano si sposta qui, e da qui si aggiorna mentre il lotto
procede — le verifiche che rimandava, le cose misurate che l'hanno smentito,
l'ordine cambiato in corsa. Un piano che vive solo nella cartella di Claude è
un piano che nessun altro vede e che sparisce cambiando macchina; e siccome
sta nel repo, i link ai file sono relativi a `plans/`, cioè `../`.

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

`packages/ui` si testa diversamente, e per la ragione simmetrica: ciò che conta lì
sono stili calcolati, focus da tastiera e contrasto, che jsdom non calcola. Quindi
`pnpm --filter @repo/ui test` monta ogni storia in Chromium (vedi
[packages/ui/CLAUDE.md](packages/ui/CLAUDE.md)). I test verificano comportamento
e accessibilità, **non le misure**: uno
Switch alto 29 invece di 18 li passava tutti. Per quello c'è Chromatic.

### Ambiente

Node ≥ 24, pnpm 12, Docker. Primo avvio:

```bash
cp .env.example .env   # e genera BETTER_AUTH_SECRET con: openssl rand -base64 32
pnpm install
pnpm db:up             # Postgres e Redis in Docker
pnpm db:migrate
pnpm dev
```

Il `.env` sta **alla radice del repo** e lo leggono tutti i workspace: i task turbo
girano con cwd = cartella del package, quindi il path è sempre `../../.env`.

Porte: web 8085, api 3005, dashboard delle code 3002, Postgres **5433** e Redis
**6380** sull'host (la 5432 e la 6379 sono occupate da un altro progetto). Un
`REDIS_URL` rimasto sulla 6379 non dà errore: si collega al Redis dell'altro
progetto, e server e worker lavorano su una coda vuota.

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
| `pnpm --filter @repo/ui dev`     | Storybook, il banco del design system     |
| `pnpm --filter @repo/ui test`    | le storie in Chromium, con axe            |
| `pnpm --filter mobile start`     | Metro per lo scheletro Expo               |

Gli arnesi che si lanciano a mano dal workspace `api` (probe, backfill, dashboard
delle code) sono in [apps/api/CLAUDE.md](apps/api/CLAUDE.md).

Le variabili d'ambiente nuove vanno dichiarate anche in `globalEnv` dentro
`turbo.json`, altrimenti il lint fallisce e la cache di turbo non le considera.

### Schema

`packages/db/src/schema/auth.ts` è **generato** da `pnpm auth:generate` e viene
riscritto per intero: non modificarlo a mano e non metterci le nostre tabelle.
Quelle vanno in file propri dentro `src/schema/`, riesportati da `schema/index.ts`.
Le migration le produce **solo drizzle-kit**.
