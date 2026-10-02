# Step 12c — Ritocchi al backlog

Seconda parte del 12c, non un lotto a sé: sono i commenti sul backlog visto in
uso, e il backlog non era finito. **Struttura approvata il 29/09/2026**, tutti
e sette i passi fatti. **Chiuso il 02/10/2026**: l'utente ha detto che il
backlog è pronto. Ciò che va rispettato d'ora in poi sta nei CLAUDE.md; qui
restano le ragioni e le misure. Approvata sul wireframe v2
([12c-backlog-ritocchi.excalidraw](12c-backlog-ritocchi.excalidraw): si apre
trascinandolo su excalidraw.com). Sotto ogni passo, man mano, cosa è stato
fatto e cosa l'ha smentito.

## Contesto

Il 12c ha rifatto `/backlog` (pagine, pannello dei filtri, tre viste). Visto
in uso, su telefono e desktop, i commenti sono stati:

- **telefono**: il menu va bene; ricerca, ordinamento e filtri prendono troppo
  posto. Le spunte dello stato occupano due righe. Sulla card manca il voto, e
  la tendina dello stato va sostituita con un bottone alla Trakt: la spunta,
  che premuta fa scegliere.
- **desktop**: la colonna dei filtri accanto alla barra del guscio sembra un
  secondo menu, e spinge la lista di lato. I filtri vanno in un drawer.
- **paginazione**: scegliere quanti giochi per pagina, «vai a pagina», e
  niente etichette «precedente» / «successiva».

Il metodo è quello del CLAUDE.md: screenshot e commenti, proposta scritta e
wireframe a bassa fedeltà (Excalidraw, due giri), poi il codice.

## Com'è oggi, misurato

- **La colonna dei filtri** è larga 256 px, a vista da `$xl`, accanto ai 240
  della barra del guscio
  ([\_app.\_private.backlog.tsx](../apps/web/src/routes/_app._private.backlog.tsx)).
  Sotto `$xl` lo stesso `FilterPanel` si apre nello `Sheet`, che in
  `@repo/ui` sale solo dal basso.
- **La barra** ([backlog-filters.tsx](../apps/web/components/backlog-filters.tsx))
  tiene ricerca, ordinamento con direzione, «Filtri» e vista; sotto, cinque
  bottoni di stato con l'etichetta, che su un telefono vanno su due righe.
- **Lo stato** si cambia da un `Select` largo 176 px in tutte e tre le viste
  ([backlog-views.tsx](../apps/web/components/backlog-views.tsx)).
- **Il voto** c'è già (`RatingValue`), ma non disegna niente se non hai votato:
  negli screenshot non compare mai. Il voto della critica è già calcolato,
  `games.critic_score` con la precedenza OpenCritic → Metacritic → IGDB
  ([modello-dati.md](../docs/modello-dati.md)), ma nel contratto sta solo su
  `GameDetailSchema`: alla lista non arriva.
- **Le pagine sono da 15** (`PAGE_SIZE`, commit `e859c69`), mentre il
  commento accanto e `apps/web/CLAUDE.md` dicono ancora 48.
- **`Pagination`** ([pagination.tsx](../packages/ui/src/components/pagination.tsx))
  ha precedente e successiva con l'etichetta e niente «vai a pagina».
- **Gli stati** sono un `pgEnum` (`backlog_status`) costruito da
  `backlogStatusValues` in
  [vocabulary.ts](../packages/contracts/src/vocabulary.ts).

## Le decisioni

1. **Due componenti in `@repo/ui`.**
   - **`Drawer`**: un pannello modale che entra da destra, alto quanto lo
     schermo, largo 380 px e quasi tutta la larghezza su un telefono. Come lo
     `Sheet`: Esc lo chiude, il focus entra, resta dentro e torna al bottone,
     da chiuso non è montato, `role="dialog"` col nome deciso da chi lo apre.
   - **`Pagination`**: precedente e successiva diventano solo frecce, con
     `aria-label`, spente agli estremi come oggi. In più un campo facoltativo
     «vai a pagina»: un numero e Invio, tenuto fra 1 e l'ultima.

