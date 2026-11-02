# Il prezzo più basso, da IsThereAnyDeal

**Stato: fatto** (02/11/2026), voce `itadPrice` della roadmap. Branch
`feat/itad-prezzo`.

## La richiesta

Nella pagina del gioco ([game-page.tsx](../apps/web/components/game-page.tsx))
una card IsThereAnyDeal, sotto durata e critica: il link alla pagina del gioco su
ITAD e il **prezzo più basso di adesso**. Se quel prezzo è anche il **minimo storico**, un segnale.

AllKeyShop è scartato: niente API pubblica (solo un widget per affiliati),
indirizzi da indovinare dal titolo, e soprattutto rivenditori di chiavi del
mercato grigio.

## Cosa dà ITAD

Letto sulla documentazione e misurato con `itad:probe` il 02/11/2026, sul
catalogo di sviluppo (2523 giochi).

- **La chiave** è gratuita: la API Key dell'app, non il client OAuth. Va
  nell'header `ITAD-API-Key`. Limite: 1000 richieste ogni 5 minuti, poi 429 con
  `Retry-After`; chi aggira i limiti viene bandito.
- **Lookup in blocco**, `POST /lookup/id/shop/{shopId}/v1`, chiave facoltativa.
  Steam (61) con `app/<appid>`: 2287 su 2331. GOG (35) con l'id nudo: 1320 su 1331. Epic (16): **0 su 678**, i nostri id non corrispondono; solo 33 giochi
  senza id ITAD ne hanno uno Epic, quindi Epic resta fuori. In totale **2328
  giochi su 2523**.
- **Overview**, `POST /games/overview/v2?country=IT`, fino a 200 UUID:
  - `current`: negozio, prezzo, sconto. Su 200 UUID 21 **non tornano nella risposta**, e nessuno arriva con `current` nullo. I cinque guardati sono titoli vecchi o ritirati: si legge come «nessuna offerta», ma è una deduzione.
  - `lowest`: il minimo storico, a volte nullo (9 su 179, per esempio i giochi
    gratuiti).
  - `current.flag`: `H` minimo storico, `N` nuovo minimo, `S` minimo del negozio.
    Il prezzo può stare sotto `lowest` (1 o 2 su 179), quindi il segnale si legge
    da qui e non dal confronto.
  - `urls.game`: `isthereanydeal.com/game/id:<uuid>/`, che redirige alla pagina
    con lo slug (302). **Lo slug non serve**: il link si compone dall'id.
  - I voucher: col default un prezzo su sette (25 su 179) vale solo con un codice
    sconto, e con `vouchers=false` cambia.
- **Termini d'uso**: il link a ITAD è raccomandato, non obbligatorio; uso
  commerciale ammesso se l'app è pubblica; i dati non si alterano, compresi i tag
  affiliati degli `itad.link` (che non usiamo); vietato far credere di essere
  affiliati a ITAD. Niente durate massime di cache.
- Copre il PC. Sulle console in pratica niente.

## Proposta

