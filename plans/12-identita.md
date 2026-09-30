# Step 12 — L'identità

**Approvato il 27/09/2026**, con due decisioni prese: **Inter per il testo e
Space Grotesk per titoli e nome**, e **l'accento resta teal**. Il simbolo si
sceglie al passo 1, fra le tre proposte.

**Chiuso il 27/09/2026**: tutti e cinque i passi fatti, il simbolo è F2. Ciò
che va rispettato d'ora in poi sta nel CLAUDE.md, alla voce «L'identità»; qui
restano le ragioni e le misure. Da verificare a mano resta solo il mobile, con
Expo Go (caratteri e `Wordmark`) e con una build di sviluppo (icona e splash,
che Expo Go non mostra).

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

   **Fatto, e scelto F2.** Le prime tre proposte (A monogramma, B dado a «L»,
   C pila di copertine) hanno mostrato che solo A reggeva a 16 px; C diceva
   «libreria» ma in piccolo si confondeva, e le sue copertine a trasparenza in
   tema scuro sparivano. Da lì tre fusioni di A e C, a colori pieni: F1 la
   tessera con una copertina dietro, F2 con due, F3 la «L» fatta di
   copertine. **Scelta F2**: la tessera con la «L», e dietro due copertine due
   passi più scuri della scala teal, che si vedono su tutti e due i fondi.

   La geometria, in un quadrato 32×32, da riprendere identica al passo 3:

   ```
   copertina in fondo  x=13 y=1 w=17 h=19 rx=4    #1c6961 (tealDark 7)
   copertina in mezzo  x=8  y=4 w=19 h=21 rx=5    #008573 (teal 11)
   tessera             x=2  y=8 w=22 h=23 rx=5.5  #12a594 (teal 9)
   «L»                 M7.5 13h4v10h7.5v4H7.5z     #1c2024 (slate 12)
   ```

2. **Il carattere**, in `@repo/ui` e sul web, con Storybook.
   Su mobile la config resta sul carattere di sistema fino al passo 4: un
   `fontFamily` che iOS non conosce è un errore, non un ripiego, e i file per
   React Native arrivano lì.

   **Fatto.** I caratteri stanno in
   [packages/ui/src/fonts.ts](../packages/ui/src/fonts.ts): `body` in Inter,
   `heading` in Space Grotesk, solo sul web; su mobile la famiglia resta
   quella di sistema. Passano a `$heading` `CardTitle`, `DialogTitle`, il
   titolo di `Page` e «Ludex» nella barra. Sul web li carica la radice da
   `@fontsource-variable` (un file per famiglia, tutti i pesi dentro),
   Storybook li importa nel `preview`, e `--font-sans` in `globals.css` fa sì
   che il testo di Tailwind abbia lo stesso carattere di quello di Tamagui.

   Misurato:
   - **70 KB in tutto**: Inter 48 KB, Space Grotesk 22 KB, l'alfabeto latino
     che la pagina scarica davvero. Gli altri alfabeti (cirillico, greco,
     vietnamita) stanno nella build ma il browser non li chiede, grazie a
     `unicode-range`.
   - **Il carattere giusto dove deve**: titolo di pagina e «Ludex» in Space
     Grotesk, voci della barra e testo di Tailwind in Inter.
   - **Il layout regge**: righe del backlog, badge, bottoni e campi hanno le
     stesse altezze di prima, confrontati sugli screenshot del passo 7.
     Test di `@repo/ui` (76) e giro del guscio (13 passi) verdi.

   Una cosa che il passaggio da Next si era lasciato dietro: **`--font-sans`
   non era più definita** da quando `next/font` non c'era più, e il testo di
   Tailwind ripiegava sul carattere di sistema. Ora la definisce `globals.css`.

   Il titolo di pagina a 600 in Space Grotesk pesava meno del grassetto di
   sistema di prima: **passato a 700**, al passo 3.

3. **Simbolo e nome**: `Logo` e `Wordmark` in `@repo/ui`, favicon e icone per
   il web, icona e splash per Expo.

   **Fatto.** `Logo` e `Wordmark` stanno in
   [packages/ui/src/components/logo.tsx](../packages/ui/src/components/logo.tsx),
   disegnati con `react-native-svg` come le icone, con la loro storia. Il
   simbolo ha i **colori fissi** e non i token: è un'immagine, la stessa della
   favicon, e non cambia col tema. Da solo è decorativo (`aria-hidden`): il
   nome lo dice il testo accanto. Il link alla home resta al web
   (`HomeLink` in `app-shell.tsx`), perché il router in `@repo/ui` non entra.
   - **Web**, in `apps/web/public`: `favicon.svg`, `favicon.ico` (16, 32 e 48,
     al posto di quello di `create-next-app`) e `apple-touch-icon.png` da 180
     px su fondo pieno. `theme-color` per chiaro e scuro, col fondo vero
     dell'app — misurato, è il passo 2 della scala slate, `#f9f9fb` e
     `#18191b`, non il passo 1. Le due `meta` stanno nel `<head>` di
     `__root.tsx` e non in `head()`: il router tiene una `meta` sola per
     `name`, e la seconda spariva.
   - **Mobile**, in `apps/mobile/assets`: `icon.png` a 1024 px e
     `splash-icon.png`, in `app.json`. La splash passa da
     `expo-splash-screen`, aggiunto: con la SDK 57 la chiave `splash` di
     `app.json` vale solo per le PWA.
   - I PNG sono ricavati dall'SVG con Chromium: il disegno ha una copia sola,
     scritta tre volte (componente, `favicon.svg`, i PNG).

   Verificato: test di `@repo/ui` (79) e giro del guscio (13 passi) verdi, i
   tre file serviti col tipo giusto, «Ludex» è il nome del link in tutte e due
   le forme della barra, nessun errore in console.

4. **Mobile**: i font con `expo-font`.

   **Fatto.** In [packages/ui/src/fonts.ts](../packages/ui/src/fonts.ts) la
   parte native ha una famiglia per peso, dichiarata con `face`: Tamagui
   sostituisce la famiglia e toglie `fontWeight`. Solo i pesi che i componenti
   usano — Inter 400, 500, 600, 700 e Space Grotesk 600, 700 — e quelli in
   mezzo li riempie `createFont` col precedente. `apps/mobile/App.tsx` li
   carica con `useFonts` sotto **gli stessi nomi**, un file per peso
   (`@expo-google-fonts/inter/400Regular`, non l'indice, che li porterebbe
   tutti e diciotto), e tiene su la schermata iniziale finché non sono
   arrivati. Nello scheletro c'è anche il `Wordmark`, la prova che il simbolo
   è universale.

   Misurato: il bundle iOS (`expo export`) si costruisce e porta i sei file,
   **1,8 MB**; Inter pesa 340 KB a peso perché il `.ttf` statico ha tutti gli
   alfabeti. Web invariato: test di `@repo/ui` (79) verdi, titoli ancora in
   Space Grotesk 700. **Da verificare da te con Expo Go**: che il testo sia in
   Inter e i titoli in Space Grotesk, e che il `Wordmark` si veda.

5. **CLAUDE.md** e questo piano chiuso.

   **Fatto.** Il paragrafo sull'identità nel CLAUDE.md non dice più
   «segnaposto»: dice dove stanno caratteri e simbolo e le quattro cose che
   si rompono senza saperle.

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
