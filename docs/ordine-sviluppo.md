# Ordine di sviluppo

Parte della documentazione in `docs/`, spostata dal CLAUDE.md della radice. Gli altri file: [modello-dati](modello-dati.md), [import-librerie](import-librerie.md), [negozi](negozi.md), [ordine-sviluppo](ordine-sviluppo.md), [scelte-scartate](scelte-scartate.md).

1. **Registrazione e auth**
2. **Inserimento manuale + prima UI web** — `backlog` con possesso, piattaforme e
   stato di completamento. Include la **ricerca IGDB** per scegliere il gioco da
   una lista, dato che il DB parte vuoto. **Niente voto, tag o categorie: sono lo
   step 5.**
3. **Recupero dati esterni** — l'**enrichment** vero e proprio: una fonte alla
   volta, IGDB per prima. Introduce la pipeline BullMQ e il worker.
4. **Import libreria Steam** — la prima libreria automatica. Riusa la pipeline
   dello step 3, che deve già esistere e reggere il volume. Porta con sé la
   scrittura idempotente dei possessi (`ensureOwnership`): un gioco già nel
   backlog, aggiunto a mano su un'altra piattaforma, deve prendersi il possesso
   `(pc, steam)` senza duplicare la riga di backlog né toccarne lo stato.
5. **Modifica del gioco** — le cose che hanno senso solo insieme, perché sono la
   stessa schermata:
   - **campi personali**: voto, note, tag e categorie. Il voto è da mezza stella
     a cinque, nullo finché non si vota — "non votato" non è "votato male". Le
     note sono l'unico testo libero ammesso, e proprio perché sono testo non
     diventano un campo su cui filtrare. Insieme **chiuso** di campi
     strutturati: l'utente non aggiunge un campo suo, i valori dei tag sì.
   - **possessi**: le mutazioni oRPC che espongono la scrittura già scritta allo
     step 4. Fino a qui l'unico modo di aggiungere una piattaforma era cancellare
     la riga e rifarla. Nasce **solo aggiunta**, perché togliere un possesso non
     bastava a farlo sparire — il prossimo import lo ricreava — e il taglio che
     reggeva era solo lo scollegamento dell'account, che regge proprio perché
     toglie _anche_ la fonte che ricreerebbe la riga (vedi «Il possesso sa da
     quale account viene»). La rimozione è arrivata dopo, quando il supporto
     dentro la chiave l'ha resa necessaria: vedi «Togliere una copia».

     Si aggiunge anche **il supporto**, ed è l'unico campo del form che non è
     personale: dichiarare il disco è l'unico modo di non perderlo il giorno
     che il gioco entra nell'abbonamento, perché il negozio quel disco non lo
     vede. Lasciandolo vuoto la riga si fa adottare dal primo import; con la
     chiave del vincolo allargata, dichiararlo dove l'import vede solo un
     diritto digitale scrive una **seconda copia**. Vedi il supporto in «Import
     di librerie».

     Ed è qui che «solo aggiunta» ha smesso di reggere: con due copie per
     console una riga sbagliata — il disco prestato che l'import ha dedotto —
     non si sarebbe più tolta. Il gesto di rimozione non nasce in questo step,
     ma è il supporto dentro la chiave a renderlo necessario.

   Due cose che si erano immaginate qui e stanno **fuori**, ciascuna perché è uno
   step suo e non un campo in più nel form:
   - **copertina da SteamGridDB**, per non subire quella di IGDB. Va deciso anche
     di chi è la scelta: `games` è condivisa fra tutti gli utenti, quindi o è un
     override per utente su `backlog`, o il primo che sceglie decide per tutti.
   - **ri-collegamento a IGDB**: correggere l'`igdbId` di un gioco risolto male, o
     collegarne uno inserito a mano che senza `igdbId` non verrà mai arricchito.
     Non è una modifica personale ed è più di una UPDATE: `games.igdbId` è unique,
     quindi se l'id di destinazione esiste già bisogna **fondere due righe
     `games`** — con i loro backlog, possessi ed `external_ids` — e le due righe
     di backlog dello stesso utente, decidendo quale stato, quale voto e quali tag
     sopravvivono. È anche l'evento che riapre un `game_sources` in `not_found`.

     E non è solo `games.igdbId`: quando l'errore viene da un import la riga
     sbagliata è quella di `external_ids`, e finché resta lì togliere il gioco
     dal backlog non serve a niente — il prossimo import lo ricollega identico.
     Vedi «Un collegamento sbagliato non si disfa togliendo il gioco».

