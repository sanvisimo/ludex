# Le altre librerie (step 9): il problema è il credenziale, non l'API

Parte della documentazione in `docs/`, spostata dal CLAUDE.md della radice. Gli altri file: [modello-dati](modello-dati.md), [import-librerie](import-librerie.md), [negozi](negozi.md), [ordine-sviluppo](ordine-sviluppo.md), [scelte-scartate](scelte-scartate.md).

Steam è l'eccezione, non il modello: una chiave applicativa nostra, un profilo
pubblico, zero credenziali dell'utente. Nessun altro negozio funziona così. Il 9f
gli aggiunge un login **facoltativo** col QR, sulla stessa riga dell'account: è
in `main` e, dal 06/10/2026, **rilasciato sul mini PC** per provarlo su un server
attivo: la prova è il modo per sapere se un login da server è accettato. Vedi
«Il blocco dell'account» più sotto.

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
fa Playnite. Se il collegamento viene disegnato _intorno_ al copia-incolla, il
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

| Negozio          | Credenziale                                                                    | Id su IGDB                                                                                     | Ore      |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------- |
| GOG              | refresh token, non scade in pratica                                            | product id, sorgente 5 — **94,5% su 435 giochi**                                               | no       |
| Epic             | refresh token                                                                  | **nessuno**: vedi sotto                                                                        | no       |
| Amazon           | refresh token                                                                  | **nessuno**: sorgente 23 ha 678 righe in tutto                                                 | no       |
| PSN              | refresh token da npsso, **10 giorni** che ripartono a ogni rinnovo             | **nessuno** sugli acquisti, `concept.id` sui giocati: vedi sotto                               | parziali |
| EA               | sessione corta, si sgancia sempre                                              | nessuno                                                                                        | sì       |
| Nintendo         | session token **730 giorni** (non ruota, non verificato), access token 15 min  | nessuno: **per nome**; le licenze digitali portano un id (16 esadecimali) che IGDB non conosce | parziali |
| Xbox             | chiave OpenXBL, o XSTS in proprio                                              | `titleId` → ProductId via `displaycatalog`, sorgente 11                                        | sì       |
| Steam, col login | refresh token **210–212 giorni**, access token 24 ore, rinnovo dentro l'import | appid, la sorgente Steam di IGDB, come col solo profilo                                        | sì       |

Le prime due colonne sono state scritte **prima** di provare, e il 9b ha
smentito quella su PSN in tutte e due i campi — e poi ha smentito la sua stessa
smentita sull'id, che c'è ma non dove lo si cercava. Restano qui corrette e non
riscritte in silenzio, perché il modo in cui ci si sbaglia su un negozio è esso
stesso un'informazione: si sbaglia guardando cosa l'API _espone_, invece di
guardare cosa _restituisce_.

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
sono i `conceptId` numerici dello store — _Dying Light 2_ è `232374`. La
libreria dell'utente porta invece `titleId` come `CUSA12555_00`, che lì dentro
non esiste. Il `conceptId` **c'è** fra i campi che la risposta di Sony dichiara,
ed è per questo che sembrava risolvibile: arriva `null` su ogni riga, 336 su
336, misurato. Esiste un'altra operazione GraphQL (`getUserGameList`) che quel
campo lo popola davvero, ma è una _persisted query_ il cui hash non è pubblico —
si cattura solo dal traffico del browser — e un job non si appoggia a una cosa
del genere. Quindi PSN si risolve **per nome**, come Epic e Amazon: 88% su 256
nomi distinti, e metà degli irrisolti sono Netflix, Spotify e YouTube, che
giochi non sono e che nessun campo dell'API distingue da un gioco.

**Il `conceptId` però esiste, e sta sull'altro elenco.** L'elenco dei giocati
(`gamelist/v2`, REST e non una persisted query) porta su **ogni** riga un
oggetto `concept` con `id` e `titleIds` — tutte le edizioni di quel gioco, PS4 e
PS5, di ogni regione. Provati sulla sorgente 36 di IGDB: **46 su 47** trovano il
gioco giusto, e l'unico che manca è _FIFA 19_. Vale solo per ciò che si è
avviato su PS4 o PS5 — 49 titoli contro 342 acquisti — ma dove c'è è un id
esatto: niente ricerca, e niente titolo in italiano da far combaciare con quello
inglese di IGDB.

**Ma il concept è la scheda del negozio, non il gioco**, e per questo risolve
**solo i dischi**. La _Master Collection_ di Metal Gear sono cinque acquisti —
MGS 1, 2 e 3, Metal Gear 1 e 2, i contenuti bonus — che si installano e si
giocano uno per uno, e fra i giocati stanno **tutti** sotto il concept della
raccolta, che su IGDB è _Master Collection: Volume 1_. Per nome ciascuno trova
il suo gioco, con la sua durata; per concept diventerebbero una voce sola. Lo
stesso concept di _Horizon Zero Dawn_ elenca fra le sue edizioni anche
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
L'elenco degli acquisti è l'elenco dei _diritti digitali_: un gioco comprato su
disco non ne ha uno, e lì non compare. L'unica traccia che lascia è nell'elenco
dei giocati, e solo se lo si è avviato su PS4 o PS5.

Lì lo si **riconosce**, ed è misurato: ogni riga dei giocati porta `service`,
che vale `ps_plus`, `none(purchased)` — o `none_purchased` sulle righe più
vecchie, stessa cosa scritta in due modi — oppure **`other`**, cioè avviato
senza nessun diritto digitale sull'account. Dei 18 giocati e non posseduti, 14
sono `other`, e i quattro controllati uno per uno sono dischi: _Horizon
Forbidden West_, _Demon's Souls_, _Wild Hearts_, _Spider-Man: Miles Morales_.
L'eccezione nota è _Astro's Playroom_, `other` perché preinstallato sulla PS5 —
non è un disco, ma sulla console c'è davvero, e farlo entrare non è un errore.
Gli altri quattro dei 18 sono `none_purchased`: comprati, ma assenti dagli
acquisti attivi — _FIFA 19_ e _WWE 2K18_ sono stati tolti dal negozio, e il
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

- **è il diritto di adesso, non quello della prima partita.** _God of War_
  (2018) è un disco comprato quell'anno e giocato da allora, ma è arrivato poi
  nel Plus: oggi è `ps_plus` fra i giocati e `PS_PLUS` fra gli acquisti, e il
  disco non si vede più. Il gioco entra lo stesso, ma come abbonamento — ed è
  esattamente il caso che lo step 14 rischia di cancellare.
- **un diritto digitale copre il disco.** _God of War Ragnarök_ sembrava un
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
- **GOG marca `isGame: true` anche i _goodies_**, gli artbook e il REDkit di The
  Witcher 3. Non c'è un campo per filtrarli e non serve: cadono da soli negli
  irrisolti, che è dove devono stare.

La piattaforma resta **`pc_windows` fissa** su tutti i negozi PC, come per Steam,
e l'utente la corregge dalla schermata dello step 5. GOG dichiarerebbe anche
Mac e Linux in `worksOn`, ma sapere su cosa _girerebbe_ non è sapere su cosa ci
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

