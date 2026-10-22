# L'app mobile

**Stato: piano, scritto il 22/10/2026.** Il codice parte quando lo decide
l'utente. In [ordine di lavoro](../docs/ordine-sviluppo.md) viene dopo
rilascio e 13, ma nessuno dei due la blocca tecnicamente:

- **il rilascio** serve solo quando l'app la usano altri: in sviluppo Expo Go
  sul telefono parla con l'API della macchina in LAN, come il web;
- **lo step 13** serve solo per «cosa gioco adesso» (M3): le altre schermate
  non dipendono da lui.

Se il mobile parte prima, l'ordine va aggiornato in
[ordine-sviluppo](../docs/ordine-sviluppo.md) e nel CLAUDE.md della radice.
La roadmap pubblica (`mobile`, «in arrivo») passa a «in corso» quando
comincia il lavoro.

## Cosa c'è oggi

- `apps/mobile` è uno scheletro: Expo SDK 57, una schermata con i quindici
  componenti di `@repo/ui` ([App.tsx](../apps/mobile/App.tsx)). Niente
  navigazione, niente login, niente API.
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

### M0 · Decisioni prima del codice

Solo carta.

1. **OpenCritic**: l'app non mostra dati OpenCritic, o si chiede a
   OpenCritic, o si compra il piano. Default: non mostrarli, come le card del
   web. Da chiedere a OpenCritic in ogni caso: se F-Droid conta come «App
   Store».
2. **Distribuzione**: default l'**APK dal nostro sito**, che non è un App
   Store. Poi, secondo la risposta di OpenCritic: F-Droid, Play Store,
   App Store (TestFlight prima). Costi: Apple Developer 99 $/anno, Google
   Play 25 $ una volta. F-Droid compila lui dal sorgente (niente EAS) e
   accetta solo dipendenze libere: niente Google Play Services, quindi niente
   push via FCM. Le dipendenze Expo di oggi sono libere.
3. **Le schermate della prima versione**. Proposta: accesso e registrazione,
   «cosa gioco adesso» (13), backlog come lista a schede, pagina del gioco,
   playlist e wishlist. Restano sul web: admin, import CSV, crediti, roadmap,
   informativa e condizioni (queste come link al sito).

### M1 · Fondamenta

- **Navigazione con Expo Router**, bottom tab: Adesso · Backlog · Playlist ·
  Account.
- **Login** col plugin `@better-auth/expo`: `expo()` sul server, `expoClient`
  con `expo-secure-store` sul client, lo schema dell'app nei
  `trustedOrigins`. È l'unico punto in cui il mobile tocca `packages/auth`.
- **oRPC**: un `RPCLink` che manda il cookie di `authClient.getCookie()`,
  più TanStack Query come sul web.
- **Testi**: `use-intl` anche qui, con **file di messaggi propri** in
  `apps/mobile`: le schermate sono diverse, e lo sono anche i testi.

### M2 · Backlog e pagina del gioco

Lista a schede, filtri in un bottom sheet, voto al volo e stato.

### M3 · «Cosa gioco adesso»

La schermata del 13, nella forma per il telefono. Aspetta il 13.

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
