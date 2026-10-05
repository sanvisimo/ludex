# Filtro «Famiglia e abbonamenti» (ritocco allo step 7)

**Stato: fatto, non committato.** Branch `feat/filtro-abbonamenti`, da `main`.
Scelta del 06/10/2026: **un gruppo nuovo «Famiglia e abbonamenti»** accanto a Store
(prima era stata scelta l'opzione 2, righe dentro Store, poi ritirata). Verificato:
`pnpm check-types`, `pnpm lint` e `pnpm --filter api test` (559 verdi dopo la revisione di «escludi»);
**non guardato nel browser**.

## Perché non c'è, e dove deve stare

Il pannello ha un gruppo **Store** (`stores`), che elenca i negozi da cui l'utente ha
almeno una copia (`listBacklogFilterOptions`, dal DB). «Steam Family» **non è un
negozio**: è un valore di `ownerships.subscription` sulla copia, a fianco di
`ps_plus`. Per questo non può comparire nel gruppo Store, e nessun filtro oggi guarda
`subscription`.

**Nintendo non richiede niente qui**: il gruppo Store lo offre da solo appena
l'utente ha un possesso `nintendo`, e l'etichetta «Nintendo eShop» esiste già
(`messages/*.json`, chiave `nintendo`). La parte «quando aggiungiamo Nintendo» della
richiesta è quindi già soddisfatta; resta il filtro nuovo.

## Cosa serve (da leggere dal codice, non provato)

| Dove                                           | Cosa                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/schemas.ts`            | `BacklogFilterSchema.subscriptions: z.array(SubscriptionSchema)`, e `BacklogFilterOptionsSchema.subscriptions`                                                                          |
| `apps/api/src/services/backlog-search.ts`      | un `EXISTS` su `ownerships.subscription`, in AND come `stores`; e le opzioni: i valori **presenti** fra i possessi visibili, non quelli possibili                                       |
| `apps/api/src/services/backlog-search.test.ts` | un gioco con una copia `steam_family` esce col filtro e non senza; un gioco comprato non esce; le opzioni offrono solo ciò che c'è; **un possesso nascosto non fa comparire l'opzione** |
| `apps/web/lib/backlog-filter.ts`               | il campo `subscriptions` (URL), nei `criteri` e in `toQueryInput`                                                                                                                       |
| `apps/web/components/backlog-filters.tsx`      | il gruppo nel pannello e il chip del filtro acceso                                                                                                                                      |
| `apps/web/messages/{it,en}.json`               | l'etichetta del gruppo e il testo «vuoto». Le etichette dei valori ci sono già (`ps_plus` → «PS Plus», `steam_family` → «Famiglia Steam»)                                               |

Semantica: **in AND**, come `stores`, con lo stesso suggerimento «tutti insieme» del
pannello. Un criterio attivo esclude chi non ha il valore. **Non** si offre «comprato»
(subscription nullo): nessuno l'ha chiesto, e si può aggiungere dopo.

## Come è fatto

Un gruppo del pannello a parte, con la stessa forma degli altri (`CheckList`), un
chip per ogni valore acceso e il suo conteggio accanto al titolo. Offre solo i valori
che l'utente ha fra le righe **visibili**: una famiglia Steam su soli giochi nascosti
non compare. Il gruppo Store resta com'era.

## Escludi famiglia e abbonamenti (richiesta del 06/10/2026, rivista lo stesso giorno)

`excludeSubscriptions` è una **lista di `Subscription`**, non un booleano: tieni i
giochi con **almeno una copia che non è fra quelle escluse**, cioè con `subscription`
nullo (comprata, o inserita a mano) o di un altro abbonamento. Escludere solo
`steam_family` lascia i giochi che hai solo nel PS Plus, e viceversa; escluderli
tutti e due è la lettura di prima, «solo copie tue».

Prima era una casella unica, e «escludi + Famiglia Steam» chiedeva due cose opposte
(deve avere una copia da famiglia / deve averne una che non lo è): zero risultati
sempre. Rimasta la lettura «almeno una copia» e non «nessuna copia da famiglia»: la
seconda toglierebbe anche un gioco comprato su Steam che si ha anche nel PS Plus, che
è tuo davvero.

**Sulla stessa copia, non su copie qualunque** (corretto dopo averlo visto in uso):
la prima versione teneva «escludi» come un `EXISTS` a parte, quindi «Steam» + «senza
Famiglia Steam» lasciava passare un gioco con la copia Steam da famiglia e un'altra
copia tua (Nintendo eShop). Ora il predicato «copia non esclusa» sta dentro ogni
sottoquery sulle copie (`platforms`, `stores`, `subscriptions`), e resta come
`EXISTS` autonomo per quando nessuno di quei filtri c'è. «Steam» + «senza famiglia»
vuol dire una copia **Steam** che non è da famiglia.

Nel pannello, il gruppo «Famiglia e abbonamenti» ha due liste degli stessi valori:
«Mostra solo» (in AND) e «Escludi». Spuntare un valore in una lo toglie dall'altra,
quindi la contraddizione non si può costruire. Un chip per valore escluso
(«Senza Famiglia Steam»). Un link vecchio con `excludeSubscriptions=true` perde il
parametro: il filtro era di poche ore prima.

## Verifica

`pnpm --filter api test` (con i casi sopra), `pnpm lint`, `pnpm check-types`, e a mano:
un backlog con una copia `steam_family` o `ps_plus` mostra il gruppo e il filtro la
trova.
