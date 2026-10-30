# Step 15f — Playlist aperte

**Stato: in corso dal 28/10/2026, lotto A.** Decisa il 22/10; il 28/10 l'utente
l'ha anticipata a prima del rilascio e di 13a e 13b
([ordine di lavoro](../docs/ordine-sviluppo.md)). Roadmap: `openPlaylists`, «in
corso». Nasce dalla nota «Da decidere: playlist aperte» in
[15b-wishlist.md](15b-wishlist.md).

**Fatto**: il server (28/10), il wireframe (approvato il 30/10), dnd-kit e le
pagine web (30/10). **Il lotto resta aperto** finché l'utente non lo dice pronto:
i commenti che arrivano vedendolo in uso vanno qui.

Il branch si chiama `feat/15f-playlist-aperte` dal 30/10 (prima
`ccr-286468c8-3f1wau`, che il proxy della sessione non ha lasciato cancellare dal
remoto: va tolto a mano).

### Il wireframe (29/10/2026, da approvare)

In [15f-playlist-aperte.excalidraw](15f-playlist-aperte.excalidraw). Si parte
dalle schermate di oggi: `/playlist` con le fasce delle playlist a filtro, la
lista della wishlist (griglia, ricerca, ordine, «Ce l'ho» e «Togli»), la scheda
del gioco con il pannello del backlog o con «Aggiungi al backlog» e «In
wishlist». La proposta, schermata per schermata:

1. **`/playlist`** ha due sezioni, **prima «Scelte a mano», poi «Filtri
   salvati»**: le nuove sono quelle da costruire a mano, le altre restano com'è
   oggi. Nell'intestazione «+ Nuova playlist», che crea una scelta a mano (quelle
   a filtro si creano ancora dal backlog). Le fasce sono le stesse di oggi, con
   il numero sulla card. Una sezione vuota tiene il titolo e una riga sola con
   il suo bottone; senza niente del tutto, lo stato vuoto di oggi con tutti e
   due i bottoni.
   - **1b**: il dialog «Nuova playlist», col nome soltanto; crea e apre la
     playlist. Lo stesso dialog fa «Rinomina».
   - **1c**: il menu ⋯ di una playlist scelta a mano: su, giù, rinomina,
     condividi, elimina. Niente «Modifica filtri».
2. **La playlist aperta**, `/playlist/curated/$id`: intestazione con
   «Condividi» e ⋯, poi la ricerca sul titolo e «+ Aggiungi giochi». Niente
   menu dell'ordine. Card come quelle della wishlist, con **lo stato in alto a
   sinistra (come oggi), il numero in basso a sinistra e il cuore in basso a
   destra**; sotto, la maniglia ⠿ a sinistra e il menu ⋯ a destra. Si
   trascina dentro la pagina; il numero è la posizione nella lista intera.
   - **2b**: il menu della card: sposta su, sposta giù, sposta alla
     posizione…, togli (con «Annulla»). Su e giù passano da una pagina
     all'altra.
   - **2c**: il dialog «Sposta alla posizione…», con il posto di adesso e un
     numero da 1 a N.
   - **2d**: con la ricerca la maniglia sparisce, il menu resta, i numeri sono
     quelli della lista intera.
3. **«Aggiungi giochi»**: un dialog che **resta aperto**, con la ricerca della
   barra in alto (prima i tuoi, poi Ludex, poi IGDB). Ogni riga ha «Aggiungi»,
   che diventa «✓ Aggiunto · n. 101»; un gioco già in lista dice il suo numero.
4. **La scheda del gioco**: «≡ Aggiungi a playlist ▾» in una riga sua, sotto i
   bottoni di oggi, sia per i giochi tuoi sia per gli altri. Il menu è quello
   della wishlist: una spunta per playlist e «+ Nuova playlist…», che la crea col
   gioco dentro. Stando in almeno una il bottone dice «In 2 playlist ▾».
5. **Telefono**: due colonne, la maniglia si tiene premuta un attimo prima di
   trascinare, «Condividi» diventa l'icona.
6. **Il link**: la pagina di oggi con i numeri sulle card e senza «Usa questi
   filtri».

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
5. **«Sposta alla posizione…»** nello stesso menu, con un campo numerico (28/10):
   il piano era pensato su 20 giochi, e con 100 portare l'80 al 3 a colpi di «su»
   vorrebbe decine di clic. Sul server non costa niente: la funzione è già «sposta
   il gioco X alla posizione N».

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
  lo scroll sul telefono, e copertina e titolo restano link. **Cambiato il
  30/10**: si trascina tutta la card, la maniglia resta per la tastiera (vedi «I
  commenti vedendolo in uso»).
- Aggiornamento ottimistico, che torna indietro se il server dice di no.
- **Si trascina dentro la pagina visibile.** Per un'altra pagina restano «Sposta
  su / giù» e «Sposta alla posizione…» nel menu ⋯ della card.
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
- La roadmap: `openPlaylists` è «in corso» dal 28/10; passa a «fatto» quando
  l'utente dice che il lotto è pronto.

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

