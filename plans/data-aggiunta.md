# Data di aggiunta

**Approvato il 29/09/2026 il piano; fatti lo stesso giorno tutti e sei i passi.** Il form resta da vedere nel browser.
Branch `feat/data-aggiunta`, da `origin/main`.

## Contesto

L'ordinamento «aggiunto» usa `backlog.created_at`
([backlog-search.ts:263](../apps/api/src/services/backlog-search.ts)), cioè il
momento in cui l'import ha scritto la riga. Su una libreria importata è lo
stesso istante per tutti i giochi: come ordinamento non dice niente.

La data giusta è quella in cui il gioco è entrato nella libreria del negozio.
Misurata con un probe sulle librerie vere il 29/09/2026:

| Negozio | Dove sta                                                                                                                                      | Copertura      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Epic    | `acquisitionDate` sul record di `library/api/public/items`, che già scarichiamo                                                               | 888/888 record |
| Amazon  | `entitlementDateFromEpoch` (ms, stringa) sull'entitlement, che già scarichiamo                                                                | 95/95          |
| GOG     | **non** in `getFilteredProducts`: sta su Galaxy, `galaxy-library.gog.com/users/{galaxyUserId}/releases`, paginata a 500 con `next_page_token` | 442/442        |
| PSN     | nessun campo data fra gli acquisti                                                                                                            | —              |
| Steam   | nessun campo data in `GetOwnedGames`                                                                                                          | —              |

Su GOG le date sono due: `date_created` c'è sempre ma non va prima del
20/04/2019, quando Galaxy ha registrato gli acquisti vecchi (23 giochi su quel
giorno); `owned_since` è la data vera ma c'è su 344 giochi su 442. Si prende
`owned_since`, e dove manca `date_created`.

**PSN resta fuori, deciso.** Le date ci sono nello storico transazioni, ma solo
con la sessione web: npsso → login di `web.np.playstation.com` → cookie
`pdccws_p` → `/api/graphql/v1/transact/transaction/history`. Il client mobile
che usiamo non può avere lo scope `transaction:history.get` (`invalid_scope`).
Darebbe una data a 308 acquisti su 347, ma vorrebbe dire conservare l'npsso,
che è la sessione completa dell'account. Troppo lavoro e troppo rischio per
una data. **Steam** arriva col 9f: la data sta nella pagina delle licenze, che
vuole il login.

Dove il negozio non la dà, la data si corregge a mano dal form di modifica.

## Scelte

- **Una colonna sola, `backlog.added_at`**, non nulla, default `now()`. Non per
  copia su `ownerships`: il form modifica _una_ data, e una per copia vorrebbe
  una UI per copia che non serve.
  **Superata dal passo 7**: la data resta anche per copia, su
  `ownerships.acquired_at`. Il form continua a modificarne una sola.
- **L'import scrive `least(added_at, acquiredAt)`.** Le righe già importate
  prendono la data vera al primo reimport; un gioco entrato oggi da Steam
  prende quella di Epic se su Epic c'è; una data corretta a mano più vecchia
  sopravvive. Il rovescio, accettato: una data corretta a mano _più recente_
  di quella del negozio il reimport la riporta indietro.
- **Gli scarti non portano la data**: risolti, l'import successivo li aggancia
  per id e la scrive.
  **Superata dal passo 8**: risolto a mano, il gioco risultava aggiunto oggi
  fino al reimport.
- **Galaxy non è bloccante**: se non risponde, l'import GOG va avanti senza
  date.

## Passo 1 — branch e piano

Branch `feat/data-aggiunta` e questo file.

**Fatto.**

## Passo 2 — schema e migration

`addedAt: timestamp('added_at').defaultNow().notNull()` su `backlog`
([backlog.ts](../packages/db/src/schema/backlog.ts)). Migration generata da
drizzle-kit, più una `--custom` con `update backlog set added_at = created_at`:
senza, le righe esistenti prenderebbero tutte la data della migration.

Verifica: `pnpm db:migrate`, poi le date su `backlog` coincidono con
`created_at`.