6. **Recupero HLTB**
7. **Filtraggio** — ricerca e filtraggio dei giochi, con possibilità di
   salvataggi.
8. **OpenCritic** — i voti della critica, e con loro **Metacritic**: sono la
   stessa schermata e lo stesso modello, e separarli avrebbe voluto dire
   scrivere due volte la stessa tabella. Porta `game_scores` (vedi sotto).
9. **Altre librerie** — gli altri negozi, in sei tempi. L'ordine non è per
   simpatia: è per quanto dura il credenziale e per quanto costa risolvere
   l'identità (vedi «Le altre librerie» sotto).
   - **9a — GOG, Epic, Amazon**: tutti PC, tutti un gesto solo che non si
     ripete. Qui si costruiscono i token cifrati, e la forma del provider si
     estrae da tre casi veri invece che da Steam più le ipotesi.
   - **9b — PSN**: prima console, ed è quella che ha smentito due delle sue
     tre premesse. La piattaforma per riga sì, ed è entrata nel modello. Il
     possesso «vero» no: **274 righe su 336 vengono da PS Plus**. E l'id
     risolvibile nemmeno — vedi «PSN» qui sotto. I **dischi fisici**, che fra
     gli acquisti non compaiono, entrano dall'elenco dei giocati
     (`service: other`) risolti per concept, e il possesso lo dice
     (`medium`). Il rinnovo entro dieci giorni, perché il collegamento non
     muoia da solo, lo fa l'aggiornamento automatico.
   - **9c — EA**: non un account collegato ma un'**importazione una tantum**.
   - **9d — Nintendo**: **due fonti** che si completano — le **Virtual Game Cards**
     (la libreria digitale, anche mai avviata) e lo **storico di gioco** (ciò che
     si è avviato, cartucce comprese, che diventano `medium: physical`). Login col
     codice nell'indirizzo di un pulsante che non si clicca, session token da due
     anni, risoluzione per nome. Vedi «Nintendo (9d)» in [negozi](negozi.md) e
     `plans/9d-nintendo.md`. **Rilasciato sul mini PC dal 06/10/2026**, per
     provarlo su un server attivo; il rilascio agli altri utenti resta da
     decidere: il rinnovo lo fa il server con due identità non nostre (l'app e
     il portale).
   - **9e — Xbox**: ciò che torna è «giocato», non «posseduto». Non si comincia
     prima di aver deciso cosa vuol dire — è la domanda in fondo a «Le altre
     librerie», e per ora è volutamente aperta.
   - **9f — Steam con login e Family**: il login Steam col QR **accanto** al
     solo profilo pubblico (le due cose sulla stessa riga), e con lui la
     libreria della famiglia. La domanda sul «gioco di tuo fratello» ha avuto la
     stessa risposta del PSN Plus: entra, marcato `steam_family`. **Fatto, e dal 06/10/2026
     rilasciato sul mini PC** per provarlo su un server attivo: Steam ha
     bloccato temporaneamente l'account dell'utente, e la prova serve a sapere
     se un login da server è accettato. Il rilascio agli altri utenti aspetta
     l'esito. Vedi «Il blocco dell'account» in
     [negozi](negozi.md) e il piano in `plans/9f-steam-login.md`.
10. **Import da file** — importazione di giochi da file CSV. **In analisi.**
    Il file di prova è un export di Playnite, in
    `apps/api/test/fixtures/playnite-export-2026-08.csv`.
