# Tamagui 3

**Stato: in corso dal 16/11/2026**, piano approvato lo stesso giorno. Passo 1
fatto, si riparte dal passo 2: vedi «Ripresa» in fondo. Lavoro interno: non
entra nella roadmap pubblica.

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

1. **Lo stato di partenza — fatto il 16/11.** Una build di Storybook su
   Chromatic come base dei pixel (build 10 e 11, su `chore/tamagui-3`). Niente
   screenshot delle schermate: il «prima» è pilecue.com, che resta su Tamagui
   2 finché non c'è il deploy, e al passo 6 si confronta con quella.
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
   - le schermate a mano, accanto alle stesse su pilecue.com, chiaro e
     scuro, telefono e desktop: home, `/backlog` nelle tre viste coi filtri
     aperti, pagina del gioco, playlist, wishlist, account, admin; drawer dei
     filtri, dialoghi, menu, tooltip da tastiera, toast, trascinamento delle
     playlist;
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

## Ripresa

Scritta il 17/11/2026 per riprendere da una chat nuova.

**Dove si è.** Branch `chore/tamagui-3`, sopra `chore/expo-58` (la PR #141,
non ancora unita: M1 del mobile, Expo SDK 58, React 19.3, TypeScript 6 e gli
altri aggiornamenti). Sul branch c'è solo questo piano. Se la #141 viene unita
prima, `chore/tamagui-3` si rimette sopra `main` (`git rebase main`).

**Il passo 1 ha lasciato quattro storie rosse su Chromatic**, per le
interazioni (`play`), non per il rendering; in locale (`pnpm --filter
@repo/ui test`) passano tutte e 159:

- **Tooltip · Hover**: c'era già prima della #141.
- **Tooltip · Long Content** e **Tooltip · Rich Content**: nuove con la #141.
  Il tooltip non compare dopo l'`hover`; Long Content l'ha toccata la #141
  (tolto l'`aria-label`, che axe 4.14 bocciava), Rich Content no.
- **Gallery · Drag Thumbnails** (`expected 0 to be 100`): nuova con la #141.
  Chromatic fotografa a 2400×1800, dove le miniature stanno tutte in vista e
  non scorrono; ma prima passava, quindi c'è anche altro (React 19.3, o il
  cast del ref di ScrollView in `gallery.tsx`).

Le tre nuove si guardano **prima del passo 2**, in locale con Storybook
(`pnpm --filter @repo/ui dev`), così la base è pulita: se sono tempi si allunga
l'attesa delle storie, se è un cambio vero si corregge sulla #141. Gli errori
di Chromatic li legge l'utente nella dashboard: **si chiedono a lui**, non si
rilancia Chromatic per ricavarli (ogni build costa 318 snapshot della quota).

**Aperti fuori da questo lotto:**

- la porta di Mailpit è passata alla 1035 (`docker-compose.yml`, nella #141),
  ma `.env.example` (riga 26) e il CLAUDE.md della radice (le porte) dicono
  ancora 1025: un commit sulla #141, deciso ma non fatto;
- prima del merge della #141, la build di produzione del web in locale
  (`pnpm --filter web build && pnpm --filter web start`), e dopo il deploy su
  pilecue.com accesso, «Password dimenticata» (nodemailer 10 col server SMTP
  vero) e la vista compatta del backlog.

**Cose già verificate, da non rifare:**

- le icone non hanno un pacchetto v3: si generano con `@tamagui/cli icons add`
  (pagina [lucide-icons](https://tamagui.dev/ui/lucide-icons#migrating-from-v2));
  `@tamagui/helpers-icon` è alla 3.3.3 stabile;
- `@tamagui/vite-plugin`, `@tamagui/toast`, `@tamagui/focus-scope`,
  `@tamagui/react-native-svg`, `@tamagui/cli` sono tutti alla 3.3.3;
- `themes.ts` usa `createV5Theme` da `@tamagui/config/v5`, rimosso nella v3;
  `config.ts` usa `defaultConfig` da `@tamagui/config/v5` e le animazioni da
  `@tamagui/config/v5-css`, che restano;
- il riassunto completo della guida (pacchetti rimossi, token, temi, stili
  piatti, componenti, animazioni, compilatore, verifiche) va riletto alla
  fonte: la pagina HTML si tronca, il testo intero sta in
  `https://tamagui.dev/llms.txt`.

**Da incollare nella chat nuova:**

> Riprendiamo la migrazione a Tamagui 3: leggi `plans/tamagui-3.md`, in
> particolare «Ripresa», e lavora sul branch `chore/tamagui-3`. Prima le tre
> storie nuove che falliscono su Chromatic, poi il passo 2.
