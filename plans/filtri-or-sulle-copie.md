# Filtri: le copie in OR, e sulla stessa copia (ritocco allo step 7)

**Stato: chiuso il 13/11/2026.**

## Perché

Ogni spunta dentro un criterio era in AND: «PS5» + «Xbox» trovava solo i giochi
che hai su tutte e due. Per «cosa gioco adesso» la domanda è l'opposto: «un gioco
di carte e d'azione che ho sulla PS **o** sulla Xbox».

## Com'è fatto

- **Generi, temi e tag** restano in AND: dicono com'è il gioco, e «carte» e
  «azione» li vuole tutti e due.
- **Piattaforma, negozio, abbonamento e supporto** passano in OR: dicono quale
  copia hai.
- Quei quattro criteri, più «senza abbonamento», si chiedono **alla stessa
  copia**: una sola `EXISTS` su `ownerships` in
  [backlog-search.ts](../apps/api/src/services/backlog-search.ts). Prima ognuno
  guardava le copie per conto suo, e «PS5» + «Fisico» trovava un gioco con un
  digitale PS5 e una cartuccia Switch. Lo faceva già solo «senza abbonamento»
  (`nonEsclusa`).
- Stato e tipo restano in OR, come prima.
- Il pannello: nei quattro gruppi delle copie il suggerimento passa da
  `allOfThem` a `oneOfThem`.
- Niente migration: le playlist salvate con due piattaforme mostrano più giochi,
  e lo stesso vale per il dado (15c), che usa lo stesso filtro.
- Roadmap: non c'entra, è una correzione.

## Verifica

- `pnpm --filter api test -- backlog-search`: i casi in AND su piattaforme,
  abbonamenti e supporto capovolti; nuovi «PS o Xbox + Fisico» e «generi in AND».
- A mano su `/backlog`: due piattaforme spuntate allargano la lista invece di
  restringerla.
