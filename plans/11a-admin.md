# Step 11a — Admin

**Aperto il 05/10/2026.** Piano approvato dall'utente con tre decisioni (sotto).
La fusione di due righe `games` è uscita da qui ed è il lotto **11b**, con un
piano suo. Sotto ogni passo, man mano, cosa è stato fatto e cosa l'ha smentito.

## Contesto

Lo step 11 in [ordine-sviluppo](../docs/ordine-sviluppo.md) è «dove finisce ciò
che nessun automatismo ha saputo chiudere»: giochi non collegati, scarti
d'import, fonti in `not_found`, gestione degli utenti. Qui c'è solo ciò che va
deciso da un umano; la riapertura automatica dei `not_found` è enrichment e
resta lì.

Cosa c'è già, letto dal codice:

- **Nessun ruolo.** Better Auth (1.6.27) ha solo email e password
  ([packages/auth](../packages/auth/src)), oRPC ha `authed` e `maybeAuthed`
  ([context.ts](../apps/api/src/rpc/context.ts)).
- **L'id esterno scritto a mano è già quasi possibile.** HLTB, OpenCritic e
  Metacritic, se `game_sources.external_id` c'è, vanno per id e saltano il
  match per nome ([hltb-enrichment.ts](../apps/api/src/services/hltb-enrichment.ts),
  [opencritic-enrichment.ts](../apps/api/src/services/opencritic-enrichment.ts),
  [metacritic-enrichment.ts](../apps/api/src/services/metacritic-enrichment.ts)).
  All'admin basta scrivere l'id, rimettere la fonte in `pending` e accodarla.
- **Gli scarti sono per utente** (`unresolved_imports`): lo stesso Netflix su
  PSN è una riga per ogni utente. Risolverne uno scrive già la mappatura in
  `external_ids` **per tutti**
  ([unresolved-imports.ts](../apps/api/src/services/unresolved-imports.ts)),
  ma gli scarti degli altri restano lì fino al loro prossimo import.
- **La fusione di due `games`** è descritta allo step 5 e non esiste: è l'11b.

## Decisioni prese

- **Ruolo admin col plugin `admin` di Better Auth**: porta `role`, `banned`,
  `banReason`, `banExpires` su `user` (e `impersonatedBy` su `session`), e le
  chiamate per elencare utenti, cambiare ruolo, bannare, chiudere le sessioni.
  Schema rigenerato con `pnpm auth:generate`, migration da drizzle-kit. Il
  primo admin lo nomina uno script a mano.
- **Fusione di due giochi: lotto nuovo, 11b.** Qui «Collega a IGDB» funziona
  solo se l'id IGDB è libero; se è già di un altro gioco lo dice e si ferma.
- **Uno scarto nascosto può valere per tutti, e si fa ora.** Vedi sotto.
- **Ripuntare un collegamento sbagliato sta qui, non nell'11b** (06/10/2026),
  ed è **solo dell'admin**. Lo ha riportato dentro il caso Toki, sotto.
- **L'utente segnala, l'admin corregge** (06/10/2026). Un collegamento
  sbagliato non lo vede nessun automatismo: il gioco ha `igdbId` e le fonti in
  `found`, quindi non finisce in nessuna lista. Lo vede solo chi ce l'ha in
  libreria. Dalla pagina del gioco l'utente lo segnala, e può suggerire il
  gioco giusto (nome o id IGDB); l'admin trova le segnalazioni nella sezione
  Giochi.

- **«Dati mancanti» al posto di «Fonti»** (06/10/2026): una sezione sola, con
  la tabellina dei conteggi in cima; il motivo del `not_found` diventa una
  colonna; l'id scritto a mano dall'admin è esente dall'unicità. Vedi il
  passo 4.

## Il caso Toki (06/10/2026)

`/games/toki`: l'import Nintendo ha agganciato l'arcade del 1989, ma il gioco
in libreria è il remake del 2018. E non c'è modo di correggerlo.

**Perché ha sbagliato** (dedotto dal codice, da verificare sul database con
`select e.source, e.external_id, g.name, g.igdb_id, g.first_release_date from
external_ids e join games g on g.id = e.game_id where g.slug = 'toki'`):

1. Nintendo non dà un id IGDB: si va per nome, con `resolveByName`
   ([library-import.ts](../apps/api/src/services/library-import.ts)). E la voce
   non porta l'anno ([nintendo-import.ts](../apps/api/src/services/nintendo-import.ts)).