Steam Family (9f) era descritta qui come lo stesso `GetOwnedGames` chiamato su N
SteamID64, senza credenziali nuove. **Smentito il 05/10/2026**: la famiglia non
si legge dai profili dei membri ma da `IFamilyGroupsService`, che vuole il token
del login, e la chiave applicativa da sola dà 401. Le misure sono in «Steam
Family e il login Steam» più sotto. La parte che resta vera è l'altra: è un
problema di modello, e lo stesso di Xbox.

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

Restava aperto il pezzo che PSN non pone: la libreria di **tuo fratello**, cioè
Steam Family e Xbox, dove ciò che torna non è nemmeno un abbonamento tuo. Per
**Steam** il 9f ha risposto nello stesso modo: le copie della famiglia **entrano**
nel backlog, marcate `steam_family` — non è un abbonamento ma la domanda è la
stessa, «è tua o ce l'hai finché dura un diritto che non è tuo?» — e se ne vanno
quando la famiglia le toglie (vedi «Steam Family e il login Steam»). Per Xbox
resta aperto.

**`store_account_id` non è quella risposta**, e non va scambiato per tale: dice
di chi è la copia, non se è tua — e ora nemmeno `subscription` va scambiata per
la stessa cosa, perché dice a che titolo ce l'hai, non di chi è l'abbonamento.

## Steam Family e il login Steam (9f)

**Misurato il 05/10/2026**, in sola lettura, con `pnpm --filter api
steam:family-probe` su un account vero: una famiglia da cinque membri (l'utente
e altri quattro), un posto libero e due ex membri, 453 giochi in
`GetOwnedGames`. Il probe non scrive niente e non stampa token: dei token
mostra solo audience e scadenze, lette dal JWT.

**Il login.** Col QR approvato nell'app Steam, con `steam-session`. **Dall'08/10/2026
la piattaforma è `WebBrowser`**, non più `MobileApp` (vedi «Il terzo blocco»). La
tabella sotto è stata misurata il 05/10 con `MobileApp`, l'unica piattaforma i cui
token si rinnovano da un server (`WebBrowser` risponde `AccessDenied`, `SteamClient`
vuole una sessione CM aperta): per `WebBrowser` la durata del refresh token **non è
ancora misurata**, e l'access token si prende con `getWebCookies()` invece che con
`refreshAccessToken`.

| Cosa                                   | Misurato                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| refresh token                          | audience `web, renew, derive, mobile`, **210–212 giorni** (18 305 360, 18 211 050 e 18 179 376 s, in tre login) |
| access token                           | audience `web, mobile`, **24 ore e mezza** (fra 86 848 e 87 904 s, in quattro login)                            |
| nuovo access token dal refresh token   | funziona (`refreshAccessToken`), stessa audience, 88 049 s                                                      |
| `renewRefreshToken()` a token fresco   | **non emette** un refresh token nuovo: resta il vecchio                                                         |
| access token su `IFamilyGroupsService` | accettato: `GetFamilyGroupForUser`, `GetFamilyGroup`, `GetSharedLibraryApps`                                    |
| access token su `GetOwnedGames`        | accettato: 453 giochi, **gli stessi** della chiave (0 solo col token)                                           |

Il percorso di Playnite (cookie web → `webapi_token` dalla pagina dello store)
**funziona e non serve**: `getWebCookies()` rende `steamLoginSecure` e
`sessionid`, `ajaxgetasyncconfig` rende un `webapi_token` con la stessa audience
e la stessa durata dell'access token, e la famiglia con quello torna identica
(343 app). Un percorso in più che dà ciò che il refresh token dà già.

**Non misurato, e conta per il rinnovo.** Con un token appena emesso Steam non
ne emette uno nuovo, quindi non sappiamo **da quando** lo fa (probabilmente
vicino alla scadenza) né se la finestra riparte. Il README di `steam-session`
avverte che quando un refresh token viene davvero rinnovato **il vecchio muore
subito**: stesso vincolo di GOG, Epic e PSN, e non l'abbiamo visto accadere.

**La famiglia.** `GetFamilyGroupForUser` rende `family_groupid` e
`is_not_member_of_any_group`; `GetFamilyGroup` rende i membri (5), i posti
liberi e gli ex membri. Su `GetSharedLibraryApps` ogni app porta `appid`,
`name`, `owner_steamids` (uno o più), `exclude_reason`, `rt_time_acquired`,
`rt_last_played`, `rt_playtime` e `app_type`.

|                                   | `include_own=false` | `include_own=true` | `+ include_excluded`, `include_free`, `include_non_games` |
| --------------------------------- | ------------------- | ------------------ | --------------------------------------------------------- |
| app                               | 343                 | 772                | 972                                                       |
| con `exclude_reason`              | **0**               | 42 (tutti `3`)     | 191 (`3`: 179, `6`: 8, `1`: 4)                            |
| `app_type`                        | tutti `1`           | tutti `1`          | `1`: 777, `4`: 172, `8192`: 11, `8`: 8, `2`: 4            |
| con me fra gli `owner_steamids`   | 0                   | 501                | 676                                                       |
| presenti in `GetOwnedGames` (453) | 70                  | 448                | 453                                                       |
| proprietari per app (1 / 2 / 3)   | 322 / 21 / 0        | 687 / 77 / 8       | 859 / 101 / 12                                            |
| `rt_time_acquired` valorizzato    | 343 su 343          | 772 su 772         | 972 su 972                                                |

- **Senza i flag di apertura Steam filtra già lei.** Gli esclusi, i gratuiti e
  i non-giochi compaiono solo se si chiedono: nella chiamata base `exclude_reason`
  non c'è mai su `include_own=false`, e su `include_own=true` ce n'è un solo
  valore. Che cosa vogliano dire `1`, `3` e `6` **non è documentato** e non lo
  indoviniamo; nel terzo giro i `4` che portano `3` sono, per esempio, _Source
  SDK_ e _Half-Life Dedicated Server_.
- **`include_own=false` non vuol dire «non miei».** 70 delle sue 343 app sono
  anche in `GetOwnedGames`, e in nessuna io compaio fra i proprietari: sono
  giochi che **anche** un altro membro possiede, e la risposta toglie me
  dall'elenco senza togliere l'app. Quindi «si saltano quelli che possiedo già» non è
  ridondante. Inferenza, non misura diretta: i 343 tornano come 271 (le app di
  `include_own=true` dove io **non** sono proprietario) più 72 (quelle dove lo
  sono, insieme a un altro); i 72 sono i 70 di `GetOwnedGames` più 2 che quella
  lista non ha.
- **Le app solo della famiglia non hanno mai `exclude_reason`** (misurato col nostro
  client, 05/10/2026): le 42 che ne portano uno su `include_own=true` sono tutte
  app dove l'utente è proprietario, e delle 271 solo della famiglia nessuna. Il
  filtro dell'import resta come guardia, ma su questa famiglia non scarta niente.
- **Ciò che è mio si distingue da `owner_steamids`**: se c'è il mio SteamID
  l'app è mia, altrimenti è solo della famiglia. Una chiamata sola con
  `include_own=true` basterebbe a separare le due cose.
- **`rt_playtime` sono minuti, e le mie.** Uguale a `playtime_forever` su 20 app
  su 20 (`include_own=false`) e 66 su 66 (`include_own=true`), fra quelle che
  ho giocato. Sulle app che non possiedo non c'è un termine di paragone.