### Il server, com'è venuto (28/10/2026)

- **Migration** `0062_playlist_kind_curated`: il valore dell'enum e
  `wishlist_items.position`, nullo fuori dalle playlist aperte. Nessun letterale
  del valore nuovo, quindi niente `55P04`.
- **Servizio** in [curated-playlists.ts](../apps/api/src/services/curated-playlists.ts),
  **contratto** `curatedPlaylists` (`list`, `create`, `rename`, `remove`, `move`,
  `get`, `add`, `removeGame`, `moveGame`, `forGame`, `share`, `unshare`). `get`
  dà a ogni gioco il suo `position` nella lista intera, da 0 e senza buchi, anche
  con la ricerca: serve al web per «su», «giù» e per il numero sulla card.
- `movePlaylist`, `sharePlaylist` e `unsharePlaylist` prendono il tipo come
  argomento, col default di prima.
- **Il link**: `SharedPlaylist` è diventato un'unione su `kind` (`filter` con
  query e `droppedTags`, `curated` senza). Nel web `/shared/$token` è cambiato
  solo quanto basta a compilare: i bottoni dei filtri e l'avviso sui tag solo per
  `filter`. Il resto della pagina è del passo 4.
- **La fusione** (11b) porta la posizione al gioco che resta; non era nel piano,
  ma senza il gioco sarebbe finito in fondo.
- **Test**: [curated-playlists.test.ts](../apps/api/src/services/curated-playlists.test.ts),
  17 casi, tutti quelli elencati sopra; uno in più in `admin-merge.test.ts`.

### I commenti vedendolo in uso (30/10/2026)

1. **«Aggiungi a playlist…» anche nel menu ⋯ delle card**, del backlog (e quindi
   delle playlist a filtro) e delle scelte a mano: apre in un dialogo le stesse
   spunte della scheda del gioco, perché il menu non ha sottomenu.
2. **Il trascinamento su tutta la card**, non più solo dalla maniglia. La
   decisione del 22/10 temeva il conflitto col dito e coi link: col dito parte
   dopo 200 ms, quindi lo scorrimento veloce resta; il clic che arriva al
   rilascio si ferma, quindi la scheda non si apre; la pressione lunga non apre
   il menu del telefono. **La maniglia resta**, com'era, per la tastiera e come
   segno che si può trascinare.

Provati con Playwright: dalla copertina il gioco si sposta e la scheda non si
apre, un clic semplice la apre, la tastiera dalla maniglia sposta, la spunta del
dialogo aggiunge e toglie. Il dito non è provato: va visto su un telefono vero.

### Le pagine, come sono venute (30/10/2026)

Come il wireframe, con queste differenze e aggiunte:

- **`curatedPlaylists.positions`**, un endpoint in più: il dialogo «Aggiungi
  giochi» dice «già al n. 12» prima del clic, e il server era l'unico a saperlo.
- **Main era andato avanti** con una sua `0062`: la nostra migration è diventata
  la `0063`, con lo stesso contenuto. Chi aveva applicato la vecchia `0062` in
  locale (solo questa sessione) ricrea il database.
- **«Annulla» dopo «Togli»** rimette il gioco in fondo e poi al suo posto: due
  chiamate, perché `add` mette sempre in fondo.
- **Le fasce di `/playlist`** troncano il nome lungo invece di mandare a capo il
  numero dei giochi; valeva anche per quelle a filtro, ed è corretto per tutte e due.
- In console restano due avvisi che c'erano già sulle pagine di prima (`onPress`
  e le misure `icon` dei bottoni di Tamagui): non vengono da qui.
- Provato con Playwright su dati finti: trascinamento col mouse e con la
  tastiera, su, giù, alla posizione, togli e annulla, aggiungi, la ricerca che
  spegne le maniglie, la scheda del gioco nei due casi, il link da anonimo e il
  telefono. IGDB in questa sessione non risponde (niente credenziali), quindi i
  risultati IGDB del dialogo non sono stati visti.

### Passi

1. **Server**: migration, servizio, contratti, test. **Fatto il 28/10.**
2. **Wireframe** (Excalidraw): `/playlist` con le due sezioni, la lista aperta
   con maniglia e ricerca per aggiungere, il menu sulla scheda del gioco.
   **Approvato il 30/10.**
3. **Dipendenza**: installare dnd-kit in `apps/web`. **Fatto il 30/10.**
4. **Web**: le pagine, l'aggiunta dalla scheda e dalla ricerca, il
   trascinamento, la condivisione. **Fatto il 30/10.**
5. **Documentazione**: [modello-dati](../docs/modello-dati.md),
   [ordine-sviluppo](../docs/ordine-sviluppo.md), `apps/web/CLAUDE.md`.
