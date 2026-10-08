# Step 15b — Wishlist

**Scelte approvate l'08/10/2026**: più liste con nome (la B), solo gioco e data,
niente marcatore sulle card, niente disegno prima del codice. Costruita lo stesso
giorno; il lotto si chiude quando l'utente dice che è pronto. Il testo di partenza, in [docs/ordine-sviluppo.md](../docs/ordine-sviluppo.md):
una tabella separata da `backlog`, arricchita come i giochi posseduti, e «riusa la
tabella delle playlist come lista con nome».

## Cosa dicono già i documenti

- **Tabella separata, non giochi «non posseduti» dentro `backlog`**: così ogni
  query su `backlog` resta semplice ([modello-dati](../docs/modello-dati.md)).
- **Comprato il gioco, la riga migra.**
- **Anche i giochi in wishlist puntano a `games`**: durata e voti servono
  _prima_ dell'acquisto.

## Cosa ho trovato nel codice

- **L'arricchimento è già gratis.** `games` è condivisa e la spazzata del
  worker legge tutta la tabella ([enrichment.ts](../apps/api/src/services/enrichment.ts)),
  non solo i giochi che stanno in un backlog; un gioco creato dalla ricerca
  (`games.fromIgdb`) accoda già il suo arricchimento. Una voce di wishlist è una
  riga che punta a `games`, e il resto viene da solo.
- **La scheda del gioco non ha dove metterla.** Per un gioco che non è nel backlog
  la pagina mostra solo «Aggiungi al backlog» ([game-page.tsx](../apps/web/components/game-page.tsx)).
  Ed è da lì — remake, simili, risultati della ricerca — che si aggiungeranno alla
  wishlist (12d, 12f).
- **«Aggiungi al backlog» pretende almeno un possesso** (piattaforma): la
  piattaforma è il filtro hard. Quindi «ce l'ho» non può essere un clic solo.
- **Le playlist leggono `backlog`.** Una wishlist non ha possessi né stato, quindi
  un filtro come «solo Switch» non ha senso; ha senso quello sui dati del gioco
  (durata, voto, anno, generi).

## Una frase da chiarire: «riusa la tabella delle playlist»

Può voler dire tre cose, e cambiano molto il lavoro:

- **A. Una wishlist sola per utente.** Nessun nome, nessuna playlist di mezzo:
  una tabella `wishlist (utente, gioco, data)`. Le playlist non si toccano.