- **I proprietari sono ripartiti fra i membri**: sulle 343, 140, 112, 89 e 23
  app per i quattro altri (la somma supera 343 perché 21 hanno due
  proprietari).

**I rifiuti, misurati il 05/10/2026 con i nostri client** (senza login: un token
finto resta finto):

| Prova                                                     | Risposta di Steam                                           |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| token inventato su `GetFamilyGroupForUser`                | **401**                                                     |
| token inventato su `GetOwnedGames`                        | **401**                                                     |
| refresh token ben formato ma falso, non scaduto           | `AccessDenied` (15)                                         |
| refresh token ben formato ma falso, con `exp` nel passato | `AccessDenied` (15), lo stesso                              |
| stringa che non è un JWT                                  | il setter di `steam-session` alza `Invalid JWT`, senza rete |

Il falso con `exp` passato risponde come quello non scaduto: Steam controlla la
firma prima della data, quindi **questo non dice quale `EResult` dia un refresh
token scaduto davvero**, né uno revocato. Resta da vedere alla prima revoca
vera, togliendo la sessione da Steam Guard. `AccessDenied` è invece confermato
come il rifiuto, ed è già in `REFUSED`.

**La sola chiave applicativa** su `GetSharedLibraryApps` risponde **401** con un
corpo **HTML**, non JSON: «Access is denied. Retrying will not help. Please
verify your key= parameter». Un client che prova a leggerlo come JSON si ritrova
un errore di parsing e non un rifiuto.

**Profilo privato.** Non misurato, e per tre giri il controllo era sbagliato.
Il probe è stato lanciato tre volte il 05/10/2026 e i numeri sopra coincidono
(stessi 343, 772 e 972 app, stessi 453 giochi).

- Il primo controllo leggeva `communityvisibilitystate` di `GetPlayerSummaries`,
  che **non segue «Il mio profilo»**: con tutto su Privato (profilo, dettagli dei
  giochi, inventario, da screenshot) vale ancora `3`, perché segue i «dettagli di
  base», che restano pubblici.
- Il secondo si fidava della **chiave**: se rende una risposta vuota i giochi
  sono nascosti. Ma con tutto su Privato, e un anonimo che dal profilo XML della
  Community legge `privacyState: private`, la chiave rende comunque i 453 giochi.
  La spiegazione più probabile è che la chiave sia dell'account interrogato, e
  Steam le mostri i dati privati come al proprietario. Quindi **a profilo privato
  il confronto chiave contro token non dice niente sugli altri utenti**, per cui
  la risposta vuota della chiave resta quella misurata allo step 4
  (`SteamLibraryNotVisibleError`).
- Il segnale che regge è `privacyState` del profilo XML della Community
  (`/profiles/{id}/?xml=1`), letto da anonimo: distingue `public`, `friendsonly` e
  `private`. Non dice i «dettagli dei giochi», che sono una voce a parte: una
  pagina della Community che li distingua non l'abbiamo trovata, e
  `/games?xml=1` non rende più XML.

**Misurato nel quarto giro**, con `profilo da anonimo: private`: il token legge la
libreria propria a profilo privato, **453 giochi, gli stessi della chiave e di
`GetOwnedGames`, nessuno mancante** (`fetchSteamLibrary` col token, il nostro
client). Era l'attesa, ed è la risposta alla domanda che contava: col login un
profilo privato non impedisce di importare. La chiave, per gli altri utenti che
non sono il suo proprietario, resta vuota.

### Come è fatto (9f)

Sul branch `feat/9f-steam-login`. Il piano e le ragioni sono in
[plans/9f-steam-login.md](../plans/9f-steam-login.md).

- **Un account, due modi.** Il profilo incollato e il login col QR sono due modi
  della **stessa riga** di `store_accounts`: la chiave è lo SteamID64, quindi fare
  l'uno dopo l'altro aggiorna la riga e non duplica i giochi. Col login la riga
  ha una credenziale cifrata come gli altri negozi (`steam` in `OAUTH_STORES`);
  l'elenco account dice solo **se** c'è (`hasLogin`), mai la credenziale. Togliere
  il solo login lascia account, profilo e giochi propri.
- **Il QR è una sessione, non una mutazione.** Il server la tiene aperta in
  **memoria nel processo dell'API** mentre l'utente inquadra e conferma
  (`accounts.steamLogin.{start,status,remove}`); cinque minuti per il QR, e un
  riavvio costa un QR da rifare. Con più repliche servirebbe Redis. A conferma
  l'account è già scritto e l'import accodato.
- **La famiglia entra come `steam_family`**, con le ore dell'utente e **senza data
  d'acquisto** (è del proprietario, e `backlog.added_at` si porta solo
  indietro). Solo dove l'utente non ha già il gioco: sulla stessa riga Steam di
  un acquisto la copia della famiglia non si scrive, e **non esiste una seconda
  riga Steam per lo stesso gioco**. Steam distingue le due copie per i DLC, che
  Ludex non tiene; farlo vorrebbe dire cambiare la chiave del vincolo sui
  possessi, condivisa con tutti i negozi, e rovinerebbe il caso PSN in cui
  comprare smette di dire «da abbonamento».
- **Cosa esce, e cosa resta.** Una copia della famiglia che la famiglia non ha
  più si toglie al reimport; se non resta altro e la riga ha dati dell'utente
  (voto, note, tag, stato) **la copia resta**, perché una riga senza possessi non
  è uno stato legittimo e il voto non sparisce per una licenza tolta. Non
  adotta i possessi scritti a mano: restano due righe.
- **Le date d'acquisto** si scrivono sulle copie proprie, dove l'utente è fra i
  proprietari. Un'app nella libreria propria che la famiglia elenca con un altro
  proprietario soltanto resta senza data.
- **Profilo privato senza login**: al collegamento col solo profilo si legge la
  libreria prima di collegare, e un profilo privato **non collega**
  (`PRECONDITION_FAILED`), con l'invito ad accedere con Steam. Un import fallito è
  silenzioso per l'utente (l'evento `finished` ricarica la lista e basta), per
  questo il controllo sta al collegamento. Non vede un profilo che diventa
  privato **dopo**.
- **Il primo import vero** (05/10/2026, col login, dal browser): 269 copie della
  famiglia su 271 attese (le altre 2 sono giochi non risolti da IGDB, fra gli
  scarti), 446 copie proprie di cui 442 con la data, nessuna copia della famiglia
  con data. _Portal_ e _Portal 2_ risultano del 2025-07-02, come sulla pagina
  delle licenze di Steam: l'ipotesi sulle date regge su due giochi.

### Il blocco dell'account (05/10/2026)

**Steam ha bloccato temporaneamente l'account dell'utente.** Il messaggio parla di
un «dispositivo inatteso» che ha effettuato l'accesso **il 5 ottobre alle 11:57, a
Milano**, dice che **non è un ban**, e limita l'account (acquisti, doni, scambi,
Community) finché il proprietario non lo recupera con l'Assistenza di Steam, via
`help.steampowered.com`.

