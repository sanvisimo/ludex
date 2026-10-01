# Pagina `/credits`: ringraziamenti e licenze

**Lotto chiuso il 01/10/2026.** Restano, per quando si va online, l'hosting
nell'informativa e la rilettura dei testi legali (in «Da decidere»); in coda,
lo step 16.

Una pagina standard, pubblica, con i servizi che usiamo, il software su cui
poggiamo e le icone, ognuno con la sua licenza.

## Scelte

- **Rotta `/credits`** sotto `_app`: il guscio avvolge anche gli anonimi, quindi
  è pubblica senza altro lavoro.
- **Tre sezioni**: servizi e fonti dati, software open source, icone.
- **I dati stanno in [apps/web/lib/credits.ts](../apps/web/lib/credits.ts)**
  (nome, indirizzo, licenza), il «a cosa ci serve» nei messaggi
  `credits.<sezione>.<id>`, in italiano e in inglese.
- **Il software è lo stack dichiarato nel CLAUDE.md**, scritto a mano, non le
  dipendenze transitive. Le licenze sono lette dal `package.json` installato di
  ogni pacchetto.
- **Le icone delle piattaforme** restano sotto la licenza di origine: RomM
  (AGPL-3.0) e Libretro/RetroArch (CC BY 4.0, con la dicitura d'obbligo). La
  pagina linka l'elenco file per file, `apps/web/public/platforms/LICENSE.md`.
- **HLTB e Metacritic**: ringraziati come fonte, senza loghi né «powered by»,
  per non suggerire un accordo che non c'è.

## Passi

1. **Rotta, dati e stringhe.** Fatto.
2. **Il link**: «Crediti e licenze» in fondo alla barra laterale e al foglio
   del menu, sotto tema e lingua, senza una voce di navigazione. **Fatto**,
   con sotto la firma «Made with ♥ in Italy & EU», richiesta dopo: è `Footer`
   in `apps/web/src/components/app-shell.tsx`, per anonimi e loggati. La firma
   è in inglese anche nel catalogo italiano, come richiesta: `nav.madeWith`.
   **Poi, richiesto dopo** (01/10/2026): licenza **AGPL-3.0-only** (`LICENSE`,
   campo `license` in ogni `package.json`, sezione nel README), la frase di
   benvenuto in cima ai crediti con link al sorgente e il contatto email
   (`repoUrl` e `contactEmail` in `apps/web/lib/credits.ts`).
   **Accordion** (01/10/2026): le tre sezioni dei crediti — servizi, icone,
   software, in quest'ordine — sono voci di un `Accordion` di `@repo/ui`;
   aperte all'inizio tranne il software.
   **Allineamento** (01/10/2026): le tre pagine di testo hanno la stessa
   larghezza (quella di `Page`, 896 px) e gli stessi formati — titoli di
   sezione 18/24 nel carattere dei titoli, corpo 15/22, elenchi puntati. Per
   avere il titolo dell'accordion come quelli di privacy, `AccordionTrigger` ha
   una variante `heading` (il default, del pannello dei filtri, non cambia).
3. **Chiusura**: **fatto** — le pagine di servizio descritte in
   `apps/web/CLAUDE.md`, questo piano aggiornato. Il lotto resta aperto finché
   restano aperti i punti qui sotto.

## Da decidere

- ~~Licenza di Ludex stesso~~: decisa, AGPL-3.0, coerente con le icone di RomM.
- ~~Informativa privacy e termini d'uso~~: scritti (opzione 1, niente iubenda,
  che nel piano gratuito non ha i termini e non lascia scrivere dei token dei
  negozi). `/privacy` e `/terms` in `apps/web/lib/legal.ts`, it e en, con i link
  nel piè della barra. **Da rileggere a mano**, e da far vedere a qualcuno
  competente prima di aprire al pubblico. Niente banner dei cookie finché non
  ci sono analytics: oggi sessione, lingua e tema.
- ~~Alla registrazione~~: **un avviso**, non una casella — «Registrandoti
  accetti le condizioni d'uso e dichiari di aver letto l'informativa», con i
  due link in una nuova scheda (`_guest.register.tsx`, messaggio
  `register.notice`). Informa ma **non registra un'accettazione**: nessuna data
  salvata. Se un giorno serve la prova (monetizzazione, utenti paganti, o un
  consiglio legale), si passa alla casella con una colonna sull'utente e una
  migration. Attenzione ai messaggi: un apostrofo davanti a un tag (`l'<tag>`)
  è l'escape dell'ICU e il tag sparisce; l'articolo va dentro il tag.
- **Il fornitore di hosting** — _prima di andare online_: oggi non c'è, e
  l'informativa dice solo «il fornitore di hosting». Si nomina, col paese dei
  server, quando si sceglie.
- **Titolare** confermato (Simone Sanvito) e **età minima 16 anni** (01/10/2026;
  la soglia italiana per il consenso digitale è 14, la nostra è più prudente).
- **Rilettura dei testi legali** — _prima di andare online_: da parte di
  qualcuno competente, con calma.
- **Cancellazione ed esportazione dell'account**: in coda, step 16 (confermato).
- ~~Termini di IGDB/Twitch~~: letti il 01/10/2026, in `apps/api/CLAUDE.md`.
  Gratis per uso non commerciale; la riga dei crediti dice «dati forniti da
  IGDB.com».
- ~~Termini di OpenCritic~~: letti, in `apps/api/CLAUDE.md`. Decisione del
  01/10/2026: **le card del backlog non mostrano OpenCritic** (`entry-score.tsx`)
  e il dialog «Dettagli» linka ogni fonte dal suo nome; la pagina del gioco era
  già a posto. Conseguenza da tenere d'occhio: il filtro e l'ordinamento per
  voto della critica usano ancora OpenCritic, quindi una lista ordinata per
  voto può avere card senza numero. Se dà fastidio, si cambia la precedenza
  sulle card (non il dato) o si rimette il numero col suo link.
- **OpenCritic sul mobile**: la pubblicazione su uno store richiede il piano
  commerciale. Da risolvere prima dell'app mobile: o l'app non mostra dati
  OpenCritic, o si chiede a OpenCritic, o si compra il piano.
