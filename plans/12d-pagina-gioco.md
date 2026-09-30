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
3. **Il contratto.** `games.byId` porta i dati nuovi, il gioco padre di un
   DLC (nome, e l'id se è in `games`), remake e simili col «ce l'hai» di chi
   guarda, e i riferimenti delle quattro fonti per i loro link (id HLTB, id
   OpenCritic, slug Metacritic, slug IGDB). Il formato di ciascun link va
   verificato a mano su un gioco vero prima di scriverlo.
4. **I componenti in `@repo/ui`**: la gallery (immagine grande, miniature,
   frecce, a tutto schermo; su telefono scorre di lato), la fila che scorre
   di lato per remake e simili, le icone dei marchi. Per le icone va deciso
   da dove vengono: Simple Icons (CC0) copre i negozi, ma per HLTB e
   OpenCritic va verificato che ci siano e con che licenza.
5. **La pagina**, riscritta sullo schizzo: hero coi badge, colonna
   principale, colonna laterale con durata e critica, il dialog «Dettagli»,
   il blocco del backlog; su telefono una colonna nello stesso ordine.
   Tailwind esce da questa pagina, come dalle altre dello step 12.
6. **Chiusura**: screenshot a 375, 900 e 1440 px, `docs/modello-dati.md`
   (le colonne nuove e `game_related`), `apps/web/CLAUDE.md`, questo piano.
   Il lotto si chiude quando l'utente dice che la pagina è pronta.
