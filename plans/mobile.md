# L'app mobile

**Stato: in corso dal 16/11/2026**, piano scritto il 22/10/2026. Anticipato
prima del 13 su decisione dell'utente (vedi
[ordine-sviluppo](../docs/ordine-sviluppo.md)): l'aspetto grafico c'è già, e
per decidere bastano i filtri del backlog. **Lo step 13** serve solo per «cosa
gioco adesso» (M3), che lo aspetta: le altre schermate non dipendono da lui.

## Cosa c'è oggi

- `apps/mobile` è uno scheletro: Expo SDK 57, una schermata con i quindici
  componenti di `@repo/ui` ([App.tsx](../apps/mobile/App.tsx)). Niente
  navigazione, niente login, niente API, niente `eas.json`.
- Il login è Better Auth col **cookie**
  ([client.ts](../packages/auth/src/client.ts)): React Native non ha un
  cookie jar affidabile.
- Il client oRPC del web ([orpc.ts](../apps/web/lib/orpc.ts)) conta su
  `credentials: 'include'`, che su React Native non basta.
- I testi stanno in `apps/web/messages/{it,en}.json`, con `use-intl`.
- **OpenCritic**: pubblicare su un App Store richiede il piano commerciale e
  il credito nella descrizione. Testo e dubbi aperti in
  [apps/api/CLAUDE.md](../apps/api/CLAUDE.md), sotto «Termini d'uso della
  chiave».

## I lotti

### M0 · Decisioni prima del codice — chiuso il 16/11/2026

1. **OpenCritic**: l'app mostra ciò che l'API restituisce, come il web
   (`SHOW_OPENCRITIC` sta sul server). Prima di pubblicare su uno store si
   decide se comprare il piano o spegnerlo. Da chiedere a OpenCritic in ogni
   caso: se F-Droid conta come «App Store».
2. **Distribuzione**: l'**APK dal nostro sito**, che non è un App
   Store. Poi, secondo la risposta di OpenCritic: F-Droid, Play Store,
   App Store (TestFlight prima). Costi: Apple Developer 99 $/anno, Google
   Play 25 $ una volta. F-Droid compila lui dal sorgente (niente EAS) e
   accetta solo dipendenze libere: niente Google Play Services, quindi niente
   push via FCM. Le dipendenze Expo di oggi sono libere.
   **iOS** si prova senza Mac e senza iPhone come si può; poi l'app la provano
   gli amici con l'iPhone. Se serve, si cerca un Mac.
3. **Le schermate della prima versione**: accesso e registrazione, backlog
   come lista a schede, pagina del gioco, playlist e wishlist; «cosa gioco
   adesso» arriva col 13 (M3). Restano sul web: admin, import CSV, crediti,
   roadmap, informativa e condizioni (queste come link al sito).

### M1 · Fondamenta

- **Build e API**: `eas.json`, e `EXPO_PUBLIC_API_URL` per l'indirizzo
  dell'API, dichiarata anche in `globalEnv` di `turbo.json`.
- **Navigazione con Expo Router**, bottom tab: Backlog · Playlist · Wishlist ·
  Account. L'assistente del 13 non è una tab (vedi M3). Wireframe in
  [mobile-m1.excalidraw](mobile-m1.excalidraw).
- **Login** col plugin `@better-auth/expo`: `expo()` sul server, `expoClient`
  con `expo-secure-store` sul client, lo schema dell'app nei
  `trustedOrigins`. È l'unico punto in cui il mobile tocca `packages/auth`.
- **oRPC**: un `RPCLink` che manda il cookie di `authClient.getCookie()`,
  più TanStack Query come sul web.
- **Testi**: `use-intl` anche qui, con **file di messaggi propri** in
  `apps/mobile`: le schermate sono diverse, e lo sono anche i testi.

