# apps/api

Prima di toccare un argomento, leggi il suo file in `docs/`: lì stanno le
regole complete, le ragioni e le misure.

| Se tocchi…                                                            | Leggi                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| `games`, `backlog`, `game_type`, `game_scores`, tag                   | [docs/modello-dati.md](../../docs/modello-dati.md)       |
| import, possessi, `store_accounts`, scarti, nascondere, rifiuti       | [docs/import-librerie.md](../../docs/import-librerie.md) |
| un negozio (GOG, Epic, Amazon, PSN…), token, aggiornamento automatico | [docs/negozi.md](../../docs/negozi.md)                   |

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

  Il path dell'endpoint di ricerca **ruota senza preavviso** — `/api/find`,
  `/api/bleed`, oggi `/api/search/site` — e quando succede ogni job risponde 404. Non è una variabile da rimettere a mano: il client legge le route dal
  `_buildManifest.js` del sito, prende quella che ha una sorella `/init` e la
  promuove **solo dopo una ricerca vera** di cui controlla la forma. Che la
  ricerca sia vera è il punto: una route che risponde 200 e restituisce altro
  passerebbe qualunque controllo più debole, e l'errore si scoprirebbe un job
  alla volta dentro `game_sources`. `HLTB_API_PATH` resta come scappatoia e
  vince su tutto — scritta, la scoperta non parte nemmeno.

  RomM fa la stessa scoperta ma in CI, e ne serve il risultato a tutte le
  installazioni da un file nel repo. Quella metà lì non ci serve e non va
  copiata: non abbiamo una flotta, e il loro file è rimasto tre mesi fermo su
  `/api/bleed` mentre HLTB era già altrove.

## Embedding ed enrichment

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

  L'evento non guarda **chi** scrive l'appid: l'enrichment IGDB, l'import
  Steam su un gioco arrivato da un altro negozio, lo scarto risolto a mano. Si
  riapre sulle righe che l'insert ha **davvero** scritto, mai su quelle
  proposte, o ogni reimport ripagherebbe la ricerca che aveva detto di no. La
  regola sta in `reopenSourcesForNewExternalIds`. Per lo stesso motivo HLTB e
  Metacritic, dopo IGDB, si accodano **solo se dovuti**: accodarli sempre li
  rifaceva al ritmo di IGDB (30 giorni) invece che al loro.

- A runtime si embedda **solo la query dell'utente** (stringa breve) per la
  similarity search.

## Arnesi

Si lanciano a mano e non stanno fra i comandi di turbo, perché non fanno parte
di nessuna pipeline:

| Comando                                          | Cosa fa                                                                                                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api platforms:audit [--all]`      | confronta la tabella `platforms` con l'elenco vero di IGDB. Segnala, non scrive: le correzioni vanno in una migration                                                                                                  |
| `pnpm --filter api steam:probe [steamid64]`      | giro a vuoto dell'import Steam: legge la libreria e prova a risolverla senza toccare il DB                                                                                                                             |
| `pnpm --filter api hltb:probe [n\|titolo]`       | giro a vuoto del match HLTB: cerca e punteggia senza scrivere. La riga che conta è quella dei "da sistemare"                                                                                                           |
| `pnpm --filter api hltb:endpoint`                | ritrova il path dell'endpoint di ricerca HLTB dalle route del sito e lo valida con una ricerca vera. Non scrive: stampa. Lo stesso che il client fa da sé sul 404                                                      |
| `pnpm --filter api opencritic:resolve [n]`       | aggancia in blocco gli id OpenCritic chiedendoli a Wikidata. Non chiama OpenCritic e non spende budget: scrive solo dove guardare                                                                                      |
| `pnpm --filter api igdb:types [n]`               | riempie `game_type` e `parent_igdb_id` sui giochi che c'erano prima di quelle colonne. 500 id per richiesta; da lì in poi li scrive l'enrichment                                                                       |
| `pnpm --filter api igdb:media [n]`               | riempie media, autori e giochi legati (12d) sui giochi arricchiti prima di quei campi, 100 id per richiesta, e stampa su quanti giochi c'è ciascuna cosa                                                               |
| `pnpm --filter api metacritic:probe [n\|titolo]` | giro a vuoto del match Metacritic. Mostra anche se il link della scheda Steam regge e quali piattaforme non sappiamo tradurre                                                                                          |
| `pnpm --filter api psn:probe [npsso]`            | giro a vuoto dell'import PSN: identità, libreria, piattaforme e ore, senza toccare il DB. Vuole l'npsso (o `PSN_TEST_NPSSO`) e usa `resolveByName`, cioè il matcher vero                                               |
| `pnpm --filter api backfill [n]`                 | accoda l'enrichment di ciò che è dovuto. Non forza: rispetta le soglie di freschezza                                                                                                                                   |
| `pnpm --filter api catchup [--resolve]`          | il `backfill` dei giorni col worker spento: accoda il dovuto delle altre fonti, poi spende il budget OpenCritic a blocchi e si ferma quando è finito. Vuole il worker acceso. `--resolve` fa prima l'aggancio Wikidata |
| `pnpm --filter api queues`                       | dashboard Bull Board sulle code, su `localhost:3002`. Ascolta solo su localhost: non c'è ruolo admin e non lo si inventa qui, da remoto si passa da un tunnel                                                          |
