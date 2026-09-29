# Import a cascata

**Approvati il 29/09/2026 i passi 0, 1 e 2, e fatti lo stesso giorno.** Il 3,
in push, approvato lo stesso giorno. Branch `feat/import-a-cascata`, PR #11.

## Contesto

Dopo un import grosso (1000 giochi) i voti OpenCritic arrivano lenti, e non
solo per il budget. La cascata dopo l'import oggi è:

1. l'import accoda IGDB per i giochi **nati adesso** in `games`
   ([library-import.ts](../apps/api/src/services/library-import.ts));
2. IGDB, appena finisce, accoda HLTB e Metacritic se dovuti
   (`FOLLOW_IGDB` in [igdb-enrichment.ts](../apps/api/src/services/igdb-enrichment.ts));
3. **OpenCritic resta fuori di proposito**: accodarlo lì spenderebbe le 25
   ricerche al giorno nell'ordine degli import. Aspetta la spazzata, che però
   senza l'aggancio Wikidata — settimanale — non ha l'id e deve cercare.

E l'aggancio settimanale ha un tetto di 500 candidati che col tempo smette di
funzionare: i candidati comprendono i giochi che Wikidata non conosce, ordinati
dal più vecchio, e restano candidati per sempre. Passati i 500 riempiono la
finestra da soli e il giro non arriva più ai giochi nuovi, senza errori.

## Passo 1 — l'aggancio senza tetto

`limit` di `resolveOpenCriticIds` diventa facoltativo: senza, prende tutti i
candidati. Il worker già lo chiama senza argomenti. Le query a Wikidata restano
a gruppi di 300 in POST ([wikidata.ts](../apps/api/src/external/wikidata.ts)).
Lo script `opencritic:resolve [n]` tiene il suo `n`.

Verifica: `pnpm --filter api test`, con un caso nuovo in
`opencritic-resolve.test.ts`.

**Fatto.** Il caso nuovo crea 501 candidati: con `createGame` uno alla volta
sforava il timeout di vitest, quindi li inserisce in blocco.

## Passo 2 — OpenCritic dopo IGDB

Un job `post-import` sulla coda `enrichment`, accodato dall'import subito dopo
i suoi job IGDB e solo se ha creato giochi. La coda è FIFO: parte dopo che
tutti gli IGDB di quell'import sono partiti.

Fa due cose:

1. l'aggancio Wikidata, senza tetto;
2. accoda OpenCritic per i giochi **dovuti e con l'id già in mano** — lo
   stesso predicato della spazzata, più un filtro — fino al budget di richieste
   rimasto, come `sweepLimit`.

Così ogni gioco costa una richiesta (200 al giorno) e mai una ricerca, che
resta della spazzata: la regola scritta su `FOLLOW_IGDB` resta vera.

Tentativi come lo scheduler settimanale (5, backoff da 60 s): Wikidata va in
affanno.

Limite accettato: un IGDB in ritentativo perde il giro. Lo riprendono aggancio
settimanale e spazzata. Aspettare ogni singolo job costa molto più codice per
un caso raro.

Vale per ogni import, manuale o automatico: è lo stesso job.

Verifica: test sulla funzione nuova (solo chi ha l'id ed è dovuto, e il tetto
del budget), `pnpm --filter api test`. Sul minipc, dopo un import, i log
mostrano `aggancio opencritic: …` e poi `opencritic … -> ok`.

**Fatto.** `enqueuePostImport` in
[queue/enrichment.ts](../apps/api/src/queue/enrichment.ts), che condivide coi
tentativi dello scheduler settimanale `WIKIDATA_JOB_OPTS`; il filtro è
`onlyLinked` su `findGamesNeedingSource`
([enrichment.ts](../apps/api/src/services/enrichment.ts)); il job lo gestisce
[worker.ts](../apps/api/src/worker.ts) accanto a `resolve`. Test: `onlyLinked`
in `enrichment.test.ts`; in `steam-import.test.ts` che il seguito parte una
volta, dopo gli IGDB, e non parte senza giochi nuovi. 320 test su 320.

## Passo 3 — gli aggiornamenti in push