**Gli orari, ricostruiti il 05/10/2026 dai file e dal database** (la macchina è in
CEST, cioè l'ora di Milano): migration del passo 1 alle 11:28; import dal browser col
solo profilo alle 11:37; test del passo 2 alle 11:45; **un import Steam con la chiave
alle 11:56**; test del passo 4 alle 12:03. Il **login col QR dall'interfaccia**, quello
della prova vera in browser, è invece delle **14:51** circa, con l'import alle 14:58:
**tre ore dopo** l'orario di Steam. Fra le 11:45 e le 12:03 sono state fatte, contro
Steam, due cose: la prova dei token falsi e il probe col login (quello con la sezione
«il nostro client»). Non ho un orologio dei singoli comandi, quindi quale delle due
sia delle 11:57 è un'**inferenza dalla sequenza**, non una misura. Gli orari esatti
dei login stanno su Steam Guard → «Gestisci i dispositivi».

Cosa era successo prima, da questa macchina, con quell'account:

- diversi login col QR in poche ore, dal probe `steam:family-probe` e dalla prova
  vera, tutti come «app mobile»;
- richieste a `IFamilyGroupsService` e a `GetOwnedGames` col token;
- nelle ultime esecuzioni del probe, **refresh token falsi con dentro lo SteamID
  dell'utente** e token inventati, per misurare gli errori (la sezione è stata
  tolta dal probe);
- una ventina di QR aperti dai test della schermata e mai approvati.

**La causa non è accertata**, e non c'è modo di saperla da qui. **L'ipotesi principale,
dell'utente e coerente con gli orari**: i probe lanciati in fila e le prove con i
**token falsi** (refresh token ben formati con lo SteamID dell'utente, token inventati
sulle API della famiglia), che per Steam somigliano a un tentativo di accesso non
autorizzato. Il login col QR in sé (un dispositivo nuovo che entra da un indirizzo
diverso) resta una possibilità minore, e non si può escludere. La risposta
dell'Assistenza non c'è ancora. Quello che **non** sappiamo, e che decide se il login
si può rilasciare:

- se Steam considera sospetto **qualsiasi** login fatto da un server per conto di un
  utente, o solo il modo in cui sono state fatte le prove;
- se conta l'indirizzo (quello del server, diverso da quello del telefono che
  approva) e se dopo il primo accesso i rinnovi periodici passano senza avvisi;
- se un blocco simile colpirebbe gli altri utenti di Ludex, che farebbero un solo
  login ciascuno ma tutti da un solo indirizzo.

