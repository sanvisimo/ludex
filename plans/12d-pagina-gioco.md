# Step 12d — La pagina del gioco

**Struttura approvata il 30/09/2026** sul wireframe
([12d-pagina-gioco.excalidraw](12d-pagina-gioco.excalidraw): si apre
trascinandolo su excalidraw.com), con la parte desktop corretta dall'utente.
**Ordine dei passi approvato** lo stesso giorno. Sotto ogni passo, man mano,
cosa è stato fatto e cosa l'ha smentito.

## Contesto

Il piano del 12a dava a questo lotto **card e pagina del gioco**. La card
resta **in sospeso** (decisione del 30/09/2026): si decide dopo, quando la
pagina avrà tutti i suoi dati, scegliendo fra quelli cosa sale sulla card.
Qui c'è la pagina.

La pagina di oggi
([\_app.games.$id.tsx](../apps/web/src/routes/_app.games.$id.tsx), 216 righe)
è ancora quella di prima dello step 12: una colonna di card, copertina e
trama, attributi, voti della critica, tempi HLTB, il blocco del backlog.

## I riferimenti dell'utente

- **ROMM**: screenshot, durata del gioco, i remake, i giochi simili.
- **Augmented Steam**: il riquadro dei voti (Metacritic critica e utenti,
  OpenCritic col tier).
- **GOG**: una hero con l'immagine principale e la gallery; dove GOG ha il box
  d'acquisto vanno HLTB e i voti della critica, **un riepilogo con un dialog
  di dettaglio**.

## Com'è oggi, misurato

- **Abbiamo e mostriamo**: copertina, titolo, tipo, anno, trama, generi, temi,
  modalità e prospettive, i voti fonte per fonte (`scores`), i tempi HLTB
  con conteggi e flag, stato, voto, note, tag e copie.
- **Abbiamo e non mostriamo da nessuna parte**: ore giocate e ultima partita
  per copia (`ownerships.playtimeMinutes`, `lastPlayedAt`), la data
  d'acquisto (solo nel form), il gioco padre di un DLC (`parentIgdbId`).
- **Non abbiamo**: artwork, screenshot, video, sviluppatore ed editore,
  remake, remaster, giochi simili. Sono tutti campi della chiamata di
  dettaglio IGDB che l'enrichment fa già (`DETAIL_FIELDS` in
  [igdb.ts](../apps/api/src/external/igdb.ts)): zero richieste in più, ma una
  migration e un backfill forzato di `games`.
- **Non abbiamo e non prendiamo**: lo User Score di Metacritic e i premi
  (Steam Awards) dello screenshot di Augmented Steam. Nessuna delle nostre
  fonti li dà.

## Decisioni prese

1. **Remake e simili: tutti visibili.** Quelli che hai sono marcati e aprono
   la loro pagina; gli altri mostrano solo copertina e nome. Per questo nome e
   copertina si salvano anche per i giochi che non sono in `games`. **A
   tendere** da lì si aggiungeranno al backlog o alla wishlist: è lo step 15,
   non questo. **Non si popola `games` coi giochi legati** (30/09/2026): una
   decina di simili per gioco sono migliaia di righe che nessuno possiede,
   ciascuna col suo enrichment e il budget OpenCritic, e una riga di `games`
   non si cancella. La riga si creerà quando l'utente ci clicca; fino ad
   allora `game_related` tiene l'`igdbId`, e la JOIN lo ritrova da sola.
2. **La card in sospeso**, vedi sopra.
3. **Lo schizzo desktop corretto dall'utente** (commit `b733fd4`): generi e
   temi diventano badge sotto il titolo, nella hero, come su GOG e Steam; nella
   colonna laterale «Durata e critica» sta sopra e «Nel tuo backlog» sotto; il
   negozio di ogni copia è un'icona al posto del nome, e l'icona è il link alla
   pagina del gioco su quel negozio.
