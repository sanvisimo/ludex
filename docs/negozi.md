# Le altre librerie (step 9): il problema è il credenziale, non l'API

Parte della documentazione in `docs/`, spostata dal CLAUDE.md della radice. Gli altri file: [modello-dati](modello-dati.md), [import-librerie](import-librerie.md), [negozi](negozi.md), [ordine-sviluppo](ordine-sviluppo.md), [scelte-scartate](scelte-scartate.md).

Steam è l'eccezione, non il modello: una chiave applicativa nostra, un profilo
pubblico, zero credenziali dell'utente. Nessun altro negozio funziona così.

Playnite li risolve tutti aprendo una webview, ma **la webview gli serve una
volta sola**: fatto il login tiene i cookie o i token su disco e da lì in poi usa
`HttpClient` normale, senza più aprire niente. Cioè l'**uso** è HTTP semplice
per tutti — un server lo fa identico. A dividerci da Playnite resta solo
l'**acquisizione**, perché una pagina web non può leggere l'URL né il corpo di
un'altra origine: è la same-origin policy, e non è aggirabile con un `iframe` o
un `window.open`.

La via d'uscita ovvia sarebbe un OAuth con `redirect_uri` nostro. **Non esiste, ed
è misurato**: GOG risponde `redirect_uri_mismatch` (dopo il login riuscito, quindi
non lo si scopre con un `curl`), Amazon risponde 404 a qualunque `openid.return_to`
fuori dai suoi domini. Sono i `client_id` dei loro launcher, con la lista dei
redirect già fissata. Non riproporlo.

Quindi: **l'utente incolla l'URL su cui è atterrato.** Si accetta l'URL intero e
non il codice estratto, come fa già `resolveSteamId` con il profilo Steam — qui
«incolla quello che hai sotto mano» è una convenzione, non un ripiego inventato
per l'occasione. È un gesto solo: da lì in poi il `refresh_token` rinnova da sé e
l'utente non lo rivede più.

Conseguenza di disegno da rispettare: **la mutazione che collega un account non
deve sapere chi le ha portato il codice.** Dal web lo incolla l'utente, da
`apps/mobile` una `WebView` nativa lo prenderà da sola, che è esattamente ciò che
fa Playnite. Se il collegamento viene disegnato *intorno* al copia-incolla, il
mobile poi lo trova incastrato.

`store_accounts` cresce di conseguenza: access token, refresh token, scadenza,
cifrati a riposo in **AES-256-GCM** con `STORE_TOKEN_KEY` (da dichiarare anche in
`globalEnv` dentro `turbo.json`), più uno stato esplicito «da ricollegare» —
perché quando il rinnovo fallisce non fallisce il job, fallisce l'utente, e
`/account` deve saperglielo dire.

## L'aggiornamento automatico

Le librerie si reimportano da sole: una spazzata sulla coda `imports`, ogni sei
ore, accoda l'import degli account il cui `last_sync_at` è più vecchio della
soglia del loro negozio — **tre giorni su PSN, sette sugli altri**
(`AUTO_SYNC_EVERY_DAYS`). Su PSN è ciò che tiene vivo il collegamento, sugli
altri è freschezza. Come la spazzata dell'enrichment, accoda e non importa.

Due interruttori, e servono **tutti e due** accesi:

- **`user_settings.auto_sync_library`** — «Aggiorna automaticamente la
  libreria», per tutti gli account dell'utente. Una tabella a parte e non una
  colonna su `user`, per la stessa ragione di `store_accounts`. **Nessuna riga
  vuol dire i default**, che stanno sulle colonne: niente migrazione dei dati
  per gli utenti che c'erano, niente hook alla registrazione, e chi legge
  ripiega sempre sul default (`coalesce` in SQL).
- **`store_accounts.auto_sync`** — per account, perché ci sono librerie che non
  cambiano più: un account Amazon su cui non si riscatta niente da un anno.

Tutti e due partono accesi. Spegnere quello generale e riaccenderlo non cambia
le scelte fatte sui singoli account. Si salta chi è `needs_reauth` —
riprovare non lo sblocca — e un account con un import già in coda non si
accoda due volte, per la stessa deduplicazione del doppio clic.