**Fatto.** Il backfill non è una migration `--custom` a parte ma sta in coda a
quella generata,
[0023_friendly_skin.sql](../packages/db/drizzle/0023_friendly_skin.sql), come
aveva già fatto la 0013: una migration sola, e la colonna non esiste mai senza
il suo backfill. Sul DB di sviluppo 1979 righe su 1979 con `added_at =
created_at`; `pnpm check-types` e `pnpm --filter api test` (329) verdi.

## Passo 3 — import

- `LibraryEntry.acquiredAt?: Date | null`
  ([library-import.ts](../apps/api/src/services/library-import.ts)).
- Epic: `acquisitionDate`, il minimo fra i record dello stesso prodotto (i DLC
  arrivano come record in più).
- Amazon: `entitlementDateFromEpoch`.
- GOG: la lettura di Galaxy, per id prodotto; `owned_since ?? date_created`.
- Dopo `ensureBacklogEntries`: `added_at = least(added_at, min(acquiredAt))`
  per riga di backlog.

Verifica: `pnpm --filter api test`, con i casi: l'import scrive la data; un
reimport non la sposta in avanti; fra due negozi vince la più vecchia; una
correzione manuale più vecchia sopravvive al reimport.

**Fatto.** La scrittura è `advanceAddedAt` in
[backlog.ts](../apps/api/src/services/backlog.ts): un UPDATE … FROM (VALUES)
a blocchi, con `v.added_at < added_at` nel WHERE, così una riga che non va
indietro non si tocca nemmeno. Le date arrivano come ISO UTC con cast a
`timestamp`, la stessa convenzione con cui Drizzle scrive la colonna. Galaxy si
interroga con `externalAccountId`, che per GOG è già il `galaxyUserId`: nessuna
chiamata in più a `userData.json`.

Test: sei casi nuovi in `library-import.test.ts` (i quattro previsti, più «senza
data resta quella dell'import» e «due voci dello stesso gioco nella stessa
libreria»), uno in `gog.test.ts` sulla lettura di Galaxy. `pnpm --filter api
test` 336 verdi, `pnpm lint` e `pnpm check-types` verdi. Non ancora provato su
un import vero.

## Passo 4 — contratto, API, ordinamento

- `BacklogEntrySchema.addedAt`.
- `backlog.update` accetta `addedAt` opzionale: assente = non toccare, `null`
  non ammesso.
- L'ordinamento `addedAt` passa a `backlog.added_at`.

Verifica: test del servizio, `pnpm check-types`.

**Fatto.** `createdAt` resta nel contratto accanto ad `addedAt`: sono due cose
diverse, e il client oggi non legge nessuna delle due. Test nuovi: la correzione
in `backlog.test.ts` (scritta, e un update senza il campo non la tocca) e
l'ordinamento in `backlog-search.test.ts` (una riga nata dopo ma aggiunta prima
va in fondo). `pnpm --filter api test` 338 verdi, `pnpm check-types` e
`pnpm lint` verdi.

## Passo 5 — form

Campo «Aggiunto il» in
[edit-entry-dialog.tsx](../apps/web/components/edit-entry-dialog.tsx), fra
note e possessi, con `Input type="date"` nativo: il design system non ha un
date picker e non se ne introduce uno. Un campo in un dialog esistente, non una
schermata nuova: niente wireframe. Da verificare che l'`Input` di `@repo/ui`
passi `type="date"` al DOM.

Verifica: modifica dal browser, poi l'ordinamento «aggiunto» la rispetta.

**Fatto, da vedere nel browser.** Il campo sta subito prima delle piattaforme,
largo 176, con `max` a oggi. Il giorno si legge e si scrive nel fuso di chi
guarda (`toDateInput`, non `toISOString`), e si manda **solo se è cambiato**:
rimandarlo a ogni salvataggio troncherebbe a mezzanotte l'ora esatta scritta
dal negozio. Vuoto non si manda, perché la data non si toglie. `type` arriva al
DOM (login e registrazione usano già `type="email"` e `"password"` sullo stesso
`Input`); `max` non l'ho visto nel browser. Etichetta in `editEntry.addedAtLabel`,
italiano e inglese. `pnpm --filter web check-types` e `lint` verdi.