11. **Admin** — dove finisce ciò che nessun automatismo ha saputo chiudere.
    Diviso in due lotti:
    - **11a, fatto** (piano in `plans/11a-admin.md`). Il ruolo admin col
      plugin di Better Auth, e il primo admin con
      `pnpm --filter api admin:grant`. Una sezione `/admin` con quattro parti:
      **dati mancanti** (fonte per stato, con «Riprova» e «Inserisci id», anche
      su una fonte `ok` agganciata male; l'id scritto a mano è esente
      dall'unicità), **scarti** di tutti (collegare e nascondere per tutti),
      **segnalati** (le segnalazioni degli utenti, con la scheda admin del
      gioco e «Non è questo gioco», che ripunta un collegamento sbagliato) e
      **utenti** (ruolo, ban, sessioni). Sulla pagina del gioco, «Segnala un
      errore». Nel match per nome, a parità di titolo conta la piattaforma
      della voce: è il caso Toki, l'arcade agganciato al posto del remake.
    - **11b, la fusione di due righe `games`** — lo stesso gioco con due id,
      o uno senza `igdbId` e uno con —, con backlog, possessi, `external_ids`
      e le due righe di backlog dello stesso utente. «Collega a IGDB» con un
      id già usato rimanda qui.

    La riapertura _automatica_ di un `not_found` non sta qui: è enrichment, e
    la sua regola sta scritta lassù. Qui c'è solo ciò che va deciso da un umano.

12. **Ui** — layout e design dell'applicazione.
13. **AI** — layer di raccomandazione, scelta del provider LLM ed embedding.
14. **Gestione abbonamenti** — PS Plus, Game Pass e chi verrà. Nasce dal 9b,
    dove si è scoperto che l'abbonamento non è un caso di frontiera: su una
    libreria PSN vera è l'**81%** delle righe. Oggi quei giochi entrano in
    backlog e il possesso porta `ownerships.subscription` a dirlo; qui si
    decide cosa succede quando l'abbonamento **finisce**, che è l'unico momento
    in cui quelle righe cominciano a mentire.

    Le domande sono tre e nessuna ha una risposta ovvia: si cancellano, si
    nascondono o si lasciano lì marcate come «non più tuo»? Chi se ne accorge —
    l'import successivo, che non li vedrà più tornare, o un controllo esplicito
    dello stato dell'abbonamento (PSN lo dichiara: il profilo porta `isPlus`)?
    E il voto o i tag che l'utente ci ha messo sopra, che restano roba sua anche
    quando il gioco non c'è più?

    Una cosa che l'API **non** può aiutare a decidere, ed è misurata: Sony marca
    `PS_PLUS` tanto il gioco mensile riscattato — che resta tuo finché sei
    abbonato — quanto il catalogo Extra/Premium, che tuo non è mai stato. Quella
    distinzione lì dentro non c'è, e nessuna colonna nostra può inventarla.

    E ce n'è una terza, peggiore delle due: `PS_PLUS` può coprire un **disco**.
    _God of War_ (2018) comprato su disco e poi arrivato nel Plus è marcato
    abbonamento su entrambi gli elenchi. Cancellarlo alla fine del Plus
    toglierebbe dal backlog un gioco che sta sullo scaffale.

    Metà risposta c'è già, ed è il supporto dentro la chiave del vincolo: chi
    dichiara il disco si ritrova **due righe**, e cancellando quella
    dell'abbonamento il gioco resta. Metà, perché nessuno può dichiarare un
    disco che non sa di dover dichiarare: finché il Plus dura le due copie si
    somigliano, e la differenza si scopre il giorno in cui è troppo tardi. Se
    questo step decidesse di cancellare, dovrebbe **chiedere prima** — è
    l'unico momento in cui l'utente ha l'informazione e noi no.

15. **Playlist, wishlist e gioco a caso** — tre pezzi, nell'ordine 15a, 15b,
    15c. La 15b riusa la tabella della 15a; la 15c non dipende dalle altre due.

    **15a — Playlist** (aggiunta il 06/10/2026, **da fare per prima**). I filtri
    del backlog salvati con un nome. Le liste in homepage sono comode, e sarebbe
    bello che ogni utente potesse crearne di sue. Decisioni prese il
    06/10/2026:
    - **leggono il backlog** (non il catalogo), e sono **dinamiche**: una
      playlist è un `BacklogQuery` salvato con un nome, per utente, e la query
      gira a ogni apertura. Hanno **rotte loro**, non sono una vista di
      `/backlog`.
    - **il JSON è una colonna come le altre**, senza versione: un campo nuovo è
      opzionale e non rompe niente; rinominare o togliere un campo, o cambiare
      un valore di un enum, porta una migration che riscrive le playlist
      salvate. Altrimenti Zod scarta il campo in silenzio e la playlist
      mostrerebbe più giochi del previsto. I tag sono salvati per id: uno
      cancellato si ignora, e la playlist lo dice.
    - **la tabella viene per prima**: la wishlist (15b) la riusa come «lista
      con nome».

    **15b — Wishlist** (**costruita l'08/10/2026**, piano in
    `plans/15b-wishlist.md`). Più liste con nome, fatte a mano, separate da
    `backlog`: stanno in `playlists` col tipo `wishlist` (la `query` diventa
    facoltativa) e i giochi in `wishlist_items`, con solo il gioco e la data. Un
    gioco o è in una lista o è nel backlog: entrando nel backlog esce da tutte. Si
    aggiunge dalla scheda del gioco; `/wishlist` e `/wishlist/$id` come le
    playlist. L'arricchimento è quello di sempre, perché `games` è condivisa.

    **15c — Gioco a caso** (aggiunto il 07/10/2026). Un pulsante che porta alla
    scheda di un gioco preso a caso dal proprio backlog. Aiuta a rispondere a
    «cosa gioco adesso» senza ragionamento: la scelta è SQL, l'LLM non c'entra
    e non dipende dallo step 13. Decisioni prese il 07/10/2026:
    - **pesca fra i giochi dell'utente con stato `backlog` («da giocare») e non
      nascosti** (`hidden_at` nullo). Una procedura oRPC ne restituisce uno; il
      pulsante fa `navigate` alla scheda del gioco. Con il backlog vuoto non c'è
      niente da aprire: il pulsante è disabilitato o lo dice.
    - **sta nella toolbar di `/backlog`**, non in homepage: la home è il
      catalogo di tutti, uguale per tutti anche da anonimi, e non parla della
      libreria di chi guarda. Il punto preciso si fissa col wireframe, quando
      arriva lo step.
    - **ignora i filtri della pagina**. Pescare dentro i filtri attivi, o dentro
      una playlist, è un'estensione possibile ma lo lega a `BacklogQuery`: non
      è nel primo giro.

    **Fatto l'08/10/2026.** `backlog.random` rende `{ slug }` o `null` (un backlog
    senza giochi «da giocare» non è un errore), scelto da SQL con `random()`
    (`pickRandomBacklogGame`). Il bottone «Gioco a caso» sta fra le azioni in
    cima a `/backlog`, accanto a «Aggiungi gioco», e non nella barra dei filtri:
    è il gesto di «cosa gioco adesso», e lì si vede anche sul telefono, dove la
    barra è già piena. Non c'è nella vista dei nascosti. Con la lista vuota un
    avviso dice che non ci sono giochi da pescare.

    **15d — Condivisione delle playlist** (aggiunta l'08/10/2026, **costruita lo
    stesso giorno**, piano in `plans/15d-condivisione.md`). Un link solo per due
    usi: una pagina pubblica, visibile a tutti, con i giochi di una playlist e
    le sole informazioni pubbliche del gioco; e il passaggio dei filtri a chi ha
    un account. Decisioni sulla privacy: dinamica, il proprietario non compare,
    nascosti ed `excluded` mai visibili, solo con il link e `noindex`.