**Non serve il lock sulla riga** di cui parla la sezione qui sotto: il rinnovo
resta dentro l'import, quindi nel worker, uno alla volta per account. Il lock
torna a servire il giorno in cui qualcosa rinnova da fuori.

Due cose che la UI, quando arriverà, deve dire: spegnere l'aggiornamento su un
account PSN, o quello generale con un PSN collegato, vuol dire **lasciarlo
morire in dieci giorni**. E in locale la spazzata gira solo col worker acceso:
lo scheduler recupera il giro perso appena riparte, ma un PSN fermo da più di
dieci giorni è già morto.

## Accorgersi prima che un collegamento è morto (da valutare)

**Non deciso, non implementato.** È stato analizzato e rimandato: sta qui perché
chi lo riprende non ricominci da capo, non perché sia la strada presa.

Oggi `needs_reauth` lo scopre **solo l'import**, quando il rinnovo viene
rifiutato e passa da `requireReauth`. Fino a quel momento la scheda in
`/account` dice che va tutto bene. L'idea valutata:

- **controllo all'apertura di `/account`**, con lo stesso `storeAccessToken` /
  `amazonAccess` dell'import. Rinnova **solo se l'access token è scaduto** — un
  token ancora valido vuol dire che un rinnovo è riuscito da poco — e salta gli
  account con un import in corso e Steam, che credenziali non ne ha.
- **quanto costa**: una richiesta al server dei token, al massimo ogni ora su GOG,
  PSN e Amazon e ogni otto su Epic. Nessuna chiamata alla libreria, nessuna
  sessione né dispositivo nuovo (Amazon registra il dispositivo solo al
  collegamento). Se qualche negozio avvisi l'utente a ogni rinnovo **non è
  misurato**; non ce lo si aspetta, perché i launcher rinnovano di continuo.
- **cosa non dice**: un rinnovo riuscito prova che il credenziale è vivo, non che
  la libreria si legga; una revoca fatta mentre l'access token è valido si vede
  solo alla sua scadenza.

**Il prerequisito, e il vero rischio: il blocco sulla riga.** GOG, Epic e PSN
invalidano il refresh token vecchio a ogni rinnovo. Oggi non c'è concorrenza
perché rinnova solo il worker, un import alla volta e deduplicato per account;
un rinnovo lanciato dalla pagina — o da due schede aperte — mentre l'import
rinnova lo stesso token manda in `needs_reauth` un account sano. Prima di
qualunque controllo fuori dal worker, il rinnovo va fatto sotto un lock sulla
riga di `store_accounts`, rileggendo il credenziale dopo averlo preso. Amazon
non ruota il token e non ne soffre.

Due pezzi collegati, anche loro da valutare:

- **PSN può avvisare prima, a zero richieste.** Il credenziale salvato è la
  risposta intera del token, compreso `refreshExpiresAt` quando Sony dichiara la
  durata: «PSN scade fra due giorni» si calcola dal DB, ed è più utile di «è
  morto». Non chiude il 9b — serve comunque qualcosa che rinnovi — ma lo rende
  visibile.
- **notifiche** (campanella, oltre al toast). Devono nascere **sul server, in
  `requireReauth`**, che è l'unico punto da cui passa ogni account che diventa
  `needs_reauth` — da un import o da un controllo — e non da un confronto lato
  client, che vedrebbe solo ciò che succede con la pagina aperta. Vuol dire una
  tabella di notifiche con lette e non lette: il modello è la decisione da
  prendere prima del codice. Il testo è «da ricollegare», **non «scollegato»**:
  quella parola è già del gesto «Scollega», e farebbe credere di aver perso i
  giochi.

Le due domande che decidono l'ordine sono **quanto dura il credenziale** e
**quanto costa risolvere l'identità**. Misurate su una libreria vera:

