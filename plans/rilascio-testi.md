# Rilascio, i testi da rivedere

Parte del [rilascio](rilascio.md), aperto il 29/10/2026 sul commento «vanno
rivisti tutti i testi». Ogni voce ha il testo di **oggi** e la **proposta**;
correggi direttamente la proposta, o scrivi sotto una riga `Nota:`. Si fa
prima l'italiano: l'inglese si traduce dopo, dal testo approvato.

Le regole che ho seguito, da confermare:

- **«noi», non «io»**: l'app oggi mescola «Non sono riuscito a…» (gli errori)
  e «ti abbiamo scritto» (le email, le condizioni). Per questi testi propongo
  «noi» dappertutto; gli errori già esistenti fuori da questo lotto restano
  come sono.
- **una cosa per frase**, e prima cosa succede, poi cosa fare.
- **il tempo del link si dice una volta**, dove serve: nell'email e nella
  pagina «Controlla la posta».

## Accesso (`/login`)

- **Link sotto la password**
  - Oggi: Password dimenticata?
  - Proposta: Password dimenticata?
- **Email non ancora confermata** (`authErrors.EMAIL_NOT_VERIFIED`)
  - Oggi: L'indirizzo email non è ancora verificato: ti abbiamo mandato un
    link nuovo, aprilo per entrare.
  - Proposta: Prima di entrare devi confermare l'email. Ti abbiamo appena
    mandato un link nuovo.
- **Dopo il reset della password**
  - Oggi: Password cambiata: accedi con quella nuova.
  - Proposta: Password cambiata. Accedi con quella nuova.
- **Link di conferma scaduto** (`login.verifyFailed`): esce dall'accesso e
  va nella pagina dei link, vedi sotto.

## Registrazione (`/register`), dopo l'invio

- **Titolo**
  - Oggi: Controlla la posta
  - Proposta: Controlla la posta
- **Testo**
  - Oggi: Ti abbiamo scritto a {email}. Apri il link per entrare: vale
    un'ora.
  - Proposta: Ti abbiamo mandato un link a {email}. Aprilo entro un'ora per
    confermare l'indirizzo ed entrare.
- **Se non arriva**
  - Oggi: Non arriva? Guarda nello spam, oppure accedi: te ne mandiamo uno
    nuovo.
  - Proposta: Non lo trovi? Guarda nello spam. Se è scaduto, accedi con email
    e password e te ne mandiamo un altro.
- **Bottone**
  - Oggi: Vai all'accesso
  - Proposta: Vai all'accesso

## Password dimenticata (`/forgot-password`)

- **Titolo**
  - Oggi: Password dimenticata
  - Proposta: Recupera la password
- **Sottotitolo**
  - Oggi: Ti mandiamo un link per sceglierne una nuova.
  - Proposta: Scrivi l'email del tuo account: ti mandiamo un link per
    sceglierne una nuova.
- **Bottone**
  - Oggi: Mandami il link
  - Proposta: Mandami il link
- **Dopo l'invio**
  - Oggi: Se l'indirizzo è registrato ti arriva un link. Vale un'ora.
  - Proposta: Se c'è un account con questo indirizzo, ti abbiamo mandato un
    link. Vale un'ora; se non lo trovi, guarda nello spam.
- **Errore**
  - Oggi: Non sono riuscito a mandare il link
  - Proposta: Non siamo riusciti a mandare il link. Riprova fra poco.

## Nuova password (`/reset-password`)

- **Sottotitolo**
  - Oggi: Scegli la password nuova.
  - Proposta: Scegli la nuova password del tuo account.
- **Nota sotto il campo**
  - Oggi: Uscirai da tutti i dispositivi.
  - Proposta: Salvandola esci da tutti i dispositivi, anche da questo: poi
    accedi con la nuova.
- **Link non valido**
  - Oggi: Il link è scaduto o non è valido. · Chiedine un altro
  - Proposta: Questo link è scaduto o è già stato usato. · Chiedi un link
    nuovo
- **Errore**
  - Oggi: Non sono riuscito a salvare la password
  - Proposta: Non siamo riusciti a salvare la password. Riprova fra poco.

## Profilo, cambio email

- **Descrizione del dialogo**
  - Oggi: Ti scriviamo prima all'indirizzo di adesso per confermare, poi a
    quello nuovo per verificarlo.
  - Proposta: Servono due conferme: prima dall'indirizzo di adesso, poi da
    quello nuovo. Fino ad allora resta quello di adesso.
- **Bottone**
  - Oggi: Invia
  - Proposta: Continua
- **Dopo l'invio**
  - Oggi: Controlla la posta di {email} per confermare il cambio.
  - Proposta: Ti abbiamo scritto a {email}: apri il link per confermare il
    cambio.
- **Errore**
  - Oggi: Non sono riuscito a chiedere il cambio
  - Proposta: Non siamo riusciti a chiedere il cambio. Riprova fra poco.
- Gli avvisi di ritorno dai link (`emailLinkOpened`, `emailLinkFailed`)
  escono dal profilo e vanno nella pagina dei link.

## La pagina dei link (`/email-link`, nuova)

Il wireframe è in [rilascio-ritocchi.excalidraw](rilascio-ritocchi.excalidraw),
schermata A.

