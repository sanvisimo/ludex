# Le pagine categoria, dai badge della pagina del gioco

**Stato: piano, non cominciato (22/10/2026).** Nella roadmap è «in arrivo»
(`categoryPages`). Va messo in fila rispetto a rilascio · 13 · mobile: non è
uno degli step di [docs/ordine-sviluppo.md](../docs/ordine-sviluppo.md).

## La richiesta

Sulla pagina del gioco i badge — generi e temi, il tipo, le tue categorie e i
tuoi tag — devono essere cliccabili e portare ai giochi che corrispondono: il
filtro di `/backlog` con quel criterio acceso. Poi, una seconda parte: una vista
come il backlog ma sul **catalogo di tutti**, con i filtri.

Sono due pezzi di misura diversa, e il primo si usa da solo.

## A. I badge portano a `/backlog` (piccolo)

I tre badge e il criterio che il filtro di `/backlog` sa già leggere
([backlog-filter.ts](../apps/web/lib/backlog-filter.ts)):

| Badge                 | Dove                                                              | Filtro             |
| --------------------- | ----------------------------------------------------------------- | ------------------ |
| Generi e temi IGDB    | hero, [game-page.tsx](../apps/web/components/game-page.tsx)       | `attributes=<id>`  |
| Tipo (DLC, Remaster…) | hero, `GameTypeBadge`                                             | `gameTypes=<tipo>` |
| Categorie e tag tuoi  | pannello del backlog, `EntryTags`                                 | `tags=<uuid>`      |

Cosa manca: `attributes` vuole l'id di `igdb_attributes`, e la pagina del gioco
riceve solo `kind`, `igdbId` e `name`.

1. **Contratto e API**: `id` in `GameAttributeSchema`
   ([schemas.ts](../packages/contracts/src/schemas.ts), lo usa solo
   `GameDetail`) e `id: true` nella query di `findGameDetailById`
   ([games.ts](../apps/api/src/services/games.ts)). Nessuna migration.
2. **`BadgeLink`** in `apps/web/components/`: un `<a href>` intorno al `Badge`,
   con `takeLinkClick` (nuova scheda, tasto centrale) e l'anello del focus. Nel
   web e non in `packages/ui`, perché usa il router.
3. **La pagina del gioco** usa `BadgeLink` per i tre badge. Lo stato resta il
   default di `/backlog`, cioè tutti tranne «non mi interessa».

Decisioni di default:

- **Da anonimi i badge restano semplici**: `/backlog` è privato. Quando c'è la
  parte B, da anonimi porteranno al catalogo.
- **Solo sulla pagina del gioco**: nelle card di `/backlog` gli stessi badge
  stanno dentro il link della card, e un link non sta dentro un link.
- **Niente wireframe**: la schermata non cambia struttura.

## B. Il catalogo con i filtri (medio)

Una vista come `/backlog`, ma su `games` intera, pubblica, con lo stato di chi
guarda come in `/search`.

Cosa c'è già:

- **`/search`** ([catalog-search.ts](../apps/api/src/services/catalog-search.ts)):
  catalogo intero, pubblica, griglia con la card della home, pagine nell'URL,
  LEFT JOIN su `backlog` per lo stato di chi guarda. Cerca solo per nome.
- **I filtri sul gioco** sono già in `buildConditions`
  ([backlog-search.ts](../apps/api/src/services/backlog-search.ts)): generi e
  temi, tipo, durata HLTB, voto della critica, uscita. C'è l'indice su
  `game_attributes.attribute_id`.

Cosa va fatto:

1. **API.** `buildConditions` si divide in condizioni sul gioco e condizioni sul
   backlog. Il backlog le usa tutte e due, il catalogo la prima. Un endpoint
   pubblico (o `games.find` allargato) e le opzioni del filtro calcolate sul
   catalogo, non sul backlog di chi guarda. Test contro Postgres.
2. **Il pannello dei filtri.** `FilterPanel`, la barra e i chip leggono
   `useBacklogFilter`, legato alla rotta `/backlog`: vanno resi indipendenti
   dalla rotta, con le sole sezioni che sul catalogo hanno senso. È il pezzo
   più grosso.
3. **Le piattaforme**: sul catalogo non ci sono copie, solo `platform_igdb_ids`,
   che si traduce nei nostri slug con `platforms`. È un filtro nuovo.
4. **Schermata nuova**: prima wireframe, poi codice. Da decidere se è una pagina
   sua o `/search` col pannello.

Non hanno senso sul catalogo: stato, store, abbonamenti, supporto, tag tuoi, il
tuo voto, «mai giocato», nascosti.

Da sapere:

- **Il catalogo non è IGDB**: sono i giochi che qualche utente ha importato o
  aperto. Con pochi utenti «tutti i Roguelike» è un elenco casuale.
- **È scoperta, non «cosa gioco adesso»**: per l'obiettivo del progetto è
  secondaria, e va messa in fila di conseguenza.

## Come si verifica

- A: da loggati, sulla pagina di un gioco un clic su un genere apre `/backlog`
  con quel genere acceso nel pannello; lo stesso per tipo e tag. Da anonimi i
  badge non sono link. `pnpm check-types`, `pnpm lint`.
- B: test del servizio contro Postgres (`pnpm --filter api test`), poi a occhio.
