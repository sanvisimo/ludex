# Filtro «Supporto»: digitale o fisico (ritocco allo step 7)

**Stato: in corso dal 16/10/2026.** Branch `feat/filtro-supporto`, da `main`.
Roadmap: `mediaFilter` a «in corso».

## Perché

Ogni copia dice già che cosa hai in mano: `ownerships.medium`, `digital` o
`physical`, nullo se non dichiarato (gli inserimenti manuali). Lo scrivono gli
import: i dischi PSN dall'elenco dei giocati (9b), le cartucce Nintendo dallo
storico di gioco (9d). Nel DB di sviluppo, il 16/10/2026: 14 copie fisiche PSN,
19 Nintendo e una a mano. Nessun filtro lo guardava.

## Com'è fatto

Come `stores`, su un'altra colonna:

- `BacklogFilterSchema.media: Medium[]`, **in AND**: un gioco con almeno una
  copia per ogni supporto spuntato. Tutti e due vuol dire «ce l'ho in tutti e due
  i modi».
- Una copia senza supporto non corrisponde a nessuna spunta: un criterio attivo
  esclude i NULL, come altrove.
- Il predicato «copia non esclusa» (`excludeSubscriptions`) sta anche dentro
  questa sottoquery: un digitale che hai solo dal Plus non conta, se il Plus è
  escluso. Con store e piattaforma invece è un criterio in più, ognuno sulla sua
  copia, come piattaforma e store fra loro.
- Le opzioni (`listBacklogFilterOptions`) offrono solo i supporti presenti fra le
  copie **visibili**.
- Il pannello ha una sezione «Supporto» fra Store e Famiglia e abbonamenti, con
  le etichette che c'erano già (`medium.digital`, `medium.physical`), un chip per
  valore. Le playlist lo ereditano senza migration: è un campo in più, e una
  playlist vecchia non ce l'ha.

## Dove

| File                                           | Cosa                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| `packages/contracts/src/schemas.ts`            | `media` nel filtro e nelle opzioni               |
| `apps/api/src/services/backlog-search.ts`      | l'`EXISTS` per valore e le opzioni               |
| `apps/api/src/services/backlog-search.test.ts` | i casi qui sopra, contro Postgres                |
| `apps/web/lib/backlog-filter.ts`               | il campo nell'URL, nei criteri e nelle playlist  |
| `apps/web/components/backlog-filters.tsx`      | la sezione del pannello e i chip                 |
| `apps/web/messages/{it,en}.json`               | `filters.mediaLabel`, `filters.noMedia`, roadmap |
| `apps/web/lib/roadmap.ts`                      | `mediaFilter` a «in corso»                       |

## Verifica

`pnpm --filter api test`, `pnpm --filter web test`, `pnpm lint`,
`pnpm check-types`. A mano: in `/backlog`, Filtri → Supporto → «Fisico» mostra
solo i giochi con un disco o una cartuccia, e il chip «Fisico» lo spegne.