- **B. Più liste con nome** («Regali», «Saldi d'estate»), a mano. Ogni lista è una
  riga di `playlists` con un `tipo`, e i giochi stanno in una tabella di
  appartenenza. Vuol dire che `playlists.query` diventa facoltativa (una lista a
  mano non ha una query), e che «playlist» smette di voler dire solo «filtro
  salvato»: è la base di **liste di giochi scelti a mano**, anche fuori dalla
  wishlist.
- **C. Playlist che leggono la wishlist** come origine al posto del backlog: i
  filtri salvati, ma sui giochi desiderati.

La A è la più piccola e non chiude niente: la B si può costruire sopra, quando
serve, con una migration. **Propongo la A.** Se la B è proprio ciò che volevi,
dimmelo: è un altro lavoro, e va disegnata prima.

## Decisioni (la B)

La frase sulle playlist voleva dire **più liste con nome**, fatte a mano
(«Regali», «Saldi d'estate»). Quindi:

- **`playlists` ha un `tipo`**: `filter` (le playlist di prima, una query
  salvata) e `wishlist` (una lista a mano, senza query). La `query` diventa
  facoltativa e un vincolo dice che c'è se e solo se il tipo è `filter`.
- **Il nome è unico per utente _e tipo_** (senza guardare le maiuscole): una
  playlist «Brevi» e una lista «Brevi» sono cose diverse e non si danno fastidio.
  Anche l'ordine («Sposta su», «Sposta giù») è dentro il tipo.
- **`wishlist_items(list_id, game_id, added_at)`**: i giochi di una lista, chiave
  `(lista, gioco)`. Un gioco può stare in più liste. Una voce porta **solo il
  gioco e la data**.
- **Solo le playlist a filtro si condividono**: le liste non hanno un link.

**Il passaggio al backlog.** Un gioco o è in una wishlist o è nel backlog:

- **Aggiungere al backlog** (a mano, dal dialogo con la piattaforma, o da un
  import) **lo toglie da tutte le liste** dell'utente, nello stesso comando. Sono
  due soli punti di scrittura: `addToBacklog` e `ensureBacklogEntries`.
- La lettura di una lista **esclude comunque** i giochi che l'utente ha nel
  backlog (`NOT EXISTS`): se una strada di scrittura se ne dimenticasse, non si
  vedrebbe un gioco già comprato.
- **Togliere un gioco dal backlog non lo rimette in lista.**
- **Aggiungere a una lista un gioco che hai già nel backlog è un conflitto.**

**Dove si aggiunge.** Nella scheda del gioco, accanto a «Aggiungi al backlog»
(che è già il «ce l'ho»), per un gioco che non è nel backlog: un menu «Wishlist»
con le liste come voci spuntabili, e «Nuova lista…». **Senza liste, il primo
«aggiungi» crea una lista che si chiama «Wishlist»** e ci mette il gioco: la
persona che vuole solo mettere da parte un gioco non deve inventare un nome.
~~Niente bottone sulle card di home e ricerca, e niente marcatore «in wishlist»
sulle card.~~ **Cambiato lo stesso giorno, vedi «Il cuore sulle card»**.

**Le pagine.** Come le playlist:

- **`/wishlist`**: una fascia per lista (le card della home), con «N giochi», il
  menu ⋯ (Rinomina, Sposta su, Sposta giù, Elimina) e «Nuova lista».
- **`/wishlist/$id`**: la lista aperta, in griglia (`HomeCard`: copertina,
  titolo, anno, durata, voto della critica), con ricerca sul titolo, ordine (data
  di aggiunta, nome, uscita, durata, voto della critica), «per pagina» a multipli
  delle colonne, e per ogni card «Ce l'ho» (apre il dialogo del backlog, con la
  piattaforma) e «Togli dalla lista». Niente pannello dei filtri nel primo giro.
- Voce «Wishlist» nel menu dell'avatar, dopo «Playlist».

**Il resto.** L'esportazione include le liste e i loro giochi (nome, `igdbId`,
data); la cancellazione le porta via per cascade sull'utente. Il mobile aspetta.

## Test (sul server, contro Postgres)

- aggiungere è idempotente (due volte, una riga) e non tocca le liste degli altri;
- le playlist a filtro e le liste non si confondono: ognuno vede, sposta e
  condivide solo le sue, e i nomi sono unici dentro il tipo;
- un gioco nel backlog non compare in wishlist, e aggiungerlo al backlog **dalla
  strada manuale e da quella degli import** toglie la riga;
- togliere dal backlog non rimette in wishlist;
- ricerca, ordinamento e paginazione; la wishlist di un altro non si legge né si
  cambia;
- l'esportazione contiene la wishlist e la cancellazione dell'account la porta via.

## Piano in passi

1. **Server**: `tipo` e `query` facoltativa, `wishlist_items`, le funzioni delle
   playlist limitate al loro tipo, le liste (crea, rinomina, sposta, elimina,
   aggiungi, togli, leggi), il passaggio al backlog, l'esportazione, i test.
2. **Scheda del gioco**: il menu «Wishlist».
3. **`/wishlist` e `/wishlist/$id`**, la voce di menu.
4. **Documentazione**: [modello-dati](../docs/modello-dati.md) e [ordine-sviluppo](../docs/ordine-sviluppo.md).

## Scelte approvate

1. **B**: più liste con nome, fatte a mano.
2. **Solo gioco e data.**
3. **Nessun marcatore «in wishlist»** sulle card di home, ricerca e playlist
   condivise. ~~Approvata, poi rivista~~: vedi «Il cuore sulle card».
4. **Nessun disegno prima del codice.**

## Fatto

- **Server**: migration 0043 (`playlists.kind`, `query` facoltativa con un vincolo
  che la lega al tipo, nome unico per `(utente, tipo, nome)`, e `wishlist_items`).
  Le funzioni delle playlist a filtro lavorano solo sul tipo `filter`
  ([playlists.ts](../apps/api/src/services/playlists.ts)); le liste sono in
  [wishlist.ts](../apps/api/src/services/wishlist.ts), e il passaggio al backlog in
  [wishlist-sync.ts](../apps/api/src/services/wishlist-sync.ts), chiamato da
  `addToBacklog` e `ensureBacklogEntries`.
- **Test**: 21 in [wishlist.test.ts](../apps/api/src/services/wishlist.test.ts),
  verificati rompendo il servizio in cinque punti (il passaggio dal dialogo, quello
  dagli import, la lettura che esclude il backlog, e i due tipi che si confondono,
  da una parte e dall'altra): ogni rottura ne ha fatto fallire almeno uno. Più 4 sul
  web per l'URL di una lista.
- **Web**: «Wishlist» nella scheda del gioco ([WishlistControl](../apps/web/components/wishlist-control.tsx)),
  `/wishlist` a fasce, `/wishlist/$id` con ricerca, ordine, «per pagina» e per ogni
  card «Ce l'ho» e «Togli» (con «Annulla»), la voce nel menu dell'avatar.

Cosa è andato diversamente dall'analisi:

- **«Ce l'ho» è il dialogo del backlog** (`AddGameDialog` con `game`), con un bottone
  suo: non c'è un secondo flusso, e quando il gioco entra nel backlog esce da tutte
  le liste da solo.
- **Il passaggio al backlog sta in un modulo a parte** (`wishlist-sync.ts`), che non
  importa il resto: `backlog.ts` lo chiama, e la lettura delle liste importa
  `backlog-search.ts`, che importa `backlog.ts`. Un modulo solo avrebbe fatto un
  giro.
- **Il numero di giochi di una lista** (`count`) conta solo le voci visibili, cioè
  senza i giochi che hai nel backlog.
- **Le mutazioni invalidano le liste da un punto solo** (la `MutationCache` di
  `providers.tsx`): un gioco che entra nel backlog da qualunque strada le rilegge.

## Il cuore sulle card (08/10/2026)

Rivista la scelta 3: le card dei giochi che **non hai nel backlog** hanno un cuore,
vuoto per metterlo da parte e pieno se sta in una lista.

- **Dove**: home, ricerca e playlist condivise, solo da loggati. Non nelle card del
  backlog e delle tue playlist (sono giochi già tuoi), né nella lista aperta e
  nelle fasce di `/wishlist` (`showWishlist={false}`: lì sarebbe sempre pieno).
- **Vuoto**: aggiunge il gioco alla **prima** lista (o ne crea una «Wishlist»), con
  «Annulla».
- **Pieno**: se il gioco sta in **una** lista lo toglie, con «Annulla»; se sta in
  più liste apre il menu delle liste, perché serve scegliere da quale. Per
  decidere il ramo chiede al server `wishlists.forGame`.
- **Dati**: `HomeGame.wishlisted` (vero se sta in almeno una delle tue liste, mai per
  un gioco che hai nel backlog, falso da anonimo), calcolato da
  `wishlistedGameIds` ([wishlist-sync.ts](../apps/api/src/services/wishlist-sync.ts))
  in home, ricerca e playlist condivise; nella lista aperta è sempre vero.
- **Test**: 7 nuovi in [wishlist.test.ts](../apps/api/src/services/wishlist.test.ts),
  verificati rompendo l'helper in tre punti.
- **La card si divide in due link** (copertina e titolo, alla stessa scheda) più il
  cuore, che è un bottone sovrapposto: un bottone non sta dentro un link.
  Il menu delle liste si monta solo quando serve, non uno per card.

## Da decidere: playlist «aperte» (08/10/2026, idea dell'utente)

Una lista di giochi **scelti a mano, nell'ordine voluto**, che non segue il
backlog: es. «i 20 RPG più belli di sempre». Si sceglie un gioco alla volta e
lo si aggiunge alla playlist; l'ordine è quello deciso da chi la fa. Non è
ancora analizzata né approvata.

Si appoggia alle liste a mano (`wishlist_items`, le pagine `/wishlist`), ma **non
è la wishlist con un altro nome**: due regole della wishlist qui non valgono.

- **Giochi che hai già.** Una wishlist esclude quelli nel backlog, e aggiungerne
  uno è un conflitto. In una playlist aperta ci stanno anche i giochi tuoi (un
  «top 20» ha quelli che hai giocato).
- **L'ordine.** La wishlist ordina per data, nome, uscita, durata, voto: non ha
  una posizione scelta. Qui serve una colonna `position` su `wishlist_items` e un
  modo di spostare un gioco su e giù (come «Sposta su / giù» delle liste, ma per
  i giochi).

Strade (da scegliere):
1. **Un terzo `kind` di `playlists`** (`curated`), con le sue regole: nome unico
   nel tipo, nessun conflitto col backlog, `position` sulle voci. Le pagine
   riusano `/wishlist/$id`. È la più pulita, perché ogni tipo conserva le sue
   regole.
2. **Un'opzione sulla lista a mano** («lista ordinata»), con le due regole sopra
   che cambiano a seconda dell'opzione. Meno codice di schema, più `if` sparsi.

Da decidere anche, senza fretta:

- se le playlist aperte si **condividono** (oggi solo quelle a filtro hanno il
  link, 15d; una top 20 è il caso in cui avrebbe più senso);
- se possono essere **pubbliche** (08/10/2026): è un'altra cosa dal link. Il
  link del 15d è privato — chi lo ha la vede, ma non c'è un elenco, la pagina è
  `noindex` e il proprietario non compare. Una playlist pubblica si **trova**:
  compare in un elenco o in una pagina del profilo, forse indicizzabile, e
  quindi porta una domanda che il 15d aveva chiuso, cioè **se il nome di chi
  l'ha fatta si vede**. Vanno decise insieme: dove si trovano (un elenco
  «Playlist della community», la scheda di un gioco che dice in quali playlist
  pubbliche compare, o solo la ricerca), se si indicizzano, e se si possono
  segnalare. Se si fa, va riletta anche la privacy (`lib/legal.ts`), perché i
  testi descrivono ciò che Ludex mostra davvero. **Deciso (08/10/2026): tre
  livelli** — privata, con link, pubblica — sulla stessa colonna di
  visibilità, al posto del solo `share_token`. Restano aperte le domande
  sopra (nome di chi l'ha fatta, dove si trova, indicizzazione, segnalazioni);
- come si **aggiunge** un gioco (dalla scheda, come per la wishlist, o da una
  ricerca dentro la lista).