2. IGDB ha due «Toki» col nome identico; senza anno `pickByName` rinuncia.
3. Decide `breakTieByReviews`, che prende la scheda più recensita: l'arcade.
4. La voce sapeva di essere **Switch** (`platformSlug`), e su Switch c'è solo
   il remake. Il matcher la piattaforma non la guarda, e la ricerca IGDB non la
   chiede nemmeno.

**Perché non si corregge.** L'errore sta in `external_ids`, che vale per tutti
e che l'import legge per prima: togliere il gioco dal backlog non serve. E il
rimedio scritto in [import-librerie](../docs/import-librerie.md) — cancellare la
riga e reimportare — qui non funziona: la voce non torna fra gli scarti, viene
ricercata per nome e ricollegata allo stesso arcade.

Due rimedi, tutti e due in questo lotto:

- **prevenire**: a parità di nome, contano prima le schede IGDB uscite sulla
  piattaforma della voce, poi le recensioni. È il passo 1, ed è import, non
  admin. Non corregge i collegamenti già scritti;
- **correggere**: «non è questo gioco, è quest'altro», nella sezione Giochi
  dell'admin (passo 6). Solo admin, perché la riga è di tutti: collegare uno
  scarto riempie un vuoto, ripuntare cambia la libreria di chi il gioco ce l'ha
  già. Lo stesso confine degli scarti nascosti per tutti.

**Chi se ne accorge è l'utente**, e l'admin lo sa solo se glielo dice: da qui
la segnalazione (passo 6). Intanto l'utente non deve fare niente: quando
l'admin ripunta, la sua copia si sposta da sola. Se nel frattempo il gioco gli
dà fastidio, lo nasconde con `hidden_at`.

Le casistiche, messe in fila:

| Caso                                                        | Chi lo vede    | Chi corregge                                 |
| ----------------------------------------------------------- | -------------- | -------------------------------------------- |
| import collegato male (Toki): `external_ids` sbagliata      | l'utente       | l'admin, su segnalazione                     |
| aggiunto a mano scegliendo la scheda IGDB sbagliata         | l'utente       | l'utente: lo toglie e aggiunge quello giusto |
| gioco senza `igdbId`                                        | la lista admin | l'admin                                      |
| fonte `found` ma sul gioco sbagliato (HLTB, OpenCritic, MC) | l'utente       | l'admin, su segnalazione, con «Inserisci id» |

**Le copie non sanno da quale id sono nate**: `ownerships` non ha l'id del
negozio. Spostarle vuol dire prendere, sul gioco sbagliato, le copie di quel
negozio. Su Toki basta — l'arcade su Switch non esiste — e dove è ambiguo
l'admin vede quali copie si spostano prima di confermare.

## Scarti nascosti per tutti

La regola già scritta in [import-librerie](../docs/import-librerie.md) era «per
utente adesso, promuovibile dopo»: questo è il «dopo». La forma:

- **una tabella nuova, `global_hidden_imports`**: `store`, `external_id`,
  `hidden_kind`, chi l'ha deciso, quando. Chiave (`store`, `external_id`).
- **Solo i tipi che sono un fatto**: `app`, `dlc`, `extra`, `prerelease`. Mai
  `unwanted`, che è una preferenza: un vincolo nel database lo esclude.
- **Promuovere** nasconde, con quel tipo, le righe di `unresolved_imports` con
  quella chiave che sono ancora visibili. Quelle già nascoste dall'utente non si
  toccano.
- **All'import**, `recordUnresolved` fa nascere già nascoste le righe nuove la
  cui chiave è nella tabella. Solo all'inserimento: l'upsert di un reimport non
  tocca `hidden_at`, quindi un utente che la rimette fra i «da sistemare» resta
  libero di farlo.
- **Togliere dalla tabella** smette di applicarla alle righe nuove e non tocca
  quelle già scritte.

## Passi

1. **La piattaforma nel match per nome.** La ricerca IGDB chiede anche le
   `platforms` di ogni risultato, tradotte nei nostri slug con
   `platforms.igdb_id`. In `resolveByName`, se la voce ha `platformSlug` e fra
   i candidati esatti uno solo è uscito su quella piattaforma, è quello; se no
   si va avanti come oggi (`pickByName`, poi `breakTieByReviews`). Vale per
   ogni negozio che dice la piattaforma per riga (PSN, Nintendo).

   **Fatto** (06/10/2026). `IgdbSearchHit.platformIds` in
   [igdb.ts](../apps/api/src/external/igdb.ts), `breakTieByPlatform` in
   [library-import.ts](../apps/api/src/services/library-import.ts). L'ordine
   è `pickByName`, poi la piattaforma, poi le recensioni: la piattaforma rompe
   un pareggio, non scavalca un giudizio fatto su nome e anno. Le piattaforme
   sono quelle di tutto il gruppo, perché su PSN lo stesso titolo arriva per
   PS4 e per PS5. Verificato sul database che Toki è la voce Nintendo
   `0100f3400a432000` → IGDB 12228, l'arcade. Il collegamento già scritto
   resta sbagliato finché non lo corregge il passo 6.

