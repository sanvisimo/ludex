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

Da verificare:

- **il giro completo su Android**: registrazione, link, accesso, Esci;
- **Turnstile nella WebView** con la chiave vera: la pagina dichiara
  l'origine del sito (`baseUrl`), da vedere se Cloudflare la accetta;
- **EAS**: `eas init` col tuo account Expo (aggiunge il `projectId` ad
  `app.json`) e la chiave di Turnstile fra le variabili del progetto EAS.

### M2 · Backlog e pagina del gioco

Lista a schede, filtri in un bottom sheet, voto al volo e stato.

### M3 · «Cosa gioco adesso»

La chat dell'assistente del 13, che porta a una vista filtrata del backlog.
Dove sta il suo ingresso (un pulsante o un campo nel Backlog) si decide qui.
Aspetta il 13.

### M4 · Playlist e wishlist

Le stesse del web.

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
