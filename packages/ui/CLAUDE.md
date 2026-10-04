# packages/ui — design system

`packages/ui` è su **Tamagui**: compila a CSS atomico sul web e a stili nativi su
mobile, con token type-safe condivisi. Il piano con le misure e le scelte è
[plans/12a-design-system.md](../../plans/12a-design-system.md); qui c'è ciò che va
rispettato ogni volta che lo si tocca.

**I token stanno su tre livelli**, e l'invariante è una: **nessun componente
punta a un primitivo**.

    primitivi (la scala: gray1…gray12, l'accento)
      → semantici (background, color, borderColor, i temi)
        → di componente (nei `styled()` dei nostri componenti)

Un `teal9` scritto in un componente resterebbe teal il giorno che l'accento
cambia; `$accent9` no. I file di token di Tamagui sono la sorgente unica: niente
JSON intermedio.

**`@repo/ui` esporta un solo `Button`, il nostro.** Niente `export * from
'tamagui'`: Tamagui ha otto dei nostri quindici nomi, e con l'export generico
vincerebbe l'ultima riga del file. Chi ha bisogno del pezzo grezzo lo importa da
`tamagui` dentro `packages/ui`, mai dalle app. Le icone (lucide) stanno in
`@repo/ui/icons`.

**Il banco è Storybook, dentro `packages/ui`**, non in `apps/web`: un banco
montato sull'app web non si aprirebbe senza l'app. Ogni componente nasce con la sua
storia, che è anche il suo test: `addon-vitest` le monta in un **Chromium vero** e
ci fa passare axe, con le violazioni che rompono il test. In CI Chromium va
installato (`playwright install chromium`). **Chromatic** confronta i pixel fra
una build e l'altra; il suo token sta in `.env` come `CHROMATIC_PROJECT_TOKEN`.

L'**identità** è **Inter** per il testo, **Space Grotesk** per titoli e nome,
l'accento **teal** e il simbolo di `Logo` (una tessera con la «L» e due
copertine dietro). Le scelte e le misure sono nel piano,
[plans/12-identita.md](../../plans/12-identita.md); qui ciò che si rompe se non lo
si sa:

- **i caratteri stanno in `packages/ui/src/fonts.ts`**, con due forme. Sul web
  una famiglia variabile, caricata da `@fontsource-variable` nella radice di
  `apps/web` e nel `preview` di Storybook. Su mobile un file per peso, con
  `face`, caricato da `apps/mobile/App.tsx` con `useFonts` **sotto gli stessi
  nomi**: un peso nuovo in un componente va aggiunto in tutti e due i posti.
  Un titolo è `fontFamily="$heading"`.
- **il simbolo ha i colori fissi**, unica eccezione alla regola dei token: è
  un'immagine e non cambia col tema. Ne esistono copie — `favicon.svg`,
  `favicon.ico` e `apple-touch-icon.png` in `apps/web/public`, icona e splash
  in `apps/mobile/assets` — e ridisegnarlo vuol dire rifarle tutte.
- **`Wordmark` non è un link**: il link alla home è del router, e sul web è
  `HomeLink` in `app-shell.tsx`.

**`Animated` di `react-native` non si importa nei componenti che girano sul web.**
Sul server trascina tutto lo `StyleSheet` di react-native-web, che nel rendering
di Vite fallisce (`inline-style-prefixer`) e la pagina risponde 500: lo
`Skeleton` ha aggirato il limite con un'opacità che si alterna, e lo `Spinner`
con la divisione per piattaforma — `spinner.tsx` per il web, `spinner.native.tsx`
con `Animated` per React Native, che Metro sceglie da solo.

**`SearchField` non è il `Combobox`.** Il Combobox sceglie un valore fra voci
che ha già e le filtra lui; il SearchField è una ricerca: il testo è il
valore, le voci (in gruppi, con dentro quello che vuole l'app) le porta chi
chiama, e Invio senza una voce evidenziata cerca invece di scegliere. Il
pattern ARIA è lo stesso, col fuoco che resta nel campo. La prop delle voci è
`options` e non `items`, che in Tamagui è l'allineamento.

**`Tabs` e `ToggleGroup` non sono la stessa cosa.** I tab sono le sezioni di una
stessa lista — i nascosti per tipo: testo sopra una linea, sottolineatura
sull'acceso, scorrono senza barra dove non stanno. Il `ToggleGroup` è la scelta
di **come guardarla**, una vista, in una cornice. Messo a fare i tab sembra una
barra di bottoni.

Sei componenti di `@repo/ui` fanno più del Tamagui che avvolgono, e il
perché sta nel loro commento:

- **`Tooltip` si apre da sé al focus da tastiera**: quello di Tamagui 2.7.7
  non lo fa, nemmeno su un `<button>` nudo. Si toglie quando Tamagui lo
  sistema. Le storie non possono provarlo — `userEvent.tab()` non produce
  `:focus-visible` — e lo prova la tastiera vera di Playwright sull'app.
- **`Sheet` è un dialogo modale**, che quello di Tamagui non è: Esc lo chiude,
  il focus entra, resta dentro e torna al bottone (`FocusScope`), e da chiuso
  non è montato.
- **`Drawer` rimette il focus e blocca lui lo scorrimento**: il Dialog di
  Tamagui sotto rimanda il focus solo al suo `Dialog.Trigger`, che un drawer
  aperto da fuori non ha, e il suo blocco (`scrollbar-gutter: stable`) lascia
  una striscia vuota fra il pannello e il bordo destro.
- **`Accordion` tiene lui l'id del contenuto**: quello di Tamagui 2.7.7 lo
  nomina in `aria-controls` ma non lo mette sul contenuto, e axe lo boccia.
- **`ToggleGroup` rimette `aria-pressed`**: a scelta singola Tamagui lo toglie
  e non mette niente al suo posto.
- **`Slider` non usa `disabledStyle`**, che su Tamagui 2.7.7 vale sempre, e
  centra il binario a mano. Calcola le maniglie misurando il binario, quindi
  **sul server non c'è**: chi lo monta in una pagina renderizzata dal server
  lo monta dopo l'idratazione (vedi `RangeFilter` in `backlog-filters.tsx`).
