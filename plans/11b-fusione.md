# Step 11b — Fusione di due giochi

**Piano approvato il 12/10/2026** (stato: `excluded` vince; la riga assorbita si
cancella). **Costruito e chiuso lo stesso giorno**: api, contratto e dialog ci
sono, i test passano (vedi «Com'è andata» in fondo), e la voce `merge` della
roadmap pubblica è «fatto». Viene dopo l'11a
([11a-admin.md](11a-admin.md)), di cui riusa il gesto «anteprima, poi conferma»
di «Non è questo gioco» (`planRepoint` in
[admin-games.ts](../apps/api/src/services/admin-games.ts)).

## Cosa si vuole

Quando lo stesso gioco sta in `games` con due id, l'admin li fonde in uno,
senza che nessun utente perda stato, voto, note, tag o possessi. È la «prima
strada» di «Un collegamento sbagliato non si disfa togliendo il gioco» in
[import-librerie](../docs/import-librerie.md): il gioco è quello giusto, l'id
no.

## Quale riga sopravvive

1. **quella con `igdbId`**;
2. se nessuna ce l'ha, **la più vecchia** (`createdAt`);
3. se **entrambe** ce l'hanno la fusione si **rifiuta**: sono due giochi IGDB
   distinti, ed è un altro problema (si corregge prima l'id sbagliato). Si
   rifiuta anche la fusione di un gioco con sé stesso.

D'ora in poi **sopravvissuto** e **assorbito**.

## Da dove parte

- **«Collega a IGDB»** con l'id già di un altro gioco (`taken`, oggi un errore
  che rimanda all'11b): il sopravvissuto è l'altro, l'assorbito è il gioco che
  si stava collegando. Il dialog si apre da lì.
- **«Fondi con…»** sulla scheda admin del gioco, con la stessa ricerca del
  catalogo di `catalog-finder.tsx`.

Il dialog mostra l'**anteprima** (la stessa funzione della conferma, così
l'admin vede ciò che succederà): i due giochi con quale sopravvive, quanti
utenti hanno solo l'uno o solo l'altro, quanti li hanno **tutti e due** e che
cosa si decide per loro. La conferma è una sola transazione.
**Non si disfa**, e il dialog lo dice.

## Cosa succede

### Utenti con una sola delle due righe

`UPDATE backlog SET game_id = <sopravvissuto>`. Finisce lì.

### Utenti con entrambe le righe

Le due righe di `backlog` diventano una, quella del sopravvissuto (o la prima
creata, se è meglio per le FK: l'importante è che la riga che resta sia una).

| Campo                            | Regola                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stato                            | `excluded` se una delle due lo è (è un giudizio esplicito, e non deve sparire in silenzio); altrimenti il più avanzato: `completed > played > playing > dropped > backlog` |
| voto                             | se ce n'è uno solo, quello; se sono due, quello della riga **modificata per ultima** (`updatedAt`)                                                                         |
| note                             | **concatenate**, la più vecchia per prima, separate da una riga vuota; se sono uguali, una sola. Sono testo dell'utente: non si butta                                      |
| tag                              | **unione** su `backlog_tags` (i `user_tags` sono per utente, gli id coincidono)                                                                                            |
| `hiddenAt`                       | nascosto **solo se lo sono entrambe**                                                                                                                                      |
| `addedAt`                        | il più vecchio                                                                                                                                                             |
| possessi                         | tutti sulla riga che resta; a parità di chiave (`ownerships_backlog_platform_store_key`, `NULLS NOT DISTINCT`) una copia sola                                              |
| rifiuti (`ownership_rejections`) | spostati; sulla stessa chiave una sola; **un rifiuto che combacia con un possesso presente cade**, perché il possesso lo contraddice                                       |

### Le tabelle del gioco

| Tabella                                                          | Regola                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `external_ids`                                                   | si spostano (la chiave unique è su `source + external_id`, non possono collidere)                       |
| `wishlist_items`                                                 | si spostano; sulla PK `(list_id, game_id)` una riga sola                                                |
| `game_reports`                                                   | si spostano; se ne risultano due **aperte** per lo stesso utente e la stessa cosa, la seconda si chiude |
| `game_scores`, `game_sources`, `game_attributes`, `game_related` | **tengono quelle del sopravvissuto**, le altre cadono: l'enrichment le riscrive                         |

### Dopo

- **Si cancella la riga assorbita.** Non ha più figli, quindi la cascata non
  porta via niente: la regola «una riga di `games` non si cancella» serve contro
  quella, e qui non c'è. **Il vecchio slug dà 404** (un redirect avrebbe voluto
  una colonna `merged_into`: scartata, vedi sotto).
- Si **riaprono i `game_sources` in `not_found`** del sopravvissuto (è l'evento
  che lo step 5 chiedeva: sono arrivati nuovi `external_ids`) e si accoda
  l'enrichment IGDB, con la regola di `reopenSourcesForNewExternalIds`.
- `critic_score` e il resto del denormalizzato li riscrive l'enrichment.

## Dove va il codice

- `apps/api/src/services/admin-merge.ts`: `planMerge(sopravvissuto, assorbito)`
  (sola lettura, rende il piano) e `mergeGames(...)` (lo stesso piano, in una
  transazione, ricontrollato dentro: fra anteprima e conferma i dati si
  muovono). Le regole sui campi sono funzioni pure, testabili da sole.
- `packages/contracts`: `admin.games.mergePreview` e `admin.games.merge`, solo
  admin; `linkIgdb` smette di rimandare a un'altra schermata e rende i due id
  da fondere.
- `apps/api/src/rpc/router.ts`: i due endpoint dietro `.use(admin)`.
- `apps/web/components/admin/merge-dialog.tsx`, sul modello di
  `repoint-dialog.tsx`; chiavi in `messages/it.json` e `en.json`.
- **La UI è un dialog che segue la struttura di «Non è questo gioco»**, quindi
  niente wireframe a parte. Se all'uso serve altro, si discute prima del
  codice.
- La voce `merge` della roadmap pubblica è già «in corso»: passa a «fatto»
  quando l'utente dice che il lotto è pronto.

## Test

Vitest contro Postgres vero, in `admin-merge.test.ts`:

- utente con una riga sola: la riga cambia gioco, niente altro;
- utente con due righe: ogni riga della tabella sopra, compresi **stato
  `excluded`**, voti discordanti, note uguali e diverse, tag che si sommano,
  `hiddenAt`;
- possessi con la stessa chiave: ne resta uno; rifiuto contraddetto da un
  possesso: cade;
- tabelle del gioco: collisioni su `wishlist_items` e `game_reports`, e
  `game_scores` del sopravvissuto che non si toccano;
- rifiuti: due `igdbId`, stesso gioco, gioco inesistente;
- **idempotenza**: rilanciarla sul gioco già assorbito rende `not_found`, senza
  scrivere;
- la riga assorbita non c'è più e nessun utente ha perso il gioco.

## Scelte scartate

- **Una colonna `merged_into` per il redirect dello slug.** Un campo e una
  lettura in più su `games` per un 404 che capita ai link dei giorni prima della
  fusione. Si aggiunge se diventa un problema.
- **Scegliere a mano, utente per utente, il voto o lo stato.** Sono centinaia di
  righe, e la fusione è un gesto dell'admin su dati che non sono suoi: le regole
  sono fisse e l'anteprima dice quante righe ne sono toccate.
- **`excluded` che perde contro gli altri stati.** Farebbe riapparire nelle
  raccomandazioni un gioco che l'utente ha escluso; riportarlo a `excluded` è un
  clic, il contrario è un giudizio perso.

## Com'è andata

Tutto come da piano, con tre differenze:

- **`linkIgdb` non lancia più `CONFLICT` su `taken`**: rende
  `{ status: 'taken', game }` con l'altro gioco, e il dialog si apre già
  sull'anteprima (senza il passo «scegli l'altro»). Il contratto è cambiato da
  `void` a `LinkIgdbResultSchema`.
- **Le regole stanno in `merge-rules.ts`**, a parte da `admin-merge.ts`, con
  `merge-rules.test.ts` (senza database).
- **`updatedAt` della riga che resta** non diventa «adesso»: è il più recente
  dei due. Serve a dire chi ha votato per ultimo, e una fusione non è un voto.
- Un possesso inserito a mano (senza account né supporto) e uno importato
  della stessa copia **non si fondono**: hanno chiavi diverse, e il prossimo
  import li adotta con `adottaPossessiMenoSpecifici`, come prima.

Test: `merge-rules.test.ts`, `admin-merge.test.ts` (11 casi su Postgres vero),
`admin-games.test.ts` (il caso `taken`) e `context.test.ts` (le due procedure
nuove rifiutano chi non è admin). La UI non ha test: non si provano i
componenti, e **non è stata provata nel browser**.

## Verifica

```bash
pnpm --filter api test -- admin-merge
pnpm lint && pnpm check-types
```

A mano, da admin: due giochi di prova con una riga di backlog dello stesso
utente ciascuno, «Fondi con…» → l'anteprima dice «1 utente con entrambi» →
conferma → un solo gioco, stato e tag sommati, il vecchio slug dà 404.
