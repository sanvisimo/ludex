# Step 15f — Playlist aperte

**Stato: decisa il 22/10/2026, non cominciata.** Quando farla nell'ordine di
lavoro (rilascio · 13 · mobile) lo decide l'utente con calma. Roadmap:
`openPlaylists`, oggi «idea». Nasce dalla nota «Da decidere: playlist aperte»
in [15b-wishlist.md](15b-wishlist.md).

## Cosa si vuole

Una lista di giochi **scelti a mano, nell'ordine voluto**, che non segue il
backlog: «i 20 RPG più belli di sempre». Si aggiunge un gioco alla volta, e
l'ordine è quello di chi la fa.

## Decisioni (22/10/2026)

1. **Due lotti.**
   - **A — privata e con link.** È questo piano.
   - **B — pubblica**: si trova (elenco, profilo o scheda del gioco), forse si
     indicizza, si può segnalare, e porta la domanda che il 15d aveva chiuso,
     cioè se il nome di chi l'ha fatta si vede. Va riletta la privacy
     (`lib/legal.ts`). **Dopo il rilascio**: dietro Cloudflare Access nessuno
     da fuori la vedrebbe. La colonna di visibilità a tre livelli (privata, con
     link, pubblica), decisa l'08/10, arriva col B; nel lotto A basta
     `share_token`.
2. **Stanno in `/playlist`**, non in `/wishlist`: per chi usa l'app sono
   playlist. Due sezioni, «Filtri salvati» e «Scelte a mano».
3. **Si aggiunge in due modi**: dalla scheda del gioco e da una ricerca dentro
   la lista. Un top 20 fatto aprendo venti schede è scomodo.
4. **Drag&drop** per l'ordine, con «Sposta su / giù» nel menu della card come
   alternativa.

## Cosa c'è già

- **Le liste a mano**: `playlists` col suo `kind`, i giochi in
  `wishlist_items` ([wishlist.ts](../apps/api/src/services/wishlist.ts)).
- **Le regole della wishlist che qui non valgono sono già limitate al tipo
  `wishlist`**: l'uscita dalle liste quando un gioco entra nel backlog
  (`dropFromWishlists`) e il cuore sulle card (`wishlistedGameIds`), in
  [wishlist-sync.ts](../apps/api/src/services/wishlist-sync.ts). Lo è anche il
  link condiviso, limitato a `filter`
  ([shared-playlists.ts](../apps/api/src/services/shared-playlists.ts)). Un
  tipo nuovo non le eredita.
- **Il nome unico dentro il tipo** lo dà già `playlists_user_kind_name_idx`.
- **Nessuna libreria di drag&drop** nel repo.

## Lotto A

### Dati

- **Un terzo valore di `playlist_kind`: `curated`.** Attenzione al `55P04`
  (vedi la nota in `packages/db/src/schema/playlists.ts`): nella migration che
  lo aggiunge il valore non si usa come letterale.
- **`wishlist_items.position`**, intero, usato solo da `curated`. Un gioco
  nuovo va in fondo (`max + 1`, letto nella stessa INSERT come per le liste).
- La voce resta gioco, data e posizione: niente note.

### Regole

- Ci stanno **anche i giochi che hai nel backlog**, e aggiungerli al backlog
  non li toglie dalla lista.
- Sulle card lo **stato di chi guarda**, come nelle liste dei negozi; il cuore
  sui giochi che non hai, come nella home.
- Il conteggio li comprende tutti.
- La lista aperta segue **solo la posizione**: niente menu dell'ordine. La
  ricerca sul titolo resta.

### L'ordine

- **Server**: una funzione sola, «sposta il gioco X alla posizione N», che
  riscrive le posizioni della lista in una transazione. Su e giù sono due suoi
  casi.
- **Web**: `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0, in
  `apps/web` (la lista è una schermata, non un componente di `packages/ui`).
  Griglia, mouse, touch e tastiera, con gli annunci per lo screen reader.
  `@dnd-kit/react`, il successore, è ancora alla 0.5. Il mobile avrà la sua
  soluzione, sui gesti di React Native.
- Si trascina da una **maniglia** sulla card: la card intera litigherebbe con
  lo scroll sul telefono, e copertina e titolo restano link.
- Aggiornamento ottimistico, che torna indietro se il server dice di no.
- **Si trascina dentro la pagina visibile.** Per un'altra pagina restano «Sposta
  su / giù» nel menu ⋯ della card.
- **Con la ricerca attiva il trascinamento è spento**: su una lista filtrata
  non è chiaro dove finirebbe il gioco.

### Condivisione col link

- Lo stesso `share_token` e la stessa `/shared/$token` delle playlist a filtro,
  con i giochi nell'ordine scelto.
- Mai il nome del proprietario né niente di suo; niente «Usa questi filtri».
- Escono anche i giochi che il proprietario ha nascosto: li ha scelti lui, uno
  per uno.

### Il resto

- L'esportazione include le liste, con `igdbId` e posizione; la cancellazione
  dell'account le porta via per cascade.
- La roadmap: `openPlaylists` va in «in arrivo» ora che è decisa, in «in corso»
  quando il lavoro comincia.

### Test (contro Postgres)

- aggiungere è idempotente e mette in fondo;
- lo spostamento in cima, in fondo, in mezzo, alla stessa posizione, e su una
  lista di un altro (non succede niente);
- un gioco che entra nel backlog, dal dialogo e dagli import, **resta** nella
  lista;
- il cuore ignora queste liste;
- i tipi non si confondono: nomi, spostamento delle liste, condivisione;
- la lista di un altro non si legge né si cambia;
- il link mostra solo dati pubblici, nell'ordine scelto;
- l'esportazione le contiene.

### Passi

1. **Server**: migration, servizio, contratti, test.
2. **Wireframe** (Excalidraw): `/playlist` con le due sezioni, la lista aperta
   con maniglia e ricerca per aggiungere, il menu sulla scheda del gioco.
3. **Dipendenza**: installare dnd-kit in `apps/web`.
4. **Web**: le pagine, l'aggiunta dalla scheda e dalla ricerca, il
   trascinamento, la condivisione.
5. **Documentazione**: [modello-dati](../docs/modello-dati.md),
   [ordine-sviluppo](../docs/ordine-sviluppo.md), `apps/web/CLAUDE.md`.
