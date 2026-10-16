# I link della pagina del gioco

**Stato: chiuso il 16/10/2026.** Branch `feat/link-pagina-gioco`, da `main`.
Roadmap: `linksFix` a «fatto». Primo in [ordine di lavoro](../docs/ordine-sviluppo.md).

## Perché

La card «Links» della pagina del gioco (`StoreLinks` in
[game-page.tsx](../apps/web/components/game-page.tsx)) mostra solo i negozi per
cui sappiamo comporre un indirizzo (`storeGameUrl` in
[store-links.ts](../packages/contracts/src/store-links.ts)): Steam, PSN, Xbox,
EA, e GOG solo se un import ha salvato la pagina. Epic, Amazon e Nintendo mai, e
il sito ufficiale nemmeno. IGDB quei link li ha nel campo `websites`, che
l'enrichment oggi non chiede.

## Misurato (16/10/2026, catalogo di sviluppo)

`pnpm --filter api igdb:websites`: non scrive, chiede `websites` a IGDB 500
giochi per richiesta. 2386 giochi con `igdbId`, uno solo senza link. Un link per
tipo per gioco (giochi = link in ogni riga).

| Tipo                      | Giochi    | %         | `trusted` |
| ------------------------- | --------- | --------- | --------- |
| Steam                     | 2174      | 91%       | tutti     |
| Twitch                    | 2099      | 88%       | quasi     |
| Official Website          | 2065      | 87%       | **0**     |
| Twitter                   | 1613      | 68%       | quasi     |
| Wikipedia                 | 1365      | 57%       | tutti     |
| YouTube                   | 1356      | 57%       | quasi     |
| Facebook                  | 1322      | 55%       | quasi     |
| Playstation               | 1230      | 52%       | **0**     |
| GOG                       | 1212      | 51%       | tutti     |
| Xbox                      | 1137      | 48%       | **0**     |
| Discord                   | 1085      | 45%       | 972       |
| Epic                      | 1054      | 44%       | tutti     |
| Nintendo                  | 1030      | 43%       | **0**     |
| Community Wiki            | 925       | 39%       | 0         |
| Instagram                 | 874       | 37%       | quasi     |
| Subreddit                 | 713       | 30%       | quasi     |
| App Store (iPhone / iPad) | 340 / 294 | 14% / 12% | tutti     |
| Google Play               | 299       | 13%       | tutti     |
| Bluesky                   | 232       | 10%       | tutti     |
| Itch                      | 222       | 9%        | tutti     |
| Meta, GameJolt            | 4, 2      | 0%        | —         |

**`trusted` non è un giudizio di affidabilità**: è falso su tutti i siti
ufficiali e su tutti i link PlayStation, Xbox e Nintendo. Sembra dire solo se
l'indirizzo ha una forma che IGDB riconosce. Non serve come filtro.

I negozi che oggi nella card non compaiono, e quanti dei loro giochi un link da
IGDB lo avrebbero:

| Negozio  | Giochi | Con link IGDB |
| -------- | ------ | ------------- |
| Epic     | 675    | 642 (95%)     |
| GOG      | 436    | 406 (93%)     |
| Nintendo | 34     | 32 (94%)      |
| Amazon   | 400    | **0**         |

Amazon su IGDB come tipo non esiste: resta senza link.

Lo script di misura è diventato il backfill (passo 2): i numeri sopra coprono
tutti i tipi IGDB, la colonna tiene solo quelli scelti. Dopo il backfill, sui
2386 giochi: 10 senza nessun link dei tipi scelti; App Store 371 (iPhone e iPad
contati una volta).

## Decisioni prese (16/10/2026)

1. **Quali link**: il sito ufficiale, Wikipedia e i negozi (Steam, GOG, Epic,
   PlayStation, Xbox, Nintendo, Itch, App Store, Google Play). Fuori social,
   Twitch, Discord, Reddit e le wiki della community.
2. **Dove**: una colonna `games.websites jsonb`, `{ type, url }[]`, come
   `videos`: è del gioco, si mostra e basta, nessuno ci filtra. Solo i tipi
   mostrati, coi nomi nostri (`gameWebsiteTypeValues` in
   [vocabulary.ts](../packages/contracts/src/vocabulary.ts)), uguali a quelli di
   `storeValues` per i negozi. Null = non ancora chiesto, lista vuota = IGDB
   non ne ha.
3. **Come si fondono**: per un negozio vince il link nostro (`storeGameUrl`),
   IGDB riempie dove manca. Sito ufficiale e Wikipedia sono righe della card
   «Links» che c'è già (il sito in cima, Wikipedia in fondo): la struttura non
   cambia, niente wireframe.

Dettagli presi nel passo 3: IGDB riempie anche un negozio di cui non abbiamo
l'id (un gioco Epic che nessuno ha importato da Epic); i link IGDB passano solo
se `http(s)`, perché li scrive la comunità e finiscono in un `href`. Il
contratto ha `storeLinks` (negozi nostri, in ordine di enum) e `websites` (il
resto, senza doppioni).

Nel passo 4 il sito ufficiale ha il globo di lucide; Wikipedia, itch.io, App
Store e Google Play sono marchi nuovi di `BrandIcon`, da Simple Icons 16.35
(CC0), coi nomi di `gameWebsiteTypeValues`. Provata su _Tunic_ nei due temi:
nove righe, dal sito ufficiale a Wikipedia.

Dopo il passo 5, vedendola in uso (16/10/2026): una copia Epic in «Copie»
aveva l'icona senza link, con il link Epic nella card sotto. Il link di una copia
ora ripiega sulla riga dello stesso negozio in `storeLinks` quando la copia non
ha una pagina sua (`BacklogPanel`): vale per Epic, Nintendo e per Steam, PSN e
Xbox senza pagina salvata. GOG non cambia, senza pagina porta già alla libreria.

## Passi

| #   | Cosa                                                                                        | Stato       |
| --- | ------------------------------------------------------------------------------------------- | ----------- |
| 1   | colonna `websites` e vocabolario, migration `0056`                                          | fatto 16/10 |
| 2   | `DETAIL_FIELDS` chiede `websites`, l'enrichment scrive; `igdb:websites` diventa il backfill | fatto 16/10 |
| 3   | `GameDetail`: negozi con ripiego su IGDB, sito ufficiale e Wikipedia; test contro Postgres  | fatto 16/10 |
| 4   | righe nuove nella card «Links», icone di App Store, Google Play e itch se `BrandIcon` le ha | fatto 16/10 |
| 5   | `docs/modello-dati.md` e questo piano                                                       | fatto 16/10 |
