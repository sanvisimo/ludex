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
cambia; `accent9` no. I file di token di Tamagui sono la sorgente unica: niente
JSON intermedio.

**Tamagui 3 con la Config v5** (`plans/tamagui-3.md`). Gli stili sono valori
piatti: token e chiavi del tema senza `$` (`bg="color2"`), stati e media query
come clausole nella stessa stringa (`bg="color2 hover:color3"`,
`p="16px max-sm:12px"`). Una `lineHeight` numerica è un rapporto: i pixel si
scrivono `"20px"`. Cose che non si indovinano:

- **le chiavi semantiche di Tamagui sono in kebab-case** (`border-color`,
  `background-hover`): i temi, congelati dalla 2.7.7 in `frozen-themes.ts` e
  da non toccare a mano, le portano nelle due grafie grazie a `withKebabKeys`
  in `themes.ts`. Le nostre (`actionColor`, `surface`) restano camelCase;
- **i caratteri usano la scala v5** in `fonts.ts`: quella di serie di
  `createSystemFont` è della v6, e il testo cambierebbe misura;
- **la config ammette solo le abbreviazioni**, anche dentro `style()`: `bg` e
  non `backgroundColor`, `select` e non `userSelect`;
- **dove gli stili sono tutti nostri il pezzo viene da `tamagui/unstyled`**
  (Accordion, ToggleGroup, Slider, le parti del Button): le pelle di `tamagui`
  hanno taglie e colori della v6, che si sovrappongono ai nostri. Quelle di
  Sheet, Switch e Tooltip in console dicono `unknown color "color-5"`:
  innocuo, quei valori li copriamo.

**`@repo/ui` esporta un solo `Button`, il nostro.** Niente `export * from
'tamagui'`: Tamagui ha otto dei nostri quindici nomi, e con l'export generico
vincerebbe l'ultima riga del file. Chi ha bisogno del pezzo grezzo lo importa da
`tamagui` dentro `packages/ui`, mai dalle app. Le icone (lucide) stanno in
`@repo/ui/icons`, generate in `src/lucide/`: una nuova si aggiunge con
`pnpm --filter @repo/ui icons:add NomeIcona`.

**Il banco è Storybook, dentro `packages/ui`**, non in `apps/web`: un banco
montato sull'app web non si aprirebbe senza l'app. Ogni componente nasce con la sua
storia, che è anche il suo test: `addon-vitest` le monta in un **Chromium vero** e
ci fa passare axe, con le violazioni che rompono il test. In CI Chromium va
installato (`playwright install chromium`). **Chromatic** confronta i pixel fra
una build e l'altra; il suo token sta in `.env` come `CHROMATIC_PROJECT_TOKEN`.

L'**identità pubblica è PileCue**: `Wordmark` ha lettere a tracciati pixel e
una pila dalla e finale; `Logo` è la P davanti alla pila. Sorgente unica e
asset sono documentati in [docs/brand/pilecue](../../docs/brand/pilecue/README.md).
**Inter** resta per il testo, **Space Grotesk** per i titoli e l'accento UI
è **viola**, con base Midnight Cue. Scale, ruoli e contrasti sono in
[docs/brand/pilecue/color-map.md](../../docs/brand/pilecue/color-map.md).
`surface` distingue le schede dalla pagina; `actionColor` è il testo dei
primari nei due temi e `selection*` governa i filtri tenui. Il CSS transitorio
usa alias delle medesime variabili Tamagui. Le scelte e le misure sono nel piano,
[plans/12-identita.md](../../plans/12-identita.md); qui ciò che si rompe se non lo
si sa:

- **i caratteri stanno in `packages/ui/src/fonts.ts`**, con due forme. Sul web
  una famiglia variabile, caricata da `@fontsource-variable` nella radice di
  `apps/web` e nel `preview` di Storybook. Su mobile un file per peso, con
  `face`, caricato da `apps/mobile/app/_layout.tsx` con `useFonts` **sotto gli stessi
  nomi**: un peso nuovo in un componente va aggiunto in tutti e due i posti.
  Un titolo è `fontFamily="heading"`.
- **il simbolo ha i colori fissi**, unica eccezione alla regola dei token: è
  un'immagine e non cambia col tema. Ne esistono copie — `favicon.svg`,
  `favicon.ico` e `apple-touch-icon.png` in `apps/web/public`, icona e splash
  in `apps/mobile/assets` — e ridisegnarlo vuol dire rigenerarle con `pnpm --filter @repo/ui brand:generate`.
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
`options` e non `items`, che in Tamagui è l'allineamento. Una ricerca senza
tendina è `ClearableInput`: un campo con la stessa x che svuota, e ogni ricerca
dell'app ce l'ha.

**`Tabs` e `ToggleGroup` non sono la stessa cosa.** I tab sono le sezioni di una
stessa lista — i nascosti per tipo: testo sopra una linea, sottolineatura
sull'acceso, scorrono senza barra dove non stanno. Il `ToggleGroup` è la scelta
di **come guardarla**, una vista, in una cornice. Messo a fare i tab sembra una
barra di bottoni.

**I pezzi della pagina del gioco** (`game-detail.tsx`: pannello, durate,
voti della critica, copia, stelle) li usano web e mobile. Un link esterno è
`href` sul web, un `<a>` vero, e `onOpen` su React Native, dove le ancore non
ci sono. Le stelle su native leggono il colore dal tema: lì `currentColor`
non arriva al riempimento dell'SVG.

Cinque componenti di `@repo/ui` fanno più del Tamagui che avvolgono, e il
perché sta nel loro commento:

- **`Button` è costruito sulle parti di comportamento** (`ButtonFrame`,
  `ButtonText`, `useButton` da `tamagui/unstyled`), non sul `Button` di
  `tamagui`: quello ha taglie sue (`xs`…`xl`) che leggono la stessa `size`
  delle nostre, e lo portavano a 38 pixel invece di 32. Su native propaga anche
  il nome del tema al frame: il Button di Tamagui 2.7.7 poteva conservare i
  colori dello schema precedente al cambio chiaro/scuro su Android
  (verificato sul Pixel 9a).
- **`Sheet` sposta lui il focus all'apertura**: da modale lo Sheet di Tamagui 3
  è già un dialogo (ruolo, Esc, focus che resta dentro e torna), ma il suo
  `FocusScope` darebbe il focus a un involucro `display: contents`, che non lo
  prende. Da chiuso non è montato, e il nome va sullo `Sheet` (`aria-label`).
- **`Drawer` rimette il focus e blocca lui lo scorrimento**: il Dialog di
  Tamagui sotto rimanda il focus solo al suo `Dialog.Trigger`, che un drawer
  aperto da fuori non ha, e il suo blocco (`scrollbar-gutter: stable`) lascia
  una striscia vuota fra il pannello e il bordo destro.
- **`ToggleGroup` rimette `aria-pressed`**: a scelta singola Tamagui lo toglie
  (anche la 3.3.3) e non mette niente al suo posto.
- **`Slider` si spegne con l'opacità**. Calcola le
  maniglie misurando il binario, quindi **sul server non c'è**: chi lo monta in
  una pagina renderizzata dal server lo monta dopo l'idratazione (vedi
  `RangeFilter` in `backlog-filters.tsx`).
