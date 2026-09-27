# Step 12c — Il backlog

**Approvato il 27/09/2026.** Sotto ogni passo, cosa è stato fatto e cosa
ha smentito.

## Contesto

Il 12b ha messo il guscio intorno alle pagine senza toccarne il contenuto, e
l'identità ha fissato caratteri e colori. Il 12c ridisegna la pagina dove sta
il grosso del progetto, `/backlog`: la lista, i filtri e la paginazione.

Come il 12b, è lavoro **sul web**. Su telefono `/backlog` è un'altra schermata
(lista a schede, filtri in bottom sheet, scorrimento al posto delle pagine), e
l'app mobile vera viene dopo lo step 13. Da qui escono i **componenti** che
quella schermata userà, non la schermata.

## Com'è oggi, misurato

- **La rotta** ([_app._private.backlog.tsx](../apps/web/src/routes/_app._private.backlog.tsx),
  304 righe) disegna ogni gioco come una `Card` alta: copertina, titolo, anno,
  durata, voto, possessi, tag, e sotto una riga con la tendina dello stato e
  **tre bottoni** (Modifica, Nascondi, Rimuovi). Una vista sola.
- **La paginazione è rotta, e sulla libreria di prova si vede subito.** Il
  client alza `limit` di 50 a ogni «carica altri», ma il contratto accetta
  `limit` fino a 200 ([schemas.ts](../packages/contracts/src/schemas.ts)): al
  quinto clic il server rifiuta. Il backlog di prova ha **1979 righe**: anche
  senza il limite sarebbero quaranta clic, e ognuno rilegge da capo tutte le
  righe già a schermo.
- **Il server è già pronto per le pagine**: `offset` c'è nel contratto e nel
  servizio ([backlog-search.ts](../apps/api/src/services/backlog-search.ts)), e
  `total` arriva da `count(*) over()`. Nessuna modifica all'API.
- **I filtri** ([backlog-filters.tsx](../apps/web/components/backlog-filters.tsx),
  507 righe) sono una barra (ricerca, ordinamento, direzione, azzera), le
  spunte dello stato, e un `<details>` «altri filtri» con `input type=checkbox`
  e `input type=number` nudi, su Tailwind. Lo stato vive nell'URL
  ([backlog-filter.ts](../apps/web/lib/backlog-filter.ts)) e la logica è
  giusta: il 12c ne cambia l'aspetto, non le regole (AND fra le spunte, OR su
  stato e tipo, i range nulli che non filtrano).
- **In `@repo/ui` mancano** Checkbox, Slider, Accordion, ToggleGroup,
  Pagination e uno stato vuoto. Tamagui ha i primi quattro; paginazione e
  stato vuoto sono da scrivere.
- **Tailwind** è in tutta la rotta, nei filtri e in cinque componenti della
  riga (`game-cover`, `game-duration`, `ownership-badges`, `entry-tags`,
  `rating-value`), che usano anche `/games/$id`, la home e due dialoghi.

## Le decisioni

1. **Pagine numerate al posto di «carica altri».** La pagina sta nell'URL
   (`page`, assente = 1), il client manda `offset = (page − 1) × 48` e `limit`
   fisso. 48 perché si divide per 2, 3, 4 e 6: la griglia chiude le righe a
   ogni larghezza. Cambiare un filtro o l'ordinamento riporta a pagina 1, come
   oggi riporta il limite a 50. Il contratto non cambia, e il `max(200)` resta.

2. **Tre viste, scelte da un ToggleGroup**, e la vista sta nell'URL (`view`,
   assente = righe) come ordinamento e direzione: stesso meccanismo, niente da
   inventare, e un link condiviso apre la stessa vista. Non la ricorda fra una
   visita e l'altra: se servirà, è una colonna in `user_settings`, e non la si
   aggiunge adesso.
   - **righe** — la vista di oggi, ridisegnata: copertina, titolo col badge
     del tipo, anno, durata, voto, possessi, tag, stato. Le tre azioni
     diventano **un menu** (`DropdownMenu`, già in `@repo/ui`): la tendina
     dello stato resta a vista, perché è il gesto più frequente.
   - **griglia** — copertina prima di tutto, sotto titolo e stato; il menu
     delle azioni sulla scheda.
   - **compatta** — la lista densa: una riga per gioco, colonne titolo,
     piattaforme, durata, voto, critica, stato. Colonne fisse: sceglierle è
     un di più che nessuno ha chiesto.

   **Cosa mostra ciascuna è quello che abbiamo oggi.** Il 12d decide quali
   informazioni stanno sulla card, sulla riga e sulla scheda, insieme ai dati
   IGDB che mancano (artwork, screenshot): qui le viste nascono coi campi che
   `BacklogEntry` porta già.