1. **L'id ITAD non si salva in database: sta in Redis.** Deciso il 02/11/2026,
   dopo aver letto [AugmentedSteam_Server](https://github.com/IsThereAnyDeal/AugmentedSteam_Server),
   che fa lo stesso. Niente `data_source`, migration, job o backfill. Si chiave
   per id di negozio (`itad:id:steam:220`), così un appid nuovo si risolve da
   solo. Scarta l'alternativa in `game_sources`: il suo indice unico non regge
   i **19 UUID** che cadono su due nostri giochi, perché ITAD unisce le edizioni
   (Control e Control: Ultimate Edition, Disco Elysium e The Final Cut). Il prezzo
   da pagare: un id sbagliato non si corregge a mano e i giochi senza id non
   compaiono in «Dati mancanti».

   Durate: **30 giorni** per un id trovato, **7** per uno che ITAD non conosce,
   modificabili con `ITAD_ID_TTL_DAYS` e `ITAD_NOT_FOUND_TTL_DAYS`. Se ITAD non
   risponde non si scrive niente: un ITAD giù non è un «non lo conosco».

2. **Il lookup solo per id di negozio, mai per titolo.** È la regola di tutte
   le fonti: l'identità non si indovina dal nome. Steam e GOG. Un gioco senza
   nessuno di quei due id non ha la riga.

   **Un gioco con più UUID** (120 su 2328): sul campione guardato sono soprattutto
   Playtest e Demo agganciati allo stesso gioco, e poi edizioni diverse fra Steam
   e GOG (The Sinking City, XIII). Si sceglie così: si scartano le voci che
   `GET /games/info/v2` non dà come `game`, poi Steam vince su GOG, poi l'id più
   basso. `info` si chiede solo per questi giochi.

3. **Dopo un 429 ci si ferma** per il tempo di `Retry-After` (5 minuti se manca),
   con la scadenza in Redis. La pagina è pubblica, un crawler può far salire le
   richieste, e chi insiste sul limite viene bandito. In più un timeout di 5
   secondi: si chiama su richiesta dell'utente.
4. **Il prezzo non si salva su `games`**: cambia ogni giorno. Lo chiede il
   server quando si apre la pagina, con una procedura oRPC sua
   (`games.price`), così la pagina non aspetta ITAD per mostrarsi. La
   risposta resta in Redis (`cacheGet` / `cacheSet` di
   [redis.ts](../apps/api/src/lib/redis.ts)) **3 ore**, anche quando ITAD
   non ha offerte. La chiave resta sul server. Si chiede con `vouchers=false`:
   la riga mostra il prezzo che si paga senza un codice sconto.
5. **Il paese è fisso, `IT`**, prezzi in euro: come la regione di PSN, che è
   l'unica provata. Vale anche per gli ospiti: la pagina del gioco è pubblica,
   e la cache per gioco tiene basse le richieste.
6. **La card** (`GamePriceCard`): sua, sotto durata e critica, e tutta link alla
   pagina ITAD. Cambiata il 02/11/2026 vedendola in uso: era una riga della card
   «Links», che nella colonna da 360 andava a capo solo quando c'era il segnale.
   Solo sui giochi che non sono nel backlog, per ospiti e wishlist compresi: un
   gioco che hai già non ha bisogno di un prezzo (deciso dopo il merge).

   ```
   [icona] IsThereAnyDeal
   12,99 € · GOG            [minimo storico]
   ```

   Il segnale è un `Badge` `success` di `@repo/ui`, quando `current.flag` è `H` o
   `N`. Un gioco gratuito, che ITAD segna `H`, mostra «Gratis» e nessun segnale.
   Senza offerte la card resta, col solo nome; senza id ITAD la card non c'è; con
   ITAD giù c'è, senza prezzo, solo se l'id è ancora in cache. Arriva con
   `games.price`, dopo il resto della pagina. Il link è `game/id:<uuid>/info/`,
   composto dall'id, come fa Augmented Steam partendo da `urls.game`.

7. **L'icona**: il logo del sito di ITAD (`logo-GBHE6XF2.svg`) in `BrandIcon`, coi
   suoi colori su una tessera nera, il fondo per cui è disegnato. Simple Icons non
   ha il marchio ITAD.

## Passi

| #   | Cosa                                                                                                                                                                                                                                             | Stato |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 0   | tu: registri l'app su ITAD e metti `ITAD_API_KEY` nel `.env`. La variabile va anche in `globalEnv` di `turbo.json`                                                                                                                               | fatto |
| 1   | `itadPrice` a «in corso» nella roadmap. `itad:probe`, non scrive: forma di lookup e overview, quali negozi accetta il lookup in blocco, limiti di frequenza, termini d'uso e attribuzione. Su quanti giochi del catalogo di sviluppo trova un id | fatto |
| 2   | client in `apps/api/src/external/itad.ts`, con la pausa dopo un 429; la scelta dell'UUID in `apps/api/src/services/itad.ts`, con le durate da `.env`; test                                                                                       | fatto |
| 3   | `games.price` nel contratto e nel router, con la cache Redis                                                                                                                                                                                     | fatto |
| 4   | la card sotto durata e critica, col segnale; messaggi it/en                                                                                                                                                                                      | fatto |
| 5   | ITAD in `/credits` ([credits.ts](../apps/web/lib/credits.ts)), la fonte in [apps/api/CLAUDE.md](../apps/api/CLAUDE.md) coi suoi termini e `itad:probe` fra gli arnesi, questo piano. `itadPrice` a «fatto» quando dici che il lotto è pronto     | fatto |

Il segnale è stato misurato il 02/11/2026 su 171 voci: nessun gioco al minimo
senza `H` o `N`. I 10 casi discordi vanno tutti nell'altro senso: 5 giochi sempre
gratuiti, che la riga mostra senza segnale, e 5 con pochi centesimi sopra
`lowest`, perché il minimo viene da un negozio in altra valuta, e che ITAD
considera comunque al minimo.
