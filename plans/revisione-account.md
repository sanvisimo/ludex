# Revisione delle sezioni account

Piano approvato in chat: Profile, Libraries, Needs attention e Hidden,
con paginazione server nelle due liste operative. Lotto in corso.

- Cornice comune con titolo, descrizione, navigazione account e filtri coerenti.
- Libraries: card più ampie, due colonne desktop; collegamento, sincronizzazione,
  wishlist e azioni distinti. Aggiungi libreria nell'intestazione, preferenze
  automatiche secondarie, aggiornamento e ricollegamento riconoscibili.
- Needs attention: righe ordinate e azione principale distinta; i possibili
  doppioni conservano il gruppo completo.
- Hidden: stesso stile delle righe, distinzione fra giochi nascosti e voci
  d'importazione; azioni esplicite per le rispettive destinazioni.
- Profile: dati personali, sicurezza (password/sessioni), gestione dati;
  eliminazione separata in fondo.
- Liste inizialmente da 10 elementi/gruppi, con selettore 10/25/50/100.
  Dimensione (`size`) e pagina nell'URL, reset al cambio
  filtri/tab, conteggi filtrati, ritorno all'ultima pagina valida dopo mutazioni.
  Hidden unisce e ordina i due tipi prima di paginare, senza il limite di 100.
- Verifiche: query SQL con isolamento utenti, filtri, gruppi e confini pagina;
  tipi/lint, build web, prova browser dei flussi e del responsive.

Le regole dei collegamenti/import e le operazioni di sicurezza dell'account
restano quelle esistenti; la revisione riguarda presentazione e lettura delle liste.

## Implementazione e verifiche

- [x] Query paginate `imports.reviewPage` e `imports.hiddenPage`, conteggi
  dedicati `imports.counts` e invalidazione delle liste dopo le mutazioni.
- [x] Intestazione/paginatore condivisi, URL con filtri e tab, correzione della
  pagina oltre l'ultima, righe con azioni laterali desktop e sotto su mobile.
- [x] Libraries con due colonne, aggiunta nell'intestazione e Aggiorna esplicito;
  Profile con Sicurezza raggruppata e sessione corrente evidenziata.
- [x] 24 test SQL mirati: isolamento utenti, ricerca letterale, filtri prima
  del limite, gruppi completi, unione ordinata dei nascosti, ripristino e oltre
  100 giochi. Typecheck e lint API/web, build client/server superati.
- [x] Chromium sulle quattro sezioni a 1440 e 390 px: cambio pagina via URL,
  ricerca/tab, gruppi, nascondi/ripristino con correzione della pagina, rientro
  nel backlog e modifica del nome. Nessun overflow o errore JavaScript.
  Dati QA rimossi al termine; nessuna importazione avviata.

Pronto per la revisione in uso dell'utente; lotto e voce roadmap ancora in corso.

## Paginazione comune e dimensione modificabile

- `ListPagination` compone paginatore, selettore e riepilogo opzionale. Le
  rotte mantengono URL, callback e regole specifiche per griglie e filtri.
- Riusato dai footer account e da backlog, playlist a filtro, playlist curate,
  wishlist e liste condivise. Le griglie mantengono i propri multipli e limiti.
- Account: default 10, selezione 10/25/50/100, `size` nell'URL e reset pagina
  al cambio dimensione. Anche con una sola pagina il selettore resta disponibile.
- Verificati nel browser default, dimensione 25/100, reset, reload, filtri e
  layout mobile; riuso nelle cinque viste precedenti e selezione da tastiera.
- Limite preesistente del Select Tamagui: a ridosso del bordo inferiore, una
  tendina lunga può lasciare l'ultima opzione fuori viewport al clic; da tastiera
  è raggiungibile. La correzione del posizionamento del Select resta separata.