Oggi la lista si aggiorna a fine import solo se si resta su `/account`: uscendo,
la query degli account smette di interrogare e, con `staleTime: Infinity`, il
backlog resta vecchio fino al reload. E nessuna pagina vede i dati che
l'enrichment scrive dopo, né gli import automatici.

Scartato il ping ristretto al guscio: copriva solo gli import lanciati a mano.

Il percorso di un evento:

1. **il worker**, che è chi cambia i dati, pubblica su un canale Redis
   (`ludex:events`);
2. **il server HTTP** tiene una sottoscrizione sola a quel canale e smista in
   memoria con `EventPublisher` di oRPC;
3. **il browser** si abbona con una procedura oRPC `events.subscribe`
   autenticata (event iterator, cioè SSE sulla stessa `/rpc`, keep-alive ogni
   5 s di default) e invalida le query.

| Evento | Chi lo emette | A chi arriva | Cosa si aggiorna nel web |
| --- | --- | --- | --- |
| `import` (`started` / `finished`) | worker, a inizio e fine di ogni tentativo d'import, manuale o automatico | solo al proprietario dell'account | `accounts`; a fine anche `backlog` e `imports` |
| `games` (id) | worker, dopo ogni enrichment `ok` | tutti i connessi: `games` è condivisa, gli id non sono privati | `backlog`, `games.latest`, `games.byId` di quegli id |

- **Raffica**: il worker raccoglie gli id e pubblica al massimo un messaggio
  ogni 5 s.
- **`finished` dopo che BullMQ ha chiuso il job**, cioè negli eventi
  `completed`/`failed` del worker e non nel `finally` del processore: prima la
  chiave di deduplicazione non è ancora liberata, e `syncing` risulterebbe
  ancora vero senza più eventi a smentirlo.
- **Riconnessione** con backoff, e a ogni riconnessione si invalida tutto ciò
  che gli eventi coprono: niente storico degli eventi persi.
- `/account` perde il ping ogni 3 s e l'effetto di fine import.

Fuori, di proposito: le modifiche da un altro dispositivo o scheda. Passano dal
server HTTP e non dal worker; l'app mobile non esiste ancora. Si aggiungono
pubblicando sullo stesso canale.

Verifica: test sul filtro per utente; `pnpm check-types`, `pnpm lint`,
`pnpm test`; a mano, import lanciato e poi `/backlog`, dove compaiono i giochi e
poi le copertine. **Sul minipc**: il proxy davanti a `ludex.sanvisimo.tech` (non
è nel repo) non deve bufferizzare lo stream né chiuderlo sotto i 5 s di
silenzio.

**Fatto**, da verificare a mano nel browser e sul minipc. Dove sta:

- contratto: `LiveEventSchema` in
  [schemas.ts](../packages/contracts/src/schemas.ts), `events.subscribe` in
  [contract.ts](../packages/contracts/src/contract.ts);
- [lib/events.ts](../apps/api/src/lib/events.ts): pubblicazione (worker),
  blocco dei giochi ogni 5 s, sottoscrizione e smistamento (server), filtro
  per utente; `redisPublish` e `logErrorsQuietly` in
  [lib/redis.ts](../apps/api/src/lib/redis.ts);
- [worker.ts](../apps/api/src/worker.ts): `games` dopo ogni enrichment `ok`,
  `import` su `active` / `completed` / `failed`, l'ultimo blocco svuotato alla
  chiusura;
- web: [use-live-updates.ts](../apps/web/src/use-live-updates.ts), montato in
  [_app.tsx](../apps/web/src/routes/_app.tsx); `/account` senza più ping.

La riconnessione è un ciclo scritto a mano e non il `ClientRetryPlugin`: il
plugin vuole il suo contesto nel tipo del client, che sta in
`packages/contracts`, e per un abbonamento solo non valeva la dipendenza.

Misurato: `pnpm lint`, `pnpm check-types`, 323 test su 323 (3 nuovi sul
filtro). Server avviato a parte: `events.subscribe` senza sessione risponde
401, e `ludex:events` compare fra i canali di Redis.