- **Registrazione confermata**: «Email confermata» · «Benvenuto su Ludex,
  {nome}.» · Vai al tuo backlog
- **Cambio email, primo link**: «Manca un passo» · «Ti abbiamo scritto al
  nuovo indirizzo: apri quel link per finire il cambio. Fino ad allora resta
  quello di prima.»
- **Cambio email, secondo link**: «Email cambiata» · «D'ora in poi accedi
  con {email}.» · Vai al profilo
- **Link scaduto, registrazione**: «Link scaduto» · «Questo link è scaduto o
  è già stato usato. Accedi con email e password: te ne mandiamo un altro.» ·
  Accedi
- **Link scaduto, cambio email**: «Link scaduto» · «Questo link è scaduto o è
  già stato usato. Chiedi di nuovo il cambio dal profilo.» · Vai al profilo

## CAPTCHA e limiti

- **Script bloccato**
  - Oggi: Non riesco a caricare la verifica anti-bot di Cloudflare: se hai un
    blocco degli annunci o un'estensione per la privacy, prova a
    disattivarla per questo sito e ricarica la pagina.
  - Proposta: Non riusciamo a caricare il controllo anti-bot. Se usi un blocco
    degli annunci o un'estensione per la privacy, disattivala per questo sito
    e ricarica la pagina.
- **Controllo non fatto** (`MISSING_RESPONSE`)
  - Oggi: Completa la verifica qui sopra prima di inviare.
  - Proposta: Prima completa il controllo qui sopra.
- **Controllo fallito** (`VERIFICATION_FAILED`)
  - Oggi: La verifica non è riuscita: riprova.
  - Proposta: Il controllo anti-bot non è passato. Riprova.
- **Troppi tentativi** (`TOO_MANY_REQUESTS`)
  - Oggi: Troppi tentativi: aspetta un momento e riprova.
  - Proposta: Troppi tentativi di fila. Aspetta qualche secondo e riprova.
- **Link non valido / scaduto** (`INVALID_TOKEN`, `TOKEN_EXPIRED`)
  - Oggi: Il link non è valido o è già stato usato. · Il link è scaduto.
  - Proposta: Questo link è scaduto o è già stato usato. (uno solo, per
    tutti e due)

## Le email

Oggi sono solo testo. Firma di tutte: «— Ludex». La proposta è la stessa
struttura per tutte: saluto, una riga su cosa è successo, il bottone (o il
link), quanto vale, cosa fare se non eri tu.

- **Conferma della registrazione**
  - Oggetto oggi: Conferma il tuo indirizzo email
  - Oggetto proposto: Conferma la tua email per entrare in Ludex
  - Testo proposto: Ciao {nome}, manca solo un passo: conferma il tuo
    indirizzo e sei dentro. [Conferma l'email] Il link vale un'ora. Se non ti
    sei registrato tu, ignora questa email: senza conferma l'account non si
    apre.
- **Conferma del nuovo indirizzo** (nuova: oggi usa per sbaglio il testo
  della registrazione)
  - Oggetto proposto: Conferma il tuo nuovo indirizzo email
  - Testo proposto: Ciao {nome}, hai chiesto di usare questo indirizzo per il
    tuo account Ludex. Confermalo e da lì in poi accederai con questo. [Usa
    questo indirizzo] Il link vale un'ora. Se non l'hai chiesto tu, ignora
    questa email: l'indirizzo non cambia.
- **Cambio email, all'indirizzo di adesso**
  - Oggetto oggi: Conferma il cambio di indirizzo email
  - Oggetto proposto: Vuoi cambiare l'email del tuo account Ludex?
  - Testo proposto: Ciao {nome}, hai chiesto di cambiare l'email del tuo
    account in {nuova}. Se sei stato tu, conferma: poi ti scriveremo al nuovo
    indirizzo. [Conferma il cambio] Il link vale un'ora. Se non sei stato tu,
    ignora questa email e cambia la password: qualcuno potrebbe averla.
- **Indirizzo già usato** (nuova: oggi non arriva niente)
  - Oggetto proposto: Quell'indirizzo è già usato su Ludex
  - Testo proposto: Ciao {nome}, hai chiesto di cambiare l'email del tuo
    account in {nuova}, ma quell'indirizzo appartiene già a un altro account
    Ludex. Il tuo resta com'è. Se quell'altro account è tuo e non ti serve
    più, puoi cancellarlo dal suo profilo e poi riprovare.
- **Reset della password**
  - Oggetto oggi: Reimposta la password
  - Oggetto proposto: Scegli una nuova password per Ludex
  - Testo proposto: Ciao {nome}, hai chiesto di cambiare la password del tuo
    account. [Scegli la nuova password] Il link vale un'ora. Se non l'hai
    chiesto tu, ignora questa email: la password resta quella di prima.
- **Registrazione con un indirizzo già iscritto**
  - Oggetto oggi: Hai già un account Ludex
  - Oggetto proposto: Hai già un account Ludex
  - Testo proposto: Ciao {nome}, qualcuno, forse tu, ha provato a registrarsi
    con questo indirizzo, che ha già un account. Per entrare usa la tua
    password; se non la ricordi, scegline una nuova. [Recupera la password]
    Se non sei stato tu, ignora questa email: il tuo account non è cambiato.