3. **I filtri: barra in alto, pannello di lato.**
   - la **barra** tiene ricerca, ordinamento con direzione, vista, e il
     bottone «Filtri (n)». Sotto, le spunte dello stato come oggi, e una riga
     di **filtri attivi** come chip con la x («PS5 ×», «≤ 2 h ×»): oggi un
     filtro dentro «altri filtri» chiuso non si vede, e l'unico segno è il
     numero su «azzera».
   - il **pannello** è un `Accordion` di sezioni — piattaforme, negozi, tipo,
     i generi e temi IGDB, categorie e tag, durata, voto, uscita, altro — con
     `Checkbox` al posto degli input nudi e **`Slider` a due maniglie** al
     posto delle coppie di numeri. Da `$lg` in su sta in una colonna a
     sinistra della lista; sotto, lo apre il bottone «Filtri» nello `Sheet`
     che il 12b ha già. Stesso componente, due contenitori, e come nel guscio
     li sceglie il CSS.
   - gli slider: **durata** da 0 a 100 ore a passi di mezz'ora, dove la
     maniglia in fondo vuol dire «nessun massimo»; **voto** da 0,5 a 5;
     **uscita** dal 1970 all'anno corrente; **critica** una maniglia sola, il
     minimo. Le maniglie agli estremi valgono «non filtrare», come oggi il
     campo vuoto. Le avvertenze di oggi sui NULL («esclude i giochi senza
     durata») restano sotto lo slider.

   Niente Popover: con il pannello e il menu delle azioni non resta niente che
   lo chieda. Il 12a lo metteva in lista, e se ne riparla quando serve.

4. **Uno stato vuoto in `@repo/ui`** (`EmptyState`: icona, titolo, testo,
   azione facoltativa). I tre casi di oggi restano distinti — backlog vuoto,
   nessun gioco passa i filtri, nessun nascosto — e il secondo porta il
   bottone «azzera i filtri».

5. **Tailwind esce da `/backlog`.** Il CLAUDE.md lo fa convivere fino alla fine
   dello step 12; una pagina che si riscrive adesso non ha motivo di
   riscriverlo. Escono anche i cinque componenti della riga: sono piccoli, e
   restare su Tailwind vorrebbe dire due stili nella stessa scheda. Le altre
   pagine che li usano non cambiano aspetto — va controllato con gli
   screenshot.

La vista dei nascosti resta com'è: è un filtro, e ricerca, viste e pagine
valgono anche lì.

## In che ordine

1. **I componenti in `@repo/ui`**, ognuno con la sua storia: Checkbox, Slider
   (una e due maniglie), Accordion, ToggleGroup, Pagination, EmptyState.
   Pagination è numerata con ellissi e precedente/successiva, ed è un `nav`
   con `aria-current` sulla pagina: le pagine le fa link lo schermo, non il
   componente, come per `NavItem`.

   **Fatto.** Sei componenti in `packages/ui/src/components`, esportati da
   `@repo/ui`, 28 test nuovi (107 in tutto, verdi con axe). Tamagui 2.7.7 ha
   dato quattro sorprese, e ciascuna sta nel commento del suo componente:
   - **Accordion**: il titolo porta `aria-controls` verso un id che il
     contenuto non ha. L'id lo teniamo noi, per sezione.
   - **ToggleGroup**: a scelta singola toglie `aria-pressed` e non mette
     nient'altro, quindi a un lettore di schermo non si sa quale vista è
     accesa. Lo rimettiamo noi.
   - **Slider**: `disabledStyle` vale sempre, anche da acceso, e il binario
     sta in cima a un contenitore interno mentre le maniglie sono a metà.
     Opacità a mano e un margine sul binario.
   - **Checkbox** da spenta ha `pointer-events: none`: il test del clic
     ignorato lo deve dire a `userEvent`.

   I test non guardano le misure: slider e badge storti li hanno visti gli
   screenshot, non loro.
2. **Le pagine**: `page` nell'URL, `offset` al server, via «carica altri».
   È il pezzo che ripara un guasto, e va per primo sulla pagina anche prima
   del ridisegno.
3. **Barra e pannello dei filtri**, con i filtri attivi a chip.
4. **Le tre viste** e il ToggleGroup, con le azioni nel menu.
5. **Stato vuoto, Tailwind fuori**, verifica, CLAUDE.md e piano chiuso.

Un commit per passo; i passi 1–2 si possono fondere se il 2 resta piccolo.

## Verifica

- `@repo/ui`: storie e test verdi in Chromium con axe; Chromatic mostra le
  storie nuove.
- `pnpm lint`, `pnpm check-types`, `pnpm test`.
- Web, sulla libreria di prova (1979 righe): l'ultima pagina si apre, un
  filtro riporta a pagina 1, indietro del browser torna alla pagina di prima,
  un URL incollato riapre filtri, vista e pagina. Screenshot delle tre viste
  larghe e strette, chiaro e scuro; il pannello nello `Sheet` sotto `$lg`;
  tastiera su slider, checkbox, accordion e menu; nessun errore in console.
- `/games/$id`, home e dialoghi dopo l'uscita di Tailwind dai componenti della
  riga: stesso aspetto di prima.

## Fuori da questo lotto

- la schermata mobile del backlog: dopo lo step 13;
- quali informazioni stanno su card, riga e scheda, e i dati IGDB nuovi: 12d;
- i filtri salvati dello step 7: l'URL resta il salvataggio;
- ricordare la vista preferita fra una visita e l'altra;
- l'uscita di Tailwind dalle altre pagine: a fine step 12.