**Stato di M1 (16/11/2026)**: scritto, da provare su un telefono.
Type-check, lint e bundle Android (`expo export`) passano, e i test dell'API
pure. Fatto: `eas.json` (`preview` per l'APK, `production`), le tre
`EXPO_PUBLIC_*` (API, sito, Turnstile), lo schema `pilecue` e gli id
`com.pilecue.app`, il plugin `expo()` sul server con `pilecue://` ed `exp://`
nei `trustedOrigins`, accesso, registrazione, «controlla la posta», le
quattro tab (tre segnaposto) e Account. Lo scheletro con i componenti
(`App.tsx`) non c'è più: il banco del design system è Storybook.

Il 16/11 l'app è passata all'**SDK 58** (React Native 0.88, React 19.3 in
tutto il repo) e a Better Auth 1.7, che ha tolto il cast del plugin Expo.

**23/11/2026: il giro su Android funziona**, nell'emulatore e con la chiave
di prova di Turnstile: registrazione, link di verifica, accesso (la riga in
`session`, user agent `okhttp`) ed Esci, che la cancella. In sviluppo serve:

- nel `.env` `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (senza, il widget non c'è ma
  il server chiede il CAPTCHA) ed `EXPO_PUBLIC_WEB_URL=http://localhost:8085`:
  con l'IP di WSL il `callbackURL` della registrazione non è fra i
  `trustedOrigins`;
- `adb reverse tcp:8085`, perché nell'emulatore `localhost` è il telefono:
  lo fa `pnpm dev`, che ora avvia anche Metro
  (`apps/mobile/scripts/adb-reverse.mjs`), se l'emulatore è già acceso;
- `--clear` a Metro dopo aver cambiato una `EXPO_PUBLIC_*`: vengono dal
  `.env` della radice, che Expo non sorveglia, e la cache tiene il valore
  vecchio.

**Turnstile nella WebView con la chiave vera funziona** (25/11/2026, con
l'APK della build nostra): Cloudflare accetta l'origine dichiarata con
`baseUrl`.

**EAS (23/11/2026)**: `eas init` fatto (progetto `pilecue/ludex`), la chiave
pubblica di Turnstile, ora in `apps/mobile/.env.production`. Il piano gratuito ha una coda lenta (la
prima build è rimasta in coda più di mezz'ora) e la firma la tiene Expo:
**EAS resta solo per le prove**, e per iOS finché non c'è un Mac (si decide
a M6). Le build che si distribuiscono le facciamo noi, che è anche la strada
di F-Droid.

#### Build Android nostra

**25/11/2026: la build gira**, in WSL, 14 minuti la prima volta. L'APK
(`versionCode` 1, `0.1.0`) è firmato con la nostra chiave (`apksigner`: `CN=PileCue`,
SHA-256 `b0f3300f…5facf4`) e nel bundle ci sono `https://pilecue.com` e la chiave vera
di Turnstile, nessun valore di sviluppo. Installato sull'emulatore, il giro
contro `pilecue.com` funziona (punto 7). Visto strada facendo:

- l'APK pesa 100 MB perché porta quattro ABI (arm64, armv7, x86, x86_64):
  per il sito (M6) va diviso per ABI o almeno tolte le due x86, che servono
  solo agli emulatori;
- `prebuild` avvisa che `userInterfaceStyle: automatic` su Android chiede
  `expo-system-ui`: senza, il tema scuro di sistema non arriva all'app.

1. **Strumenti in WSL**: il JDK (c'è il 21; React Native indica il 17, si
   prova col 21 e si scende solo se Gradle protesta) e gli Android
   command-line tools in `~/Android/Sdk`, con `ANDROID_HOME` nel profilo
   (`~/.bashrc`). Platform e build-tools li scarica Gradle alla prima build;
   l'NDK no, perché i command-line tools nuovi (la CLI `android`) non
   scrivono più le licenze e Gradle lo rifiuta: si installa a mano con
   `android sdk install "ndk;<versione>"`, quella che chiede l'errore.
2. **Il progetto nativo si genera, non si versiona**: `expo prebuild -p
android --clean` rigenera `apps/mobile/android/`, che va in `.gitignore`.
   Le modifiche native passano da `app.json` e dai config plugin, mai a mano
   in quella cartella.
3. **La chiave è nostra**: `keytool -genkeypair` in
   `~/.pilecue/pilecue-release.jks`, fuori dal repo, con una copia di
   sicurezza: persa la chiave, un APK nuovo non si installa sopra il vecchio.
   Percorso, alias e password in `~/.gradle/gradle.properties`. Un config
   plugin nostro (`apps/mobile/plugins/with-release-signing.js`) aggiunge al
   `build.gradle` generato la firma di release che legge quelle proprietà:
   senza, la release esce non firmata, e non si installa. La chiave di EAS
   non si usa, quindi l'APK di EAS non va distribuito.
4. **I valori di produzione** in `apps/mobile/.env.production`, versionato:
   sono URL e la chiave pubblica di Turnstile, niente di segreto. Expo lo
   legge da solo nella build di release; lo script di build non passa il
   `.env` della radice, i cui valori di sviluppo vincerebbero sul file. Da
   `eas.json` si tolgono gli `env`, così la fonte è una.
5. **La versione** sta in `app.json`, `MAJOR.MINOR.PATCH`, ed è l'unico
   numero da alzare: il `versionCode` lo ricava `app.config.ts`
   (`MAJOR·10000 + MINOR·100 + PATCH`, 0.1.0 → 100), perché un `versionCode`
   che non cresce non si installa come aggiornamento. Si alza a ogni APK
   distribuito, non a ogni build: PATCH per le correzioni, MINOR per un lotto
   (M2 sarà la 0.2.0), la 1.0.0 alla prima pubblicazione su uno store (M6).
   Ogni APK distribuito ha il suo tag git, `mobile-v<versione>`. In
   `eas.json` `appVersionSource` è `local`.
6. **Lo script**: `pnpm build:android` dalla radice, cioè `expo prebuild
-p android --clean` e poi `./gradlew assembleRelease` in `android/`. L'APK
   esce in `android/app/build/outputs/apk/release/`.
7. **Verifica**: `apksigner verify --print-certs` mostra la nostra chiave;
   l'APK si installa sull'emulatore con `adb install` e si rifà il giro
   (registrazione, link, accesso, Esci) contro `pilecue.com`, con Turnstile
   vero.

Dopo, non in questo lotto: la build nella CI di GitHub (i runner Ubuntu
hanno già JDK e SDK, ma la chiave andrebbe nei secret: sarebbe la prima
credenziale di firma su GitHub, da decidere) e l'APK sul sito (M6).

**Info (25/11/2026)**: in Account la riga «Info ›» apre una schermata con
la versione (`0.1.0 (100)`, da `expo-constants`) e i link a informativa e
condizioni, che da Account si sono spostati lì.

### M2 · Backlog e pagina del gioco

Lista a schede, filtri in un bottom sheet, voto al volo e stato.

**Struttura approvata il 25/11/2026** (wireframe Excalidraw in chat). Nessun
cambio all'API: bastano `backlog.list`, `filterOptions`, `setStatus`,
`update` e `games.bySlug`.

1. **Backlog**: conteggio, ricerca per nome, «Filtri (n)» e «Ordina»
   (aggiunti, nome, durata, voto, uscita, nei due versi). Una scheda per
   gioco: copertina, titolo, piattaforme e negozio, durata HLTB, stato come
   etichetta, voto. Scorrendo carica altri 50, niente pagine. Stati vuoto,
   caricamento ed errore come sul web.
2. **Filtri in un foglio dal basso**: stato, piattaforma, durata (cursore),
   negozio e abbonamento; «Azzera» e «Mostra n». Tag, voto, critica, anno,
   tipo e nascosti restano sul web. I filtri durano finché l'app è aperta.
3. **Pagina del gioco**, rifatta il 25/11 sui commenti (v2, «com'è il
   sito»): immagine che sfuma con la copertina sovrapposta, titolo, anno e
   tipo; fascia personale con stato e voto; HLTB in tre riquadri (storia,
   extra, 100%); tutti i voti della critica per fonte, col giudizio e il
   nome che porta alla fonte (OpenCritic lo vuole); le copie per intero
   (negozio, piattaforma, account, supporto, ore, ultima volta) con
   **Modifica**, **Nascondi** e **Rimuovi**; generi e temi; immagini;
   descrizione; altre versioni. **Modifica resta nell'app**: note, tag,
   categorie, copie (togliere e aggiungere).
4. **Voto al volo**: la pressione lunga su una scheda apre un piccolo
   foglio con stato e voto.

Fuori da M2: aggiungere un gioco, gioco a caso, salvare una playlist,
nascosti; wishlist e playlist sono M4.

**25/11/2026, componenti condivisi e tutti i filtri** (sui commenti alla v2:
«perché riscrivere la pagina quando quella del sito funziona»). I pezzi della
pagina del gioco stanno in `packages/ui/src/components/game-detail.tsx` e li
usano web e mobile: `DetailPanel`, `LinkRow`, `DurationTiles`,
`CriticScoreBadge`, `CriticScoreRow`, `CopyTile`, `RatingStars`. Prendono
testi e dati semplici; un link è `href` sul web e `onOpen` su native. Il web
ha perso le sue copie (`critic-score-badge.tsx`, `rating-stars.tsx`) ed è
rimasto uguale a vederlo. Il foglio dei filtri ha **tutti** i filtri del
pannello del web, nello stesso ordine, e l'ordinamento le sue nove voci.

**25/11/2026, scritto e guardato nell'emulatore** (tema chiaro e scuro).
Cose che il codice ha insegnato:

- **dentro un foglio di Tamagui su native non c'è il contesto di
  use-intl**: il foglio passa da un portale. I testi si calcolano fuori e
  arrivano come props (`useStatusLabels`, `useRatingLabels`);
- **Hermes non ha `Intl.PluralRules`**: niente plurali ICU nei messaggi del
  mobile, due chiavi (`countOne`, `countOther`);
- **il tasto indietro di Android non chiude un foglio**: lo fa
  `useBackToClose`, o esce dalla schermata col foglio aperto;
- **`fill="currentColor"` non riempie un'icona su native**: il colore va
  letto dal tema;
- **`SelectTrigger` è alto 32 anche su native**, mentre `Button` e `Input`
  sono 44: nel mobile gli si passa l'altezza. Da correggere in
  `packages/ui`, ma quella modifica fa partire un deploy;
- l'URL delle copertine IGDB è copiato in `apps/mobile/lib/game-format.ts`:
  il mobile non importa il web.

### M3 · «Cosa gioco adesso»

La chat dell'assistente del 13, che porta a una vista filtrata del backlog.
Dove sta il suo ingresso (un pulsante o un campo nel Backlog) si decide qui.
Aspetta il 13.

### M4 · Playlist e wishlist

Le stesse del web. **Struttura approvata il 25/11/2026** (wireframe in
chat), in due PR: **M4a Playlist**, poi **M4b Wishlist**. Nessun cambio
all'API.

1. **Tab Playlist**: «Nuova playlist» (scelta a mano), poi «Scelte a mano»
   e «Filtri salvati» a fasce: nome, numero, copertine che scorrono con lo
   stato sopra, come le card del sito.
2. **Playlist aperta**: ricerca e ordine, le schede del Backlog con la
   pressione lunga (stato e voto; nelle scelte a mano anche sposta su/giù e
   togli, col numero davanti). «Aggiungi giochi» nelle scelte a mano. Menu
   ⋯: rinomina, condividi (il foglio del telefono), elimina; a filtro anche
   «Modifica filtri», che apre il Backlog con quei filtri.
3. **Tab Wishlist**: «Nuova lista», «Le mie liste» e «Dai negozi» a fasce.
4. **Lista aperta**: «Ce l'ho» (chiede la piattaforma) e «Togli»; quelle
   dai negozi senza «Togli» e con «Aggiorna wishlist», le voci da
   sistemare sul sito.
5. **Pagina del gioco**: «Aggiungi a playlist» con le spunte; il cuore
   della wishlist per i giochi non tuoi. **Backlog**: «Salva come
   playlist» in fondo ai filtri.

Come in M2, ciò che serve a web e mobile va in `packages/ui`: la card con
copertina delle fasce e la fascia che scorre. Il trascinamento per
riordinare resta fuori: sul telefono «sposta su/giù».

### M5 · Collegare i negozi con la WebView

Quello che il mobile sblocca ([negozi](../docs/negozi.md), in apertura): la
WebView legge da sola l'URL su cui si atterra e lo passa alla mutazione che
c'è già, senza copia-incolla. Da **misurare negozio per negozio**, e ogni
prova su un account vero si annuncia prima. Steam (9f) resta fuori finché
l'utente non decide.

### M6 · Pubblicazione

Secondo M0.2: build, scheda dello store, privacy label, credito a OpenCritic
se l'app mostra i suoi dati.

## Metodo

Ogni schermata come dice il CLAUDE.md: proposta e wireframe Excalidraw
approvato, poi il codice.

## Fuori da questo piano

Notifiche push (per esempio `needs_reauth`), offline, widget. Si valutano
dopo la prima versione.
