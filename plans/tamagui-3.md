# Tamagui 3

**Stato: fatto il 18/11/2026**, in corso dal 16/11, piano approvato lo stesso
giorno. Passi 1, 2 e 3 il 17/11, passi 4, 5, 6 e 7 il 18/11. Lavoro interno:
non entra nella roadmap pubblica.

## Perché

Tamagui 2.7.7 è l'ultima della 2, e i tipi di React Native 0.88 (SDK 58) già
non combaciano con i suoi: quattro cast, in `gallery.tsx`, `scroll-row.tsx`,
`ownership-badges.tsx` e nei due bottoni trascinabili
(`sortable-bands.tsx`, playlist scelte a mano). Più si aspetta, più la 2 resta
indietro rispetto a React Native.

Fonti: la guida ufficiale,
[Upgrading to v3](https://tamagui.dev/docs/guides/how-to-upgrade),
[Config v5 compatibility](https://tamagui.dev/docs/core/config-v5) e
[le icone](https://tamagui.dev/ui/lucide-icons#migrating-from-v2).

## Cosa resta uguale

**La Config v5.** La v3 di default usa la Config v6 (colori a 11 passi,
spaziature sulla griglia di 4 pixel): è un cambio di design, non di versione,
e resta fuori. Con `@tamagui/config/v5` restano identici scale, colori a 12
passi, caratteri e abbreviazioni.

## Cosa cambia, misurato

| Cambio                                                                       | Da noi                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `hoverStyle`, `pressStyle`, `focusVisibleStyle`… → valori piatti             | 109                                          |
| media `$sm={{…}}` → clausole `sm:`                                           | 50                                           |
| token senza `$` (`"$color11"` → `color-11`, 12 passi → 11)                   | 952                                          |
| `lineHeight` numerico: da pixel a rapporto                                   | 225                                          |
| `$platform-native` → `native:`                                               | 3 (Input e Button)                           |
| `createV5Theme` rimosso                                                      | `themes.ts`                                  |
| `styleable` → `createStyledHOC`; taglie dei controlli `xs`…`xl`              | `button.tsx`                                 |
| Toast: nuova anatomia (`<Toast>` + `Toast.Viewport`)                         | `toast.tsx`; i 218 `toast()` no              |
| Sheet: `Frame` → `Container` + `Background`                                  | `sheet.tsx`                                  |
| ScrollView del web: implementazione propria, non più RNW                     | galleria, righe che scorrono                 |
| un modello di focus per Dialog, Popover, Select; attivo → `background-press` | gli 8 aggiramenti di `packages/ui/CLAUDE.md` |
| icone: niente pacchetto, si generano                                         | 87 icone, 98 file che le usano               |

Il nome `color-11` è nella tabella perché la guida lo dà per la Config v6; con
la v5 i nomi restano senza trattino (`color11`, `accent9`, `red11`): lo dicono
gli errori di `tsc` del passo 3.

## I passi

Su `chore/tamagui-3`, da `main` (la PR #141, con React 19.3 e React Native
0.88, è unita dal 16/11).

1. **Lo stato di partenza — fatto il 16/11.** Una build di Storybook su
   Chromatic come base dei pixel (build 10 e 11, su `chore/tamagui-3`; la
   build 12 del 17/11 è quella con tutte le storie verdi). Niente
   screenshot delle schermate: il «prima» è pilecue.com, che resta su Tamagui
   2 finché non c'è il deploy, e al passo 6 si confronta con quella.
2. **I pacchetti e i temi — fatto il 17/11.** Tutti i `tamagui` e `@tamagui/*` alla 3.3.3
   insieme, `npx tamagui check` per i doppioni. Config v5; i temi di
   `createV5Theme` **congelati** come valori statici in `themes.ts`, generati
   una volta dalla 2.7.7 prima di aggiornare (default: niente pacchetto
   `@tamagui/config-v5`, che è un'altra dipendenza da tenere allineata).
   `@tamagui/vite-plugin` 3 nel web e in Storybook (solo ESM).
   - Com'è andato: i temi sono in `packages/ui/src/frozen-themes.ts`, e il
     risultato finale di `themes.ts` è identico byte per byte a quello della
     2.7.7 (56 temi). `themes.ts` ridà a ogni tema il tipo completo, che il
     letterale da solo non ha. Token, media, abbreviazioni e impostazioni di
     `@tamagui/config/v5` 3.3.3 hanno gli stessi valori della 2.7.7: cambia
     solo il nome delle chiavi (`$1.5` → `1-5`) e sparisce `$true`, che non
     usiamo. `v5-css` usa già `@tamagui/animations-css/extras`, come vuole lo
     Sheet; `quick` resta, ma ora è una molla (si guarda al passo 6).
     `@tamagui/cli` è fra le dipendenze di sviluppo di `packages/ui`.
   - Resta alla 2.7.7 solo `@tamagui/lucide-icons-2`, con la sua copia di
     `@tamagui/core`: se ne va col passo 3.
   - `tsc` su `packages/ui`: 384 errori, tutti dei passi 4 e 5. Oltre a quelli
     previsti, `select.tsx` usa anch'esso `Sheet.Frame`, e i `focus-out` di
     Dialog, Drawer e DropdownMenu non hanno più `preventDefault`.
     Fino al passo 4 né il web né Storybook partono.
3. **Le icone — fatto il 17/11.** `@tamagui/cli icons add` per le 118 che
   usiamo, in `packages/ui/src/icons/`; `icons.ts` le ri-esporta, quindi gli
   import `@repo/ui/icons` non cambiano. Via `@tamagui/lucide-icons-2`, dentro
   `@tamagui/helpers-icon`. Media e stati non stanno più sull'icona: dove ci
   sono, un `View` intorno.
   - Com'è andato: le icone usate sono 87, non 118. Stanno in
     `packages/ui/src/lucide/` e non in `src/icons/`, che accanto a
     `icons.ts` renderebbe ambiguo `'../icons'`. Un'icona nuova:
     `pnpm --filter @repo/ui icons:add Nome`, che passa anche Prettier.
     `@tamagui/helpers-icon` 3.3.3 fra le dipendenze; `IconProps` esce da
     `@repo/ui/icons` (lo usa `tabs.tsx`). L'unica prop di stile su
     un'icona era `rotate` sul chevron dell'accordion, ora su un `XStack`
     intorno. Nel lockfile non resta niente della 2.x, e c'è una copia sola
     di `@tamagui/core`.
   - Le icone generate tipizzano `color`: i 27 errori in più di `tsc`
     (411) sono i `color="$color11"` sulle icone. Al passo 4 va controllato
     che il codemod li veda, perché un'icona non è un componente di stile.
4. **Il codemod — fatto il 18/11.**
   `@tamagui/codemod-flat-values --source-semantics v2-pixels` su
   `packages/ui/src`, `apps/web` e `apps/mobile`: prima a vuoto col
   resoconto, poi `--write`. Le righe che segnala si sistemano a mano, e un
   `rg "hoverStyle|pressStyle|focusStyle|enterStyle|exitStyle|\\$[a-z]"` trova
   quelle che non vede (stili costruiti da funzioni o spread condizionali).
   - Com'è andato: il codemod vuole un `tsconfig.json` nella cartella da cui
     parte, quindi gira una volta per workspace. 1099 punti di stile, 188
     file riscritti.
   - **I temi portano anche le 16 chiavi in kebab-case** (`border-color`,
     `background-hover`…), con lo stesso valore della camelCase
     (`withKebabKeys` in `themes.ts`): i componenti di Tamagui 3 leggono
     quelle, il codemod le scrive, e i temi v5 di Tamagui 3 le hanno tutte e
     due. Le nostre chiavi (`actionColor`, `surface`…) restano camelCase.
   - **Quattro difetti del codemod**, sistemati a mano: cancella i commenti
     dentro le liste di prop (37 righe in 16 file, rimesse sopra la stessa
     prop); sposta prop dopo `{...props}`, cambiandone la precedenza
     (`activeStyle` di Checkbox e Switch, `iconAfter` di Select); scioglie i
     cast `{...({ title } as object)}` in prop che i tipi non accettano (11,
     rimessi con i loro commenti); avvolge i valori condizionali in template
     inutili (34 tolti).
   - **Sui componenti di `@repo/ui` non converte niente**, perché non ne
     riconosce il tipo: i `$lg={{ maxW }}` di `DialogContent`, i token di
     `Badge` e un `lineHeight={20}` su `DropdownMenuLabel`, che con la v3
     sarebbe diventato venti volte il carattere. Una trentina di punti, più
     gli oggetti di stato costruiti in variabili (`dropdown-menu.tsx`,
     `game-page.tsx`, `backlog-views.tsx`). Lo sweep di `rg` ora è vuoto.
   - `activeStyle` di Checkbox e ToggleGroup vuole un pezzo di `style()`, e lì
     valgono solo le abbreviazioni (`bg`, per `onlyAllowShorthands`); quello
     dello Switch è uno stile di React Native, un oggetto normale.
     `contentContainerStyle` nel mobile prende le prop per esteso.
   - `tsc`: 27 errori in `packages/ui`, 4 solo del web, 0 solo del mobile,
     tutti del passo 5: `styleable` di Button (e i tipi delle sue storie),
     Toast, `Sheet.Frame`, i `focus-out` senza `preventDefault` (Dialog,
     Drawer, DropdownMenu, `cover-preview.tsx`, `ownership-badges.tsx`), le
     taglie di Select e Slider, `unstyled` rimosso da Accordion e
     ToggleGroup, `selectable` sul testo di `xbox-code-panel.tsx`. Lint verde.
5. **Le API rimosse — fatto il 18/11.** Button (`createStyledHOC`, le nostre
   taglie contro quelle della base), Toast, Sheet, il focus di Dialog, Drawer
   e DropdownMenu, ScrollView. Gli otto aggiramenti di `packages/ui/CLAUDE.md`
   si riprovano uno per uno: chi non serve più si toglie, col suo commento.
   Via i quattro cast di React Native 0.88, se la v3 li rende inutili.
   - **Button sulle parti di comportamento** (`ButtonFrame`, `ButtonText`,
     `useButton` da `tamagui/unstyled`), non sulla pelle del `Button` di
     `tamagui`: quella ha taglie sue (`xs`…`xl`) che leggono la stessa `size`,
     e il bottone di serie misurava 38 invece di 32 (padding 16, raggio 5,
     testo 13). Misurato nello Storybook: ora 32 e 28, padding 10, raggio 8,
     testo 14 e 13, peso 500, colori e stati come prima. Da disabilitato è un
     `<button disabled>` con `pointer-events: none`.
   - **Accordion, ToggleGroup e Slider da `tamagui/unstyled`**: la prop
     `unstyled` non c'è più, e le pelle stilano proprio le parti che
     stiliamo noi. Lo Slider senza pelle prende ancora `size` in pixel.
   - Toast sulla nuova anatomia (`<Toast>`, `Toast.Viewport`, `Toast.List`),
     con le stesse icone; i `toast()` delle schermate non cambiano. Sheet su
     `Container` più `Background`. Select: niente più `index` sulle voci,
     il chevron in `Select.Icon`. I `focus-out` usano `isCanceled` e
     `cancel()`. `selectable` sul testo è `select="text"`.
     `@tamagui/get-font-sized` fra le dipendenze di `packages/ui`, o
     `declaration` non sa dare un nome ai tipi di `Label` e del Dialog.
   - **Gli aggiramenti.** Tolti: il focus del Tooltip (la v3 lo apre da
     tastiera, non al clic, e lo chiude con Esc: provato con Playwright),
     Esc e `FocusScope` dello Sheet (li fa lo Sheet modale; resta lo
     spostamento del focus all'apertura), l'id del contenuto dell'Accordion,
     il focus del DropdownMenu (`OpensDialog` passa tre volte su tre). Restano:
     il Drawer (senza, `OpenAndClose` fallisce), `aria-pressed` del
     ToggleGroup (la v3 lo toglie ancora), lo Slider, il Button su native
     (da provare sul telefono, passo 6).
   - **Lo Sheet** è già un `role="dialog"` col nome passato allo `Sheet`
     (`aria-label`): il nostro contenitore col ruolo era un secondo dialogo.
   - I cast di galleria e riga che scorre tolti (`ComponentRef<typeof
ScrollView>`); quelli dei bottoni in `ownership-badges.tsx`,
     `sortable-bands.tsx` e playlist scelte a mano restano, perché vengono
     dall'unione web/nativo del ref di Tamagui e non da React Native 0.88.
   - Le storie: Button disabilitato forza il clic (`pointerEventsCheck: 0`),
     Select si aspetta anche i dettagli dell'evento, `passaSopra` del
     Tooltip ripassa col mouse solo se il suggerimento non c'è.
   - Avvisi in console, senza effetto a schermo: le pelle di Sheet, Switch e
     Tooltip usano nomi della Config v6 (`color-4`, `color-5`, `2.5`) che
     con la v5 non esistono, e i nostri valori li coprono. Su tutte le storie
     non ce ne sono altri.
   - `tsc` a zero sui tre workspace, lint verde, 159 storie su 159, test del
     web 68 su 68.
6. **Le verifiche — fatto il 18/11.**
   - `tsc`, lint, i tre banchi di test (le storie in Chromium con axe);
   - Chromatic contro la base del passo 1: ogni differenza si guarda;
   - le schermate a mano, accanto alle stesse su pilecue.com, chiaro e
     scuro, telefono e desktop: home, `/backlog` nelle tre viste coi filtri
     aperti, pagina del gioco, playlist, wishlist, account, admin; drawer dei
     filtri, dialoghi, menu, tooltip da tastiera, toast, trascinamento delle
     playlist;
   - l'app sull'emulatore: Accedi, Account, il Select del tema;
   - la build del web senza errori di Tamagui nel log (l'ottimizzazione che
     salta lo dice solo lì, vedi `apps/web/CLAUDE.md`);
   - le variabili CSS di Tamagui che usano `globals.css` e i CSS delle pagine
     (`--color12`, `--borderColor`, `--surface`…) esistono ancora;
   - le media query passate ai componenti di `@repo/ui` (`maxW="lg:960px"`
     su `DialogContent`, `display="max-sm:none"`) non rompono l'idratazione,
     come succedeva con la v2 (`apps/web/CLAUDE.md`).
   - Fatto: `tsc`, lint e i banchi (159 storie, 68
     test del web); la build del web, che si fermava su `@tamagui/sheet`
     finché `publicHoistPattern` non ha portato gli `@tamagui/*` alla radice
     (il compilatore li fa caricare a Node dalla radice dell'app), e ora non ha
     errori di Tamagui nel log; le variabili CSS, che esistono tutte,
     iniettate a runtime e non nei `.css`.
   - **I caratteri** erano cambiati: `createSystemFont` di Tamagui 3 ha di
     serie la scala della v6 (la taglia 4 da 15 a 14). `fonts.ts` passa ora
     la scala v5 (`v5SystemFontSizes`, `v5SystemFontLineHeight`), e le 129
     variabili dei caratteri coincidono con pilecue.com.
   - **Roadmap e crediti** accanto a pilecue.com (build di produzione locale,
     desktop scuro e telefono chiaro): uguali, salvo i `display: list-item`
     (crediti, roadmap, documenti legali), alti 24 invece di 23. La v2 dava a
     ogni `.is_View` l'interlinea della taglia `true`; la v3 no, e il `li`
     eredita i 24 del `body`. Rimettere quella regola per intero peggiora
     tutto (dal 6 al 12-25% di pixel diversi): resta da decidere solo per i
     `li`.
   - I `li` restano a 24: deciso dall'utente, è solo un filo più arioso.
   - Chromatic: la build 12 non è mai stata accettata, e la 13 è stata
     accettata come base. Il confronto dei pixel fra v2 e v3 quindi Chromatic
     non l'ha fatto; l'hanno fatto la prova a mano e i confronti con
     pilecue.com. Da qui in avanti la base è la v3.
   - L'utente ha provato a mano schermate da collegato, emulatore e
     idratazione: tutto funzionante, nessun errore di idratazione.
7. **La documentazione — fatto il 18/11.** `packages/ui/CLAUDE.md` e
   `apps/web/CLAUDE.md` (abbreviazioni, media query, gli aggiramenti rimasti), e il piano del
   design system dove cita la 2.7.7.

## Rischi

- **I pixel.** Sul corpus di prova di Tamagui il codemod lascia da rivedere
  una riga su cinque. Chromatic e il passo 6 sono l'unico modo di sapere che
  il risultato è uguale.
- **Il focus e gli stati attivi** cambiano anche con la Config v5: sono
  comportamento, e i test delle storie ne coprono una parte.
- **La durata.** È il lotto più grosso dopo il 12: se il passo 4 lascia molto
  a mano, si ferma lì e si riferisce prima di andare avanti.

## Fuori

La Config v6 (colori a 11 passi, griglia di 4 pixel) e le regole del React
Compiler: lotti a parte.

## Ripresa

Aggiornata il 18/11/2026. I sette passi sono fatti sul branch
`chore/tamagui-3`; il lotto si chiude quando l'utente lo dice pronto. Restano
la PR verso `main` e il deploy su pilecue.com, dopo il quale si guarda la
pagina di produzione come al passo 6.

**Chromatic costa sempre tutto**: TurboSnap non è attivo sull'account, ogni
build sono tutti i 318 snapshot. La base è la build 13, cioè già la v3.

**Le icone, i temi e i caratteri** non si rigenerano con gli strumenti di
Tamagui senza guardare: i temi sono congelati, e i caratteri passano la scala
v5 a mano (vedi `packages/ui/CLAUDE.md`).