**Aggiornamento del 06/10/2026**: Steam e Nintendo sono rilasciati sul mini PC,
apposta per provarli su un server attivo. Non è la risposta, è il modo per
averla: se l'account viene bloccato di nuovo, va scritto qui e il login si
spegne. Fino ad allora il rilascio **agli altri utenti** resta una decisione
aperta, e **nessun probe o
prova si lancia contro un account vero senza averlo concordato** (vedi l'avvertimento
in cima al probe). Le strade, a decisione presa: tenere il codice dietro un
interruttore spento, restare col solo profilo pubblico (che non tocca l'account),
oppure capire dalla documentazione di Valve o dall'Assistenza se questo tipo di
login è accettato.

### Il secondo blocco (07/10/2026) e le due strade

**Steam ha bloccato l'account una seconda volta**, il 7 ottobre alle 9:23 (Torino), con lo
stesso messaggio. L'Assistenza aveva sbloccato quello del 05/10 senza dire cosa fosse
scattato. Stavolta **nessun probe e nessun token falso**: il blocco è venuto dall'uso
normale del login.

**Cosa mostra «Recently seen devices»** (Steam Guard → «Gestisci i dispositivi»),
letto dall'utente il 07/10/2026:

| Ora     | Dispositivo                   | Da dove                             |
| ------- | ----------------------------- | ----------------------------------- |
| 9:22    | «Galaxy S25» (mobile)         | il nostro QR, dall'istanza locale   |
| 9:23    | «Galaxy S25» (mobile)         | il nostro QR, dall'istanza locale   |
| 9:28    | «Galaxy S25» (mobile)         | il nostro QR, dal mini PC           |
| 9:47    | «Chrome on Windows» (browser) | il browser dell'utente              |
| (prima) | «Pixel 9a» (mobile)           | il telefono vero, anche lui «nuovo» |

Tutti «New Device, first seen less than 2 weeks ago»: dopo un recupero le sessioni
ripartono da zero, quindi «nuovo» non distingue i nostri dai suoi.

**Cosa si sa, e cosa no.**

- **Il login in sé non è il problema**: moltissimi strumenti fanno login Steam con la
  stessa libreria, e non vengono bloccati. Neanche l'indirizzo: le sessioni partivano
  dalla rete dell'utente, a Torino, e il blocco è scattato da locale, non solo dal server.
- **Sono tre QR in sei minuti**, e per Steam ciascuno è un dispositivo mobile nuovo,
  su un account appena recuperato. Il 05/10 erano 4-5 in poche ore. È l'ipotesi
  principale, **non accertata**: l'Assistenza non dice cosa scatti.
- **Come ci presentiamo**: `steam-session` con `MobileApp` si dichiara l'app Android
  (user agent `okhttp/4.9.2`, versione `3.10.3`, dispositivo «Galaxy S25»), e
  l'utente ha un altro telefono. Non si sa se conti.
- Dai token salvati (`iat`) l'import delle 9:23:04 è venuto 8 secondi dopo il QR
  delle 9:22:56: login e uso del token non si possono separare.

**Le due strade, e la scelta è dell'utente.**

|          | QR dall'app Steam                             | Token dal browser                          |
| -------- | --------------------------------------------- | ------------------------------------------ |
| Su Steam | un dispositivo nuovo (dall'08/10: un browser) | **niente**: il server non apre sessioni    |
| Durata   | refresh token (mesi), access token 24 ore     | access token 24 ore, **non si rinnova**    |
| Famiglia | si aggiorna da sola                           | si aggiorna quando se ne incolla uno nuovo |

Il token è `webapi_token` della pagina
`store.steampowered.com/pointssummary/ajaxgetasyncconfig`, aperta dal browser dove
l'utente è già dentro Steam (misurato il 05/10/2026: stessa audience e stessa durata
dell'access token, famiglia identica). Il server ne legge lo SteamID64 (`sub`) e la
scadenza (`exp`) **senza una richiesta**, e lo salva come credenziale senza refresh
token (`SteamWebCredentials`). Un refresh token incollato per errore si rifiuta: vale
mesi, ed è ciò che questa strada evita di chiedere.

Con un token scaduto o rifiutato **l'import non va in `needs_reauth`**: legge la libreria
propria dal profilo con la chiave e **non tocca la famiglia**, né aggiungendo né
potando (`familySkipped` nel resoconto). Le copie `steam_family` restano finché
l'utente non incolla un token nuovo o toglie il login. Col QR, invece, un rifiuto è un
login morto come prima.

**Nessun avviso sul secondo login.** Si era aggiunto (`SteamLoginExistsError`,
`PRECONDITION_FAILED`, `replace`) sull'idea che più dispositivi nuovi in pochi minuti
facessero scattare il blocco, ed è stato tolto l'08/10/2026: contava anche un secondo
account Steam, che va collegabile, e l'utente ha rifatto il login su molti dispositivi
in quei giorni senza conseguenze, bloccato solo dai login di Ludex. Resta che aprire
un QR annulla il precedente **dello stesso utente** (una sessione in memoria alla volta).
Due istanze di Ludex (locale e mini PC) con database diversi fanno ciascuna il suo
login: una sola istanza per account Steam, per ordine, non per un avviso.

**Non provato dal vero**: i test girano con la libreria e Steam finti, e nessuna
richiesta a Steam è partita in questo lavoro. Resta da vedere se un token web usato
da un server è accettato da Steam senza avvisi: si saprà al primo incolla vero,
dopo che l'Assistenza ha risposto sul blocco.

### Il terzo blocco (08/10/2026) e il QR come un browser

Con **un solo** QR dal mini PC (10:23, un solo «Galaxy S25», niente doppio login)
Steam ha bloccato di nuovo l'account, citando quel dispositivo. Tre blocchi su tre,
tutti dopo un QR `MobileApp`; il 07/10 il blocco era arrivato circa due ore e mezza dopo
il login (9:23 → 11:50), quindi la valutazione di Steam è ritardata, e il doppio login
non era la causa.

**Cosa dice il forum del manutentore.** Il thread
[«I get my account banned when I log in with a QR code»](https://dev.doctormckay.com/topic/5758-i-get-my-account-banned-when-i-log-in-with-a-qr-code/)
(giugno 2025) è il nostro caso: `LoginSession(MobileApp)` + `startWithQR()`, account
segnalato «accessed by someone else» dopo qualche ora, tre volte, dispositivo «Galaxy
S22» (da noi, nella 1.9.4, «Galaxy S25»). Chi è passato a `WebBrowser` con uno user
agent diverso da quello di default non è stato bloccato (almeno 4 ore, più a lungo per
un secondo utente), e uno scrive che il blocco scatta solo col QR fatto come app
mobile, perché sull'app vera quel login non esiste e Steam lo nota. **Sono segnalazioni
di utenti: il manutentore non ha risposto né confermato.** L'esempio ufficiale
`login-with-qr.ts` usa comunque `MobileApp`, quindi non prova il contrario.

**Cosa abbiamo cambiato.**

- Il QR si apre come `WebBrowser`, con uno user agent nostro (`STEAM_LOGIN_USER_AGENT`,
  un Chrome su Linux: il default della libreria è proprio ciò che chi veniva bloccato
  non aveva cambiato). Per Steam è l'accesso di un browser autorizzato col QR, cosa
  che esiste.
- L'access token viene da `getWebCookies()` (cookie `steamLoginSecure`, quello dello
  store), come negli esempi. Prima si forzava `refreshAccessToken()` subito dopo il
  login: era ridondante (la libreria lo fa da sé per `MobileApp` se il token manca)
  e il commento sbagliato. Non era la causa.
- Un refresh token web **non si rinnova da un server**: ogni circa 24 ore il job rifà
  `getWebCookies()` dal refresh token (una richiesta web, come un browser che riapre
  Steam) e il refresh token resta lo stesso. Quando muore serve un nuovo QR;
  `refreshExpiresAt` dice quando. Un credenziale `MobileApp` del vecchio login non
  vale più (audience `mobile`, non `web`): diventa `needs_reauth`.

**Provato dal vero (08–10/10/2026), sul mini PC, con due account.** Un account di
prova (`sanvitest`) e quello principale dell'utente, lo stesso bloccato tre volte:

- **Il login.** `sanvitest` autorizzato l'08/10 alle 15:53 (l'ora che dà Steam Guard),
  il principale alle 22:05. In Steam Guard compare un solo «Chrome on Linux», mai un
  «Galaxy». Nessun avviso e nessun blocco, né in Steam Guard né in Ludex.
- **Il token si usa.** L'access token preso dai cookie dello store è accettato:
  `sanvitest` risulta «Signed in», con la famiglia, e importa; il principale importa
  alle 22:52 con lo stato `ok`.
- **Il rinnovo da server.** Il 10/10 alle 01:02 (ora locale) i due account, con il
  token scaduto da circa 9 e 3 ore, hanno preso un access token nuovo con
  `getWebCookies()` dal refresh token, senza un nuovo login: nuova scadenza a 24h15 e
  24h04 dal rinnovo, `status` ok. Il rinnovo parte dentro un'importazione: quel giorno
  l'ha fatto partire un ↻ a mano, perché l'aggiornamento automatico di Steam è a
  sette giorni.
- **Il nome.** Con la chiave API nuova, un secondo QR su `sanvitest` (10/10, circa
  12:35) ne ha riscritto il nome, senza scollegare l'account. Quel secondo login,
  sullo stesso account, non ha avuto blocchi in quasi sei ore.
- **Il principale.** L'utente ha riferito il 10/10 sera: nessun blocco né per come si
  usa il login, né per come si usa la chiave.

**Cosa non dice.** Sono due account sullo stesso indirizzo, osservati per giorni e non
per settimane; il principale ha **un solo rinnovo** provato; la **durata del refresh
token web non è misurata** (il credenziale è cifrato nel database, e `refreshExpiresAt`
sta dentro); e resta aperta la domanda di prodotto, molti utenti da un solo server.
Il probe `steam:family-probe` fa ancora il login `MobileApp`: non va lanciato.

## Nintendo (9d)

Nessuna API per sviluppatori: è il backend dell'app Nintendo (`com.nintendo.znej`) per
i token e lo storico, e il GraphQL del portale `accounts.nintendo.com` per le licenze
digitali. `CLIENT_ID`, `User-Agent` e i path dell'app vengono dal client open source
[nintendo-go](https://pkg.go.dev/github.com/wolveix/nintendo-go); il GraphQL e la sua
query dalla richiesta del portale e dall'estensione Nintendo di Playnite
([XenorPLxx](https://github.com/XenorPLxx/playnite-library-nintendo)). Tutto
**provato il 05 e il 06/10/2026** su un account vero, con
`pnpm --filter api nintendo:probe` e `nintendo:vgc-probe`. Il piano e le ragioni sono
in [plans/9d-nintendo.md](../plans/9d-nintendo.md).

**Due fonti, e nessuna basta da sola** (su un account con 19 licenze digitali e 37
giochi giocati):

| Fonte                                        | Cosa dà                                                                                                                         | Cosa non ha                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Virtual Game Cards** (GraphQL del portale) | la libreria **digitale**, **anche mai avviata**: _Hyrule Warriors: Age of Calamity_ e _Blanc_ sono lì, senza un minuto di gioco | le cartucce; le ore          |
| **Storico di gioco** (`play_histories`)      | ciò che si è avviato, **cartucce comprese** (_Zelda: Tears of the Kingdom_, _Super Mario Bros. Wonder_), con ore e ultimo avvio | ciò che non si è mai avviato |

È la forma dei dischi PSN `other`: un titolo **nello storico e senza una licenza
digitale** è con ogni probabilità una cartuccia, e il possesso lo dice (`medium:
physical`). Su un account vero regge su **quattro casi su cinque** (misurato il
06/10/2026 con l'utente): _Bayonetta_ è digitale (il codice incluso con la cartuccia di
_Bayonetta 2_) e sta nelle Virtual Game Cards, e le cartucce vere sono solo nello
storico. **_Tetris 99_ sbaglia**: è digitale, è nello storico, e non è fra le licenze né
visibili né nascoste (`isHidden: true` rende zero voci), quindi risulta «fisico». La
classe che sbaglia è quella dei giochi gratuiti o legati all'abbonamento: si risolvono su
IGDB, **entrano come possesso**, e l'utente non può correggere il supporto di una copia.
Il perché _Tetris 99_ non stia nelle Virtual Game Cards **non è spiegato**. App
dell'abbonamento e demo risultano «fisiche» allo stesso modo, ma non si risolvono su IGDB
e non diventano mai un possesso. **Una cartuccia mai avviata non lascia traccia da nessuna
parte**: resta l'inserimento a mano (o l'import da file dello step 10).

**Scelta dell'utente (06/10/2026): si tiene «fisico», accettando i falsi.** L'alternativa
— dichiarare `medium` solo dove c'è una prova (le Virtual Game Cards dicono «digitale») e
lasciare lo storico senza licenza non dichiarato, come PSN lo dichiara solo con `service:
other` — avrebbe perso il «Fisico» sulle cartucce vere per non scrivere un'affermazione che
a volte è falsa. Si è preferito il «Fisico» sulle cartucce, e il prezzo è quello scritto
sopra: un gioco gratuito o dell'abbonamento giocato e senza licenza risulta fisico, e
**l'utente non può correggere il supporto di una copia**. Se questa classe si rivelasse
larga, la correzione naturale è renderlo modificabile dalla scheda del gioco (step 5), non
cambiare la regola.

**Le voci di soli contenuti aggiuntivi non sono una copia del gioco.** _Zelda: Breath of
the Wild_, _Monster Hunter Rise_ e _Mario + Rabbids: Sparks of Hope_ sono voci con
`hasReleasedApplication: false` e solo `hasReleasedAddOnContents: true`: gli
aggiornamenti o i DLC di un gioco che si ha altrove (di _Zelda_, in cartuccia: l'utente
lo ha confermato). Si saltano, come i DLC di Epic che collassano sul gioco. Se il gioco
è una cartuccia e lo si è avviato, arriva dallo storico.

| Cosa                             | Misurato                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| il login                         | PKCE su `accounts.nintendo.com`; l'utente accede **nel suo browser**. «Select this account» non si clicca (punta a `npf…://`): **clic destro → copia l'indirizzo del link**                                                                                                    |
| credenziali                      | session token **730 giorni**; access token e `id_token` **15 minuti**. Il rinnovo è una POST sola e non cambia il session token. **Provato dal server l'08/10/2026** (un solo account): il session token del 05/10 valeva ancora tre giorni dopo, stato `ok`                   |
| GraphQL delle Virtual Game Cards | `wb.lp1.savanna.srv.nintendo.net/graphql` (**`*.srv.nintendo.net`, non nintendo.com**); senza cookie; **accetta l'`id_token` del login dell'app** (HTTP 200, gli stessi 19 titoli) oltre a quello del portale, che vive 14 minuti e si ricava dalla pagina con la sessione web |
| header e variabili               | `x-nintendo-savanna-client-id` (lo stesso del portale, **non so se uguale per tutti**), `shopId` 3, `language` `en`, `nasLanguage` `en-US`, e il **paese dell'account** (`IT`)                                                                                                 |
| storico                          | `app-api.znej.nintendo.com/api/v2.0/users/me/play_histories`, una richiesta, 37 titoli; `platform` **`HAC`**, `deviceType` assente                                                                                                                                             |
| Virtual Game Cards, i campi      | `apparentPlatform` **`NX`** su 19 su 19; `applicationId` 16 esadecimali minuscoli; `ownerNaId` = `userNaId` = il `sub` dell'`id_token` (`3247fa748f1dd367`)                                                                                                                    |
| identità su IGDB                 | nessun id: **per nome**. Sullo storico, 28 su 37; i 9 irrisolti sono app Switch Online e Classics, due demo, _HentaiUni_: nessun gioco vero                                                                                                                                    |
| Switch 2                         | `OUNCE` per le Virtual Game Cards **viene dal codice di Playnite, non è misurato**; il codice dello **storico** non si conosce. L'account di prova non ha giochi Switch 2                                                                                                      |

**Decisioni** (le ragioni sono nel piano):

- una **copia digitale** solo se la voce ha `hasReleasedApplication`; `medium: digital`.
  Un titolo solo nello storico è `medium: physical`;
- la piattaforma: `HAC` e `NX` → `nintendo_switch`, `OUNCE` → `nintendo_switch2`. Un
  codice sconosciuto **non ripiega su Switch 1**, per la stessa ragione di PSN: si salta
  con un log;
- l'id esterno è l'`applicationId` / `titleId` **in minuscolo da tutte e due le parti**:
  la **coincidenza fra i due non è verificata** su un titolo in comune. Se non
  coincidessero, ogni gioco giocato e digitale comparirebbe due volte;
- le app dell'abbonamento e le demo **non si filtrano**: nessun campo le distingue da un
  gioco, e cadono da sole fra gli scarti, come i _goodies_ di GOG;
- l'account è il `sub` dell'`id_token`, che coincide con `ownerNaId`; il nickname, se il
  profilo risponde, è solo il nome leggibile;
- il **paese** si prende al collegamento: dalla claim `country` dell'`id_token` se c'è,
  altrimenti da `GET /2.0.0/users/me`. **Nessuno dei due è misurato.** Se manca,
  l'import **salta le Virtual Game Cards, con un log, e importa lo storico senza
  dichiarare il supporto** (dire «fisico» sarebbe falso per quasi tutta la libreria
  digitale giocata): non si indovina un paese. Ricollegare riprova;
- se le Virtual Game Cards **falliscono** (non per l'autorizzazione), l'import **fallisce**
  invece di degradare allo storico, per la stessa ragione: il job riprova;
- il primo avvio **non** è `acquired_at`: dice quando si è cominciato a giocare;
- **400 e 401** sul token sono «non vale più» (`needs_reauth`); 403, 429, 5xx e la rete
  sono temporanei. Lo stato che Nintendo dà a un session token scaduto **non è
  misurato**;
- i giochi **in prestito o di un altro account** (`ownerNaId` diverso da `userNaId`, o
  `isLending`) non si trattano: si importano come gli altri e si contano in un log. Non
  ce ne sono sull'account di prova, quindi **non è misurato** come si presentino.

**Rinnovo da server provato (08/10/2026).** Con l'account dell'utente, loggato dal 05/10:
a un'importazione del 08/10 alle 22:51 il server ha rinnovato l'access token (scadenza
14 minuti dopo) col session token salvato tre giorni prima, e lo stato è rimasto `ok`,
senza blocchi da Nintendo. Un solo account, un solo indirizzo.

**Il rischio, da decidere prima di rilasciare.** Il login lo fa l'utente dal suo
browser, ma il rinnovo lo fa il **server**, a ogni import, e ora con **due identità non
nostre**: quella dell'app Nintendo (`com.nintendo.znej`, per i token e lo storico) e
quella di un browser del portale (origine e `User-Agent` di Chrome, per il GraphQL: il
GraphQL è provato così, non senza). Tre richieste per import (token, storico,
GraphQL). In locale l'indirizzo è quello di casa, e il rischio è piccolo; su un server
remoto, con molti utenti da un solo indirizzo, è la domanda che ha fermato il 9f, e non
è misurata. Un client non ufficiale
[può violare il contratto Nintendo](https://pkg.go.dev/github.com/wolveix/nintendo-go).
L'aggiornamento automatico è a **sette giorni**, come Steam e GOG: se si decide che un
rinnovo periodico dal server è troppo, è `AUTO_SYNC_EVERY_DAYS.nintendo`. Se il GraphQL
risponde 401 su un token fresco, la prima riga da guardare è `SAVANNA_CLIENT_ID` in
`apps/api/src/external/nintendo.ts`.

## Le wishlist dei negozi (15e, da fare)

Nessun import legge le wishlist dei negozi: quelle di Ludex sono a mano
([15b](../plans/15b-wishlist.md)). Il lotto 15e le porterebbe dentro, e per ora
è solo documentazione: **nessuna richiesta è partita** e niente di quanto segue è
misurato. Fonti: la documentazione che l'utente ha incollato il 10/10/2026, e una
ricerca in sola lettura lo stesso giorno. **Tre negozi grossi hanno un endpoint**
(Steam, GOG, PlayStation), quindi la funzione si può fare; gli altri si valutano di
volta in volta.

**Steam.** Due metodi di `IWishlistService`, non documentati da Valve nella
Steamworks Web API ma elencati dalla documentazione non ufficiale delle interfacce:

- `GET https://api.steampowered.com/IWishlistService/GetWishlist/v1?steamId=<SteamID64>&key=<chiave>`
  — **con la chiave dell'applicazione**: non apre nessuna sessione, come
  `GetOwnedGames` per un account col solo profilo, quindi non c'entra con i blocchi
  del login (vedi sopra). È il metodo che basterebbe: servono gli appid.
- `GET https://api.steampowered.com/IWishlistService/GetWishlistSortedFiltered/v1` —
  la wishlist a pagine, con ordinamenti e filtri e, a richiesta, i dati dello
  store. Parametri: `steamid` (uint64), `context`, `data_request` («se passato,
  rende i dati dell'elemento»), `sort_order`, `filters`, `start_index` («i dati in
  questo intervallo sono riempiti con StoreBrowse»), `page_size`, `share_token`
  («determina quali elementi si vedono e i filtri effettivi»). Più pesante di quello
  che serve.

**Non misurato**, e da vedere con **una** richiesta prima di scrivere codice: la forma
della risposta (si dice appid, priorità e data di aggiunta), se la wishlist si legge
solo quando è pubblica, e se accetta anche l'`access_token` del login (a wishlist
privata).

**GOG.** `GET https://embed.gog.com/user/wishlist.json` rende la wishlist
dell'account:

```json
{
  "wishlist": { "1207658750": true, "1207658928": true },
  "checksum": "e7c70b9b758318ed2f08b4450272296c"
}
```

Le chiavi sono gli **id prodotto di GOG**, gli stessi delle copie che importiamo.
**Non misurato**: l'autenticazione. L'esempio non la mostra, e non sappiamo se
accetti il token di `auth.gog.com` che già usiamo per la libreria di Galaxy o voglia
i cookie del sito.

**PlayStation.** `GET https://m.np.playstation.com/api/graphql/v1/op?operationName=metGetStoreWishlist`,
sullo stesso host delle librerie PSN che già leggiamo (`gamelist`, `userProfile`).
Dalla documentazione non ufficiale che usa anche `psn-api`
([andshrew/PlayStation-Trophies](https://andshrew.github.io/PlayStation-Trophies/#/misc/Store),
`docs/misc/Store.md`):

- parametri: `variables={}` e `extensions={"persistedQuery":{"version":1,"sha256Hash":"571149e8aa4d76af7dd33b92e1d6f8f828ebc5fa8f0f6bf51a8324a0e6d71324"}}`;
- intestazioni: `apollographql-client-name: PlayStationApp-Android` e
  `content-type: application/json`, più il token come Bearer;
- **legge solo la wishlist dell'account che si autentica**, non quella di altri;
- risposta: `data.storeWishlist`, un elenco di `Product` con `id` (per esempio
  `UP0102-CUSA07104_00-SLUS201840000001`), `name`, `platforms` (`PS4`, `PS5`),
  `boxArt`, `storeDisplayClassification` e il prezzo (con le offerte PS Plus). **Non
  c'è una data di aggiunta.**

**Non misurato**: se il token che già usiamo per le librerie basta, e per quanto
l'hash della query persistente resta valido: è legato all'app Android, e se Sony
cambia la query smette di funzionare. È la parte più fragile. `psn-api` non
risulta esporre una funzione per la wishlist (le sue funzioni elencate sono di
trofei, titoli e profilo), e noi non la usiamo: il client di [psn.ts](../apps/api/src/external/psn.ts)
è scritto a mano.

**Gli altri negozi: da valutare**, di volta in volta, quando serve.
**Xbox** non dovrebbe essere complesso (valutazione dell'utente, 10/10/2026):
il punto di partenza indicato è il repository
[microsoft/xbox-live-api](https://github.com/microsoft/xbox-live-api), che però è l'SDK
Xbox Live per chi sviluppa giochi, e una ricerca nel codice per «wishlist» non
trova niente: **non è verificato** che offra la wishlist di un utente. **Nintendo** ha
una wish list sull'eShop e sul sito, ma nessuna API pubblica per leggerla;
**Epic** non ne mostra una nelle librerie non ufficiali che abbiamo guardato.

**Da decidere nell'analisi**, prima del codice:

- dove vanno i giochi: una lista per negozio e account, in `playlists` col tipo
  `wishlist`, senza mescolarsi con le liste fatte a mano;
- se un gioco tolto dalla wishlist del negozio esce anche dalla lista di Ludex;
- la regola che c'è già: entrando nel backlog un gioco esce da tutte le liste, quindi
  una wishlist importata non deve riportarlo dentro;
- l'identità: gli appid Steam, gli id prodotto GOG e i prodotti PlayStation (per
  nome, come la libreria PSN) si risolvono su IGDB, e una riga non risolta cade fra
  gli scarti;
- la cadenza: con la chiave Steam è una richiesta per account e non tocca il login,
  ma l'aggiornamento automatico (sette giorni) è per la libreria, non per questa.

## La data d'acquisto

Diventa `ownerships.acquired_at` della copia, e la più vecchia delle copie
`backlog.added_at`, con la regola scritta in [modello-dati](modello-dati.md). Misurata sulle librerie vere il 29/09/2026:

| Negozio | Dove sta                                                                                                                                                                   | Copertura      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Epic    | `acquisitionDate` sul record di `library/api/public/items`, nella risposta che già si scarica                                                                              | 888/888 record |
| Amazon  | `entitlementDateFromEpoch` sull'entitlement: millisecondi, **come stringa**                                                                                                | 95/95          |
| GOG     | **non** in `getFilteredProducts`: sta nella libreria di Galaxy, `galaxy-library.gog.com/users/{galaxyUserId}/releases`, stesso token, 500 per pagina con `next_page_token` | 442/442        |
| Steam   | niente in `GetOwnedGames`. Col login, `rt_time_acquired` su `GetSharedLibraryApps` (misurato il 05/10/2026, vedi «Steam Family e il login Steam»): **501/501** sui miei    | 501/501        |
| PSN     | niente fra gli acquisti: vedi sotto                                                                                                                                        | —              |

Su Epic un prodotto ha più record — i DLC hanno lo stesso `productId` — e vale
il più vecchio. Su GOG le date sono due e non valgono uguale: `owned_since` è
quella vera ma c'è su 344 giochi su 442; `date_created` c'è sempre ma non va
prima del **20/04/2019**, il giorno in cui Galaxy ha registrato gli acquisti
vecchi (23 giochi su quel giorno solo). Si prende la prima, e la seconda dove
manca. Galaxy porta anche i giochi degli altri negozi che integra: di quelli
non si tiene niente, la loro data è quando Galaxy li ha visti. E Galaxy **non
blocca** l'import: se non risponde, i giochi entrano lo stesso, senza data.

**Steam: la data c'è, e per le copie proprie è quella giusta.**
`rt_time_acquired` è valorizzato su ogni app, ma **lo stesso gioco ha date
diverse a seconda della chiamata**: _Portal_ vale 2011-09-20 con
`include_own=false` e 2025-07-02 con `include_own=true`. È la data di **una**
copia. Riscontro del 05/10/2026 sulla pagina delle licenze di Steam
(`store.steampowered.com/account/licenses`): _Portal_ e _Portal 2_ risultano
acquisiti il 2 luglio 2025, quindi per un'app in comune con un parente la risposta
con `include_own=true` dà la data **dell'utente**, e quella del proprietario
(2011) è l'altra chiamata. _Portal 2_ non era nel campione stampato dal probe, e
resta da confrontare in pagina dopo il primo import.

Sulle app **solo della famiglia** la data è del proprietario (la più vecchia
misurata è del 2008, prima che l'utente entrasse nella famiglia) e non dice quando
il gioco è diventato giocabile per lui: non va scritta come `acquired_at`, o
farebbe arretrare `backlog.added_at`, che si porta solo indietro. E sulle app che
la libreria propria ha ma la famiglia elenca con un altro proprietario soltanto,
la data è sua e non si usa.

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

## Il link alla pagina del gioco

Misurato il 30/09/2026 sulle librerie vere, in sola lettura, per sapere se dai
dati che già scarichiamo si può costruire il link alla pagina del negozio. Vale
per GOG e PSN, che rispondono; per Epic lo slug non c'è nei nostri dati.

**Un 200 non prova niente.** GOG con uno slug sbagliato rimanda a `/en/games`,
PSN con un id inesistente a `/it-it/error?…`, e in tutti e due i casi il codice
è 200. Il controllo va fatto sull'**URL finale** e sul titolo della pagina.

| Negozio | Campo                                         | Dove sta                                 | Presenza                    | Link                                                              |
| ------- | --------------------------------------------- | ---------------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| GOG     | **`url`**, es. `/en/game/bioshock_remastered` | ogni prodotto di `getFilteredProducts`   | 7 su 8; apre 5 su 5 provati | `https://www.gog.com` + `url`                                     |
| GOG     | `slug`, es. `bioshock_remastered_game`        | lo stesso prodotto                       | 8 su 8; apre 4 su 5 provati | **non usarlo**: non è il percorso della pagina                    |
| Epic    | nessuno                                       | `library/api/public/items`, `bulk/items` | 0 su 5                      | `https://store.epicgames.com/p/{slug}`, ma lo slug non lo abbiamo |
| PSN     | `productId`                                   | `getPurchasedGameList` (gli acquisti)    | 50 su 50; apre 5 su 5       | `https://store.playstation.com/it-it/product/{productId}`         |
| PSN     | `concept.id`                                  | `gamelist/v2` (i giocati)                | 49 su 49; apre 5 su 5       | `https://store.playstation.com/it-it/concept/{conceptId}`         |
| PSN     | `conceptId`                                   | `getPurchasedGameList`                   | **0 su 50**, sempre `null`  | —                                                                 |

**GOG: `url`, non `slug`.** I due coincidono quasi sempre, e per questo
sembrano lo stesso campo. Non lo sono: BioShock Remastered ha `slug`
`bioshock_remastered_game` e `url` `/en/game/bioshock_remastered`, e il link
costruito dallo slug finisce sull'elenco dei giochi. Su un secondo campione,
non aperto, `death_knights_of_krynn` ha `url` `/en/game/dungeons_dragons_krynn_series`,
e `alders_blood_prologue` **non ha `url`**: per i prodotti senza serve un
ripiego, per esempio un link di ricerca. Il campione è di 8 prodotti presi a
caso dalla prima pagina, non l'intera libreria.

**Epic: lo slug non sta nei nostri dati.** `bulk/items` rende `id`, `title`,
`namespace`, `categories`, `customAttributes`, `releaseInfo`, `developer` e
poco altro: né `productSlug`, né `urlSlug`, né `catalogNs.mappings.pageSlug`, e
`customAttributes` ha solo `FolderName`, `PresenceId` e simili. `graphql.epicgames.com`,
col bearer token, ha risposto `404 Gone` per tutti e 5 i namespace provati; il
GraphQL di `store.epicgames.com` e le pagine `/p/…` rispondono con una sfida
Cloudflare (403) a chi non è un browser, quindi da terminale **nessun link Epic
è stato aperto**.

Gli slug delle pagine hanno la forma **`{titolo}-{sei cifre esadecimali}`**:

- `https://store.epicgames.com/p/astrea-six-sided-oracles-33c949`
- `https://store.epicgames.com/p/mechabellum-88a843`
- `https://store.epicgames.com/p/control-resonant-3568d3`

Il suffisso non si deduce dal titolo, e **non si deduce nemmeno dagli id che
abbiamo**. Astrea (`-33c949`) e Mechabellum (`-88a843`) sono in libreria su
Epic, e per loro si è confrontato il suffisso con tutti gli id del record e del
catalogo — `productId`, `namespace`, `catalogItemId`, `appName`, `entitlementName`
— come testo e come inizio o fine dell'hash md5, sha1 e sha256 di ciascuno:

| Gioco       | `productId`                        | `namespace`                        | Suffisso |
| ----------- | ---------------------------------- | ---------------------------------- | -------- |
| Astrea      | `4515173972ae4444a2582bc690c150bd` | `a940fa38f001486a9884640924119576` | `33c949` |
| Mechabellum | `131adc2288294d74aaff6a2f02b51d59` | `36074aa6badf45698cced1a44e837fa2` | `88a843` |

Nessun riscontro. `control-resonant` non è in libreria (c'è solo Control, con
`productId` `prod-calluna`), quindi il terzo esempio non si è potuto provare.
Lo slug sta con ogni probabilità nella pagina del negozio o in un endpoint che
oggi non chiamiamo, non in un calcolo che possiamo rifare. Finché non si trova
dove, per Epic resta il link di ricerca
`https://store.epicgames.com/browse?q={titolo}`, da provare a mano.

**PSN: due link, per due elenchi che non si incrociano.** Gli acquisti portano
il `productId` e mai il `conceptId`; i giocati portano il `concept.id` e mai il
`productId`. Su 49 giocati, **nessuno** ha lo stesso `titleId` di un acquisto
nella prima pagina, quindi non c'è una copia che li abbia tutti e due: il link
di una copia viene da ciò da cui la copia è nata, `/product/` o `/concept/`.
