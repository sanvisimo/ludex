# Il voto al volo, sulla pagina del gioco

**Stato: chiuso il 21/10/2026**, segnato «fatto» nella roadmap
(`quickRating`). Provato dall'utente nel browser. Branch `feat/voto-al-volo`,
da `feat/14-abbonamenti` e non da `main`: tutti e due toccano `game-page.tsx`
e la roadmap, e partendo da lì non ci sono conflitti. Si unisce dopo il 14.
Passano `pnpm check-types`, `pnpm lint` e `pnpm --filter web test`.

## La richiesta

Oggi, per dare un voto, bisogna aprire «Modifica» e usare il dialogo intero
(`RatingStars` in `edit-entry-dialog.tsx`). L'utente vuole poter votare **al
volo**, dal pannello «Nel tuo backlog» della pagina del gioco
(`BacklogPanel` in `apps/web/components/game-page.tsx`).

## Decisioni (21/10/2026)

L'utente ha detto che **proposta e wireframe non servono**: la struttura è
questa.

- **Il voto resta dov'è**, nell'intestazione del pannello accanto allo stato,
  dove oggi c'è `RatingValue`.
- **Le cinque stelle sono sempre visibili**, col numero accanto. Senza voto
  sono vuote: oggi `RatingValue` non rende niente quando il voto manca.
- **Si vota cliccando lì**, a mezze stelle come nel dialogo.
- **Il voto si deve poter togliere**, anche lì e non solo nel dialogo.
  `RatingStars` lo fa già: ricliccare il valore scelto lo toglie.

## Da sapere

- **Il voto sta sulla riga di `backlog`**, non sulla copia: un gioco che non hai
  non si vota. Vale anche per la wishlist.
- `RatingStars` era in Tailwind e `lucide-react`: con questo lotto passa a
  Tamagui (vedi sotto).
- Il salvataggio passa da `updateBacklogEntry`, come il dialogo.

## Com'è fatto

- **`RatingStars` è in Tamagui** (`apps/web/components/rating-stars.tsx`), non
  più in Tailwind, e ha due misure: `md` nel dialogo, come prima, col testo
  «4 su 5»; `sm` nel pannello, con stelle da 18 px e il solo numero, **a
  sinistra**. Senza voto il numero non c'è e le stelle sono vuote.
- **Correzioni dopo la prima prova** (21/10/2026): la mezza stella usciva
  come una stella piccola, perché l'icona si stringeva alla larghezza del
  taglio (prima lo impediva `max-w-none` di Tailwind); il numero a destra,
  cambiando larghezza, spostava le stelle sotto il puntatore e il secondo clic
  non toglieva il voto; e dopo il clic restava l'anteprima del passaggio del
  mouse, che copriva il voto vero.
- **Il pannello** (`BacklogPanel`) ha `onRating` accanto a `onStatus`; la
  rotta (`_app.games.$slug.tsx`) salva con `backlog.update`, mandando solo
  `{ id, rating }`. Mentre salva mostra già il voto scelto.
- Il voto si toglie ricliccando quello scelto, nel pannello come nel dialogo.
  **Solo nel dialogo** c'è anche una × accanto al voto, che compare quando c'è
  un voto (deciso dall'utente il 21/10/2026: il secondo clic resta, ma non si
  indovina).
