# Ludex

Gestore di libreria giochi multi-piattaforma. **Non è un tracker**: il cuore è un
motore decisionale che risponde a «cosa gioco adesso» in base al tempo che hai,
alla piattaforma che hai accesa e all'umore.

Nasce dall'assenza di un equivalente mobile di Playnite.

Le decisioni di progetto — perché Hono e non NestJS, perché Drizzle e non
Prisma, come è fatto il modello dati e perché — stanno in [CLAUDE.md](CLAUDE.md).
Questo file serve a metterlo in piedi.

## A che punto è

Fatti: registrazione e login, inserimento manuale con ricerca IGDB, enrichment
IGDB su coda, import della libreria Steam, modifica del gioco (voto, note, tag,
possessi), durate HowLongToBeat, ricerca e filtraggio del backlog, voti della
critica da OpenCritic e Metacritic.

Prossimi: layout e design (step 9), le altre librerie importabili, l'admin, il
layer di raccomandazione. Il mobile non è ancora iniziato.

## Stack

Tutto TypeScript. **Hono** + **Drizzle** + **PostgreSQL** sul backend, **oRPC**
per la tipizzazione end-to-end senza codegen, **Better Auth** con gli utenti nel
nostro Postgres, **BullMQ** + Redis per i job, **Next.js** sul web. Monorepo
pnpm + Turborepo.

| Workspace            | Contenuto                                       |
| -------------------- | ----------------------------------------------- |
| `apps/api`           | Hono. Due entrypoint: `server.ts` e `worker.ts` |
| `apps/web`           | Next.js                                         |
| `packages/db`        | schema Drizzle e client, unica fonte di verità  |
| `packages/auth`      | istanza Better Auth e client                    |
| `packages/contracts` | router oRPC e schemi Zod condivisi              |

I job **non girano nel processo che serve le richieste HTTP**: stesso codebase,
due processi, così uno scrape pesante non degrada le API. In sviluppo `pnpm dev`
li lancia insieme.

## Primo avvio

Servono Node ≥ 24, pnpm 11 e Docker.

```bash
cp .env.example .env   # e genera BETTER_AUTH_SECRET con: openssl rand -base64 32
pnpm install
pnpm db:up             # Postgres e Redis in Docker
pnpm db:migrate
pnpm dev
```

Il `.env` sta **alla radice del repo** e lo leggono tutti i workspace.

Porte: web `3000`, api `3001`, dashboard delle code `3002`, Postgres `5433`
(la 5432 è occupata da un altro progetto), Redis `6379`.

### Chiavi

Per accendere l'applicazione bastano `DATABASE_URL` e `BETTER_AUTH_SECRET`. Il
resto abilita una funzione per volta, e senza quella chiave la funzione
semplicemente non parte:

| Variabile                               | Serve a                                              |
| --------------------------------------- | ---------------------------------------------------- |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | cercare i giochi e arricchirli. È la fonte primaria  |
| `STEAM_API_KEY`                         | importare la libreria Steam                          |
| `OPENCRITIC_API_KEY`                    | i voti OpenCritic (chiave RapidAPI, piano gratuito)  |
| `METACRITIC_API_KEY`                    | facoltativa: solo se ruotano la loro chiave pubblica |
| `HLTB_API_PATH`                         | facoltativa: solo se HLTB sposta il suo endpoint     |

Una variabile nuova va dichiarata **anche in `globalEnv` dentro `turbo.json`**,
o il lint fallisce.

## Comandi

| Comando                          | Cosa fa                                   |
| -------------------------------- | ----------------------------------------- |
| `pnpm dev`                       | avvia tutto                               |
| `pnpm lint` / `pnpm check-types` | lint e typecheck sul monorepo             |
| `pnpm test`                      | vitest (serve Postgres acceso)            |
| `pnpm db:up` / `pnpm db:down`    | Postgres e Redis in Docker                |
| `pnpm db:generate`               | genera la migration dal diff dello schema |
| `pnpm db:migrate`                | applica le migration                      |
| `pnpm db:studio`                 | Drizzle Studio                            |
| `pnpm auth:generate`             | rigenera lo schema Better Auth            |

Poi ci sono gli arnesi da operatore, che si lanciano a mano dal workspace `api`
e non stanno in nessuna pipeline:

| Comando                                          | Cosa fa                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `pnpm --filter api backfill [n]`                 | accoda l'enrichment di ciò che è dovuto, rispettando le scadenze         |
| `pnpm --filter api opencritic:resolve [n]`       | aggancia gli id OpenCritic chiedendoli a Wikidata, senza spendere budget |
| `pnpm --filter api queues`                       | dashboard Bull Board sulle code, solo su localhost                       |
| `pnpm --filter api steam:probe [steamid64]`      | giro a vuoto dell'import Steam, senza scrivere                           |
| `pnpm --filter api hltb:probe [n\|titolo]`       | giro a vuoto del match HLTB                                              |
| `pnpm --filter api metacritic:probe [n\|titolo]` | giro a vuoto del match Metacritic                                        |
| `pnpm --filter api platforms:audit [--all]`      | confronta la tabella `platforms` con l'elenco vero di IGDB               |

I `probe` cercano e punteggiano **senza scrivere niente**: la riga che conta è
quella dei «da sistemare», perché è la lista di ciò che il job scarterebbe.

## Fonti dati

**IGDB** è il metadato primario e la chiave d'identità dei giochi. **Steam** dà
la libreria posseduta. **HowLongToBeat** dà le durate, **OpenCritic** e
**Metacritic** i voti della critica; **Wikidata** non porta dati, porta
identificativi — è da lì che si prende l'id OpenCritic di un gioco senza bruciare
le 25 ricerche al giorno del piano gratuito.

Nessuna di queste viene interrogata mentre un utente aspetta: si arricchisce su
coda e **il risultato finisce sempre in DB**.

## Test

```bash
pnpm test                 # tutto
pnpm --filter api test    # solo l'api
```

Vitest, e **contro un Postgres vero**: la logica che conta è fatta di upsert,
vincoli unique e predicati con LEFT JOIN, quindi mockare il database
testerebbe il mock. Le fonti esterne si stubbano al confine del modulo di
servizio. Il database dei test è `ludex_test`, nello stesso container: lo crea e
lo migra il setup di vitest, non serve prepararlo a mano.
