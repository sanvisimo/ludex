# Step 12d — La pagina del gioco

**In approvazione**: struttura non ancora decisa. Si corregge sul wireframe
([12d-pagina-gioco.excalidraw](12d-pagina-gioco.excalidraw): si apre
trascinandolo su excalidraw.com) finché non è approvata; poi l'ordine dei
passi, poi il codice.

## Contesto

Il piano del 12a dava a questo lotto **card e pagina del gioco**. La card
resta **in sospeso** (decisione del 30/09/2026): si decide dopo, quando la
pagina avrà tutti i suoi dati, scegliendo fra quelli cosa sale sulla card.
Qui c'è la pagina.

La pagina di oggi
([_app.games.$id.tsx](../apps/web/src/routes/_app.games.$id.tsx), 216 righe)
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
   non questo.
2. **La card in sospeso**, vedi sopra.

## La proposta (schizzo v1)

**Desktop**, dentro il guscio:

- **Hero** larga quanto il contenuto: l'artwork IGDB; se manca il primo
  screenshot; se manca anche quello la copertina sfocata. Sopra, in basso,
  copertina, titolo col tipo, anno, sviluppo ed editore, e «DLC di…» se c'è.
- **Colonna principale**: la gallery come GOG (lo screenshot o il trailer
  scelto, sotto le miniature, clic a tutto schermo), la descrizione, generi e
  temi, remake e remaster, giochi simili.
- **Colonna laterale**, al posto del box d'acquisto:
  - **Nel tuo backlog**: lo stato col bottone alla Trakt, il voto, le copie
    con ore giocate, ultima partita e data d'acquisto, note e tag, Modifica e
    Nascondi. Se il gioco non è tuo: «Aggiungi al backlog».
  - **Durata e critica**: i tre tempi HLTB principali, un voto per fonte
    (OpenCritic col tier, Metacritic con quello della tua piattaforma, IGDB),
    e **Dettagli**.
- **Dialog «Dettagli»**: HLTB coi quattro tempi, le segnalazioni e
  solo/coop/versus; la critica fonte per fonte, con mediana, percentuale che
  lo consiglia, tier, e Metacritic per piattaforma con positive, miste e
  negative.

**Telefono**: una colonna, e l'ordine cambia. Prima ciò che serve a decidere
(hero, il tuo backlog, durata e critica), poi la gallery che scorre di lato,
la descrizione in tre righe con «altro», gli attributi, remake e simili che
scorrono di lato. «Dettagli» apre lo stesso dialog.

## Da verificare prima del piano dei passi

- Quanti giochi della libreria di prova hanno artwork, screenshot, video,
  remake e simili su IGDB: decide quanto spesso la hero ripiega e quanto
  spesso le sezioni restano vuote.
- Quanto dura il backfill sulle ~2000 righe di prova col rate limit di IGDB.
