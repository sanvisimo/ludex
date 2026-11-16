# Tamagui 3

**Stato: piano, scritto il 16/11/2026.** Il codice parte quando l'utente lo
approva. Lavoro interno: non entra nella roadmap pubblica.

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
| icone: niente pacchetto, si generano                                         | 118 icone, 102 file che le usano             |

Il nome `color-11` è nella tabella perché la guida lo dà per la Config v6; con
la v5 i nomi dei temi vanno verificati al passo 2, prima del codemod.

## I passi

Su un branch da `chore/expo-58` (React 19.3 e React Native 0.88 servono),
finché la PR #141 non è unita; poi da `main`.

1. **Lo stato di partenza.** Una build di Storybook su Chromatic come base dei
   pixel, e screenshot delle schermate che contano: home, `/backlog` nelle tre
   viste coi filtri aperti, pagina del gioco, playlist, wishlist, account,
   admin; sull'emulatore Accedi e Account.
2. **I pacchetti e i temi.** Tutti i `tamagui` e `@tamagui/*` alla 3.3.3
   insieme, `npx tamagui check` per i doppioni. Config v5; i temi di
   `createV5Theme` **congelati** come valori statici in `themes.ts`, generati
   una volta dalla 2.7.7 prima di aggiornare (default: niente pacchetto
   `@tamagui/config-v5`, che è un'altra dipendenza da tenere allineata).
   `@tamagui/vite-plugin` 3 nel web e in Storybook (solo ESM).
3. **Le icone.** `@tamagui/cli icons add` per le 118 che usiamo, in
   `packages/ui/src/icons/`; `icons.ts` le ri-esporta, quindi gli import
   `@repo/ui/icons` non cambiano. Via `@tamagui/lucide-icons-2`, dentro
   `@tamagui/helpers-icon`. Media e stati non stanno più sull'icona: dove ci
   sono, un `View` intorno.
4. **Il codemod.** `@tamagui/codemod-flat-values --source-semantics v2-pixels`
   su `packages/ui/src`, `apps/web` e `apps/mobile`: prima a vuoto col
   resoconto, poi `--write`. Le righe che segnala si sistemano a mano, e un
   `rg "hoverStyle|pressStyle|focusStyle|enterStyle|exitStyle|\\$[a-z]"` trova
   quelle che non vede (stili costruiti da funzioni o spread condizionali).
5. **Le API rimosse.** Button (`createStyledHOC`, le nostre taglie contro
   quelle della base), Toast, Sheet, il focus di Dialog, Drawer e
   DropdownMenu, ScrollView. Gli otto aggiramenti di `packages/ui/CLAUDE.md`
   si riprovano uno per uno: chi non serve più si toglie, col suo commento.
   Via i quattro cast di React Native 0.88, se la v3 li rende inutili.
6. **Le verifiche.**
   - `tsc`, lint, i tre banchi di test (le storie in Chromium con axe);
   - Chromatic contro la base del passo 1: ogni differenza si guarda;
   - le schermate del passo 1 a mano sul web, chiaro e scuro, telefono e
     desktop: drawer dei filtri, dialoghi, menu, tooltip da tastiera, toast,
     trascinamento delle playlist;
   - l'app sull'emulatore: Accedi, Account, il Select del tema;
   - la build del web senza errori di Tamagui nel log (l'ottimizzazione che
     salta lo dice solo lì, vedi `apps/web/CLAUDE.md`).
7. **La documentazione.** `packages/ui/CLAUDE.md` e `apps/web/CLAUDE.md`
   (abbreviazioni, media query, gli aggiramenti rimasti), e il piano del
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