| Negozio | Credenziale | Id su IGDB | Ore |
| --------- | ------------------------------- | ------------------------------------------------- | --- |
| GOG | refresh token, non scade in pratica | product id, sorgente 5 — **94,5% su 435 giochi** | no |
| Epic | refresh token | **nessuno**: vedi sotto | no |
| Amazon | refresh token | **nessuno**: sorgente 23 ha 678 righe in tutto | no |
| PSN | refresh token da npsso, **10 giorni** che ripartono a ogni rinnovo | **nessuno** sugli acquisti, `concept.id` sui giocati: vedi sotto | parziali |
| EA | sessione corta, si sgancia sempre | nessuno | sì |
| Nintendo | cookie di sessione | nessuno | no |
| Xbox | chiave OpenXBL, o XSTS in proprio | `titleId` → ProductId via `displaycatalog`, sorgente 11 | sì |

Le prime due colonne sono state scritte **prima** di provare, e il 9b ha
smentito quella su PSN in tutte e due i campi — e poi ha smentito la sua stessa
smentita sull'id, che c'è ma non dove lo si cercava. Restano qui corrette e non
riscritte in silenzio, perché il modo in cui ci si sbaglia su un negozio è esso
stesso un'informazione: si sbaglia guardando cosa l'API *espone*, invece di
guardare cosa *restituisce*.

Dove l'id c'è l'import costa nulla: i 435 giochi GOG si risolvono in **tre**
richieste da 200 id, e il matcher per nome ne recupera altri 16, per un 98,2%
automatico e due sole scelte da fare a mano. Dove l'id non c'è si paga **una
ricerca IGDB per gioco**: Amazon sono 92 richieste per un 85,9%, Epic 705. Su
queste fonti gli scarti sono la regola, non l'angolo, e va messo un tetto ai
tentativi come già impone l'enrichment.

**Epic è il caso che inganna, e va scritto perché la trappola è ben nascosta.**
IGDB ha una sorgente Epic con diecimila righe, e i suoi uid hanno la stessa forma
degli id che il launcher restituisce — 32 esadecimali. Sono cose diverse: gli uid
di IGDB sono gli **offer id del negozio**, il launcher dà `catalogItemId`,
`namespace` e `productId`. Su una libreria vera nessuno dei tre trova niente,
**zero su 705**, misurato. In compenso il record di libreria porta già il titolo
in `sandboxName` — quindi niente chiamate al catalogo — e gioco e DLC
condividono il `productId`, che è ciò che li fa collassare: 836 voci diventano
705 giochi senza chiedere niente a nessuno.

**PSN è Epic una seconda volta, e stavolta la trappola era scritta nel campo
giusto.** IGDB ha una sorgente PS Store con quindicimila righe, e i suoi uid
sono i `conceptId` numerici dello store — *Dying Light 2* è `232374`. La
libreria dell'utente porta invece `titleId` come `CUSA12555_00`, che lì dentro
non esiste. Il `conceptId` **c'è** fra i campi che la risposta di Sony dichiara,
ed è per questo che sembrava risolvibile: arriva `null` su ogni riga, 336 su
336, misurato. Esiste un'altra operazione GraphQL (`getUserGameList`) che quel
campo lo popola davvero, ma è una *persisted query* il cui hash non è pubblico —
si cattura solo dal traffico del browser — e un job non si appoggia a una cosa
del genere. Quindi PSN si risolve **per nome**, come Epic e Amazon: 88% su 256
nomi distinti, e metà degli irrisolti sono Netflix, Spotify e YouTube, che
giochi non sono e che nessun campo dell'API distingue da un gioco.

**Il `conceptId` però esiste, e sta sull'altro elenco.** L'elenco dei giocati
(`gamelist/v2`, REST e non una persisted query) porta su **ogni** riga un
oggetto `concept` con `id` e `titleIds` — tutte le edizioni di quel gioco, PS4 e
PS5, di ogni regione. Provati sulla sorgente 36 di IGDB: **46 su 47** trovano il
gioco giusto, e l'unico che manca è *FIFA 19*. Vale solo per ciò che si è
avviato su PS4 o PS5 — 49 titoli contro 342 acquisti — ma dove c'è è un id
esatto: niente ricerca, e niente titolo in italiano da far combaciare con quello
inglese di IGDB.

