# Rilascio, i testi da rivedere

Parte del [rilascio](rilascio.md), aperto il 29/10/2026 sul commento «vanno
rivisti tutti i testi». Ogni voce ha il testo di **oggi** e la **proposta**;
correggi direttamente la proposta, o scrivi sotto una riga `Nota:`. Si fa
prima l'italiano: l'inglese si traduce dopo, dal testo approvato.

**Approvata il 29/10/2026 e messa nel codice**, in italiano e in inglese.

Seconda versione, del 29/10/2026: la prima era «troppo gioviale», da rendere
«un po' più formale, ma non troppo». Le regole:

- **il «tu» resta**, come nel resto dell'app; via i toni da chiacchiera
  («sei dentro», «forse tu», «Benvenuto»).
- **le email aprono con «Gentile {nome},»** e chiudono con «Ludex».
- **gli errori sono impersonali**: «Non è stato possibile…», né «io» né «noi».
- **una cosa per frase**: prima cosa è successo, poi cosa fare.

## Accesso (`/login`)

- **Link sotto la password**
  - Oggi: Password dimenticata?
  - Proposta: Password dimenticata?
- **Email non ancora confermata** (`authErrors.EMAIL_NOT_VERIFIED`)
  - Oggi: L'indirizzo email non è ancora verificato: ti abbiamo mandato un
    link nuovo, aprilo per entrare.
  - Proposta: Per accedere è necessario confermare l'indirizzo email. Ti
    abbiamo inviato un nuovo link di conferma.
- **Dopo il reset della password**
  - Oggi: Password cambiata: accedi con quella nuova.
  - Proposta: La password è stata aggiornata. Accedi con la nuova password.
- **Link di conferma scaduto** (`login.verifyFailed`): esce dall'accesso e
  va nella pagina dei link, vedi sotto.

## Registrazione (`/register`), dopo l'invio

- **Titolo**
  - Oggi: Controlla la posta
  - Proposta: Conferma il tuo indirizzo email
- **Testo**
  - Oggi: Ti abbiamo scritto a {email}. Apri il link per entrare: vale
    un'ora.
  - Proposta: Abbiamo inviato un link di conferma a {email}. Il link è
    valido per un'ora.
- **Se non arriva**
  - Oggi: Non arriva? Guarda nello spam, oppure accedi: te ne mandiamo uno
    nuovo.
  - Proposta: Se non lo trovi, controlla la cartella spam. Se il link è
    scaduto, accedi con email e password per riceverne uno nuovo.
- **Bottone**
  - Oggi: Vai all'accesso
  - Proposta: Vai all'accesso

## Password dimenticata (`/forgot-password`)

- **Titolo**
  - Oggi: Password dimenticata
  - Proposta: Recupero della password
- **Sottotitolo**
  - Oggi: Ti mandiamo un link per sceglierne una nuova.
  - Proposta: Inserisci l'indirizzo email del tuo account: riceverai un link
    per impostare una nuova password.
- **Bottone**
  - Oggi: Mandami il link
  - Proposta: Invia il link
- **Dopo l'invio**
  - Oggi: Se l'indirizzo è registrato ti arriva un link. Vale un'ora.
  - Proposta: Se l'indirizzo corrisponde a un account, riceverai a breve un
    link valido per un'ora. Controlla anche la cartella spam.
- **Errore**
  - Oggi: Non sono riuscito a mandare il link
  - Proposta: Non è stato possibile inviare il link. Riprova tra qualche
    minuto.

## Nuova password (`/reset-password`)

- **Titolo**
  - Oggi: Nuova password
  - Proposta: Imposta una nuova password
- **Sottotitolo**
  - Oggi: Scegli la password nuova.
  - Proposta: Scegli la nuova password del tuo account.
- **Nota sotto il campo**
  - Oggi: Uscirai da tutti i dispositivi.
  - Proposta: Dopo il salvataggio verrai disconnesso da tutti i dispositivi,
    compreso questo.
- **Link non valido**
  - Oggi: Il link è scaduto o non è valido. · Chiedine un altro
  - Proposta: Il link è scaduto o è già stato utilizzato. · Richiedi un nuovo
    link
- **Errore**
  - Oggi: Non sono riuscito a salvare la password
  - Proposta: Non è stato possibile salvare la password. Riprova tra qualche
    minuto.

## Profilo, cambio email

- **Descrizione del dialogo**
  - Oggi: Ti scriviamo prima all'indirizzo di adesso per confermare, poi a
    quello nuovo per verificarlo.
  - Proposta: Per sicurezza il cambio va confermato due volte: dall'indirizzo
    attuale e da quello nuovo. Fino ad allora resta valido l'indirizzo
    attuale.
- **Bottone**
  - Oggi: Invia
  - Proposta: Continua
- **Dopo l'invio**
  - Oggi: Controlla la posta di {email} per confermare il cambio.
  - Proposta: Abbiamo inviato un'email a {email}: apri il link per confermare
    il cambio.
- **Errore**
  - Oggi: Non sono riuscito a chiedere il cambio
  - Proposta: Non è stato possibile richiedere il cambio. Riprova tra qualche
    minuto.
- Gli avvisi di ritorno dai link (`emailLinkOpened`, `emailLinkFailed`)
  escono dal profilo e vanno nella pagina dei link.

## La pagina dei link (`/email-link`, nuova)

Il wireframe è in [rilascio-ritocchi.excalidraw](rilascio-ritocchi.excalidraw),
schermata A.

