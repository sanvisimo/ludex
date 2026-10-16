# EA, un collegamento che si rinnova

**Stato: chiuso il 16/10/2026, senza codice.** Il secondo giro di
`ea:login-probe` ha risposto «pc_sign is missing»: EA resta un'importazione una
tantum. Decisione dell'utente, presa prima del giro: se non regge la strada
buona, non si insegue né sul web né sul mobile. Segue il 9c ([9c-ea.md](9c-ea.md)), chiuso come
importazione una tantum.

## Perché

Il 9c importa con il token di `connect/auth` (`client_id=ORIGIN_JS_SDK`,
`response_type=token`, `redirect_uri=nucleus:rest`): una pagina JSON, quattro
ore, nessun rinnovo. Per aggiornare la libreria l'utente rifà i passi
(«Importa di nuovo»). Gli altri negozi si collegano una volta e il server rinnova
da sé: l'obiettivo è portare EA lì, e svuotare `oneShotStoreValues`.

## Cosa dicono le fonti (lette, non provate)

- **Il plugin EA di GOG Galaxy** (BellezaEmporium/galaxy-integration-ead,
  aggiornato ad agosto 2026) fa il login dell'**app desktop EA**:
  `client_id=JUNO_PC_CLIENT`, OAuth con PKCE, `display=junoClient/login`,
  redirect a `qrc:///html/login_successful.html?code=…`. Il codice si scambia su
  `connect/token` col `client_secret` dell'app, scritto nel plugin come quelli di
  GOG ed Epic nei loro launcher, e rende **access e refresh token**; il rinnovo è
  `grant_type=refresh_token`.
- Quel login manda anche **`pc_sign`**: un'impronta dell'hardware (processore,
  BIOS, dischi) e un orario, firmati con una chiave dell'app EA ricavata da EA
  Desktop. Il plugin la calcola dal PC su cui gira; un server dovrebbe inventarne
  uno. Un documento di fattibilità terzo (unifideck) dice che il plugin ripiega
  su una firma vuota e il login passa: non verificato.
- **Lutris** fa il login con `ORIGIN_SPA_ID` e un redirect https,
  `www.origin.com/views/login.html`, ma solo per avere i cookie della sessione.

## Misurato (13/10/2026, richieste anonime)

- **`www.origin.com/views/login.html` risponde 301 verso
  `ea.com/games/library/pc-download`, e perde `?code=…`.** Il codice di
  `ORIGIN_SPA_ID` non arriverebbe mai nella barra degli indirizzi: quella strada
  è chiusa dal lato dell'utente, prima ancora di sapere se dà un refresh token.
- **`qrc://`** è uno schema che il browser non apre, e ci si arriva con un
  redirect dopo il login, non con un pulsante di cui copiare l'indirizzo (com'è
  per Nintendo): il codice del login dell'app EA, da un browser, probabilmente
  non si vede da nessuna parte. Non provato.

## L'idea da provare: il codice dalla pagina JSON

`redirect_uri=nucleus:rest` non porta da nessuna parte: EA risponde con una
pagina JSON, ed è così che arriva il token di oggi. Se con `response_type=code`
la stessa pagina mostra un **codice**, il gesto resta quello del 9c — apri un
indirizzo col browser entrato su ea.com, copia il JSON — e il codice si scambia
per un refresh token. Nessun `qrc://`, e forse nessun `pc_sign`.

`ea:login-probe` (in [`ea-login-probe.ts`](../apps/api/src/scripts/ea-login-probe.ts))
lo prova con due client, il secondo solo se il primo non dà il refresh token:

1. **`ORIGIN_JS_SDK`**, quello del token di oggi: pubblico, senza segreto;
2. **`JUNO_PC_CLIENT`**, col suo segreto e PKCE, **senza `pc_sign`**: se EA la
   pretende, l'errore lo dice.

