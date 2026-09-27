# Step 12 — L'identità

**Bozza, da approvare.** Niente codice finché non sono prese le decisioni qui
sotto.

## Contesto

Il 12b ha costruito il guscio con un'identità **segnaposto**: «Ludex» in testo,
il carattere di sistema, l'accento teal. Questo lotto la rende vera, e sta fra
il 12b e il 12c: il 12c ridisegna il backlog, e lo fa meglio se sa già con che
carattere e con che colori.

L'identità qui sono quattro cose: **nome**, **simbolo**, **carattere**,
**colore**. Tutto finisce nei token e nei componenti di `@repo/ui`, così web e
mobile la ereditano senza che le schermate cambino.

## Cosa c'è oggi, misurato

- **Nome**: «Ludex», scritto da `Wordmark` in `apps/web` (testo, 18/600). Il
  sottotitolo dell'app è «Cosa gioco adesso» (`app.description`). Expo lo chiama
  «Ludex».
- **Carattere**: lo stack di sistema della config v5 di Tamagui, per `body` e
  `heading`. Geist è uscito col 12a perché non si vedeva. Il testo di Tailwind
  (le schermate, fino alla fine dello step 12) usa `--font-sans`, che oggi non
  è definita, quindi ripiega anche lui sul sistema.
- **Colore**: accento teal, scelto nel 12a perché il viola e il magenta sono
  ovunque sulle copertine. Base slate. Il Button usa testo scuro sul teal:
  contrasto 6.16, misurato.
- **Simbolo**: non c'è. `favicon.ico` è quello di `create-next-app`. L'app Expo
  non ha né icona né splash (`app.json` ha solo nome e slug).

## Le decisioni da prendere

### 1. Il carattere

Il vincolo che taglia la lista: **deve esistere su tutte e due le
piattaforme**. Sul web si serve da noi (`@fontsource`, niente richieste a
Google), su mobile va caricato in `.ttf` con `expo-font`
(`@expo-google-fonts/*`), e a **pesi fissi**: React Native i font variabili non
li regge bene. Quindi una famiglia di Google Fonts, con licenza aperta.

Due ruoli: il **testo dell'interfaccia**, fitto (righe del backlog, durate,
voti: servono cifre tabellari, che si allineano in colonna), e i **titoli**
col nome.

1. **Inter per tutto** — neutro, leggibilissimo in piccolo, cifre tabellari.
   L'identità la porterebbero simbolo e colore.
2. **Inter per il testo, Space Grotesk per titoli e nome** — il testo resta
   neutro dove è fitto, i titoli hanno un carattere più tecnico, da gioco senza
   essere un fumetto. Un file in più da caricare.
3. **Manrope per tutto** — geometrico e più caldo di Inter, ancora leggibile
   in piccolo.

**Parere: la 2**: un'identità che sta tutta nel colore è debole, e la
differenza fra titolo e testo aiuta a leggere una pagina fitta come il backlog.

### 2. Il simbolo

Non esiste, e non lo decido da solo. Propongo di **disegnarne tre** in SVG
e di mostrarteli, accanto al nome e come favicon a 16 px, prima di scegliere.
Tre direzioni:

- un **monogramma**: una «L» geometrica;
- un **dado**, che dice «si sceglie cosa giocare», cioè il cuore del
  prodotto;
- una **pila di copertine**, che dice «libreria».

### 3. Il colore

**Parere: resta il teal.** Le ragioni del 12a valgono ancora, e il contrasto è
misurato. Cambiarlo vorrebbe dire rimisurare Button e Badge (il passo 9 di una
scala Radix «bright» vuole testo scuro, uno «scuro» testo chiaro). Serve solo la
tua conferma.

## Dove finisce, una volta deciso

- **`packages/ui`**: i due font in `config.ts` con `createFont`, con i nomi
  giusti per piattaforma (sul web una famiglia sola coi pesi, su mobile un
  nome per ogni peso). `Wordmark` e `Logo` passano qui, universali: il nome e
  il simbolo servono anche a mobile. I componenti che fanno da titolo
  (`CardTitle`, `DialogTitle`, il titolo di `Page`) passano a `$heading`.
- **`apps/web`**: i font caricati da `@fontsource` nella radice, già nel
  bundle; `--font-sans` definita, così il testo di Tailwind coincide con quello
  di Tamagui; favicon SVG più `.ico` e l'icona da 180 px per iOS; `theme-color`
  per chiaro e scuro.
- **`apps/mobile`**: `useFonts` di `expo-font` prima del primo render; icona e
  splash in `app.json`.
- **Storybook**: gli stessi font nel `preview`, o il banco mostrerebbe un'altra
  app.

## In che ordine

1. **Le proposte**: una pagina di prova con le tre coppie di caratteri su
   schermate vere (una riga del backlog, un titolo, la barra) e i tre simboli.
   Te le mando come immagini. **Qui ci si ferma e scegli.**
2. **Il carattere**, in `@repo/ui` e sul web, con Storybook. Misura del peso
   dei file e confronto prima/dopo sulle stesse pagine: un font diverso cambia
   le misure, e righe dense, badge e Switch vanno riguardati.
3. **Simbolo e nome**: `Logo` e `Wordmark` in `@repo/ui`, favicon e icone per
   il web, icona e splash per Expo.
4. **Mobile**: i font con `expo-font`.
5. **CLAUDE.md** e questo piano chiuso.

## Verifica

- `@repo/ui`: storie e test verdi; **Chromatic mostrerà una differenza su ogni
  storia**, ed è atteso: va accettata come nuova base, non letta come errore.
- Web: screenshot prima e dopo delle stesse pagine, larghe e strette, chiaro e
  scuro; nessun errore in console; il testo di Tailwind con lo stesso
  carattere di quello di Tamagui.
- Build: peso dei font aggiunti, misurato.
- **Mobile: da te, con Expo Go** (`pnpm --filter mobile start`): da qui non ho
  un telefono. Da guardare: carattere caricato, icona, splash.

## Fuori da questo lotto

- pagina di presentazione, immagini per la condivisione (Open Graph), manifest
  PWA;
- il ridisegno delle pagine, che è del 12c in poi;
- l'accento scelto dall'utente: la mappa in `palettes.ts` è pronta, ma è
  un'interfaccia da fare quando servirà.