**Ma il concept è la scheda del negozio, non il gioco**, e per questo risolve
**solo i dischi**. La *Master Collection* di Metal Gear sono cinque acquisti —
MGS 1, 2 e 3, Metal Gear 1 e 2, i contenuti bonus — che si installano e si
giocano uno per uno, e fra i giocati stanno **tutti** sotto il concept della
raccolta, che su IGDB è *Master Collection: Volume 1*. Per nome ciascuno trova
il suo gioco, con la sua durata; per concept diventerebbero una voce sola. Lo
stesso concept di *Horizon Zero Dawn* elenca fra le sue edizioni anche
l'artbook. E in cambio, sulla libreria vera, il concept non recuperava nessun
acquisto che il nome perdesse: i titoli in italiano rimasti fuori sono giochi
mai avviati, che fra i giocati non ci sono. Quindi gli acquisti restano **per
nome**, e il concept si usa dove è l'unica cosa che c'è: un disco ha solo la sua
riga fra i giocati, che porta già il nome del concept, e un disco di una
raccolta finisce sulla raccolta, che è ciò che si è inserito nella console.

Il concept viaggia su `LibraryEntry.igdbLookup` e **non** diventa l'id
esterno: quello resta il `titleId`, che è ciò che si scrive in `external_ids` e
che il passo 1 rilegge, ed è lo stesso codice della copia digitale nella stessa
regione.

Sempre di PSN, quattro cose che si pagano care se si scoprono tardi:

- **Il gateway GraphQL rifiuta le richieste «semplici»**, e non è un problema di
  autenticazione: è Apollo con la protezione CSRF attiva, che risponde **400** a
  una GET i cui header un `<form>` HTML avrebbe potuto produrre da solo.
  `Authorization` non conta. Serve un header non-semplice — noi mandiamo
  `x-apollo-operation-name`, che è la forma documentata — e senza si passa un
  pomeriggio a cercare l'errore nella query, che è giusta.
- **`me` non è un alias valido.** Gli endpoint vogliono l'`accountId` numerico,
  che sta nell'`id_token` restituito insieme al token e va usato **lui** come
  `external_account_id`: l'`onlineId` leggibile Sony lascia cambiarlo, e un
  utente che si rinomina si ritroverebbe due account collegati.
- **Le ore stanno su un secondo elenco**, quello dei giochi giocati, che copre
  solo PS4/PS5 e solo ciò che si è avviato — da qui il «parziali» della tabella.
  Si aggancia in modo **esatto** e senza match per titolo, ma la chiave è
  nascosta: l'elenco degli acquisti non dichiara il `titleId` come campo suo, lo
  porta dentro l'`entitlementId` (`UP3971-PPSA33764_00-WALKWALKWALKWALK`, il
  pezzo di mezzo). Su una libreria vera 31 dei 49 giocati trovano così il loro
  possesso; gli altri 18 sono giocati e non posseduti, e di quelli entrano
  solo i 14 dischi, vedi sotto.
