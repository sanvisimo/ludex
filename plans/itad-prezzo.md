# Il prezzo più basso, da IsThereAnyDeal

**Stato: da approvare** (25/10/2026). Branch `ccr-0d87f8d3-b0k3nh`.
Fuori dall'ordine di lavoro di [ordine-sviluppo](../docs/ordine-sviluppo.md):
quando farlo è da decidere.

## La richiesta

Nella card «Links» della pagina del gioco (`StoreLinks` in
[game-page.tsx](../apps/web/components/game-page.tsx)) una riga
IsThereAnyDeal: il link alla pagina del gioco su ITAD e il **prezzo più basso
di adesso**. Se quel prezzo è anche il **minimo storico**, un segnale.

AllKeyShop è scartato: niente API pubblica (solo un widget per affiliati),
indirizzi da indovinare dal titolo, e soprattutto rivenditori di chiavi del
mercato grigio.

## Cosa dà ITAD

Dalla memoria della API v2, **da verificare nel passo 1**: da qui il sito è
bloccato dalla rete.

- **Una chiave gratuita**, registrando un'app sul sito di ITAD. La API Key,
  non il client OAuth.
- **Lookup**: dall'appid Steam (e forse dall'id di altri negozi, in blocco)
  all'id del gioco su ITAD, un UUID, e al suo slug.
- **Overview**: per una lista di id e un paese, il prezzo attuale più basso
  (negozio, prezzo, sconto) e il minimo storico. Molti giochi per richiesta.
- La pagina pubblica: `isthereanydeal.com/game/{slug}/info/`.
- Copre il PC (Steam, GOG, Epic, Humble…). Sulle console in pratica niente.

## Proposta

1. **L'id ITAD va in `game_sources`, non in `external_ids`.** ITAD è un posto
   da cui si legge, non un negozio: `data_source` riceve `itad`, la riga tiene
   l'id in `external_id`, e lo stato dice già tutto ciò che serve: `ok`,
   `not_found` per un gioco che ITAD non conosce (i giochi solo console),
   `failed` per riprovare. Lo slug, se l'overview non dà già il link, sta
   accanto all'id (da decidere col passo 1).
2. **Il lookup solo per id di negozio, mai per titolo.** È la regola di tutte
   le fonti: l'identità non si indovina dal nome. Steam di sicuro, GOG ed Epic
   se il lookup in blocco li accetta. Un gioco senza nessuno di quegli id non
   ha la riga.
3. **Quando**: un job di enrichment `itad`, come HLTB e Metacritic. Si apre
   quando arriva un appid Steam nuovo (`reopenSourcesForNewExternalIds`, lo
   stesso evento) e la spazzata lo ripassa di rado, perché l'id ITAD non
   cambia. Per i giochi già in catalogo, un backfill a mano in blocco,
   `itad:resolve`.
4. **Il prezzo non si salva su `games`**: cambia ogni giorno. Lo chiede il
   server quando si apre la pagina, con una procedura oRPC sua
   (`games.price`), così la pagina non aspetta ITAD per mostrarsi. La
   risposta resta in Redis (`cacheGet` / `cacheSet` di
   [redis.ts](../apps/api/src/lib/redis.ts)) **3 ore**, anche quando ITAD
   non ha offerte. La chiave resta sul server.
5. **Il paese è fisso, `IT`**, prezzi in euro: come la regione di PSN, che è
   l'unica provata. Vale anche per gli ospiti: la pagina del gioco è pubblica,
   e la cache per gioco tiene basse le richieste.
6. **La riga**: la stessa `LinkRow` delle altre, dopo i negozi e prima di
   Wikipedia. Tutta la riga porta alla pagina ITAD.

   ```
   [icona] IsThereAnyDeal          12,99 € · GOG  [minimo storico]
   ```

   Il segnale è un `Badge` di `@repo/ui`, solo quando il prezzo attuale è
   **minore o uguale** al minimo storico. Senza offerte la riga resta, col
   solo nome; senza id ITAD, o con ITAD giù, il prezzo non compare e la riga
   c'è se c'è l'id. La struttura della card non cambia: niente wireframe,
   salvo che tu lo voglia.

7. **L'icona**: il marchio ITAD in `BrandIcon` se Simple Icons ce l'ha,
   altrimenti un'icona di lucide (un cartellino del prezzo).

## Passi

| #   | Cosa                                                                                                                                                                                                     | Stato |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 0   | tu: registri l'app su ITAD e metti `ITAD_API_KEY` nel `.env`. La variabile va anche in `globalEnv` di `turbo.json`                                                                                       | —     |
| 1   | `itad:probe`, non scrive: forma di lookup e overview, quali negozi accetta il lookup in blocco, limiti di frequenza, termini d'uso e attribuzione. Su quanti giochi del catalogo di sviluppo trova un id | —     |
| 2   | `itad` in `data_source` (migration da drizzle-kit), client in `apps/api/src/external/itad.ts`, job di enrichment e riapertura sull'appid; test contro Postgres                                           | —     |
| 3   | `itad:resolve`, il backfill in blocco                                                                                                                                                                    | —     |
| 4   | `games.price` nel contratto e nel router, con la cache Redis                                                                                                                                             | —     |
| 5   | la riga nella card «Links», col segnale; messaggi it/en                                                                                                                                                  | —     |
| 6   | ITAD in `/credits` ([credits.ts](../apps/web/lib/credits.ts)), la fonte in [apps/api/CLAUDE.md](../apps/api/CLAUDE.md) coi suoi termini, la roadmap, questo piano                                       | —     |

Il passo 1 può cambiare la proposta: se l'overview non dà il minimo storico,
o se i termini chiedono un'attribuzione vicino al prezzo come OpenCritic, si
torna qui prima del passo 2.