Per ciascuno: l'indirizzo da aprire, ciò che l'utente incolla, lo scambio del
codice (una richiesta), e se arriva un refresh token un rinnovo (una) e
l'identità col token rinnovato (una). Stampa le chiavi delle risposte e le
durate, mai i token. Il refresh token, se arriva, si salva **cifrato** con
`STORE_TOKEN_KEY` in `~/.cache/ludex/ea-login-probe.bin`, fuori dal repo, e
`--rinnova` lo rinnova giorni dopo.

**Parla con l'account EA dell'utente**, da un client che non è il browser di
ea.com: Steam l'ha bloccato tre volte per prove simili. EA potrebbe chiedere una
verifica o mandare un avviso di accesso.

Il **primo giro** (13/10/2026) ha chiuso l'idea:

| Client           | Risposta di EA                                                                  | Vuol dire                                                                                         |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ORIGIN_JS_SDK`  | `unauthorized_client`, «response_type is invalid» (101109)                      | non dà codici: solo il token da quattro ore del 9c                                                |
| `JUNO_PC_CLIENT` | `invalid_request`, «redirect_uri is invalid» (102111), con `response_type=code` | il codice sì, ma solo verso i suoi indirizzi di ritorno, cioè `qrc:///html/login_successful.html` |

## Il secondo giro: il login dell'app EA, com'è

Resta il login di `JUNO_PC_CLIENT` con il suo `qrc://`, PKCE,
`display=junoClient/login`, e **senza `pc_sign`**. Il refresh token lo dà (lo dice
il plugin di Galaxy): la domanda è **dove l'utente vede il codice**. Chrome, a un
redirect verso uno schema che non conosce, probabilmente non mostra niente;
Firefox forse lascia l'indirizzo `qrc://…?code=…` nella barra, con una pagina
d'errore. Il giro si fa in Firefox; se la barra non lo mostra, il codice si prende
da F12 → Rete, dalla risposta di `connect/auth`, solo per misurare. Poi lo
scambio (una richiesta, ed è lì che si vede se `pc_sign` serve), un rinnovo e
l'identità.

Se il codice si vede solo dagli strumenti per sviluppatori, **sul web non si fa**:
resta per il mobile, dove una `WebView` intercetta il redirect da sola, com'è in
Playnite.

| Domanda                                                    | Risposta                                    |
| ---------------------------------------------------------- | ------------------------------------------- |
| Dove si vede il codice: barra di Firefox, o solo F12       | non si arriva al codice                     |
| Lo scambio passa senza `pc_sign`, e rende un refresh token | **no**: EA si ferma prima, a `connect/auth` |
| Quanto dura il refresh token, e se ruota                   | non misurabile                              |
| Un rinnovo da qui, a distanza di giorni (`--rinnova`)      | non misurabile                              |

**Il secondo giro (16/10/2026).** Firefox, entrato su ea.com, sull'indirizzo
stampato dallo script: EA non rimanda a `qrc://`, risponde con una pagina JSON,
`{"error":"invalid_request","error_description":"pc_sign is missing","code":102105}`.
La firma dell'hardware non è facoltativa già al login, prima dello scambio del
codice: il ripiego su una firma vuota di cui parlava il documento di unifideck
non c'è, o non c'è più.

Avere un codice vorrebbe dire calcolare un `pc_sign` dal server: un'impronta
hardware inventata, firmata con una chiave estratta da EA Desktop. È la cosa più
fragile che si possa tenere (EA la cambia aggiornando l'app) e quella che
più somiglia a farsi passare per il client di EA. Non si fa.

## Poi

- **Se una strada regge**: il piano dei passi di codice — il client nuovo in
  `external/ea.ts` (scambio e rinnovo, come Epic), EA fuori da
  `oneShotStoreValues`, il rinnovo nell'import (`storeAccessToken`), la scheda
  che torna al ↻ e all'interruttore, la voce in roadmap «in corso». Il client
  della libreria, la riduzione e l'import del 9c restano.
- **Se nessuna regge**: EA resta una tantum, e qui si scrive perché, con le
  misure. **È andata così** (16/10/2026): vedi il secondo giro sopra.
  `oneShotStoreValues` resta `['ea']`.
