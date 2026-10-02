# Import di librerie

Parte della documentazione in `docs/`, spostata dal CLAUDE.md della radice. Gli altri file: [modello-dati](modello-dati.md), [import-librerie](import-librerie.md), [negozi](negozi.md), [ordine-sviluppo](ordine-sviluppo.md), [scelte-scartate](scelte-scartate.md).

Le librerie importate aggiungono tre cose al modello, decise allo step 4:

- **`store_accounts`**: l'account dell'utente su un negozio, uno per `(utente,
negozio, account)` — **non uno per negozio**: due account Amazon sono un caso
  vero, e ci sono utenti con due Steam. Non è una colonna su `user` perché
  `auth.ts` è generato e viene riscritto. Allo step 4 teneva solo l'identità
  pubblica dell'account, perché a Steam basta uno SteamID64; dallo step 9 tiene
  anche i token, e come sono fatti lo dice «Le altre librerie» qui sotto.
- **abbonamento su `ownerships`**: `subscription`, nullo se la copia è comprata.
  Vedi «un gioco a cui puoi giocare stasera ma che non è tuo», più sotto: è la
  risposta parziale che il 9b ha dovuto dare, non un campo in più.
- **pagina del negozio su `ownerships`**: `store_page`, il pezzo di
  indirizzo che il negozio dà (Steam `app/{appid}`, GOG l'`url` del prodotto,
  PSN `product/{id}` o `concept/{id}`); l'URL intero lo compone
  `storePageUrl` in `@repo/contracts`. È della copia perché viene da ciò da
  cui la copia è nata. Al reimport va in COALESCE come le ore: le copie di
  prima la prendono, una scrittura che non la porta non la cancella. Le
  misure di cosa dà ogni negozio sono in
  [negozi](negozi.md#il-link-alla-pagina-del-gioco).
- **copertina e pagina del negozio su `unresolved_imports`**: `image_url` e
  `store_page`. Una voce non risolta non ha `games` né IGDB, quindi l'unica
  immagine è quella che il negozio manda, nella stessa risposta che l'import già
  scarica: GOG `image` (con `_glx_vertical_cover.webp`), Epic `keyImages` del
  catalogo (`DieselGameBoxTall`, con gli spazi codificati), PSN `image.url`
  (acquisti) e `imageUrl` (giocati), Amazon `productDetail.iconUrl`, un
  quadrato. **Steam non la salva**: `storeCoverUrl` la compone dall'appid.
  Al reimport vanno riscritte insieme al nome (`excluded`), e non toccano il
  nascondere. `store_page` ha la stessa forma di quella su `ownerships`, e il
  link lo compone lo stesso `storePageUrl`. Le righe esistenti le prendono al
  prossimo import.
- **supporto su `ownerships`**: `medium`, `digital` o `physical`, nullo quando
  nessuno l'ha dichiarato. Gemello di `subscription`: quello dice _a che
  titolo_ hai la copia, questo _che cosa_ hai in mano. L'import lo scrive
  sempre — `digital` per ogni libreria di negozio, `physical` per i dischi PSN
  — e dallo step 5 lo scrive anche l'utente, che è l'unica fonte possibile per
  un disco coperto da un diritto digitale: per il negozio quel gioco è
  digitale e basta.

  **Sta nella chiave del vincolo**, e qui c'era scritto il contrario. Non
  descrive com'è fatta una copia, dice **quale** copia è: il disco sullo
  scaffale e il diritto che l'abbonamento presta sono due copie dello stesso
  gioco sulla stessa console, esattamente come Steam e GOG sono due copie sullo
  stesso PC, e stanno su due righe.

  Le due non sono simmetriche, ed è questo a decidere la chiave larga: a
  sparire è sempre il digitale — l'abbonamento finisce, il gioco esce dal
  negozio — mentre un disco che l'import non vede più non è un disco che non
  hai, è un disco che Sony non ha modo di dichiarare. Con la chiave stretta
  l'arrivo di un diritto digitale riscriveva la riga in COALESCE e il disco
  spariva: è la storia di _God of War_ (2018), comprato su disco e poi finito
  nel Plus, e succedeva **anche senza che nessuno avesse scritto niente a
  mano**, ai dischi che l'import stesso aveva dedotto da `service: other`.

  Il prezzo, che è vero e va accettato: niente cancella una riga che l'import
  smette di emettere. Un disco dedotto male — quello prestato da un amico,
  _Astro's Playroom_ che è preinstallato — resterebbe lì anche il giorno che
  compri il gioco in digitale. È il baratto scelto: la chiave stretta non
  accumula mai righe false ma perde in silenzio una copia che hai davvero, la
  larga sbaglia in un modo che si vede e che un gesto di rimozione sistema.
  Quel gesto adesso c'è: vedi «Togliere una copia» qui sotto.

  Da qui tre regole a valle. **`ensureOwnerships` non aggiorna più il
  supporto**: sta nella chiave, quindi su una riga trovata per conflitto è
  uguale per definizione. **`fondiDoppioni` non lo arbitra più**: due voci che
  cadono sulla stessa chiave ce l'hanno uguale, e il disco PSN con un codice
  diverso dall'acquisto sulla stessa console — che prima diventava una riga
  sola — resta quello che è, due copie. E **l'adozione si allarga**: una riga
  meno specifica (senza account o dello stesso account, senza negozio, senza
  supporto) se la prende l'import, ma mai una che dichiari un supporto
  _diverso_ o un altro account. Ciò che non dichiara
  niente dice «non lo so», non «un'altra»: è la forma di ogni possesso scritto
  a mano prima che il campo esistesse, e si fa adottare. Dove la riga di
  destinazione esiste già — l'import era passato e quella a mano è rimasta lì
  accanto — adottare violerebbe il vincolo, e la meno specifica si cancella.

- **ore giocate su `ownerships`**, non su `backlog`: sono una proprietà di
  _quella copia_, e lo stesso gioco su GOG avrebbe le sue. Sono dato oggettivo
  del negozio, non un campo personale dello step 5. **Non si usano per indovinare
  lo stato**: due ore su un GDR da sessanta non vogliono dire "giocato", e
  `played` allo step 13 pesa.
- **`unresolved_imports`**: le voci che l'import non ha saputo legare a un gioco.
  Dal 9b portano anche la **piattaforma**, quando il negozio la dice: senza,
  risolvere a mano uno scarto PS5 non saprebbe su quale console scrivere il
  possesso, e `platformFor('psn')` alzerebbe — com'era giusto facesse finché
  nessuno aveva risposto a quella domanda.
  Stanno lì e **non in `games` come righe non risolte**, perché `games` è
  condivisa fra tutti gli utenti: su una libreria vera gli scarti sono client
  beta e "Friend's Pass", e riversarli nel catalogo di tutti per un problema di
  uno è sbagliato. L'utente le vede e le risolve a mano. Sono **per account**,
  non per negozio, o gli scarti del secondo Amazon sovrascriverebbero quelli del
  primo.

## Ciò che non voglio vedere

Il documento la rimanda già due volte — lo step 5 sui possessi («prima serve una
logica di scarto/nascondi, che è ancora da pensare») e lo step 11 sugli scarti —
e il 9b la rende concreta: la libreria PSN porta Netflix, YouTube, Spotify, Prime
Video, MUBI, DAZN e il lettore multimediale, che **nessun campo dell'API
distingue** da un gioco. Cadono negli irrisolti, che è dove devono stare, ma non
ci restavano: il vecchio `dismiss` **cancellava la riga**, e il prossimo import
la riportava.

Sono due gesti su due oggetti diversi, e vanno tenuti distinti:

- **una voce che non è un gioco** — Netflix. Sta in `unresolved_imports` e lì
  resta; si vuole solo che smetta di comparire fra i «da sistemare».
- **un gioco vero che non voglio in lista** — _Horizon Forbidden West_, finito e
  archiviato. Sta in `backlog`, il possesso è suo, e domani si può volerlo
  rivedere.

**Non è un problema di import, ed è la cosa da non sbagliare in partenza.**
L'import non ricrea ciò che c'è già: `ensureBacklogEntries` fa
`onConflictDoNothing` e una riga di backlog esistente non la tocca affatto,
mentre l'upsert degli scarti riscrive solo nome, piattaforma e ore. Un campo
messo su quelle righe sopravvive da sé, senza che il job debba sapere che
esiste. Ciò che non sopravvive è **cancellare** — ed è esattamente l'errore che
`dismiss` faceva, e la ragione per cui lo step 5 dice che togliere un possesso
non basta.

Quindi la forma è **un campo per riga, in due tabelle**, e nient'altro:
`hidden_at` su `unresolved_imports` per non vederla più fra gli scarti, e su
`backlog` per non vedere il gioco in lista. Stessa parola per lo stesso
intento, e le liste che filtrano di default. Una data e non un booleano, perché
la vista dei nascosti li mette in ordine di quando; nasconderli due volte non
la sposta.

Sugli scarti c'è anche **il perché**, `hidden_kind`, perché «nascosto» mette
insieme cose diverse. Su una libreria vera sono app (Netflix, Spotify, DAZN),
contenuti extra (goodies GOG, il REDkit, un artbook), versioni di prova (beta,
alpha, «Friend's Pass») e DLC. I tipi sono cinque, un insieme chiuso in
`hiddenKindValues`: `app`, `dlc`, `extra`, `prerelease` e `unwanted`. I primi
quattro sono un **fatto** sulla voce; `unwanted` — un gioco vero che non si ha
voglia di sistemare — è una **preferenza**. Un vincolo nel database tiene
`hidden_at` e `hidden_kind` nulli o valorizzati insieme.

Sul backlog il tipo **non c'è**: lì sta un gioco già risolto, nasconderlo è una
preferenza di vista, e il giudizio sul gioco ha già il suo posto in `excluded`.
Un DLC finito nel backlog perché IGDB ha agganciato la sua scheda non è una
scelta dell'utente ma un dato, e lo dice IGDB (`game_type`).

Tre cose che qualunque versione dovrà rispettare:

- **Il possesso resta.** Nascondere non è dire «non ce l'ho»: il gioco è tuo, e
  allo scollegamento dell'account va contato fra quelli che spariscono. Il flag
  sta su `backlog`, non su `ownerships`.
- **Serve un posto dove ripensarci**, perché riattivare è metà del gesto: un
  gioco nascosto per sbaglio, senza una vista dei nascosti, sparisce per sempre.
  È l'unico pezzo di interfaccia che questa cosa richiede davvero.
- **`excluded` non è la stessa cosa** e non va riusato. Vuol dire «non voglio
  giocarlo», è un giudizio sul gioco e allo step 13 pesa più di molte
  valutazioni positive; nascondere è una preferenza di vista. Fondendoli, un
  gioco nascosto perché è spazzatura insegnerebbe al motore che non ti piace
  quel genere.

Restava aperta una domanda sola: **è roba di uno o di tutti?** Il tipo ne dà
metà della risposta — si potrà promuovere un fatto, mai una preferenza — e il
resto è dello step 11. Che Netflix su PSN non sia un gioco è vero per chiunque, e come l'enrichment si
paga una volta sola potrebbe pagarsi una volta sola anche il contrario — con
l'admin dello step 11 che promuove a globale ciò che un utente ha già bocciato.
Il rovescio è quello già scritto per i tag: una decisione di uno che tocca la
libreria di sconosciuti vuole una moderazione da inventare. L'ordine però è
chiaro e non costa niente: **per utente adesso, promuovibile dopo**. Un flag per
utente lo si promuove quando si vuole; una lista globale scritta subito la si
smonta con una migrazione e con la domanda «di chi era questa decisione?», a cui
nessuna riga saprebbe rispondere.

Due conseguenze minori, scritte perché si scoprono altrimenti a cose fatte:

- una voce nascosta **continua a costare la sua ricerca IGDB** a ogni import,
  perché il matcher non sa che l'hai bocciata. Su PSN sono undici ricerche: un
  costo noto, non un motivo per mettere le mani nell'import. Semmai è
  un'ottimizzazione di dopo.
- se IGDB un giorno impara a riconoscere una voce nascosta, quella smette di
  essere uno scarto e diventa un gioco in backlog: il nascondere **non la
  segue**, perché l'oggetto è cambiato. Ricomparirà una volta, e lì si nasconde
  di nuovo — dall'altro lato.

Due cose che restano da decidere, e che chi arriva dopo deve trovare scritte:

- **allo step 13 i nascosti escono dai candidati, ma non insegnano niente.** È la
  differenza con `excluded` portata sulla query: chi non vuole vedere un gioco
  non vuole nemmeno che gli venga proposto, ma non ha detto che non gli piace.
- **«Rimuovi» accanto a «Nascondi» era ambiguo**, e la risposta non è stata
  togliere il bottone ma dire la verità prima di eseguirlo. Su un gioco
  importato «Rimuovi» non dura — il prossimo import ricrea riga e possessi — e
  ciò che **non** torna è la roba dell'utente, che la cascade si porta via:
  l'unico effetto duraturo è cancellare voto, note e tag e lasciare il gioco.
  Quindi il gesto passa da una conferma che elenca solo ciò che c'è davvero
  («perderai il voto» su un gioco non votato insegna a non leggere i dialoghi)
  e, dove il gioco tornerebbe, offre «Nascondi» accanto — accanto e non al
  posto, perché la scelta resta di chi guarda.

## Togliere una copia

Nascondere risponde a «non voglio vederlo». Questa è l'altra domanda, e non è
la stessa: **questa copia non ce l'ho** — il disco prestato da un amico che
l'import ha dedotto da `service: other`, la piattaforma aggiunta per sbaglio.
È un fatto sul possesso, non una preferenza di vista, e per questo non si
risolve con `hidden_at`.

Cancellare la riga e basta non funziona, per la stessa ragione di `dismiss`
sugli scarti: il prossimo import la rimette, e su PSN l'aggiornamento
automatico gira ogni tre giorni. Il numero che decide è questo, misurato sulla
libreria di prova: **2390 possessi su 2392 vengono da un import**. Una
rimozione senza memoria sarebbe un bottone che non fa niente.

La memoria è **`ownership_rejections`**, una tabella a parte con la stessa
chiave del vincolo sui possessi, `NULLS NOT DISTINCT` compreso. Sta lì e non su
`ownerships` come un `removed_at`, e la ragione è la stessa per cui la chiave è
quella: le due forme tengono lo stesso fatto, ma un flag andrebbe escluso da
**ogni** lettura dei possessi — la ricerca, il pannello dei filtri, i conteggi
dello scollegamento: dieci punti — e una lettura dimenticata mostrerebbe un
possesso che l'utente ha tolto, cioè un bug che sembra del database. Con la
tabella la riga non c'è davvero: nessuna di quelle letture cambia, e se il
rifiuto non mordesse il danno sarebbe un possesso di troppo, che si vede e si
toglie di nuovo.

Quattro regole che ne discendono:

- **il rifiuto morde in un punto solo**, `ensureOwnerships`, cioè l'import —
  che è l'unica cosa che rimetterebbe la riga. Il confronto è sulla chiave del
  vincolo, quindi rifiutare il disco PS5 non tocca il diritto digitale sulla
  stessa console: sono due copie, e l'utente ne ha tolta una.
- **si torna indietro dichiarando di nuovo la copia.** `addOwnershipToEntry`
  cancella i rifiuti **compatibili** — chi non dichiara negozio o supporto sta
  dicendo «non lo so», non «un'altra copia» — ed è anche ciò che fa l'«Annulla»
  del toast. La riga rinasce senza account, e il prossimo import se la riprende
  con l'adozione: il giro è lungo ma non inventa un secondo modo di scrivere un
  possesso.
- **l'ultimo possesso non si toglie.** La piattaforma è il filtro hard di
  «stasera ho la Switch accesa», e una riga senza nessuna resterebbe nel
  backlog invisibile a chi la cerca. È un `CONFLICT`, non un `BAD_REQUEST`: la
  richiesta è scritta bene, è lo stato della riga a non permetterla. Lato web
  la x non compare nemmeno, perché un bottone che fallisce sempre è peggio di
  un bottone che non c'è.
- **`store_account_id` è in `cascade`**, al contrario del `restrict` che porta
  il possesso. Non è un'incoerenza: i possessi sopravvivono allo scollegamento
  «tieni i giochi» perché sono roba dell'utente, e per quello la riga
  dell'account resta; quando invece si cancella davvero, di quell'account non
  resta niente da importare e un rifiuto che lo nomina non ha più nessuno da
  fermare. Con `restrict` avrebbe bloccato lo scollegamento.

## Come si chiama un account, quando ne hai due

`store_accounts` porta **due** nomi, e sono di due persone diverse:

- `display_name` è come lo chiama il **negozio**: `personaname` su Steam,
  `username` su GOG (da `userData.json`, l'unico posto dove GOG dica qualcosa di
  leggibile — lo scambio del token dà solo l'id), il display name su Epic, il
  nome di battesimo su Amazon. Si prende **al collegamento** e non a ogni import:
  è decorazione, e un nome cambiato nel frattempo non vale una richiesta in più
  per libreria. Se la richiesta non riesce si mette null e si tira avanti — un
  collegamento riuscito non deve fallire perché non sappiamo come chiamarlo.
- `label` è come lo chiama **l'utente**, ed è l'unica cosa che risolve il caso
  per cui esiste: due account Amazon della stessa persona rendono lo **stesso**
  `given_name`, misurato su due account veri. Nessun dato dell'API li separa, e
  l'unico che sa quale dei due è «quello di famiglia» è chi li ha collegati.

La precedenza è `label → display_name → external_account_id`, scritta una volta
sola in `storeAccountName` dentro `packages/contracts`, perché la usano la lista
degli account, i badge dei possessi e i log del worker.

Da qui discende una regola per i negozi che verranno: **non si va a caccia
dell'email** per distinguere gli account. GOG ce l'ha, Amazon la nasconde dietro
uno scope che non abbiamo, EA e Nintendo non danno niente — e anche prendendola
tutta si resterebbe con due account che si chiamano uguale. L'etichetta funziona
ovunque e costa zero richieste.

Attenzione a un tranello di GOG: `userData.json` porta un `userId` che **non è**
quello che salviamo. Il nostro `external_account_id` viene dallo scambio del
token ed è il `galaxyUserId`. Di quella risposta si prende il nome e nient'altro,
o l'identità dell'account cambierebbe sotto ai possessi che ci puntano.

## Il possesso sa da quale account viene

`ownerships` porta uno `store_account_id`, nullo sugli inserimenti manuali. Non è
un di più: senza, due account dello stesso negozio collassano nella stessa riga
per il vincolo unique, e da lì discendono due cose che non si possono più fare —
sapere **da quale dei due lanciare il gioco**, e sapere **quali possessi erano di
un account** quando lo si scollega. `store` resta accanto e non è ridondante: è
l'unica cosa che c'è sugli inserimenti manuali, ed è la colonna su cui filtra la
ricerca dello step 7.

L'account entra anche **nella chiave del vincolo**, e questo ha una conseguenza
da tenere a mente: un possesso «PC / Amazon» scritto a mano e lo stesso portato
dall'import sarebbero due righe. Per questo `ensureOwnerships` prima **adotta**
il possesso senza account invece di sdoppiarlo. Una riga che porta l'id di un
_altro_ account è il caso vero dei due Amazon e non si tocca; una dello
**stesso** account invece sì, se non dichiara il supporto. È lo scarto risolto
a mano, che sa da quale account viene ma non se è un disco: finché l'adozione
guardava solo `store_account_id is null`, il reimport di quell'account gli
metteva accanto la copia `digital`, e la lista mostrava lo stesso gioco con due
badge identici.

**Scollegare è una domanda, non un bottone**, ed è l'unica risposta al buco che
il CLAUDE.md dichiarava aperto sui possessi. Le due strade non sono la stessa
cosa con un'etichetta diversa:

- **tieni i giochi** — restano nel backlog come se fossero stati inseriti a mano.
  La riga di `store_accounts` **non si cancella**: passa a `unlinked` e perde le
  credenziali. Sopravvive perché i possessi puntano a lei, ed è l'unica cosa che
  ancora ricordi da quale dei due account veniva un gioco. Cancellarla e mettere
  a nullo i possessi ricreerebbe esattamente il buco appena chiuso.
- **cancella i giochi** — i possessi di quell'account se ne vanno, e con loro le
  righe di `backlog` che restano senza nessun possesso: voto, note e tag
  compresi, senza eccezioni. Qui la riga dell'account si cancella davvero, perché
  non è rimasto niente da ricordare.

In entrambi i casi **`games` non si tocca mai**: la scheda, i metadata e la
mappatura in `external_ids` restano nel catalogo condiviso, e il prossimo utente
che importa quel gioco non ne ripaga l'enrichment perché qualcun altro ha
scollegato un account. E in entrambi i casi gli scarti se ne vanno: senza
l'account sono voci di una libreria che non sappiamo più leggere.

Poiché «cancella» è irreversibile e la sua portata **non si vede da fuori** — un
gioco che sta anche su GOG non sparisce — il dialogo conta prima di eseguire:
quanti possessi, quanti giochi uscirebbero davvero dal backlog, e quanti di
quelli hanno qualcosa che ha messo l'utente.

Lato web tutto questo vive in **`/account`**: una **lista di account collegati**
più un «aggiungi un account» dove si sceglie il negozio, lo stato dell'import
mentre gira, e la lista degli scarti da sistemare o scartare. `linkableStoreValues`
non sparisce, cambia mestiere: non è più l'elenco delle schede — una per negozio
non poteva rappresentare due account Amazon — ma l'elenco di quella tendina. Il
collegamento resta lo stesso gesto per tutti (si incolla l'URL del profilo, lo
SteamID64 o il nome scelto — lo SteamID su Steam non è in vista da nessuna
parte). Che un import sia in corso si legge **dalla coda** e non da
`last_sync_at`, che al primo giro è ancora nullo e non avrebbe niente da dire.

**Da fare: quale import gira, e a che punto è.** Oggi `syncing` è un booleano
per account, letto dalla chiave di deduplicazione (`isImportRunning`): vale
tanto per un job **in coda** quanto per uno **in lavorazione**, e con
`concurrency: 1` sugli import la differenza conta — con cinque account dovuti
dall'aggiornamento automatico uno lavora e quattro aspettano, e `/account` li
mostra tutti uguali. E non c'è avanzamento: un import Epic sono 705 ricerche
IGDB, minuti in cui la pagina dice solo «in corso». Servono tutte e due le
cose: **quale** account è in lavorazione e quali in fila, e **quanto manca**
(BullMQ ha `job.updateProgress`, che oggi nessun import chiama).

L'ordine dei passi dell'import è esso stesso una regola: **prima il nostro DB**
(gli appid già in `external_ids` non costano niente), **poi IGDB** e solo per il
resto, in blocchi — su 452 giochi sono quattro richieste. Risoluzione ed
enrichment restano due cose distinte: la prima è sincrona e in blocco, il secondo
è un job per gioco.

Il job d'import porta **l'id dell'account e nient'altro**: da lì si leggono
negozio, utente e identità pubblica. Era `{ store, userId }`, che è anche la
vecchia chiave di deduplicazione, e con due account sullo stesso negozio si
escludevano a vicenda — il secondo veniva scartato in silenzio e l'utente
aspettava una libreria che non arrivava. Il credenziale non è mai nel job: chi
esegue va a leggerlo, o si scriverebbe un refresh token in chiaro nella
cronologia di Redis.

## Un collegamento sbagliato non si disfa togliendo il gioco

Il ri-collegamento a IGDB sta scritto fra le cose che lo step 5 rimanda, e lì è
descritto come «correggere l'`igdbId` di un gioco risolto male». Visto da un
import è un'altra cosa, e la differenza non è accademica: **il collegamento
sbagliato non sta su `games`, sta in `external_ids`**. È la riga
`(negozio, id esterno) → gioco` che il passo 1 dell'import legge per prima, ed è
per questo che l'errore è appiccicoso.

Da qui discendono due gesti che sembrano rimedi e non lo sono:

- **togliere il gioco dal backlog non tocca la mappatura.** È giusto che non la
  tocchi — `external_ids` è del catalogo condiviso, il backlog è tuo — ma il
  prossimo import rilegge quella riga e ti ricollega **lo stesso identico gioco
  sbagliato**, senza spendere niente e senza chiedere niente. Sembra che l'import
  «insista»; in realtà sta solo credendo a una cosa che nessuno ha corretto.
- **cancellare la riga di `games` è peggio del problema.** Le FK verso `games`
  sono tutte `on delete cascade`: se ne vanno `external_ids`, `game_attributes`,
  `game_sources`, `game_scores` e i `backlog` — con voti, note e possessi — **di
  tutti gli utenti che avevano quel gioco**, non solo di chi ha sbagliato. E in
  cambio non riporta le cose al punto di partenza: dove IGDB ha una sorgente per
  il negozio (Steam, GOG, Xbox) il passo 2 riaggancia lo stesso id al primo
  reimport, dove non ce l'ha (Epic, Amazon, PSN) la voce ricade negli scarti, che
  visto da fuori assomiglia a «il gioco è sparito e non torna più».

Oggi l'unico gesto che funziona davvero è cancellare a mano la riga di
`external_ids` e rilanciare l'import: la voce torna fra gli scarti e la si
ricollega dal dialogo di `/account`. Che sia una `DELETE` in psql è la misura di
quanto manchi l'interfaccia.

Quindi il ri-collegamento sono **due strade verso lo stesso posto**, e chi lo
farà deve trovarle scritte tutte e due:

- **il gioco è quello giusto ma l'id no** — un gioco inserito a mano senza
  `igdbId`, o risolto male: si corregge `games.igdbId`, con la fusione di due
  righe che lo step 5 descrive.
- **il gioco è giusto per qualcun altro ma non per questa voce di libreria** —
  l'errore è nell'import: si **ripunta la riga di `external_ids`** a un altro
  gioco, o la si toglie perché torni a essere uno scarto. `games` non si tocca,
  e per un motivo solo ma sufficiente: quel gioco è di tutti, questa mappatura è
  di una libreria sola.

Ha un parente stretto e non è un caso: è lo stesso gesto che l'admin dello step
11 chiama «inserimento a mano dell'id esterno» per le fonti in `not_found`.
Scritto l'id giusto, il match non si rifà — si salta.
