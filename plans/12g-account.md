# Step 12g — La pagina account

**Chiuso il 02/10/2026**, quando l'utente ha detto che la pagina è pronta.
Struttura approvata sul wireframe
([12g-account.excalidraw](12g-account.excalidraw): si apre trascinandolo su
excalidraw.com), con le correzioni dell'utente dentro. Sotto ogni passo, man
mano, cosa è stato fatto e cosa l'ha smentito.

## Contesto

Oggi [`/account`](../apps/web/src/routes/_app.account.tsx) è una colonna sola:
i dati (nome ed email, niente altro), l'interruttore generale
dell'aggiornamento automatico, una scheda per account collegato, il modulo
«Aggiungi un account», gli scarti d'import con i nascosti dentro un
`<details>`, i giochi nascosti. Con 6 account e 26 scarti è lunga e le cose
non si ritrovano. Usa ancora Tailwind: il 12g lo toglie anche da qui.

Riferimenti dell'utente: la pagina «account collegati» di Ubisoft (card con
icona grande, stato, «Scollega») e quella di EA (icone colorate, nome
dell'account).

## Decisioni prese

- **Quattro sezioni, menu a sinistra**: Profilo, **Librerie**, Da sistemare,
  Nascosti. Sul telefono il menu è una riga di voci scorrevole in alto, non una
  colonna. I conteggi (26, 17) stanno accanto alle voci.
- **Sotto-rotte**, come il backlog tiene lo stato nell'URL:
  `/account/profile`, `/account/libraries`, `/account/needs-attention`,
  `/account/hidden`. `/account` rimanda al profilo. Il tab dei nascosti è un
  parametro di ricerca.
- **Profilo**: dati con **modifica del nome**; **cambio password**; **sessioni
  attive** con «esci dagli altri dispositivi»; **scarica i miei dati** e
  **cancella l'account**, questi due solo lato FE e spenti finché non c'è lo
  step 16. La cancellazione sta in fondo, in una zona rossa, e il dialogo
  chiede di scrivere il nome utente.
  - Better Auth (1.6.27) ha già `updateUser`, `changePassword`,
    `listSessions`, `revokeSession`, `revokeOtherSessions`; non serve un sender
    di email, a differenza del cambio email e del reset password, che restano
    fuori finché non ce n'è uno.
- **Librerie** a card in griglia da 3 colonne (4 dove c'è spazio), una per
  account, con l'icona **colorata** del negozio. Sulla card: negozio, nome
  dell'account, stato (importata X fa / in corso / **da ricollegare**), il
  bottone «Aggiorna» e l'interruttore dell'aggiornamento automatico dell'account.
  Il menu ⋮ ha «Dai un nome» e «Scollega», più «Ricollega» solo con il
  credenziale scaduto. «Dai un nome» è un dialogo, non il form dentro la card.
  In cima alla sezione, sulla riga dell'**aggiornamento automatico**, c'è
  **«+ Aggiungi libreria»**, che apre il modulo di oggi in un dialogo; «Aggiorna
  tutte» sta accanto al titolo. L'aggiornamento automatico ha un **«?» con
  tooltip** (su touch, un tocco): «Le librerie collegate si reimportano da sole:
  PlayStation ogni 3 giorni, gli altri negozi ogni 7. Puoi sempre aggiornare a
  mano.» È il testo che la pagina ha oggi sotto l'interruttore.
- **Profilo**: «Dati personali» (nome ed email) e «Esporta i tuoi dati» sono due
  schede con due titoli diversi; il primo wireframe ne aveva due uguali.
- **Da sistemare**: lista di righe con **copertina, nome, negozio e account,
  data di aggiunta**, e i bottoni di oggi (Collega, Nascondi ▾). Il link alla
  pagina del negozio è **l'icona del negozio**, come sulla pagina del gioco.
- **Nascosti**, a tab: App, DLC, Contenuto extra, Versione di prova, **Non
  interessato**. I primi quattro sono i `hiddenKind` delle voci d'import;
  **Non interessato unisce** le voci d'import `unwanted` e i giochi nascosti dal
  backlog (`hidden_at`), in una lista sola con l'etichetta «gioco» o «voce».

## Copertine e link

**Misurato il 02/10/2026**, in sola lettura, con i token dell'utente: la prima
risposta grezza di ogni negozio, la stessa che usa l'import. Nessun import legge
oggi un campo immagine, ma **tutti e cinque i negozi ne mandano uno**, nella
stessa risposta che già scarichiamo: nessuna chiamata in più.

| Negozio | Campo                                                                                          | URL                                                                                                | Raggiungibile |
| ------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------- |
| Steam   | nessuno: si compone dall'appid                                                                 | `https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/library_600x900.jpg` (o `header.jpg`)   | 200, 2 su 2   |
| GOG     | `image` su ogni prodotto di `getFilteredProducts`, `//images-1.gog-statics.com/{hash}`         | `https:` + `image` + un suffisso: `_glx_vertical_cover.webp` (verticale), `_196.jpg`, `.jpg` pieno | 200 su tutti  |
| Epic    | `keyImages[]` nel **catalogo** (`bulk/items`), che l'import già chiama per i titoli            | l'`url` del tipo `DieselGameBoxTall` (verticale); ci sono anche `DieselGameBox` e `…BoxLogo`       | 200           |
| PSN     | `image.url` negli acquisti; `imageUrl` e `concept.media.images[]` nei giocati                  | l'URL com'è                                                                                        | 200, 12 su 12 |
| Amazon  | `product.productDetail.iconUrl` (quadrata), più `details.backgroundUrl1/2` e `details.logoUrl` | l'URL com'è                                                                                        | 200           |

- **Formati diversi**: Steam, GOG ed Epic danno una copertina verticale; PSN e
  Amazon un quadrato. Il riquadro è verticale 40×60 e ritaglia (`cover`): da
  guardare sulla pagina vera se i quadrati reggono.
- **Ottenerle vuol dire salvarle.** Una colonna `image_url` su
  `unresolved_imports`, scritta dall'import insieme al nome e **riscritta al
  reimport** (l'upsert di `recordUnresolved` riscrive già nome, ore e
  piattaforma). Le righe di oggi la prendono al prossimo import o al prossimo
  aggiornamento automatico. Steam non la salva: si compone dall'`externalId`.
- **Si mostrano da lì, non si scaricano**: le copertine IGDB e Steam funzionano
  già così. Se l'immagine non c'è o non carica, segnaposto con l'icona del negozio.
- **Il link alla pagina del negozio è l'icona del negozio**, come sulla pagina
  del gioco: cliccabile dove un link c'è, ferma altrimenti. `storePageUrl` in
  [store-links.ts](../packages/contracts/src/store-links.ts) legge
  `ownerships.store_page`, e gli scarti non ce l'hanno. **Steam** si compone
  dall'`externalId`. **GOG** (`url`) e **PSN** (`product/…`, `concept/…`) vanno
  salvati anche su `unresolved_imports`, come sui possessi: una seconda colonna
  `store_page`. **Epic** e **Amazon** non hanno una pagina pubblica per gioco:
  icona senza link.
- Una cosa trovata di passaggio, **non usata**: le righe Amazon portano
  `details.websites` (`OFFICIAL`, `STEAM`, `GOG`, `TWITTER`…). Potrebbero dare
  un link per il gioco; è un'altra cosa dal link al negozio Amazon, e se ne
  riparla se serve.

## Da decidere

1. **Salvare `image_url` e `store_page` sugli scarti** significa una migration
   (drizzle-kit) e un campo in più su ciascun `LibraryEntry` dei cinque import.
   Le tocca quasi tutti. Se pesa, il minimo è Steam subito (nessuna modifica
   all'import) e gli altri in un secondo tempo.

## In che ordine

1. **Il guscio della sezione**: layout con menu, le quattro rotte, il rimando da
   `/account`, i conteggi, Tailwind fuori dalla pagina.

   **Fatto** (02/10/2026). `_app.account.tsx` è la cornice (titolo, menu,
   `Outlet`, e il controllo della sessione di prima); le sezioni sono
   `_app.account.{profilo,librerie,da-sistemare,nascosti}.tsx`, e
   `_app.account.index.tsx` rimanda al profilo con `replace`. Il menu è
   `AccountNav` ([account-nav.tsx](../apps/web/components/account-nav.tsx)):
   colonna da `$md`, riga che scorre sotto, un `YStack` solo che cambia
   direzione col CSS. **Niente è stato riscritto dentro le sezioni**: i
   componenti di prima (schede degli account, modulo, scarti, nascosti) sono
   stati spostati così come sono, e si rifanno ai passi 3, 4 e 5. Tre cose che
   il passo ha dovuto aggiungere:
   - **`NavItem` ha `trailing`**, il numero a destra. Il test di accessibilità
     ha bocciato la prima versione: `$color10` sulla voce accesa fa 3.09, ne
     servono 4.5, quindi il numero ha il colore dell'etichetta spenta. Storia
     `WithCount`.
   - **`UnresolvedImports` ha `scope`** (`pending` o `hidden`): gli scarti da
     sistemare e quelli nascosti stavano nello stesso riquadro, in un
     `<details>`, e ora sono due sezioni. Il mucchio vuoto non disegna niente, e
     a dire «non c'è niente» è la sezione, con un `EmptyState`.
   - **`useAccountCounts`** conta le voci da sistemare e i nascosti (voci
     d'import più giochi nascosti dal backlog, una riga sola per il totale).
     Zero non si scrive: il numero dice che c'è qualcosa.

   Provato sulla pagina vera, con un utente di prova (registrato apposta e
   cancellato alla fine), a 1440 e 412 px: `/account` va al profilo, ogni voce
   porta alla sua sezione e si accende, «indietro» torna alla sezione di
   prima, nessun errore in console, nessuno scorrimento orizzontale. **Non
   visto**: i numeri accanto alle voci con dati veri (l'utente di prova non
   ha scarti), e le schede degli account (non ne ha); li vede l'utente sul
   proprio account. Per chi riprova con Playwright: la pagina tiene aperta una
   connessione per gli eventi, quindi `networkidle` non scatta mai.

2. **Profilo**: nome, password, sessioni, zona dei dati. Test dei dialoghi con
   Better Auth.

   **Fatto** (02/10/2026). Cinque schede in
   [\_app.account.profilo.tsx](../apps/web/src/routes/_app.account.profilo.tsx),
   ognuna un componente in `apps/web/components`: `profile-details` (nome
   modificabile sul posto, email no), `change-password` (dialogo),
   `active-sessions`, `account-data` (esporta e cancella). Niente Tailwind e
   nessuna dipendenza nuova: il browser e il sistema operativo dallo user agent
   li ricava `lib/user-agent.ts`, e un UA che non riconosce dà «Dispositivo
   sconosciuto». Il codice d'errore `INVALID_PASSWORD` è in `lib/auth-error.ts`.

   Scelte che il wireframe non diceva:
   - **«Esci dagli altri dispositivi» nel cambio password è spuntato di
     default**: chi cambia la password perché teme che qualcuno la conosca vuole
     quello, e questa sessione resta.
   - **L'ora delle sessioni è quella dell'accesso**, non dell'ultima attività:
     Better Auth aggiorna la sessione al più una volta al giorno.
   - **Il bottone «Cancella account» si apre**, a differenza di quello
     dell'esportazione: il dialogo (nome utente da scrivere) c'è già, e la
     conferma è spenta da una costante, `DELETION_AVAILABLE`, che lo step 16
     accende. Il wireframe lo disegnava spento: così invece la schermata si vede.

   Provato sulla pagina vera con un utente di prova, e due sessioni da
   dispositivi finti: le tre sessioni compaiono con «questo dispositivo» su una
   sola e «Safari · iPhone» e «Firefox · Windows» riconosciuti; «Esci» ne toglie
   una; il nome si salva (e cambia anche l'avatar); con la password attuale
   sbagliata il dialogo dice «La password attuale non è corretta.»; con quella
   giusta la password cambia, la vecchia non entra più (401), la nuova sì, e
   le altre sessioni sono chiuse. A 412 px nessuno scorrimento orizzontale.

   **Aggiunta del 02/10/2026, su richiesta**: `Badge` ha tre varianti di stato,
   `success`, `warning` ed `error`, e «questo dispositivo» è `success`. Fondo
   al passo 3 della scala dello stato, **testo al 12 e non all'11**: a 12 px
   `$green11` su `$green3` nel tema chiaro fa 4.21 e `$amber11` su `$amber3`
   4.24, e il test di accessibilità ne chiede 4.5. Le userà il passo 3 per lo
   stato delle librerie.

   **Bottoni a destra, su richiesta** (02/10/2026): nelle schede del profilo il
   bottone sta a destra del titolo, non sotto. Lo fa `CardHeaderRow`
   ([card-header-row.tsx](../apps/web/components/card-header-row.tsx)): il testo
   ha base 0 e minimo 220 px, quindi la riga va a capo solo quando il bottone
   non ci sta accanto — a 412 px, non a 800. «Esci dagli altri dispositivi» sta
   nell'intestazione di «Sessioni attive»: agisce su tutto l'elenco, e la riga
   di questo dispositivo resta senza bottoni.

   Trovato provandolo:
   - **«accesso tra 5 secondi»**: il riferimento di «X fa» si ferma al montaggio
     e una sessione aperta dopo risultava nel futuro. L'orario si limita a
     `now`.
   - **Un avviso di React su `accessibilityLabel`** compare alla prima
     notifica di qualunque pagina, anche in flussi non toccati (provato con
     l'errore di «Collega» su Librerie). Viene dal `Toast` di `@repo/ui` o dal
     Tamagui sotto, non da questo passo, e **non è stato corretto**.

3. **Librerie**: card, icone, menu, dialoghi.

   **Fatto** (02/10/2026). La domanda sulle icone aveva già risposta:
   `BrandIcon` in `@repo/ui` è una tessera col colore del marchio e il glifo
   bianco, e c'era. **Mancava Amazon**, che il commento dava per introvabile:
   è su Simple Icons (CC0), ed è entrato in `BrandIcon` (`#FF9900`). La pagina
   del gioco non lo usa ancora: il suo `STORE_BRAND` non lo elenca, e non l'ho
   toccata.

   La sezione ([\_app.account.librerie.tsx](../apps/web/src/routes/_app.account.librerie.tsx)):
   titolo e «Aggiorna tutti gli account»; una riga con l'interruttore generale,
   il «?» e «Aggiungi libreria» ([auto-sync-settings.tsx](../apps/web/components/auto-sync-settings.tsx),
   [add-store-account.tsx](../apps/web/components/add-store-account.tsx)); poi la
   griglia, `repeat(auto-fill, minmax(240px, 1fr))`, quindi tre colonne nel
   desktop largo, due in uno stretto, una sul telefono. Senza account, uno stato
   vuoto con «Aggiungi libreria».

   La scheda ([store-account-card.tsx](../apps/web/components/store-account-card.tsx)):
   icona, negozio, account (etichetta e nome del negozio), lo stato in una riga
   — `Badge` `error` «Da ricollegare», `warning` «importazione in corso», o
   «importata X fa» —, e **una riga sola in fondo**: ↻ a sinistra, «Auto» con lo
   switch a destra. Nel menu ⋮: «Dai un nome», «Ricollega» solo con il
   credenziale scaduto, «Scollega». Dare un nome e ricollegare sono dialoghi
   (`rename-account-dialog.tsx`; il ricollegamento riusa `StoreLinkForm`, che ora
   ha `onLinked` e chiude da sé il dialogo).

   Cose decise provandolo, sulla pagina vera dell'utente:
   - **La prima scheda era troppo affollata**: «Aggiorna» a parole e lo switch
     con la sua etichetta facevano tre righe. Ora ↻ è la sola icona, con il nome
     nel suggerimento e nell'`aria-label`; «Ricollega», che è il gesto da fare,
     resta a parole. Lo switch tiene «Auto» **scritto**: il suggerimento non
     compare su un telefono, e uno switch senza una parola accanto non direbbe
     cosa fa. Il nome completo («Aggiorna automaticamente») sta nell'`aria-label`
     e nel suggerimento.
   - **Stato e gesti stanno ancorati in fondo** (`grow` sul contenuto, `mt="auto"`
     su un gruppo che li tiene insieme): la griglia allunga le schede di una
     riga alla più alta, e senza l'ancora le icone ↻ stavano ad altezze
     diverse. Prima era ancorata la sola riga dei gesti, e lo stato restava in
     alto con un vuoto di misura diversa sotto. Misurato: lo stato e il ↻ stanno
     alla stessa altezza in tutte le schede di una riga.
   - **Il «?» fa due cose**: al passaggio e al focus un suggerimento, al clic la
     stessa spiegazione sotto la riga, perché il suggerimento non esiste su un
     telefono e la spiegazione serve soprattutto lì.
   - **Il ↻ gira mentre quell'account importa**, e solo quello, con un nuovo
     `Spinner` in `@repo/ui` ([spinner.tsx](../packages/ui/src/components/spinner.tsx)).
     Una prima versione con Tailwind (`animate-spin`) è stata scartata su
     richiesta; la seconda, con `Animated` di `react-native`, **ha rotto la
     pagina: 500 dal server**. Importare `Animated` sul web trascina tutto lo
     `StyleSheet` di react-native-web, che nel rendering lato server di Vite
     fallisce (`inline-style-prefixer`: «default is not a function»). Da qui la
     divisione per piattaforma: sul web una rotazione CSS (`@keyframes` in un
     `<style>` accanto all'elemento, durata in una variabile CSS, e
     `prefers-reduced-motion` deciso dal CSS, senza JavaScript che legga la
     preferenza e senza un primo render diverso dal secondo); su React Native
     `spinner.native.tsx`, con `Animated` e il driver nativo. **Quella nativa
     non è provata**: `apps/mobile` è ancora uno scheletro.
     Il bottone resta spento mentre importa, e la scheda dice «importazione in
     corso». Per vederlo senza un import vero ho intercettato la risposta di
     `accounts/list` con `syncing: true` su Steam: gira solo la sua icona (la
     trasformazione cambia fra tre istanti), le altre stanno ferme, e con
     «meno movimento» nel sistema anche quella.

   Provato con un utente di prova e sei account finti inseriti nel database
   (cancellati alla fine, insieme all'utente), a 1440 e 412 px: tre schede per
   riga a 1440, riga unica con ↻ e switch alla stessa altezza in tutte, il menu
   ha le voci giuste (con «Ricollega» solo sulla PSN scaduta), «Dai un nome»
   salva e la scheda mostra il nome, l'interruttore si accende e spegne, il
   dialogo di scollegamento si apre, nessun errore in console. **Non provato**:
   un collegamento vero dal dialogo «Aggiungi libreria» (servono credenziali
   dei negozi) e «Aggiorna», che avvierebbe un import vero.

4. **Da sistemare**: `createdAt` nel contratto e nella query (oggi
   `UnresolvedImportSchema` non lo porta); le colonne `image_url` e
   `store_page` su `unresolved_imports` e gli import che le scrivono; copertina,
   segnaposto, icona-link. Test: l'import scrive la copertina e il reimport la
   aggiorna senza toccare il resto della riga.

   **Fatto** (02/10/2026). Tutti e cinque gli import, come deciso.
   - **Dati.** Migration `0027_unresolved_image_store_page`: due colonne nullable
     su `unresolved_imports`, `image_url` e `store_page`, applicata al database
     di sviluppo (e a quello dei test dal global setup). `LibraryEntry` ha
     `imageUrl`; `recordUnresolved` scrive `imageUrl` e `storePage` e li
     **riscrive al reimport**, senza toccare `hiddenAt` e `hiddenKind`. Steam,
     GOG e PSN avevano già `storePage` sulla voce, per i possessi: ora arriva
     anche agli scarti. Per le copertine, GOG (`image`), Epic (`keyImages` del
     catalogo, che l'import chiamava già per i titoli), PSN e Amazon la
     estraggono dalla risposta che già scaricano: **nessuna richiesta in più**.
     Steam non salva niente: `storeCoverUrl` in `@repo/contracts` la compone
     dall'appid.
   - **Contratto.** `UnresolvedImportSchema` ha `createdAt`, `imageUrl` e
     `storePage`; `createdAt` è la data di «aggiunta», e il reimport non la
     tocca.
   - **UI.** `UnresolvedRow` ([unresolved-row.tsx](../apps/web/components/unresolved-row.tsx)),
     senza Tailwind: copertina 44×64 (ritagliata, perché PSN e Amazon sono
     quadrate), nome, l'**icona del negozio che è il link** dove un link c'è,
     e «Steam (sanvisimo) · 3h · aggiunta 2 ott 2026». Dove l'immagine manca, o
     non si carica, un riquadro con l'icona del negozio. La usano sia «Da
     sistemare» sia i nascosti, che il passo 5 rifarà a tab. `STORE_BRAND` ora è in
     `lib/store-brand.ts` e lo usano anche le schede delle librerie.
   - **Provato** con un utente di prova e otto scarti (uno per negozio, più un
     404 di Steam, un'immagine Amazon rotta e due voci senza immagine, poi
     cancellati): le copertine vere si caricano per Steam, GOG, Epic, PSN e
     Amazon; le immagini che danno 404 e quelle assenti cadono sul riquadro con
     l'icona; i link sono giusti (Steam, GOG, PSN); nessun errore in console né
     scorrimento orizzontale a 1440 e 412 px. Test: 361 nell'API (nuovi: il
     reimport che riscrive copertina e indirizzo senza toccare il nascondere,
     la voce senza niente che resta nulla, `gogCoverUrl`, `epicCoverUrl`,
     `fetchGogLibrary`, `fetchAmazonLibrary`, l'immagine che passa da PSN).
   - **La copertina è anche nel dialogo «Collega al gioco giusto»**, su richiesta
     dell'utente: a sinistra del testo «Cerca su IGDB…», della stessa misura
     delle copertine dei risultati (90 × 128), così la voce si confronta con la
     lista a colpo d'occhio. `UnresolvedCover` è stata estratta da
     `UnresolvedRow` ed è la stessa della riga (44 × 64); dove manca, il riquadro
     con l'icona del negozio. Provato a 1440 e 412 px, con una voce con
     copertina e una senza: nessuno scorrimento orizzontale del dialogo.
   - **Trovato.** Una voce GOG **senza `url`** ha il link alla libreria
     dell'utente (`https://www.gog.com/en/account`), perché `storePageUrl` fa
     così per i possessi: l'icona è cliccabile e porta lì. Va bene finché la
     regola è una sola.
   - **Non provato** con il tuo account vero: **le righe che hai oggi non
     hanno ancora la copertina**, tranne Steam, che si compone. La prendono al
     prossimo import, quindi con «Aggiorna tutti gli account» in Librerie, o
     all'aggiornamento automatico. Non l'ho lanciato io: chiama i negozi con i
     tuoi token.

5. **Nascosti**: i tab, la lista unita; la query dei giochi nascosti e quella
   delle voci si compongono nella pagina, senza una procedura nuova se
   l'ordinamento regge.

   **Fatto** (02/10/2026). [\_app.account.nascosti.tsx](../apps/web/src/routes/_app.account.nascosti.tsx)
   ha cinque tab — App, DLC, Contenuto extra, Versione di prova, Non
   interessato — ciascuno col suo numero, nell'ordine dei `hiddenKindValues`.
   - **Il tab sta nell'URL**: `?tipo=dlc`. «Indietro» torna al tab di prima, e un
     valore che non è un tipo si ignora. Senza `?tipo` si apre **il primo che ha
     qualcosa dentro**, non «App» a prescindere: arrivare su un elenco vuoto con
     quattro numeri accanto sarebbe un giro a vuoto. Con niente nascosto, lo
     stato vuoto di tutta la sezione.
   - **I tab sono un componente nuovo, `Tabs`** ([tabs.tsx](../packages/ui/src/components/tabs.tsx)).
     La prima versione era un `ToggleGroup`, e visto sulla pagina vera era
     brutta: il `ToggleGroup` è una scelta di vista in una cornice di bottoni,
     col numero attaccato al testo; e il riquadro che lo faceva scorrere aveva
     `overflow: scroll`, che su Windows disegna **sempre** le barre — vertical
     e orizzontale — anche quando non servono. Lo stesso difetto era nel menu
     dell'account sul telefono (`account-nav.tsx`, dal passo 1). Ora: testo
     senza cornice sopra una linea, sottolineatura con l'accento sul tab acceso,
     il numero in un `Badge` piccolo accanto (zero non si scrive); ruoli
     `tablist` e `tab`, `aria-selected`, un solo tab nella sequenza del Tab e le
     frecce, Home e Fine per passare dall'uno all'altro (attivazione
     automatica). Dove non stanno — un telefono — **scorrono senza barra**: un
     `ScrollView` orizzontale di Tamagui con l'indicatore nascosto, come la
     galleria, e il tab acceso si porta da sé in vista (un indirizzo aperto su
     «Non interessato» non lo lascia fuori dal bordo). Il menu dell'account usa
     `overflowX: auto` con `scrollbarWidth: none`. **Non c'è la sfumatura sul
     bordo** che avevo proposto: il tab tagliato dal bordo dice già «ce ne sono
     altri», e una sfumatura che compare solo quando si può scorrere vuole
     JavaScript che misuri. Si aggiunge se serve. Il `ToggleGroup` resta per le
     viste del backlog. Storie `Default`, `Narrow`, `Keyboard` (ruolo, nome col
     numero, tastiera) e `Themes`, con axe.
   - **«Non interessato» unisce** le voci d'import `unwanted` e i giochi nascosti
     dal backlog, in una lista sola **per data di nascondimento, i più recenti
     per primi**. Gli altri quattro tipi sono solo voci d'import, perché un
     gioco del backlog si nasconde senza tipo. Le due query si compongono nella
     pagina (`useHiddenItems` in [hidden-list.tsx](../apps/web/components/hidden-list.tsx)),
     senza una procedura nuova: l'ordine lo fa il client.
   - **I giochi si portano al massimo 100**, e il numero del tab è il totale, non
     quanti ne sono caricati. Oltre, il link «Vedili tutti nel backlog» porta
     alla vista con filtri e ricerca. Una finestra, non un secondo backlog.
   - **Le righe**: `RowFrame` è la cornice comune, `UnresolvedRow` (che ora
     scrive «nascosta {data}» sui nascosti) e il nuovo `HiddenGameRow` (copertina
     IGDB, nome col link alla scheda, badge del tipo e dei possessi, «Mostra di
     nuovo» col toast «Annulla»). Le voci d'import hanno «Collega» e «Mostra di
     nuovo».
   - **Tolti**: `HiddenEntries` (il suo mestiere è ora di `HiddenList`), il
     `scope` di `UnresolvedImports` — che è tornato a fare una cosa sola, i «da
     sistemare», senza Tailwind e senza il riquadro attorno — e le stringhe
     `hiddenTitle` e `hiddenEntries.title`.

   Provato con un utente di prova — sette voci nascoste di ogni tipo e tre
   giochi nascosti, poi cancellati — a 1440 e 412 px: i numeri dei tab tornano
   (App 2, DLC 1, Extra 1, Prova 1, Non interessato 5), «Non interessato» alterna
   giochi e voci nell'ordine giusto per data, il clic cambia l'URL, «indietro» lo
   riporta, `?tipo=boh` si ignora, «Mostra di nuovo» su una voce la toglie dal
   tab e dal numero del menu e la rimette in «Da sistemare». Nessun errore in
   console né scorrimento orizzontale. **Non visto**: le copertine IGDB dei
   giochi nascosti (qui sono bloccate), e il tuo account vero.
   Ho tolto dal database anche i tre giochi finti inseriti in `games`, che è
   condivisa: nessun backlog li usava.

6. **Chiusura**: `apps/web/CLAUDE.md`, screenshot a 412 e 1440 px, piano
   chiuso.

   **Fatto** (02/10/2026). `apps/web/CLAUDE.md` ha la pagina account — le sezioni,
   i numeri del menu, il profilo con Better Auth, le librerie e l'ancora in
   fondo, gli scarti con copertina e link, i nascosti a tab, la trappola
   dell'`overflow: scroll` e come provarla con Playwright; `packages/ui/CLAUDE.md`
   la differenza fra `Tabs` e `ToggleGroup`; `docs/import-librerie.md`
   `image_url` e `store_page` (al passo 4). **Gli screenshot di chiusura no**:
   l'utente guarda la pagina in diretta sul suo account, che è l'unica con dati
   veri. Controlli di chiusura: lint e `tsc` puliti in tutti i workspace
   (`apps/web`, `apps/api`, `apps/mobile`, `packages/ui`, `contracts`, `db`,
   `auth`); 361 test nell'API e 135 in `@repo/ui`. Prettier segnala solo i
   `meta` di drizzle-kit, generati, come tutti i precedenti.

   **Resta fuori, e annotato:**
   - **Tailwind** in `resolve-import-dialog.tsx`, `store-link-form.tsx` e
     `unlink-account-dialog.tsx`: i dialoghi dell'account, da riscrivere con la
     fine dello step 12.
   - **La sfumatura sul bordo dei tab** che scorrono: non c'è, il tab tagliato
     dal bordo dice già «ce ne sono altri».
   - **`spinner.native.tsx` non è provato**: `apps/mobile` è ancora uno scheletro.
   - **L'avviso di React su `accessibilityLabel`** alla prima notifica, dal
     `Toast` di `@repo/ui` o dal Tamagui sotto; e il `No font size found icon`
     nella console. Non sono di questo lotto e non sono stati indagati.
   - **Le righe di scarti già in tabella** non hanno ancora la copertina, tranne
     Steam: la prendono al prossimo import.
   - **Amazon in `game-page.tsx`**: `BrandIcon` ora ha Amazon, e la pagina del
     gioco non lo usa ancora.

## Verifica

- `pnpm lint`, `pnpm check-types`, `pnpm test` (le procedure toccate).
- A 412 e 1440 px, da collegato: ogni sezione, le card con 6 account, il menu
  ⋮, i dialoghi, il menu a riga scorrevole sul telefono.
- Un account con credenziale scaduto mostra «Ricollega».
- Nessun errore in console; nessuno scorrimento orizzontale a 412 px.

## Fuori da questo lotto

- cambio email e reset password: serve un sender di email;
- l'esportazione e la cancellazione vere: step 16;
- la card dei giochi (12e).

## Sessione non fresca (06/10/2026)

**Trovato in produzione**: «Active sessions» mostra «I couldn't read your
sessions». La chiamata `list-sessions` risponde 403 con
`{"code":"SESSION_NOT_FRESH"}`: Better Auth rifiuta l'operazione a una sessione
più vecchia di `session.freshAge` (un giorno di default) finché non si rifà il
login. Non è un guasto: è la schermata che mette ogni errore sotto la stessa
frase. Env e CORS in produzione sono a posto (controllati nel container).

**Letto il sorgente di Better Auth 1.6.27**: il controllo di freschezza
(`freshSessionMiddleware`) è **solo** su `list-sessions` e `unlink-account`
(che non usiamo). Revoca di una sessione, «Esci dagli altri dispositivi»,
cambio password e `update-user` usano `sensitiveSessionMiddleware`, che non
guarda l'età. La prima versione di questo piano supponeva il contrario.

**Scartato**: gestire il codice nell'interfaccia («devi accedere di nuovo» e un
bottone che fa `signOut()`). Per rivedere i propri dispositivi si dovrebbe
rifare il login ogni volta che la sessione ha più di un giorno, per un'azione
di sola lettura. **Scartato anche un `freshAge` lungo**: si misura da
`createdAt`, che non si rinnova, e una sessione usata ogni giorno vive
all'infinito, quindi supera qualunque soglia finita; l'errore tornerebbe a data
fissa, e nel frattempo un cookie rubato resterebbe «fresco» per tutto il periodo.

**Decisione**: `session.freshAge: 0` in
[packages/auth/src/index.ts](../packages/auth/src/index.ts), che spegne il
controllo.

- **Cosa si perde**: `unlink-account` (non lo usiamo, e senza provider social
  non c'è niente da scollegare) e il controllo di `delete-user` senza
  password (l'endpoint è disabilitato: `user.deleteUser.enabled` non c'è). Lo
  step 16 deve quindi chiedere la password lui: riga aggiunta a
  [docs/ordine-sviluppo.md](../docs/ordine-sviluppo.md).
- **A ogni salto di versione di Better Auth**: se un endpoint nuovo usa
  `freshSessionMiddleware`, lì la protezione non c'è più.
- **Il rimbalzo dell'account** ([\_app.account.tsx](../apps/web/src/routes/_app.account.tsx)):
  quando la sessione sparisce rimanda a `/login` con `next` uguale alla sezione
  aperta, come fa `_app._private`, così dopo l'accesso si torna al profilo e non
  alla home. È un difetto a sé, valeva anche per una sessione scaduta.

**Provarlo**: da loggati, nel DB portare `session.created_at` e `updated_at`
della propria sessione a più di un giorno fa e aprire `/account/profile`: la
lista delle sessioni si carica. Da anonimi, aprire `/account/libraries`: si va a
`/login?next=/account/libraries` e, dopo l'accesso, si torna lì. In produzione
serve il deploy del server (la config sta lì).

**Fuori**: un test automatico (è una riga di config, e `apps/web` non ha test
di componente); il testo legale (non cambia cosa si raccoglie); una scadenza
assoluta delle sessioni, che sarebbe un'altra decisione di prodotto.
