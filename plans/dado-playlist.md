# Il dado dentro le playlist

Richiesta (20/11/2026): su una playlist «Scegli per me» deve pescare dalla
playlist, non da tutto il backlog. E il bottone «Scegli per me» va
nell'intestazione delle playlist, come nel backlog.

## Deciso

- `games.random` prende `playlistId` facoltativo. Da loggati, con una playlist
  tua: a filtro, il filtro salvato (tag cancellati ignorati, come
  `openPlaylist`, con `existingTags` condivisa); scelta a mano, i suoi giochi,
  anche fuori dal backlog. Una playlist non tua dà `null`. Mazzo e `after`
  come prima.
- Il dado riconosce `/playlist/$id` e `/playlist/curated/$id` al clic e manda
  l'id; la scheda pescata tiene `?seed=…&playlist=…` al posto dei criteri, così
  il giro resta nella playlist.
- La ricerca testuale della pagina **non** conta: si pesca dalla playlist intera.
- «Scegli per me» (`RandomGameDice labelled`) nell'intestazione delle due
  pagine, prima del menu ⋯; lì il dado flottante non c'è.
- Roadmap non toccata: estensione del dado, già «fatto».

## Verifiche

- `random-game.test.ts`: playlist a filtro (solo il filtro salvato, giro
  completo, tag cancellato), scelta a mano (anche giochi fuori dal backlog),
  playlist di un altro (`null`).
- `backlog-filter.test.ts`: `validateRandomSearch` e `randomSearch` con
  `playlist`.
- A occhio, nell'app: le due pagine in chiaro e scuro, desktop e telefono; il
  giro con Playwright (3 giochi a mano: 3 diversi poi da capo; filtro «in
  corso»: solo i 4 in corso, poi da capo).