4. **Ogni fonte ha il suo link, con l'icona**: HLTB, OpenCritic, Metacritic e
   IGDB, per correttezza verso chi il dato l'ha prodotto.
5. **Il riferimento alla pagina del negozio sta sulla copia**, in una colonna
   di `ownerships`, col pezzo che il negozio dà; l'URL intero si compone al
   momento di mostrarlo. Non `external_ids`: per PSN lì c'è il `titleId`, che
   nessuna pagina usa.
6. **GOG senza `url`** porta a `https://www.gog.com/en/account`, la libreria
   dell'utente.
7. **Epic: niente link**, l'icona e basta.
8. **Il trailer: `iframe` sul web, app di YouTube su mobile.** Un componente
   con due file gemelli in `@repo/ui`: `.web.tsx` monta l'`iframe`
   (`youtube-nocookie.com`) solo quando si preme «play», e fino ad allora
   mostra la miniatura, così aprire la pagina non carica gli script di
   YouTube; quello nativo apre il video nell'app. Le icone dei marchi sono
   tessere col colore del marchio: Simple Icons (CC0), Xbox e Nintendo dalle
   icone di IGDB, HowLongToBeat da PCGamingWiki; Amazon resta col nome.

## La proposta (schizzo v1)

**Desktop**, dentro il guscio:

- **Hero** larga quanto il contenuto: l'artwork IGDB; se manca il primo
  screenshot; se manca anche quello la copertina sfocata. Sopra, in basso,
  copertina, titolo col tipo, anno, sviluppo ed editore, «DLC di…» se c'è, e
  generi, temi, modalità e prospettive come badge.
- **Colonna principale**: la gallery come GOG (lo screenshot o il trailer
  scelto, sotto le miniature, clic a tutto schermo), la descrizione, remake e
  remaster, giochi simili.