## Passo 6 — documentazione

- [docs/modello-dati.md](../docs/modello-dati.md): la colonna e la regola del
  `least`.
- [docs/negozi.md](../docs/negozi.md): quale negozio dà la data e dove, e
  l'esito del probe PSN, così non va rifatto.

**Fatto.** In `modello-dati.md` un punto nella sezione `backlog`: `added_at`
contro `created_at`, una per gioco e non per copia, e la regola del `least` col
suo rovescio. In `negozi.md` una sezione nuova in fondo, «La data d'acquisto»:
la tabella per negozio, le due date di GOG, e la strada PSN passo per passo col
perché è stata scartata. I due file non passano prettier già da prima (corsivi
con `*`, tabelle non allineate): le aggiunte seguono il loro stile e non li
riformattano.

## Passo 7 — una data per copia

Approvato e fatto il 29/09/2026, sul branch `claude/elegant-rubin-suzk14`.

Lo stesso gioco in due librerie ha **due date di aggiunta**, una per copia: su
GOG nel 2019, su Epic nel 2022. Fino al passo 6 se ne teneva una sola, la più
vecchia, in `backlog.added_at`, e l'altra si perdeva.

- **Schema**: `ownerships.acquired_at`, può essere nulla (Steam, PSN, inserimenti
  manuali).
  Migration [0024_lean_archangel.sql](../packages/db/drizzle/0024_lean_archangel.sql),
  senza backfill: le date per copia non erano salvate da nessuna parte, le
  copie esistenti le prendono al primo reimport.
- **Copia**: `ensureOwnerships` la scrive e, sul conflitto, fa
  `least(excluded.acquired_at, acquired_at)`, che ignora i NULL: un reimport
  non la sposta avanti e uno senza data non la cancella. `fondiDoppioni` tiene
  la più vecchia.
- **Gioco**: `advanceAddedAt` ora prende gli id di backlog e legge dalle copie:
  `added_at = least(added_at, min(ownerships.acquired_at))`. Le regole del
  passo 3 non cambiano.
- **Non cambiano**: contratto, API e form. La data per copia non si mostra,
  e togliere una copia non ricalcola quella del gioco.

Verifica: i test della data di aggiunta in `library-import.test.ts` ora
controllano anche la data di ogni copia (GOG 2022 ed Epic 2019 restano
entrambe, e il gioco prende il 2019; un reimport senza data non la cancella).
`pnpm --filter api test` 338 verdi; typecheck e lint verdi pacchetto per
pacchetto (`pnpm -r`), perché turbo in quell'ambiente non avviava i processi.
Non ancora provato su un import vero.

## Passo 8 — gli scarti tengono la data

Approvato e fatto il 03/10/2026, sul branch `ccr-3765f971-robvd4`.

Golazo, scarto Amazon collegato a mano a IGDB, è diventato l'ultimo gioco
aggiunto: lo scarto non teneva la data, e `resolveUnresolvedImport` creava la
riga di backlog con `added_at = now()`. Il reimport l'avrebbe riportata
indietro, ma fino ad allora la data era sbagliata.

- **Schema**: `unresolved_imports.acquired_at`, nullable. Migration
  [0029_unresolved_acquired_at.sql](../packages/db/drizzle/0029_unresolved_acquired_at.sql),
  senza backfill: gli scarti esistenti la prendono al prossimo import.
- **`recordUnresolved`** la scrive, e il reimport la aggiorna come nome e ore.
- **`resolveUnresolvedImport`** la passa alla copia e chiama `advanceAddedAt`.

Verifica: un caso nuovo in `library-import.test.ts` (import senza match →
scarto con la data → risolto a mano → copia e gioco con la data del negozio),
che senza la correzione fallisce. `pnpm --filter api test` 374 verdi.

Golazo, già risolto, la prende al prossimo reimport di Amazon.

**Verificato dall'utente il 03/10/2026 sull'app vera: funziona.**
