# Import a cascata

**Approvati il 29/09/2026 i passi 0, 1 e 2, e fatti lo stesso giorno.** Il 3
è in discussione.

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

## Passo 3 — il backlog si aggiorna su qualunque pagina (in discussione)

Oggi la lista si aggiorna a fine import solo se si resta su `/account`: uscendo,
la query degli account smette di interrogare e, con `staleTime: Infinity`, il
backlog resta vecchio fino al reload.

Proposta: l'osservazione dell'import in corso sale nel guscio `_app` (ping ogni
3 s **solo mentre un import è in corso**), e al passaggio da in corso a finito
si invalidano backlog e scarti.

Alternativa sollevata: push via eventi. Richiede di portare l'evento dal worker
al server HTTP (`QueueEvents` su Redis) e da lì al browser (SSE con gli event
iterator di oRPC), più il proxy del minipc senza buffering. Si ripaga solo se
deve coprire anche gli import automatici e l'arrivo dei dati dell'enrichment.
