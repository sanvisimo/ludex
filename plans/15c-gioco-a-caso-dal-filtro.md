# Il gioco a caso dal filtro

**Stato: chiuso il 16/10/2026.** Branch `feat/gioco-a-caso-dal-filtro`, da
`main`. Roadmap: `randomFilter` a «fatto». Primo in
[ordine di lavoro](../docs/ordine-sviluppo.md); è l'estensione della 15c.

## Perché

Il gioco a caso della 15c pesca solo fra i giochi «da giocare» e ignora i
filtri di `/backlog`. Chiesto il 13/10: che peschi **dal filtro selezionato**,
e che dalla scheda del gioco pescato si possa **passare a un altro**, sempre
dentro lo stesso filtro.

## Decisioni (16/10/2026)

- **Un dado fisso in basso a destra**, sempre visibile, al posto del bottone
  «Gioco a caso» nella toolbar di `/backlog`, che si toglie. Solo icona: con
  `aria-label` e `Tooltip` «Gioco a caso». La freccia «torna su» (`BackToTop`)
  gli compare **sopra**, così il dado non si sposta mai; sul telefono tutti e
  due stanno sopra la barra.
- **Da dove pesca:**

  | Chi guarda | Dove                       | Da dove pesca                                     |
  | ---------- | -------------------------- | ------------------------------------------------- |
  | Loggato    | `/backlog`                 | dal filtro attivo; senza filtri, tutto il backlog |
  | Loggato    | scheda arrivata col dado   | il successivo, stesso filtro e seme               |
  | Loggato    | qualunque altra pagina     | tutto il backlog, seme nuovo                      |
  | Anonimo    | ovunque                    | il catalogo, solo i tipi giocabili della home     |
  | Chiunque   | `/backlog`, vista nascosti | niente dado                                       |

  «Tutto il backlog» è **ciò che la lista mostra senza filtri**: tutti gli
  stati tranne `excluded`, mai i nascosti. Non è una regola del dado: è il
  default di `/backlog` (`defaultStatus`), quindi «pesca da ciò che vedi»
  vale sempre, anche se l'utente spunta «Non mi interessa». Il server non
  nasconde niente di sua iniziativa, come per la lista.

  L'anonimo pesca con la regola della home (`PLAYABLE_TYPES`): un DLC, un
  bundle o una colonna sonora non sono una risposta a «cosa gioco». Il dado
  sta nel guscio, non nella home: la home resta uguale per tutti.

- **Il continuo: un seme e il gioco su cui sei.** Il server mescola i
  candidati con `md5(seme || games.id)` — lo stesso trucco della rotazione
  della home — e il dado chiede «il primo dopo questo» nel mazzo, ricominciando
  dall'inizio in fondo. Il primo tiro è il primo del mazzo: col seme nuovo è un
  tiro equo. Quindi:
  - nessuna ripetizione finché non si è visto tutto il filtro;
  - nessuno stato sul server: il mazzo si ricalcola uguale dal seme;
  - regge se il filtro cambia sotto i piedi (segni «in corso» il gioco
    pescato da un filtro «da giocare»): il suo hash si calcola lo stesso, e il
    successivo resta giusto, dove un `offset` salterebbe un gioco.
- **Il filtro e il seme viaggiano nell'URL della scheda**, piatti come quelli
  di `/backlog`: `/games/hades?seed=k3f9&status=backlog&platforms=pc_windows`.
  Solo i criteri: non ordine, pagina, vista o `size`, che al dado non
  servono. Senza `seed` la scheda è quella di sempre, e il dado tira da capo.
  Il tasto indietro torna al gioco di prima, il refresh tiene il giro.
- **Nessun wireframe**: la schermata non cambia, si aggiunge un bottone
  flottante la cui posizione è decisa qui sopra. L'aspetto si rifinisce sulla
  pagina vera.

## Passi

1. Questo piano, e `randomFilter` a «in corso» nella roadmap, coi testi.
2. **Server.**
   - Contratto: `games.random({ filter?, seed, after? })` → `{ slug } | null`,
     pubblica; sostituisce `backlog.random`. `filter` è `BacklogFilter` senza
     `hidden`; `after` è lo slug della scheda.
   - `pickRandomGame` in `services/random-game.ts`: da loggati
     `buildConditions` di `backlog-search.ts` (esportata, sul solo filtro), da
     anonimi `PLAYABLE_TYPES` di `home.ts`. Via `pickRandomBacklogGame`.
   - Test contro Postgres: pesca dentro il filtro, giro completo senza
     ripetizioni, ripartenza dall'inizio, gioco uscito dal filtro, unico gioco,
     nascosti mai, anonimo mai un DLC.
3. **Web.**
   - `lib/backlog-filter.ts`: `validateRandomSearch` (la `validateSearch` della
     scheda), `randomSearch` (filtro + seme da mettere nell'URL),
     `toRandomFilter` (dall'URL al contratto), coi test.
   - `RandomGameDice` nel guscio, accanto a `BackToTop`, che perde il suo
     contenitore fisso: lo tiene il guscio per tutti e due.
   - Via `RandomGameButton` dalla toolbar di `/backlog`.
4. `docs/ordine-sviluppo.md` e `apps/web/CLAUDE.md`; roadmap a «fatto» quando
   il lotto è pronto.

## Verifiche

- `pnpm --filter api test -- random-game`
- `pnpm --filter web test`
- `pnpm check-types` e `pnpm lint`
- A mano: da `/backlog` con un filtro, il dado apre una scheda con `seed`
  nell'URL; il dado sulla scheda passa al successivo, e dopo N giochi (N del
  filtro) ricomincia. Da anonimo, dalla home, apre un gioco del catalogo.

## Avanzamento

**16/10/2026: passi 1–4 fatti**, e il lotto chiuso lo stesso giorno: roadmap
a «fatto». Test del dado (`random-game.test.ts`, 9 casi) e del web (`il dado` in
`backlog-filter.test.ts`) verdi, typecheck e lint puliti.

Provato in Chromium da anonimo, a 1280 e a 390 di larghezza: quattro tiri di
fila tengono lo stesso seme, il tasto indietro torna al gioco di prima, e sul
telefono la freccia sta sopra il dado e tutti e due sopra la barra. **Il giro da
loggati non è provato nel browser**: lo coprono i test del servizio.

**Trovato provando.** La prima versione leggeva dove si è dalle rotte montate
(`useMatch`): un secondo clic mentre la scheda di prima caricava ancora le
trovava ferme alla pagina di partenza, e il dado ripartiva con un seme nuovo.
Ora legge `router.state.location` al clic, che è già l'indirizzo verso cui si
sta andando.
