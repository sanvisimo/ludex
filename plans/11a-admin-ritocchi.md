# 11a — ritocchi all'admin

Branch `feat/admin-ritocchi`. Lavoro interno: niente voce in roadmap.

## Cosa

1. **Contenitore fluido**: `/admin` non ha più il tetto di 1200 (`_app.admin.tsx`).
   Il menu laterale resta com'è, la sezione prende il resto.
2. **Tabella leggibile** (`components/admin/admin-table.tsx`, `_app.admin.missing.tsx`):
   - il dettaglio del motivo va a capo (`CellText wrap`), non si taglia;
   - il titolo del motivo in grassetto, come nella scheda del gioco;
   - più spazio al nome del gioco (Gioco `flex` 3, Motivo `flex` 3);
   - righe più alte (`py` 10), intestazione che si stacca dal fondo.
3. **«Found but empty» e «Fine as is» senza bottoni**: in «Found but empty» la
   colonna Motivo è il `Badge` verde «ok» (lo stesso della scheda del gioco), con
   «set by hand» in grigio accanto. Niente colonna delle azioni nei due casi. Per
   correggere un id si apre la scheda del gioco dal nome nella riga. «Queued» e
   «Failed» restano com'erano.
4. **Icone ai bottoni di azione dell'admin** (lucide, `@repo/ui/icons`):

   | Bottone                   | Icona      |
   | ------------------------- | ---------- |
   | Ritenta                   | `RotateCw` |
   | Inserisci id              | `Hash`     |
   | Collega / Collega in IGDB | `Link2`    |
   | Non è questo gioco        | `Unlink`   |
   | Nascondi                  | `EyeOff`   |
   | Ripristina                | `Eye`      |
   | Archivia                  | `Archive`  |
   | Cerca                     | `Search`   |
   | Aggiungi                  | `Plus`     |

   Restano senza icona i pulsanti di filtro (con conteggio) e quelli di
   Annulla / Conferma / Indietro nei dialoghi.

## Verifica

`pnpm lint`, `pnpm check-types`; poi `/admin/missing` (tutte le tab e i filtri),
`/admin/unresolved` e la scheda di un gioco su `pnpm dev`.
Alla fine: la riga dell'admin in `apps/web/CLAUDE.md`.

## Aggiunta: il dialogo «Inserisci id»

Visto in uso. `components/admin/set-source-id-dialog.tsx`:

- dialog più larga (`maxW` 720) e titoli dei risultati e dei candidati a capo,
  non più tagliati;
- l'intestazione carica `admin.games.detail` (per `slug`, che `SourceToSet` ora
  porta) e mostra anno, tipo, utenti, IGDB, i negozi di provenienza con i link
  alle loro pagine e l'id attuale della fonte, se c'è.

Le piattaforme (PC, PS5…) non ci sono: stanno nei possessi, e servirebbe l'api.

## Aggiunta: il dialogo «Collega» dell'account

`components/resolve-import-dialog.tsx` riscritto in Tamagui, largo 720: in testa
copertina, nome, negozio e account, id intero, ore, ultima partita, data di
aggiunta (o di quando l'hai nascosta) e il link al negozio; sotto `IgdbPicker`,
con la ricerca che parte da sola dal nome della voce. Prima era in Tailwind, e
la frase d'intestazione incollava `store/storeName`. La piattaforma non c'è: il
contratto lato utente non la porta.

`IgdbPicker`: titoli dei risultati a capo.