16. **Cancellazione ed esportazione dell'account** — **fatto il 06/10/2026**
    (piano in `plans/16-cancellazione-esportazione.md`). L'utente elimina il
    proprio account e scarica i propri dati: i diritti di cancellazione e di
    portabilità del GDPR (artt. 17 e 20). Aggiunto in coda il 01/10/2026, dopo
    aver deciso la licenza (AGPL-3.0) e visto cosa raccogliamo: nome, email, la
    libreria e i token dei negozi. Com'è andata, sulle domande qui sotto:
    la cancellazione è `deleteUser` di Better Auth con la password pretesa da
    un hook, l'ultimo admin non si cancella, e `beforeDelete` cancella prima il
    backlog (la cascata passerebbe lo stesso, ma per l'ordine delle FK). Le
    domande originali:
    - **cosa si porta via la cancellazione.** Le FK dell'utente sono in
      cascade, ma `games` è condivisa e **non si cancella mai**: se ne vanno
      backlog, possessi, tag, account dei negozi e i loro token, e restano i
      giochi.
    - **cosa contiene l'esportazione**: backlog, possessi, voti, note, tag,
      senza i token.
    - **la conferma passa dalla password.** `session.freshAge` è 0 (vedi
      `packages/auth`), quindi Better Auth non controlla più che la sessione
      sia recente: `delete-user` va chiamato **con** la password, e il server
      deve rifiutare la richiesta senza.
    - **fino ad allora** un'informativa privacy non può prometterli: o si
      scrive un indirizzo a cui chiedere, o questo step viene prima.

Ricerca ed enrichment sono due usi distinti di IGDB e non vanno confusi: lo step 2
cerca e salva id e titolo, in modo sincrono e senza coda; lo step 3 scarica i
metadata completi in job asincroni.

Poi: mobile — che non è solo un'altra interfaccia, perché una `WebView` nativa
sblocca i negozi che dal web non si possono collegare (vedi «Le altre librerie»).

Non anticipare step successivi: se una feature appartiene allo step 13, non
implementarla mentre si lavora sull'1.