- **Il credenziale dura dieci giorni**, non due mesi, e **la finestra riparte a
  ogni rinnovo**. Misurato a distanza di giorni sullo stesso account: un refresh
  token emesso l'11 settembre, che scadeva il 21, rinnovato il 14 ne ha dato uno
  che scade il 24. Quindi PSN non va ricollegato a scadenza — ma solo **finché
  qualcosa rinnova entro dieci giorni**. A farlo è l'aggiornamento automatico
  (vedi «L'aggiornamento automatico»), che su PSN reimporta ogni tre giorni.
  È l'unico negozio dove la frequenza dell'import non è una questione di
  freschezza dei dati ma di tenere vivo il collegamento.

**I dischi fisici non stanno fra gli acquisti, ed è la parte che manca al 9b.**
L'elenco degli acquisti è l'elenco dei *diritti digitali*: un gioco comprato su
disco non ne ha uno, e lì non compare. L'unica traccia che lascia è nell'elenco
dei giocati, e solo se lo si è avviato su PS4 o PS5.

Lì lo si **riconosce**, ed è misurato: ogni riga dei giocati porta `service`,
che vale `ps_plus`, `none(purchased)` — o `none_purchased` sulle righe più
vecchie, stessa cosa scritta in due modi — oppure **`other`**, cioè avviato
senza nessun diritto digitale sull'account. Dei 18 giocati e non posseduti, 14
sono `other`, e i quattro controllati uno per uno sono dischi: *Horizon
Forbidden West*, *Demon's Souls*, *Wild Hearts*, *Spider-Man: Miles Morales*.
L'eccezione nota è *Astro's Playroom*, `other` perché preinstallato sulla PS5 —
non è un disco, ma sulla console c'è davvero, e farlo entrare non è un errore.
Gli altri quattro dei 18 sono `none_purchased`: comprati, ma assenti dagli
acquisti attivi — *FIFA 19* e *WWE 2K18* sono stati tolti dal negozio, e il
sospetto, non verificato, è che il diritto sia decaduto con loro.

**Ed entrano.** Un giocato `other` che fra gli acquisti non c'è diventa un
possesso come gli altri — negozio `psn`, l'account da cui viene, abbonamento
nullo — con `medium: physical`, sulla piattaforma della sua `category` (sulle
righe vecchie `unknown` decide il prefisso del `titleId`: `CUSA` è PS4, `PPSA`
è PS5), e risolto per concept prima che per nome. La scelta sta in
`buildPsnEntries`, che è pura apposta. Sulla libreria vera sono 14 voci in più,
e tutti e 14 i concept trovano il gioco giusto.

Il prezzo è noto e accettato: `other` vuol dire «avviato senza un diritto
digitale», non «è tuo». Un disco prestato entra come fosse tuo, e il prossimo
import lo ricrea: la risposta è nasconderlo, che sopravvive ai reimport. Gli altri
giocati assenti dagli acquisti **non** entrano: un Plus scaduto non è tuo, e di
un acquisto sparito dal negozio non sappiamo abbastanza.

Tre cose che `service` **non** dice, da tenere presenti:

- **è il diritto di adesso, non quello della prima partita.** *God of War*
  (2018) è un disco comprato quell'anno e giocato da allora, ma è arrivato poi
  nel Plus: oggi è `ps_plus` fra i giocati e `PS_PLUS` fra gli acquisti, e il
  disco non si vede più. Il gioco entra lo stesso, ma come abbonamento — ed è
  esattamente il caso che lo step 14 rischia di cancellare.
- **un diritto digitale copre il disco.** *God of War Ragnarök* sembrava un
  disco ed era un voucher: `none(purchased)` e comprato, correttamente. Un gioco
  che si ha sia su disco sia in digitale entra come digitale, e non c'è niente
  da recuperare.
- **un disco mai avviato non lascia traccia da nessuna parte**, e nemmeno un
  disco PS3 o Vita, che l'elenco dei giocati non copre. Per quelli restano
  l'inserimento a mano e l'import da file dello step 10.

Quattro dettagli che si pagano se si scoprono tardi:

- **Amazon registra un dispositivo, e un dispositivo sta su un account
  solo.** Il serial era derivato dall'utente, quindi il secondo account
  Amazon della stessa persona registrava lo stesso dispositivo e lo toglieva
  al primo: dei due ne restava vivo uno, a ping-pong. Ora il serial è **per
  collegamento**, fa il giro dal client (`state` di `loginUrl` → `link`) e un
  ricollegamento riusa quello dell'account. Il ricollegamento controlla anche
  che il login sia stato fatto **con quell'account**: con due account Amazon
  legati fra loro la sessione del sito può stare sull'altro, e prima se ne
  aggiornava la riga in silenzio.
- **Amazon vive solo sul mercato americano.** `amzn1.adg` è registrato su
  `amazon.com` con `marketPlaceId=ATVPDKIKX0DER`; su `amazon.it` la stessa
  richiesta è un 404. Un account italiano si autentica benissimo lì, quindi il
  mercato si inchioda e non si parametrizza.
- **Amazon decora i titoli con l'edizione** (`- CE` per le Collector's Edition):
  nove dei tredici irrisolti sono quello. Toglierlo prima di cercare è una regola
  per `shortenTitle`, non un caso particolare.