- **Colonna laterale**, al posto del box d'acquisto:
  - **Durata e critica**: i tre tempi HLTB principali, un voto per fonte
    (OpenCritic col tier, Metacritic con quello della tua piattaforma, IGDB),
    ciascuna con l'icona che porta alla sua pagina, e **Dettagli**.
  - **Nel tuo backlog**: lo stato col bottone alla Trakt, il voto, le copie
    (icona del negozio col link, piattaforma, ore giocate, ultima partita,
    data d'acquisto), note e tag, Modifica e Nascondi. Se il gioco non è tuo:
    «Aggiungi al backlog».
- **Dialog «Dettagli»**: HLTB coi quattro tempi, le segnalazioni e
  solo/coop/versus; la critica fonte per fonte, con mediana, percentuale che
  lo consiglia, tier, e Metacritic per piattaforma con positive, miste e
  negative.

**Telefono**: una colonna, nell'ordine del desktop. La hero coi badge, durata
e critica, il tuo backlog; poi la gallery che scorre di lato, la descrizione
in tre righe con «altro», remake e simili che scorrono di lato. «Dettagli»
apre lo stesso dialog.

## I link ai negozi

Misurati col probe del 30/09/2026, i risultati stanno in
[negozi.md](../docs/negozi.md), «Il link alla pagina del gioco». Il link è
**della copia**: viene da ciò da cui la copia è nata.

| Copia                             | Da dove viene il link                          | Se manca                         |
| --------------------------------- | ---------------------------------------------- | -------------------------------- |
| Steam                             | l'appid                                        | —                                |
| GOG                               | `url` di `getFilteredProducts`, **non** `slug` | `https://www.gog.com/en/account` |
| PSN, dagli acquisti               | `productId` → `/product/{productId}`           | —                                |
| PSN, dai giocati (i dischi)       | `concept.id` → `/concept/{conceptId}`          | —                                |
| Epic                              | lo slug non sta nei nostri dati                | icona senza link                 |
| Amazon                            | nessuna pagina pubblica per gioco              | icona senza link                 |
| Disco dichiarato, aggiunta a mano | nessuno                                        | icona senza link                 |

GOG e PSN il dato lo mandano già, ma oggi lo buttiamo: va letto e salvato
all'import. Le copie importate finora prendono il link al prossimo import
dell'account.

## In che ordine

1. **I dati IGDB.** Nella chiamata di dettaglio entrano `artworks`,
   `screenshots`, `videos`, `involved_companies` (sviluppo ed editore),
   `remakes`, `remasters` e `similar_games` con nome e copertina. Dove vanno:
   - su `games`, perché sono del gioco e uguali per tutti: gli `image_id` di
     artwork e screenshot, i video (id YouTube e nome), sviluppatori ed
     editori. Si mostrano e basta, nessuno ci filtra: array, non tabelle;
   - in una tabella nuova, `game_related` (gioco, tipo, `igdbId`, nome,
     copertina), perché remake e simili possono non essere in `games` e «ce
     l'hai» è una JOIN su `igdbId` → `games` → `backlog`. L'enrichment la
     riscrive intera a ogni giro, dentro la sua transazione.

   Il test è sulla riscrittura idempotente di `game_related`. Per i giochi
   già arricchiti un arnese sul modello di `igdb:types`, 500 id per
   richiesta: sulle ~2000 righe di prova sono quattro richieste. Stampa anche
   quanti giochi hanno artwork, screenshot, video, remake e simili: è la
   misura di quanto spesso la hero ripiega e le sezioni restano vuote. Va
   lanciato in locale, dove ci sono le credenziali IGDB.

   **Fatto**, tranne il giro vero dell'arnese. Migration `0025`: le cinque
   colonne su `games` (null = mai chiesto, lista vuota = IGDB non ne ha) e
   `game_related` con l'enum `related_kind`. La scrittura dell'enrichment è
   diventata `saveIgdbMetadata`, la stessa per il job e per l'arnese, che
   scrive tutto ciò che IGDB sa e non solo i campi nuovi: così le due strade
   non lasciano un gioco in uno stato che l'altra non produce. L'arnese è
   `pnpm --filter api igdb:media`. Una correzione al piano: **100 id per
   richiesta, non 500**, perché ogni gioco si porta dietro screenshot, simili
   e id dei negozi espansi; sulle ~2000 righe di prova sono venti richieste,
   cinque secondi. Test: media e autori scritti, `game_related` riscritta
   senza accumulare e senza tenere ciò che IGDB ha tolto, l'arnese che
   riempie, non richiede due volte e lascia candidato chi IGDB non conosce.
   **Resta da fare**: lanciare `igdb:media` in locale e scrivere qui la
   copertura che stampa.

2. **I link ai negozi.** La colonna su `ownerships`, scritta dagli import di
   Steam (l'appid), GOG (`url`) e PSN (`product/…` dagli acquisti,
   `concept/…` dai giocati), e **riscritta al reimport**, o le copie di oggi
   non la prenderebbero mai. La composizione dell'URL è una funzione pura in
   `@repo/contracts`, che serve uguale a web e mobile. Test: l'import la
   scrive, il reimport la aggiorna senza toccare il resto della copia.

   **Fatto.** Migration `0026`: `ownerships.store_page`. Steam scrive
   `app/{appid}`, GOG l'`url` del prodotto (solo se comincia con `/`), PSN
   `product/{productId}` sugli acquisti e `concept/{conceptId}` sui dischi. Al
   conflitto va in COALESCE come le ore: il reimport la dà alle copie di prima,
   una scrittura che non la porta non la cancella. `storePageUrl` sta in
   `packages/contracts/src/store-links.ts`, e `OwnershipSchema` porta
   `storePage`. **Limite noto**: il link PSN è fisso sulla regione `it-it`,
   l'unica provata; la regione dell'account PSN non la salviamo. Test: il
   reimport che dà la pagina a una copia che non l'aveva e non la toglie a
   chi l'ha, e le due forme PSN in `buildPsnEntries`.

3. **Il contratto.** `games.byId` porta i dati nuovi, il gioco padre di un
   DLC (nome, e l'id se è in `games`), remake e simili col «ce l'hai» di chi
   guarda, e i riferimenti delle quattro fonti per i loro link (id HLTB, id
   OpenCritic, slug Metacritic, slug IGDB). Il formato di ciascun link va
   verificato a mano su un gioco vero prima di scriverlo.

   **Fatto.** `GameDetailSchema` porta media e autori, `parent` (id e nome,
   solo se il padre è in `games`), `related` con `gameId` e `owned` di chi
   guarda, e `links` delle quattro fonti composti dal server
   (`sourceLinks` in `games.ts`). Le copie portano anche `acquiredAt`, che il
   contratto non aveva. I formati li ha provati l'utente su Cyberpunk 2077 e
   Control: HLTB `/game/{id}`, Metacritic `/game/{slug}/`, IGDB
   `/games/{slug}`. **OpenCritic** vuole `/game/{id}/{slug}`: senza slug dà
   404, con uno qualunque apre la pagina giusta. Il suo slug non lo salviamo
   e si usa quello IGDB, che quasi sempre coincide. Test: il «ce l'hai» sui
   correlati (tuo, in `games` ma non tuo, fuori da `games`, da sloggati), il
   padre presente e assente, i link.

4. **I componenti in `@repo/ui`**: la gallery (immagine grande, miniature,
   frecce, a tutto schermo; su telefono scorre di lato), la fila che scorre
   di lato per remake e simili, le icone dei marchi. Per le icone va deciso
   da dove vengono: Simple Icons (CC0) copre i negozi, ma per HLTB e
   OpenCritic va verificato che ci siano e con che licenza.

   **Fatto.** `BrandIcon`: dodici tessere col colore del marchio e il glifo
   bianco, con un bordo chiaro sottile perché le nere (Steam, EA,
   Metacritic, HLTB) restino visibili sul tema scuro. `Gallery`: elemento
   scelto in grande, miniature che scorrono, frecce spente agli estremi,
   immagine a tutto schermo nel `Dialog`. `YoutubeVideo` coi due gemelli.
   **Per remake e simili nessun componente nuovo**: la fila è lo
   `ScrollView` orizzontale che `@repo/ui` esporta già. Storie con axe in
   Chromium, 120 in tutto.

5. **La pagina**, riscritta sullo schizzo: hero coi badge, colonna
   principale, colonna laterale con durata e critica, il dialog «Dettagli»,
   il blocco del backlog; su telefono una colonna nello stesso ordine.
   Tailwind esce da questa pagina, come dalle altre dello step 12.

   **Fatto**, e provato sulla pagina vera a 375, 900 e 1440 px con un gioco
   di prova (le immagini IGDB e YouTube, che la rete del container blocca,
   sostituite da segnaposti). I pezzi stanno in `apps/web/components/game-page.tsx`;
   `HltbTimes` e `CriticScores` sono diventate le due sezioni del dialog
   «Dettagli», in Tamagui. Le colonne si affiancano da `$lg`; sotto, una
   colonna con la laterale **prima** nell'HTML, e `row-reverse` la rimette a
   destra sul desktop. Metacritic mostra il voto della piattaforma su cui hai
   il gioco, se c'è. `AddGameDialog` accetta un gioco già scelto, così dalla
   pagina si aggiunge senza cercarlo. Nessuna classe Tailwind nei file della
   pagina. Trovato sulla pagina vera e corretto: la miniatura del trailer
   usciva dal riquadro e copriva il «play» (mancava `position: relative`);
   a 375 px le caselle dei tempi spezzavano «Completionist» a metà, ora vanno
   a capo intere; «ultima partita» è una data e non «3 mesi fa», che server e
   browser avrebbero scritto diversi.

5b. **Le icone delle piattaforme**, dopo aver visto la pagina (30/09/2026).
Il nome della piattaforma sulle copie diventa un'icona, quelle di RomM:
disegni colorati dell'hardware, non loghi, e ci sono anche per Windows e
DOS, che nessuna raccolta di loghi ha. L'abbinamento si fa con la tabella
di RomM che lega le sue piattaforme agli id IGDB, che `platforms` ha su 87
righe su 96; più otto a mano. Si convertono in PNG da 96 px, gli ICO come
gli SVG, perché React Native gli ICO non li legge, e stanno in
`apps/web/public/platforms/` con la licenza: **RomM è AGPL-3.0**, e una
parte delle icone viene da Libretro, **CC BY 4.0**, con l'obbligo di
citarla. Il componente è `PlatformIcon` in `@repo/ui`, su un cerchio
chiaro fisso perché alcune icone sono scure. Dove l'icona manca resta il
nome.

**Fatto.** 83 icone su 96 piattaforme: 75 abbinate dall'id IGDB, 8 a
mano (Flash, Game & Watch, Mega Duck, PC-FX, SuperGrafx, Switch 2, Sega
CD, TIC-80, e Xbox One per nome); le 13 senza sono piattaforme rare.
336 KB in tutto. Provenienza, commit di RomM e licenza file per file in
`apps/web/public/platforms/LICENSE.md` (9 da Libretro, CC BY 4.0; 74 da
RomM, AGPL-3.0). L'elenco di chi ha l'icona è in
`apps/web/lib/platform-icons.ts`. Sulle copie il nome della piattaforma
sparisce dove c'è l'icona, e resta nel suo `aria-label`.

5c. **La hero a tutta larghezza e il guscio nuovo**, dopo aver visto la
pagina sul telefono (01/10/2026). La hero aveva i margini della pagina e gli
angoli arrotondati, anche sul desktop; ora va da un bordo all'altro della
finestra, e titolo e badge restano allineati alla colonna da 1200 px. Per
farla arrivare ai bordi il guscio perde la barra laterale, e già che c'era
l'utente l'ha ridisegnato (senza wireframe, per sua scelta):

- **una barra sola**: a sinistra il nome, che porta al catalogo; a destra
  l'avatar, sempre visibile, col menu di backlog, account, tema, lingua e
  uscita. Da anonimo tema, lingua, «Accedi» e «Registrati»;
- **in alto sul desktop, in basso sul telefono**, perché lì i menu si
  aprono dal basso. Col fondo della pagina e senza bordo (fra «sopra la
  hero» e «sopra la pagina» l'utente ha scelto la seconda);
- **niente più drawer** né voce «Catalogo»: c'è il nome;
- **un footer**: «© anno sanvisimo», «Made with ♥ in Italy & EU», crediti,
  privacy, termini.

**Fatto.** `Page` ha uno spazio `hero` sopra il suo contenitore; `NavLink`
non serve più ed è tolto (`NavItem` resta in `@repo/ui`). Provato sulla
pagina vera a 375 e 1440 px, da anonimo e da collegato: il menu dell'avatar
in basso si apre verso l'alto da solo. Trovato e corretto: la colonna
principale della pagina (gallery, descrizione, simili) sul telefono era alta
zero, per la base 0 di `flex={1}` quando le colonne si impilano, e il
contenuto le usciva sotto; prima non si vedeva perché dopo non c'era niente,
col footer sì. **Da guardare dopo**: le soglie di `/backlog` (la colonna dei
filtri da `$xl`) erano tarate sui 240 px della barra laterale, che ora non
c'è: funziona, ma ora la pagina ha 240 px in più.

6. **Chiusura**: `docs/modello-dati.md` (le colonne nuove e
   `game_related`), `apps/web/CLAUDE.md`, questo piano. Gli screenshot di
   chiusura no: la pagina la guarda l'utente, e qui le immagini IGDB sono
   bloccate. Il lotto si chiude quando l'utente dice che la pagina è pronta.
