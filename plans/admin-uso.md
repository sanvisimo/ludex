# Admin — Uso

Una sezione dell'admin per vedere chi usa Ludex, cosa entra nel catalogo e come
stanno code e fonti esterne. Lavoro interno: niente voce in roadmap, perché chi
usa l'app non la vede. Deciso il 07/11/2026, il giorno dopo l'apertura al
pubblico.

Wireframe: [admin-uso.excalidraw](admin-uso.excalidraw), anche in
[PNG](admin-uso.png).

## Le visite: Cloudflare, senza Web Analytics

Le visite di chi non ha un account non stanno nel nostro database. Si leggono
nella dashboard di Cloudflare, dominio `sanvisimo.tech` → Analytics & Logs →
HTTP Traffic: **i visitatori unici, non le richieste**, che ogni pagina
moltiplica con le chiamate all'API sullo stesso dominio. Il numero è di tutta
la zona, quindi anche degli altri sottodomini, se il piano non permette di
filtrare per `ludex.sanvisimo.tech` (non verificato).

**Web Analytics di Cloudflare no**, deciso dall'utente: l'informativa dice che
non usiamo strumenti di analytics (`apps/web/lib/legal.ts`), e resta vero.

## Cosa c'è nella sezione

`/admin/usage`, ultima voce del menu (`_app.admin.usage.tsx`), dati da
`admin.usage.get` (`apps/api/src/services/admin-usage.ts`):

1. **Utenti**: registrati, nuovi a 7 giorni, attivi a 7 e 30 giorni; le
   iscrizioni al giorno negli ultimi 30; le librerie collegate per negozio
   (account, importati almeno una volta, aggiornati negli ultimi 7 giorni, da
   ricollegare). Gli account `csv` non sono librerie e non si contano.
2. **Giochi**: nel catalogo, nuovi a 7 giorni, risolti su IGDB, in almeno una
   libreria; i giochi entrati nel catalogo al giorno; i 10 presenti in più
   librerie, col link alla scheda admin. Lo stato delle fonti resta in «Dati
   mancanti», con un link.
3. **API e code**: le code BullMQ in diretta da Redis; le chiamate alle fonti
   esterne (vedi sotto); l'esito dell'enrichment per gioco negli ultimi 7
   giorni, da `game_sources`.
4. **Pagina Utenti**: la colonna «Ultimo accesso».

I grafici sono **Recharts**, solo in `apps/web` (l'admin non esiste su mobile,
e `packages/ui` resta universale): `components/admin/day-bars.tsx`, una serie,
colori dalle variabili del tema (`--accent9`, `--color11`, `--borderColor`).
Preferito a Chart.js perché è fatto di componenti React e disegna in SVG, dove
le variabili CSS del tema funzionano da sole.

## I limiti, scritti anche nella pagina

- **Attivo** è chi ha usato una sessione nel periodo (`session.updated_at`),
  escluse quelle aperte da un admin «come» l'utente. È **per difetto**: Better
  Auth aggiorna la data al più una volta al giorno, e un logout cancella la
  sessione. **Non c'è uno storico** degli attivi giorno per giorno: servirebbe
  una tabella nuova, cioè dati nuovi e l'informativa da cambiare. Scartato per
  ora.
- **I giorni sono UTC**, nei grafici e nei contatori.
- **L'esito per gioco** è l'ultimo tentativo di ciascun gioco, non ogni
  chiamata.

## Il contatore delle chiamate

`countedFetch` (`apps/api/src/lib/api-calls.ts`) conta in Redis, per giorno e
per fonte, le chiamate e i 429: hash `apicalls:<giorno>` e
`apicalls429:<giorno>`, 31 giorni di vita. In Redis e non in memoria perché
server e worker chiamano le stesse fonti da due processi. Non aspetta e non
fallisce mai: un Redis giù non ferma le chiamate. Con `NODE_ENV=test` non
conta, o i test gonfierebbero i contatori dello sviluppo. Nessun dato personale:
l'informativa non cambia.

Le fonti contate (`apiCallSourceValues`): IGDB (solo le query, non il token),
HLTB, Metacritic, OpenCritic, Wikidata, ITAD, e Steam diviso fra Web API e store
perché hanno limiti diversi. I negozi collegati per utente (GOG, PSN, Xbox…) no:
poche chiamate e nessun limite noto. I limiti mostrati accanto stanno nei
messaggi (`admin.usage.limits`).

## Da fare a parte

- **IGDB può superare il suo limite.** La pausa di 250 ms (`igdb.ts`) vale dentro
  un processo, ma IGDB lo chiamano server e worker: insieme fino a 8 richieste al
  secondo contro 4. E `igdb.ts` non gestisce il 429, che diventa un errore
  qualunque. Non corrompe dati; il contatore dei 429 ora lo rende visibile. Un
  lotto suo.

## Verifica

- `pnpm --filter api test`: `admin-usage.test.ts` (attivi, giorni a zero e UTC,
  account `csv`, classifica, finestra degli esiti) e `context.test.ts`
  (`usage.get` respinge chi non è admin).
- Typecheck e lint di `contracts`, `api` e `web`.
- A occhio su `pnpm dev`, con dati finti, in chiaro e in scuro: `/admin/usage` e
  la colonna di `/admin/users`.
- Il contatore conta una chiamata vera fuori dai test (`hget apicalls:<oggi>`).
