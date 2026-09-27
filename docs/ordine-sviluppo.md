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
     toglie *anche* la fonte che ricreerebbe la riga (vedi «Il possesso sa da
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
9.  **Altre librerie** — gli altri negozi, in sei tempi. L'ordine non è per
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
    - **9d — Nintendo**: barattolo di cookie, nessun id che IGDB conosca.
    - **9e — Xbox**: ciò che torna è «giocato», non «posseduto». Non si comincia
      prima di aver deciso cosa vuol dire — è la domanda in fondo a «Le altre
      librerie», e per ora è volutamente aperta.
    - **9f — Steam con login e Family**: il login Steam al posto del solo
      profilo pubblico, e con lui la libreria della famiglia. Ha la stessa
      domanda di Xbox — un gioco della libreria di tuo fratello è tuo? — e va
      fatto per ultimo.
10. **Import da file** — importazione di giochi da file CSV. **In analisi.**
    Il file di prova è un export di Playnite, in
    `apps/api/test/fixtures/playnite-export-2026-08.csv`.
11. **Admin** — dove finisce ciò che nessun automatismo ha saputo chiudere. Non
    è una cosa sola:
    - **giochi non collegati** (senza `igdbId`, quindi mai arricchiti) e gli
      **scarti d'import** rimasti in `unresolved_imports`. Qui casca anche la
      terza domanda di «Ciò che non voglio vedere»: se una voce bocciata da uno
      possa valere per tutti, ed è questo il posto dove qualcuno lo deciderebbe.
    - **fonti in `not_found`**: il gioco è su IGDB, ma HLTB, OpenCritic o
      Metacritic non l'hanno trovato. È un mucchio a parte e molto più grande —
      sulla libreria di prova 455 righe contro 52 scarti d'import. Servono il
      ritentativo forzato e soprattutto **l'inserimento a mano dell'id
      esterno**: `game_sources.external_id` c'è già, e scritto lui il match non
      si rifà, si salta. È la valvola per ciò che nessuna euristica prenderà
      mai; l'alternativa è ritoccare le soglie del matcher finché non passa
      quel gioco lì, e romperne altri due.
    - **gestione degli utenti**.

    La riapertura *automatica* di un `not_found` non sta qui: è enrichment, e
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
    *God of War* (2018) comprato su disco e poi arrivato nel Plus è marcato
    abbonamento su entrambi gli elenchi. Cancellarlo alla fine del Plus
    toglierebbe dal backlog un gioco che sta sullo scaffale.

    Metà risposta c'è già, ed è il supporto dentro la chiave del vincolo: chi
    dichiara il disco si ritrova **due righe**, e cancellando quella
    dell'abbonamento il gioco resta. Metà, perché nessuno può dichiarare un
    disco che non sa di dover dichiarare: finché il Plus dura le due copie si
    somigliano, e la differenza si scopre il giorno in cui è troppo tardi. Se
    questo step decidesse di cancellare, dovrebbe **chiedere prima** — è
    l'unico momento in cui l'utente ha l'informazione e noi no.
15. **Wishlist** — tabella separata da `backlog`, arricchita come i giochi
    posseduti.

Ricerca ed enrichment sono due usi distinti di IGDB e non vanno confusi: lo step 2
cerca e salva id e titolo, in modo sincrono e senza coda; lo step 3 scarica i
metadata completi in job asincroni.

Poi: mobile — che non è solo un'altra interfaccia, perché una `WebView` nativa
sblocca i negozi che dal web non si possono collegare (vedi «Le altre librerie»).

Non anticipare step successivi: se una feature appartiene allo step 13, non
implementarla mentre si lavora sull'1.
