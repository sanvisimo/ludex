# Il prezzo di IsThereAnyDeal sulle card della wishlist

**Stato: in corso** (19/11/2026), voce `itadWishlist` della roadmap. Branch
`feat/itad-wishlist`. Segue [itad-prezzo](itad-prezzo.md), di cui riusa id,
cache e regole.

## La richiesta

Sulle card della wishlist il prezzo di IsThereAnyDeal: nella lista aperta
(`/wishlist/$id`) e nelle fasce di `/wishlist`.

## Proposta

1. **In blocco, mai una chiamata per card.** Una pagina arriva a 200 giochi e una
   fascia a 20: chiamando `games.price` per card, a cache vuota, si farebbero due
   richieste a ITAD per gioco, contro un limite di 1000 ogni 5 minuti oltre il
   quale si viene banditi. `findGamePrices(gameIds)` in
   [services/itad.ts](../apps/api/src/services/itad.ts) fa una query sola su
   `external_ids`, un lookup per negozio sugli id che non sono in cache, `info`
   solo per i giochi con più UUID, e un'overview sola (fino a 200 UUID) per i
   prezzi che non sono in cache. `findGamePrice` è `findGamePrices([id])`.
2. **ITAD giù non toglie i prezzi che si sanno già**: se il lookup fallisce
   restano i giochi con l'id in cache, col prezzo in cache o col solo link; gli
   altri non hanno la riga, e non si scrive niente.
3. **`games.prices`**, da loggati (le liste sono private), fino a 200 giochi:
   una mappa gioco → `GamePrice` o `null`.
4. **La riga** (`CardPrice`, [card-price.tsx](../apps/web/components/card-price.tsx))
   in fondo a `HomeCard`, nello slot `footer`, tutta link alla pagina ITAD:

   ```
   [icona] 12,99 €            [Minimo]
   ```

   **Una riga sola, alta sempre uguale, mai a capo**: corretto il 19/11/2026
   vedendola in uso. Col negozio accanto al prezzo e «Minimo storico» la riga
   andava a capo in modo diverso per ogni card, e anno e voto delle card vicine
   non stavano più alla stessa altezza. Il negozio e «minimo storico» per esteso
   stanno nel `Tooltip` e nell'`aria-label` («12,99 € su GOG · Minimo storico —
   Apri su IsThereAnyDeal»); sul telefono, dove il suggerimento non c'è, il
   negozio è a un tocco, nella pagina ITAD. Senza offerte: icona e
   «IsThereAnyDeal» in grigio. Niente riga sui giochi già nel backlog (la regola
   della pagina del gioco) né su quelli senza id ITAD.

## Passi

| #   | Cosa                                                                 | Stato |
| --- | -------------------------------------------------------------------- | ----- |
| 1   | `findGamePrices` e `fetchItadOverviews` a blocchi, test              | fatto |
| 2   | `games.prices` nel contratto e nel router                            | fatto |
| 3   | `footer` di `HomeCard`, `CardPrice` nella lista aperta e nelle fasce | fatto |
| 4   | roadmap a «in corso», [apps/api/CLAUDE.md](../apps/api/CLAUDE.md)    | fatto |
| 5   | vederla in uso; `itadWishlist` a «fatto» quando dici che è pronto    |       |
