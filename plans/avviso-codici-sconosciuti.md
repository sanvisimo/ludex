# Avviso Telegram sui codici di piattaforma sconosciuti

**Stato: in corso**, approvato il 12/11/2026. Branch `feat/avviso-codici-sconosciuti`.

## Il problema

Nintendo e PSN dicono la piattaforma di ogni voce con un codice loro (`HAC`,
`BEE`, `PS5`…), che traduciamo con una mappa scritta a mano. Un codice che la
mappa non conosce **non ripiega su un'altra piattaforma**, giustamente, e la
voce si salta. L'unica traccia è una riga nel log del worker:

```
[import] nintendo: 2 voci saltate, piattaforma sconosciuta: … [BEE], … [BEE]
```

Il 12/11/2026 un utente non trovava _Tears of the Kingdom_: era la Switch 2
Edition, codice `BEE`, sconosciuto. Lo si è scoperto solo perché l'utente l'ha
segnalato. Quelle voci non arrivano nemmeno fra gli scarti: per l'utente il
gioco non esiste, e per l'admin non c'è niente da vedere. Il log di Docker
ruota (10 MB × 3) e nessuno lo legge ogni giorno. Corretto con
[#133](https://github.com/sanvisimo/ludex/pull/133); questo lotto serve a
saperlo la prossima volta senza aspettare una segnalazione.

## La soluzione

Un messaggio Telegram all'admin quando un import incontra un codice
sconosciuto, **una volta per codice**. Il bot c'è già: è quello degli errori di
deploy e backup.

1. **`apps/api/src/lib/notify.ts`**, `notifyAdmin(testo)`: una POST a
   `https://api.telegram.org/bot<TELEGRAM_TOKEN>/sendMessage` con
   `TELEGRAM_CHAT_ID`. Senza le variabili non fa niente, e in sviluppo resta
   muta. **Non lancia mai**: un avviso fallito si scrive nel log e l'import va
   avanti. Timeout breve.
2. **Una volta per codice**: `claimOnce` di `lib/redis.ts` sulla chiave
   `unknown-platform:<negozio>:<codice>`, per 30 giorni. Il primo import che lo trova avvisa; se dopo
   30 giorni il codice è ancora sconosciuto, avvisa di nuovo. Con Redis giù
   `claimOnce` dà `false` e l'avviso salta: resta il log.
3. **Nintendo e PSN**: `buildNintendoEntries` e `buildPsnEntries` rendono, oltre
   alle `scartate`, i codici sconosciuti con un titolo d'esempio. L'import li
   passa all'avviso, e il log resta com'è. Il messaggio:

   ```
   Ludex · nintendo: codice di piattaforma sconosciuto BEE (es. «The Legend of Zelda: Tears of the Kingdom – Nintendo Switch 2 Edition»). Le voci si saltano finché non lo si aggiunge.
   ```

4. **Variabili**: `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID`, gli stessi nomi di
   `/opt/scripts/telegram.env`, così i valori si copiano. In `.env.example`
   (vuote) e in `globalEnv` di `turbo.json`. **Sul VPS le aggiunge l'utente** in
   `/opt/docker/ludex/ludex.env`, che il compose passa a `api` e `worker`.
5. **Test**: `buildNintendoEntries` e `buildPsnEntries` rendono i codici
   sconosciuti; due import con lo stesso codice mandano un avviso solo. Il
   notificatore si stubba al confine del modulo, non su `fetch`.

Fuori: la roadmap (è lavoro interno) e altri usi dell'avviso. La funzione è
generica, ma ogni altro uso è una decisione a parte.

## Verifica

- `pnpm --filter api test`, `pnpm lint`, `pnpm check-types`.
- In locale, con le due variabili nel `.env`: un import con un codice
  sconosciuto (da un test o forzando la mappa) manda un messaggio, il secondo no.
- Sul VPS, dopo il deploy e le variabili in `ludex.env`: oggi nessun codice è
  sconosciuto, quindi la prova vera la farà il primo che arriva. Che le variabili
  siano lette lo si vede prima con una chiamata a `notifyAdmin` dal container
  del worker.

## Dopo: nessun deploy per un codice nuovo

L'avviso dice che un codice manca, ma aggiungerlo resta un deploy. Il passo
successivo, da progettare a parte: la mappa da codice a piattaforma passa dal
codice a una tabella (`negozio`, `codice`, `piattaforma`), seedata con quelli di
oggi. Un codice nuovo vi si scrive con la piattaforma vuota, l'avviso dice
«assegnalo nell'admin», e il primo import dopo l'assegnazione lo fa entrare.
Costa una migration e una piccola sezione dell'admin, una volta sola.

E l'altra metà: corretto il codice, gli utenti che avevano quei giochi vanno
avvisati che un aggiornamento della libreria li recupera. Oggi non c'è un modo
di farlo dentro l'app. È la voce «Notifiche in PileCue» della roadmap, fra le
idee dal 12/11/2026: un sistema di notifiche agli utenti, da progettare a parte.