2. **Lo stato alla Trakt, e un sesto stato.**
   - **Un'icona per stato**, in un punto solo dell'app:

     | Stato                           | Icona (lucide) |
     | ------------------------------- | -------------- |
     | Da giocare (`backlog`)          | `Bookmark`     |
     | In corso (`playing`)            | `Play`         |
     | Finito (`played`)               | `Check`        |
     | Completato (`completed`, nuovo) | `Trophy`       |
     | Abbandonato (`dropped`)         | `CircleStop`   |
     | Non mi interessa (`excluded`)   | `Ban`          |

     Abbandonato non usa la x: confondeva. Lo stop fa coppia col play di
     In corso.

   - **Il bottone**: la tendina diventa un bottone quadrato con l'icona dello
     stato; premuto apre un `DropdownMenu` a scelta singola
     (`DropdownMenuRadioGroup`, che c'è già) con icona ed etichetta. Uguale
     nelle tre viste, accanto al menu delle azioni.
   - **Gli stati nella barra**: stesse icone. Da `$sm` icona ed etichetta,
     sotto solo l'icona, con `Tooltip` e `aria-label`: così stanno su una
     riga.
   - **`completed` è il platinato, il 100%**: non sostituisce `played`, che
     resta «finito». Va in fondo agli stati «giocati», dopo `played`, e rientra
     nel filtro di default (tutti tranne `excluded`). Nessun import lo imposta
     da solo: dedurlo dai trofei PSN è un'altra storia.

3. **Filtri e ordinamento nel `Drawer`, su telefono e desktop.** La colonna di
   lato sparisce e la lista prende tutta la larghezza. Ordinamento e direzione
   diventano la prima sezione del pannello, anche su desktop. Nella barra
   restano ricerca, «Filtri (n)» e vista; sotto, gli stati e i chip dei
   filtri attivi, che dicono cosa c'è di acceso a drawer chiuso. Lo `Sheet`
   dal basso resta al menu del guscio.

4. **Quanti giochi per pagina**: 15, 30, 60 o 120, con 15 di default. Sta
   nell'URL (`size`, assente = 15) come la vista, e cambiarlo riporta a
   pagina 1. Tutti sotto il `max(200)` del contratto, che non cambia.
   Sul desktop «per pagina» a sinistra, le pagine al centro, «vai a pagina» a
   destra; sul telefono le pagine sopra, gli altri due sotto.

5. **Il voto sulla card: il tuo se c'è, altrimenti la critica.**
   - votato da te: `Star` e il voto, come oggi;
   - non votato, con un voto della critica: `Award` e il numero. La fonte
     («OpenCritic 87») sta nel tooltip e nell'`aria-label`, perché senza
     fonte il numero non si legge: OpenCritic e Metacritic non stanno sulla
     stessa scala;
   - né l'uno né l'altro: niente, nessun segno vuoto.

   Coppa al platinato e coccarda alla critica, e non il contrario: su PSN il
   platinato è un trofeo. La stessa regola vale nelle tre viste. Serve che
   `criticScore` e `criticScoreSource` passino da `GameDetailSchema` a
   `GameSchema`, e che la query del backlog li porti: si tocca il contratto,
   non il database.

## In che ordine

1. **I dati**: lo stato `completed` e il voto della critica nella lista.
   - `completed` in `backlogStatusValues`, la migration **da drizzle-kit**,
     le etichette in `it.json` ed `en.json`, la riga «Stati» nel CLAUDE.md e
     in `docs/modello-dati.md`. Da verificare sulla migration generata: che il
     valore vada dopo `played` (`ADD VALUE … AFTER`), e che nessuno `switch`
     sugli stati resti senza il caso nuovo — lo dice `check-types`.
   - `criticScore` e `criticScoreSource` in `GameSchema` e nel `toEntry` della
     ricerca, con un caso nel test della ricerca.

   **Fatto.** La migration generata è
   `0022_backlog_status_completed.sql`, una riga:
   `ADD VALUE 'completed' BEFORE 'dropped'` — drizzle-kit mette il valore al
   suo posto da solo. Nessuno `switch` sugli stati da completare, e nessun
   punto del codice tratta `played` a parte: le etichette passano tutte da
   `useStatusLabels`. Scheletro mobile e storia del `Select` hanno elenchi
   di stati loro, di esempio, e restano come sono.

   Il voto della critica è costato meno del previsto: `GameSchema` prende le
   colonne da `gameColumns` in
   [games.ts](../apps/api/src/services/games.ts), che serve il catalogo e la
   lista del backlog insieme. Due colonne in più lì, e tolte dalla scheda
   completa, che le aveva per conto suo. Due casi nuovi in
   [backlog-search.test.ts](../apps/api/src/services/backlog-search.test.ts):
   la lista porta voto e fonte, e `completed` si salva e si filtra — che
   prova anche la migration applicata.

2. **I componenti in `@repo/ui`**: `Drawer` e le modifiche a `Pagination`,
   ognuno con la sua storia e i test axe.

   **Fatto.** [drawer.tsx](../packages/ui/src/components/drawer.tsx) sta sul
   Dialog di Tamagui, che dà Esc, focus intrappolato e titolo come nome del
   dialogo. Sei test nuovi (113 in tutto, verdi con axe): il drawer si apre,
   si chiude con Esc e con la x e rimette il focus; le frecce hanno il nome
   in `aria-label`; «vai a pagina» tiene il numero fra 1 e l'ultima e ignora
   ciò che non è un numero. Il campo usa `onSubmitEditing`, che è l'Invio sul
   web e il tasto di invio su mobile: niente `<form>`.

   Due cose che la storia e gli screenshot hanno smentito:
   - **il focus non tornava al bottone.** Il Dialog modale di Tamagui lo
     rimanda al suo `Dialog.Trigger`, che qui non c'è. Ricordarsi chi aveva il
     focus in un effetto non basta, nemmeno di layout: gli effetti del
     contenuto girano prima, e il focus era già sulla x. Si legge nel render
     in cui `open` diventa vero.
   - **il drawer non arrivava al bordo destro.** Bloccando lo scorrimento,
     Tamagui mette `scrollbar-gutter: stable` sull'`html`, e velo e drawer,
     che sono fissi, si fermano prima di quella fascia: 15 px vuoti, anche su
     una pagina senza barra di scorrimento. Il drawer spegne quel blocco
     (`disableRemoveScroll`) e fa il suo: via la barra, la sua larghezza in
     `padding-right`. Misurato con e senza barra: bordo a 1280 su 1280, la
     pagina sotto non si sposta, gli stili tornano com'erano alla chiusura.
     Col `Dialog` centrato la striscia c'è ancora, ma non si vede.

   Il commento dello `Sheet` dice ancora che un giorno terrà i filtri: va
   corretto al passo 4, quando i filtri passano al drawer.

3. **Lo stato alla Trakt**: la mappa delle icone, il bottone nelle tre viste,
   le icone negli stati della barra.

   **Fatto**, da guardare sulla pagina vera. La mappa sta in
   [status-icon.tsx](../apps/web/components/status-icon.tsx); il bottone è
   `StatusButton` in
   [backlog-views.tsx](../apps/web/components/backlog-views.tsx), un
   `DropdownMenuRadioGroup` con icona ed etichetta per voce (`textValue`, o
   il typeahead non sa cosa cercare). Il suo nome dice anche lo stato:
   «Stato di Vane: Da giocare» (`statusOf` ha preso `{status}`).

   Tre scostamenti dal piano:
   - **niente `Tooltip`**, né sul bottone di stato né sugli stati della
     barra. Sul bottone il `Tooltip` e il trigger del menu vogliono tutti e
     due avvolgere lo stesso bottone, e il menu delle azioni accanto non ce
     l'ha; negli stati della barra l'etichetta è a vista da `$sm`, e sotto si
     è su un telefono, dove il passaggio del mouse non c'è. Il nome
     accessibile è l'etichetta in tutti i casi.
   - **nella griglia lo stato va in fondo**, sulla riga di anno e durata:
     accanto al titolo, su una scheda da 152 px, due bottoni gli lasciavano
     60 px.
   - **nella compatta la colonna dello stato passa da 188 a 72 px**, e lo
     spazio torna al titolo.

4. **Barra e drawer**: l'ordinamento nel pannello, il pannello nel `Drawer`,
   la colonna di lato tolta.

   **Fatto**, da guardare sulla pagina vera. La barra è una riga sola:
   ricerca (che prende lo spazio che resta, fino a 320), «Filtri (n)» sempre
   a vista, vista a destra. Il pannello ha in cima `SortControl` — criterio e
   direzione, fuori dalle sezioni perché non è un filtro — e in fondo
   «Azzera», che nel wireframe c'era e nel piano no. Un messaggio nuovo,
   `filters.closePanel`, per la x del drawer.

   `maxW={1280}` resta sulla pagina, con un'altra ragione: griglia e compatta
   vivono di colonne. Già corretti qui e non al passo 7, perché dicevano il
   falso da subito: la riga di `apps/web/CLAUDE.md` sul pannello di lato da
   `$xl`, il commento dello `Sheet` («domani il pannello dei filtri»), quelli
   del pannello e della griglia.

5. **Le pagine**: `size` nell'URL, la scelta accanto alla paginazione, «vai a
   pagina».

   **Fatto**, da guardare sulla pagina vera. `size` è un campo di
   [backlog-filter.ts](../apps/web/lib/backlog-filter.ts) come `view`: fuori
   dai criteri, e un valore che non è fra 15, 30, 60 e 120 torna a 15 invece
   di aprire una pagina che nessun menu sa rifare. `PAGE_SIZE` non c'è più, e
   con lui il commento che diceva 48. La scelta compare anche con una pagina
   sola, se i giochi sono più di 15: chi ha scelto 120 su 50 giochi deve poter
   tornare indietro. «Vai a pagina» usa `goToPage`, quindi lascia una voce
   nella cronologia come un clic su un numero.

   Le frecce, ora senza testo a vista, si chiamano «Pagina precedente» e
   «Pagina successiva»: «Precedente» da solo, letto fuori contesto, non
   diceva di cosa. Corretta anche la riga di `apps/web/CLAUDE.md` che diceva
   48 giochi alla volta.

6. **Il voto sulla card**, con la regola del punto 5.

   **Fatto**, da guardare sulla pagina vera.
   [entry-score.tsx](../apps/web/components/entry-score.tsx): il tuo voto
   (`RatingValue`) se c'è, altrimenti `Award` e il voto della critica
   arrotondato, altrimenti niente. Lo usano le righe, la griglia (dentro
   `Facts`) e la colonna «Voto» della compatta. Un messaggio nuovo,
   `critic.scoreOf` («OpenCritic: 87»), per il nome e il `title`.

   Due cose che il piano non sapeva, provate con una storia temporanea in
   Chromium e poi tolta:
   - **il suggerimento è un `title`, non il nostro `Tooltip`**, che vuole un
     elemento che prende il focus: un numero in sola lettura non deve essere
     una fermata del Tab, e sarebbero fino a 120 per pagina. Tamagui passa
     `title` al DOM ma non lo dichiara nei tipi: cast, come fa `Pagination`
     con `href`.
   - **`RatingValue` aveva già un errore di accessibilità**: `aria-label` su
     un `div` senza ruolo, che axe boccia (`aria-prohibited-attr`) e un
     lettore di schermo può ignorare. Ora tutti e due hanno `role="img"`,
     il modo standard di dare un nome a un voto mostrato.

7. **Chiusura**: `apps/web/CLAUDE.md` (il pannello non sta più di lato da
   `$xl`, le pagine non sono più da 48), il commento di `PAGE_SIZE`,
   screenshot a 375, 900 e 1440 px, piano chiuso.

   **Fatto.** CLAUDE.md e `PAGE_SIZE` erano già sistemati ai passi 4 e 5.
   Gli screenshot, a tema scuro, con un utente di prova da 200 giochi
   registrato apposta e cancellato alla fine: righe, griglia e compatta, il
   menu di stato e il drawer, alle tre larghezze. Una cosa sola storta, e
   corretta: **a 375 la paginazione usciva dallo schermo**, con «vai a
   pagina» tagliato a destra. Le view di Tamagui non si restringono, e il
   `nav` restava largo quanto il contenuto invece di andare a capo:
   `maxW="100%"` in [pagination.tsx](../packages/ui/src/components/pagination.tsx).
   Nessuno scorrimento orizzontale a 375 né a 1440.

   **La memoria del browser che «schizza»**, segnalata a metà lotto su
   Firefox e Vivaldi con `localhost:8085` aperto, non si è riprodotta:
   Chromium e Firefox, da loggato, home e `/backlog` fino a 120 giochi per
   pagina, con tutte le interazioni del lotto, tengono memoria, nodi e
   richieste fermi. L'ipotesi rimasta è la pagina aperta mentre il codice
   cambia: ogni salvataggio è un aggiornamento a caldo di Vite, e qui se ne
   facevano decine in pochi secondi. Non verificata: se ricapita con la
   pagina aperta da sola, si riparte da lì.

   Una prova a favore dell'ipotesi (02/10/2026): a 412 px, in locale, la
   pagina è comparsa senza la barra in basso e con la riga di ricerca che
   sforava a destra, mentre online, dallo stesso commit, era giusta. Il
   codice era lo stesso; un ricaricamento con la cache svuotata e il
   riavvio del dev server l'hanno sistemata. Non era un difetto del layout.