- **Registrazione confermata**: «Indirizzo email confermato» · «Il tuo
  account è attivo.» · Vai al tuo backlog
- **Cambio email, primo link**: «Conferma il nuovo indirizzo» · «Abbiamo
  inviato un link al nuovo indirizzo: aprilo per completare il cambio. Fino
  ad allora resta valido l'indirizzo attuale.»
- **Cambio email, secondo link**: «Indirizzo email aggiornato» · «D'ora in
  poi accedi con {email}.» · Vai al profilo
- **Link scaduto, registrazione**: «Link non valido» · «Il link è scaduto o è
  già stato utilizzato. Accedi con email e password per riceverne uno
  nuovo.» · Accedi
- **Link scaduto, cambio email**: «Link non valido» · «Il link è scaduto o è
  già stato utilizzato. Puoi richiedere di nuovo il cambio dal profilo.» · Vai
  al profilo

## CAPTCHA e limiti

- **Script bloccato**
  - Oggi: Non riesco a caricare la verifica anti-bot di Cloudflare: se hai un
    blocco degli annunci o un'estensione per la privacy, prova a
    disattivarla per questo sito e ricarica la pagina.
  - Proposta: Non è stato possibile caricare il controllo anti-bot. Se usi un
    blocco degli annunci o un'estensione per la privacy, disattivala per
    questo sito e ricarica la pagina.
- **Controllo non fatto** (`MISSING_RESPONSE`)
  - Oggi: Completa la verifica qui sopra prima di inviare.
  - Proposta: Completa il controllo anti-bot prima di continuare.
- **Controllo fallito** (`VERIFICATION_FAILED`)
  - Oggi: La verifica non è riuscita: riprova.
  - Proposta: Il controllo anti-bot non è riuscito. Riprova.
- **Troppi tentativi** (`TOO_MANY_REQUESTS`)
  - Oggi: Troppi tentativi: aspetta un momento e riprova.
  - Proposta: Troppi tentativi ravvicinati. Attendi qualche secondo e riprova.
- **Link non valido / scaduto** (`INVALID_TOKEN`, `TOKEN_EXPIRED`)
  - Oggi: Il link non è valido o è già stato usato. · Il link è scaduto.
  - Proposta: Il link è scaduto o è già stato utilizzato. (uno solo, per
    tutti e due)

## Le email

Oggi sono solo testo. Diventano HTML, con la versione in testo accanto per
chi non lo legge: wireframe in
[rilascio-ritocchi.excalidraw](rilascio-ritocchi.excalidraw), schermata D.
Tutte con la stessa struttura: «Gentile {nome},», cosa è successo, il bottone,
quanto vale il link, cosa fare se la richiesta non è tua, la firma «Ludex».

- **Conferma della registrazione**
  - Oggetto oggi: Conferma il tuo indirizzo email
  - Oggetto proposto: Conferma il tuo indirizzo email
  - Testo proposto: Per attivare il tuo account Ludex conferma il tuo
    indirizzo email. [Conferma l'indirizzo] Il link è valido per un'ora. Se
    non hai richiesto la registrazione, puoi ignorare questa email: l'account
    non verrà attivato.
- **Conferma del nuovo indirizzo** (nuova: oggi usa per sbaglio il testo
  della registrazione)
  - Oggetto proposto: Conferma il nuovo indirizzo email
  - Testo proposto: È stato richiesto di associare questo indirizzo al tuo
    account Ludex. [Conferma il nuovo indirizzo] Dopo la conferma accederai
    con questo indirizzo. Il link è valido per un'ora. Se non hai fatto tu la
    richiesta, puoi ignorare questa email.
- **Cambio email, all'indirizzo attuale**
  - Oggetto oggi: Conferma il cambio di indirizzo email
  - Oggetto proposto: Richiesta di cambio dell'indirizzo email
  - Testo proposto: È stato richiesto di cambiare l'indirizzo email del tuo
    account Ludex in {nuova}. [Conferma il cambio] Dopo la conferma invieremo
    un link anche al nuovo indirizzo. Il link è valido per un'ora. Se non hai
    fatto tu la richiesta, ignora questa email e cambia la password del tuo
    account.
- **Indirizzo già in uso** (nuova: oggi non arriva niente)
  - Oggetto proposto: Indirizzo email già in uso
  - Testo proposto: Hai chiesto di cambiare l'indirizzo email del tuo account
    Ludex in {nuova}, ma questo indirizzo è già associato a un altro account.
    Il tuo indirizzo non è cambiato. Se l'altro account è tuo e non ti serve
    più, puoi cancellarlo dal suo profilo e poi ripetere la richiesta.
- **Reset della password**
  - Oggetto oggi: Reimposta la password
  - Oggetto proposto: Reimpostazione della password
  - Testo proposto: Abbiamo ricevuto una richiesta di reimpostazione della
    password del tuo account Ludex. [Imposta una nuova password] Il link è
    valido per un'ora. Se non hai fatto tu la richiesta, puoi ignorare questa
    email: la password resta invariata.
- **Registrazione con un indirizzo già iscritto**
  - Oggetto oggi: Hai già un account Ludex
  - Oggetto proposto: Hai già un account Ludex
  - Testo proposto: È stata richiesta una registrazione con questo
    indirizzo, che è già associato a un account Ludex. Per accedere usa la
    tua password; se non la ricordi, puoi impostarne una nuova. [Recupera la
    password] Se non hai fatto tu la richiesta, puoi ignorare questa email: il
    tuo account non è cambiato.