- **GOG marca `isGame: true` anche i *goodies***, gli artbook e il REDkit di The
  Witcher 3. Non c'è un campo per filtrarli e non serve: cadono da soli negli
  irrisolti, che è dove devono stare.

La piattaforma resta **`pc_windows` fissa** su tutti i negozi PC, come per Steam,
e l'utente la corregge dalla schermata dello step 5. GOG dichiarerebbe anche
Mac e Linux in `worksOn`, ma sapere su cosa *girerebbe* non è sapere su cosa ci
giochi. Per le console la piattaforma la dice la fonte, riga per riga: dal 9b
`LibraryEntry` la porta, e `platformFor` è diventata il ripiego per chi non ce
l'ha invece che la regola. Continua ad alzare per i negozi che non hanno né
l'una né l'altra, che è il modo giusto di accorgersi di un negozio aggiunto a
metà. Se ne porta una che non sappiamo tradurre, la voce si **salta con un log**:
il possesso ha una FK su `platforms`, e ripiegare su PS4 vorrebbe dire
proporre all'utente un gioco che non può avviare.

Da lì discende una regola del matcher che sembra un dettaglio e non lo è. Il
**cross-buy** fa arrivare lo stesso gioco due volte, PS4 e PS5, con lo stesso
identico titolo — 80 gruppi su 256 nomi. La rete tesa dopo i 266 «Live» di Epic
scartava i nomi ripetuti, e così com'era avrebbe buttato metà libreria PSN in
silenzio. La regola giusta è: un nome ripetuto è ambiguo **solo se si ripete
sulla stessa piattaforma**. Sui negozi PC la piattaforma è una sola per tutta la
libreria, quindi lì non cambia niente; su PSN due console sono due copie dello
stesso gioco, si cerca una volta e si scrivono **due possessi** e due righe in
`external_ids` — una per `titleId`, o al reimport quella PS4 ricomprerebbe una
ricerca.

**Ubisoft Connect e Battle.net non si faranno mai**, ed è bene che sia scritto qui
perché sembrano possibili: Playnite li importa leggendo il file di cache del
client installato e il registro di Windows, non una API. Non c'è nessun
credenziale di rete da acquisire, da rinnovare o da cifrare — c'è un disco a cui
un server non è attaccato. Con Battle.net non c'è nemmeno il ripiego di un
endpoint pubblico: l'OAuth ufficiale di Blizzard esiste ma non espone la libreria
a nessuno.

Steam Family, quando si farà (9f), legge la libreria con lo stesso
`GetOwnedGames` chiamato su N SteamID64. Qui c'era scritto che **non porta
credenziali nuove**, e va verificato prima di crederci: sapere *chi* sta nella
famiglia probabilmente richiede il token di un membro, cioè il login Steam che
il 9f porta con sé. La parte che resta certa è l'altra: è un problema di
modello, e lo stesso di Xbox.

Che è la domanda che nessun negozio del 9a poneva, e che **il 9b ha posto subito
e in grande**: un gioco a cui puoi giocare stasera ma che non è tuo — Game Pass,
PS Plus, la libreria di tuo fratello — sta in `backlog` o no? Su PSN non è un
caso di frontiera: sono **274 righe su 336**, l'81% della libreria.

La risposta presa, e il perché: **entrano, e il possesso si ricorda da dove
viene**. Entrano perché `backlog` serve a rispondere a «cosa gioco adesso», e un
gioco che stasera puoi avviare è esattamente ciò di cui quella domanda parla;
lasciarli fuori avrebbe tolto al motore decisionale i quattro quinti di una
console. Si ricorda da dove viene perché il giorno che l'abbonamento finisce
quelle righe cominciano a mentire, e a quel punto o si sa quali sono o si è
perso il dato per sempre. Cosa farne quel giorno è lo **step 14**, e non è
questa colonna a deciderlo.