2. **Ruolo admin.** Plugin `admin` nel server e nel client di
   [packages/auth](../packages/auth/src), `pnpm auth:generate`, migration.
   Middleware `admin` in [context.ts](../apps/api/src/rpc/context.ts) (dopo
   `authed`, rifiuta chi non ha `role = 'admin'`), gruppo `admin.*` nel
   contratto. Script per nominare il primo admin per email, documentato in
   [apps/api/CLAUDE.md](../apps/api/CLAUDE.md).

   **Fatto** (06/10/2026). Plugin in
   [packages/auth](../packages/auth/src), migration
   [0034_admin_plugin](../packages/db/drizzle/0034_admin_plugin.sql), middleware
   `admin` in [context.ts](../apps/api/src/rpc/context.ts) con il suo test
   (401 senza sessione, 403 senza ruolo, passa l'admin; sessione vera di
   Better Auth, non finta), `pnpm --filter api admin:grant <email>`. Cose che
   il piano non diceva:
   - il gruppo `admin.*` nel contratto nasce al passo 4, con la prima
     procedura: vuoto non serve a niente, e il test del middleware usa una
     procedura sua;
   - col plugin il tipo di `auth` nomina zod, e `tsc` di `@repo/auth` falliva
     sulla portabilità delle dichiarazioni (TS2742). Il package non emette
     niente e si consuma dal sorgente: `declaration` spento nel suo tsconfig,
     invece di aggiungere zod alle sue dipendenze;
   - `pnpm auth:generate` non legge il `.env` da solo: va lanciato con le
     variabili caricate (`set -a; . ./.env; set +a`), e chiede conferma prima
     di sovrascrivere.

3. **Wireframe** (Excalidraw, `11a-admin.excalidraw`) di `/admin`, delle
   quattro sezioni e del form di segnalazione sulla pagina del gioco. Si
   corregge lì finché la struttura non è approvata.

   **Fatto** (06/10/2026), otto frame, approvati. Due cose che il piano non
   diceva: la **scheda admin di un gioco** è una pagina sua,
   `/admin/giochi/:slug`, che mette insieme i gesti delle fonti (passo 4) e
   dei collegamenti (passo 6) su un gioco solo, ed è da lì che si fa
   «Inserisci id» su una fonte `ok`; le **segnalazioni stanno dentro
   Giochi**, col conteggio nel menu. Sulla pagina del gioco, chi il gioco non
   ce l'ha non vede il pannello «Nella tua libreria»: il link «Segnala un
   errore» sta allora sotto «Durata e critica».

4. **Dati mancanti** (era «Fonti in `not_found`», allargato il 06/10/2026).
   In cima una tabellina di conteggi, fonte per stato: in coda, non trovati
   da sistemare, non trovati giusti così, trovati ma vuoti (HLTB senza durata,
   OpenCritic e Metacritic senza voto), falliti. Più due righe: giochi senza
   id IGDB (passo 6) e scarti d'import (passo 5). Ogni cella apre la lista
   filtrata, con gioco, motivo e quanti utenti ce l'hanno. Per la coda
   OpenCritic basta quante e da quando: il budget del giorno vive nella
   memoria del worker, e mostrarlo vorrebbe dire salvarlo in Redis.

   **Il motivo del `not_found` diventa una colonna**, `game_sources.reason`:
   `too_old`, `no_results`, `ambiguous`, `year_mismatch`, `taken`. Oggi è
   solo il testo di `error`, diverso per ogni fonte, e separare «da
   sistemare» da «giusto così» vorrebbe una regex sul testo. La scrive
   l'enrichment; la migration la riempie una volta sulle righe che ci sono.
   La lista di default mostra solo i sistemabili (`ambiguous`,
   `year_mismatch`, `taken`). Sul database di sviluppo, 06/10/2026: dei 574
   `not_found` di OpenCritic 349 sono `too_old`.

   Azioni «Ritenta» (in coda) e «Inserisci id» (`external_id` scritto,
   `pending`, in coda). **«Inserisci id» vale su qualunque fonte, anche
   `ok`**: Metal Gear Solid 3 – Master Collection ha Metacritic `ok` ma
   agganciato a Peace Walker, che nessuna lista dei mancanti mostra. Ci si
   arriva dalla scheda del gioco nell'admin, o da una segnalazione.

   **L'id scritto a mano è esente dall'unicità** (06/10/2026). Il vincolo
   `(source, external_id)` su `game_sources` ferma i match automatici
   sbagliati, ma port e remaster condividono davvero la voce dell'originale
   (MGS3 Master Collection e MGS3 sono la stessa voce HLTB, 5913), e le 24
   righe HLTB e 23 Metacritic in `taken` sono probabilmente in buona parte
   questo. Una colonna `manual` su `game_sources`, scritta da «Inserisci id»;
   l'indice unique diventa parziale anche su `not manual`. I match automatici
   restano vincolati fra loro come oggi, **e contro una riga manuale no**
   (corretto il 06/10/2026): se l'originale arriva dopo, la voce è sua, e
   quella manuale è in prestito.

   **Fatto** (06/10/2026), solo l'api: le schermate sono del passo 8.
   Migration [0035](../packages/db/drizzle/0035_source_reason_manual.sql)
   (enum, colonne, indice) e
   [0036](../packages/db/drizzle/0036_source_reason_backfill.sql) (il
   backfill, che sul database di sviluppo ha classificato tutti i 917
   `not_found`); `markSource` vuole il motivo su ogni `not_found`, e il tipo lo
   impone ai 13 punti che lo scrivono; servizio
   [admin-sources.ts](../apps/api/src/services/admin-sources.ts) e procedure
   `admin.missing.summary`, `admin.missing.list`, `admin.sources.retry`,
   `admin.sources.lookup`, `admin.sources.setExternalId`. Cose che il piano
   non diceva:
   - i motivi sono **sei**: c'è anche `gone`, l'id che avevamo e che la fonte
     non ha più (pagina HLTB sparita, IGDB che non conosce l'id);
   - **`no_results` è da sistemare**, non giusto così: «non ha nulla» può essere
     un nome cercato male. Giusto così resta solo `too_old`;
   - «Inserisci id» accetta l'id o l'indirizzo della scheda, e l'id lo estrae
     il server; `admin.sources.lookup` dice prima di salvare di chi è già.

5. **Scarti d'import di tutti**: raggruppati per negozio e id esterno, con
   quante librerie li hanno e come li hanno nascosti. Azioni:
   - **«Collega per tutti»**: la riga di `external_ids` e la risoluzione degli
     scarti di ogni utente con quella chiave, con la stessa logica di
     `resolveUnresolvedImport`;
   - **«Nascondi per tutti»** con il tipo, e il suo rovescio: la sezione sopra.
6. **Giochi**, quattro pezzi, l'ultimo fuori dall'admin:
   - **non collegati** (senza `igdbId`): lista, con quanti utenti li hanno in
     backlog. Azione «Collega a IGDB» se l'id è libero, altrimenti un messaggio
     che rimanda all'11b;
   - **segnalazioni**: una tabella nuova, `game_reports`: utente, gioco, cosa è
     sbagliato (la copia di un negozio, oppure una fonte: `hltb`, `opencritic`,
     `metacritic`), il suggerimento facoltativo (`suggested_igdb_id` e
     `suggested_name`), una nota libera, quando, e `resolved_at` /
     `resolved_by`. Una sola segnalazione aperta per utente, gioco e cosa:
     risegnalare aggiorna quella. Nell'admin sono raggruppate per gioco, con
     quanti utenti l'hanno detto e i suggerimenti; da lì si apre il gioco con
     il suggerimento già nella ricerca. Si chiudono da sole quando l'admin
     corregge quella cosa su quel gioco, oppure a mano con «Archivia»;
   - **collegati male**, il caso Toki: dal gioco, le sue righe di
     `external_ids`, e l'azione «Non è questo gioco» con la ricerca IGDB. Ripunta
     la riga (il gioco giusto lo crea `resolveGameFromIgdb` se non c'è), sposta
     sul gioco giusto le copie di quel negozio di ogni utente che le ha, e le
     mostra prima di confermare. **La riga di backlog**, per ogni utente: se sul
     gioco sbagliato non ha altre copie, si sposta tutta (stato, voto, note,
     tag) sul gioco giusto, perché quel voto l'ha dato al gioco che credeva di
     avere; se ha altre copie, o ha già il gioco giusto in backlog, si spostano
     solo le copie e la riga resta (le due righe dello stesso utente sono l'11b).
   - **Lato utente**, sulla pagina del gioco: «Segnala un errore», un form
     piccolo con cosa è sbagliato (le copie per negozio, le fonti), «Suggerisci
     il gioco giusto» con la ricerca IGDB già usata per l'inserimento a mano
     (sceglierne uno dà l'id) o un nome scritto libero, e una nota. Con una
     segnalazione aperta, al posto del bottone c'è «Segnalato il …».
7. **Utenti**: nome, email, iscrizione, numero di giochi e di account
   collegati. Azioni: ruolo, ban e rimozione del ban, chiudi le sessioni. Niente
   cancellazione (step 16) e niente impersonazione.
8. **Web**: `/admin` col menu a sinistra come `/account`, sotto-rotte
   `mancanti`, `scarti`, `giochi`, `utenti`. Il link compare solo agli admin;
   la rotta rimanda via chi non lo è (la sicurezza vera la fa il middleware).
   La sezione «Dati mancanti», che era un «da capire», è decisa al passo 4.

9. **Documentazione**: step 11 in [ordine-sviluppo](../docs/ordine-sviluppo.md)
   diviso in 11a e 11b; in [import-librerie](../docs/import-librerie.md) la
   risposta alla domanda «è roba di uno o di tutti?», e il rimedio di «Un
   collegamento sbagliato non si disfa togliendo il gioco» corretto: per i
   negozi che vanno per nome cancellare la riga non basta.

## Verifica

Test contro Postgres, in `apps/api`:

- il middleware respinge un utente senza ruolo;
- con l'id inserito a mano l'enrichment va per id e non rifà il match;
- «Collega per tutti» ripetuto due volte dà lo stesso risultato;
- «Nascondi per tutti» non tocca le righe già nascoste dall'utente, e un
  import successivo fa nascere nascoste le righe nuove con quella chiave;
- `unwanted` non entra in `global_hidden_imports`;
- «Collega a IGDB» con un id già usato si rifiuta;
- a parità di nome vince il candidato uscito sulla piattaforma della voce, e
  senza piattaforma il risultato è quello di oggi (Toki come caso di test);
- «Non è questo gioco» ripunta la riga, sposta le copie di quel negozio e,
  ripetuto, non cambia niente; un import successivo legge la riga nuova;
- dopo «Non è questo gioco», chi aveva solo quella copia ritrova voto e note
  sul gioco giusto e nessuna riga sul gioco sbagliato; chi ha anche un'altra
  copia, o aveva già il gioco giusto, ha le due righe come prima, con le copie
  spostate;
- risegnalare lo stesso gioco aggiorna la segnalazione aperta, non ne crea
  un'altra; correggere quella cosa la chiude;
- «Inserisci id» accetta un id già di un altro gioco, e lo marca `manual`;
  un match automatico che trova un id già preso resta `not_found` con
  `reason = 'taken'`, e una riga manuale non ferma l'originale che arriva
  dopo;
- la migration di `reason` classifica le righe che ci sono (un caso per
  motivo, col testo di `error` di oggi).

`global_hidden_imports` e `game_reports` non sono seedate da una migration,
quindi non vanno aggiunte alla lista delle tabelle escluse dal troncamento.

## Fuori da questo lotto

- **11b — fusione di due righe `games`**, con backlog, possessi,
  `external_ids` e le due righe di backlog dello stesso utente.
- Ripuntare un collegamento **dalla pagina del gioco**, per ogni utente: no,
  solo admin (vedi «Il caso Toki»). Dalla pagina del gioco si segnala.
- Cancellazione ed esportazione dell'account: step 16.
- **La durata nascosta sulle card** (06/10/2026, web, da fare a parte).
  [game-duration.tsx](../apps/web/components/game-duration.tsx) la nasconde
  quando HLTB dice `hasSolo = false`, regola nata per Counter-Strike. Sbaglia
  sui giochi in co-op: Blanc (123 minuti) non la mostra. Sul database di
  sviluppo sono 67 le durate nascoste, 31 con la co-op. Va nascosta solo se
  non c'è né solo né co-op.
- **Il filtro «senza durata»** nel backlog (06/10/2026, step 7, da fare a
  parte): una spunta nel filtro della durata per i giochi che non ce l'hanno.