Il posto è `ownerships.subscription`, nullo = comprato. Sta sulla copia e non
sul gioco per la stessa ragione delle ore: lo stesso titolo comprato su Steam
non diventa «da abbonamento» perché su PS5 ce l'hai col Plus. Al reimport si
riscrive **senza COALESCE**, al contrario delle ore, ed è voluto: il caso che
conta è quello in cui il valore sparisce — compri un gioco che avevi col Plus, e
il possesso deve smettere di dire che dipende dall'abbonamento.

Resta aperto il pezzo che PSN non pone: la libreria di **tuo fratello**, cioè
Steam Family e Xbox, dove ciò che torna non è nemmeno un abbonamento tuo. Lì la
risposta di oggi non si estende da sola.

**`store_account_id` non è quella risposta**, e non va scambiato per tale: dice
di chi è la copia, non se è tua — e ora nemmeno `subscription` va scambiata per
la stessa cosa, perché dice a che titolo ce l'hai, non di chi è l'abbonamento.

## La data d'acquisto

Diventa `backlog.added_at`, con la regola scritta in
[modello-dati](modello-dati.md). Misurata sulle librerie vere il 29/09/2026:

| Negozio | Dove sta | Copertura |
| --- | --- | --- |
| Epic | `acquisitionDate` sul record di `library/api/public/items`, nella risposta che già si scarica | 888/888 record |
| Amazon | `entitlementDateFromEpoch` sull'entitlement: millisecondi, **come stringa** | 95/95 |
| GOG | **non** in `getFilteredProducts`: sta nella libreria di Galaxy, `galaxy-library.gog.com/users/{galaxyUserId}/releases`, stesso token, 500 per pagina con `next_page_token` | 442/442 |
| Steam | niente in `GetOwnedGames`. C'è nella pagina delle licenze, che vuole il login: 9f | — |
| PSN | niente fra gli acquisti: vedi sotto | — |

Su Epic un prodotto ha più record — i DLC hanno lo stesso `productId` — e vale
il più vecchio. Su GOG le date sono due e non valgono uguale: `owned_since` è
quella vera ma c'è su 344 giochi su 442; `date_created` c'è sempre ma non va
prima del **20/04/2019**, il giorno in cui Galaxy ha registrato gli acquisti
vecchi (23 giochi su quel giorno solo). Si prende la prima, e la seconda dove
manca. Galaxy porta anche i giochi degli altri negozi che integra: di quelli
non si tiene niente, la loro data è quando Galaxy li ha visti. E Galaxy **non
blocca** l'import: se non risponde, i giochi entrano lo stesso, senza data.

**PSN: le date ci sono, ma non le prendiamo.** Stanno nello storico
transazioni del PlayStation Store, e ci si arriva solo con la sessione del sito:

1. l'npsso come cookie su `web.np.playstation.com/api/session/v1/signin`,
   seguendo a mano i redirect (otto, fra `ca.account.sony.com` e
   `io.playstation.com`) fino al cookie **`pdccws_p`**;
2. con quello, `GET /api/graphql/v1/transact/transaction/history` con
   `startDate`, `endDate` (in `+0000`, non `Z`), `limit=25`, `includePurged` e
   `transactionTypes`; si pagina con `nextEndDate` finché `hasMore`;
3. ogni ordine porta `transactionDate` e gli articoli con lo `skuId`
   (`EP0900-PPSA03234_00-…-E003`), che si lega all'`entitlementId`
   dell'acquisto sulle prime due parti, editore e titleId.

La v2 (`/api/transactions/v2/history`) accetta il nostro token ma vuole lo
scope `transaction:history.get`, e il client mobile che usiamo **non lo può
avere**: `invalid_scope`. Misurato: 312 transazioni dal 2018, **308 acquisti su
347** con una data (260 per editore e titleId, 48 per nome, cioè le copie PS4
del cross-buy); dei 67 comprati davvero, 66. Scartato per il prezzo, non per la
resa: vorrebbe dire conservare l'npsso, che è la sessione intera dell'account,
pagamenti compresi, e ricavare la data da una risposta che porta anche IP e
metodi di pagamento. Il primo giocato (`firstPlayedDateTime`, su `gamelist/v2`)
non è un ripiego: copre 40 acquisti su 347, ed è un'altra informazione.

