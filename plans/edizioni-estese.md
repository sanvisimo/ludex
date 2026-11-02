# Le edizioni estese e il gioco principale

**Stato: in corso** (02/11/2026), voce `gameVersions` della roadmap.

## La richiesta

[Catherine](http://localhost:8085/games/catherine) e
[Catherine: Full Body](http://localhost:8085/games/catherine-full-body) sono lo
stesso gioco in due edizioni, e la pagina del primo non nomina il secondo. Full
Body è un'edizione estesa: va mostrata insieme a remake e remaster.

Dall'altra parte, la pagina di un'espansione
([Songs of the Past](http://localhost:8085/games/the-witcher-3-wild-hunt-songs-of-the-past))
deve dire qual è il gioco principale.

## Cosa dà IGDB

L'enrichment chiede solo `remakes`, `remasters` e `similar_games`
([igdb.ts](../apps/api/src/external/igdb.ts), `DETAIL_FIELDS`). Misurato il
02/11/2026 sui 2525 giochi del catalogo di sviluppo:

| Campo IGDB              | Giochi | Voci | Max | Deciso                                     |
| ----------------------- | ------ | ---- | --- | ------------------------------------------ |
| `expanded_games`        | 91     | 94   | 2   | **sì**, nella fila di remake e remaster    |
| `ports`                 | 214    | 325  | 10  | no                                         |
| `expansions`            | 177    | 475  | 21  | no: si va dall'espansione al gioco, sotto  |
| `standalone_expansions` | 52     | 65   | 3   | no: come le espansioni                     |
| `dlcs`                  | 533    | 2417 | 129 | no: livree e tratte di Train Sim World 5   |
| `bundles`               | 978    | 2118 | –   | no                                         |
| `forks`                 | 4      | 4    | –   | no                                         |
| `version_parent`        | 81     | –    | –   | no: lo stesso gioco in un'altra edizione   |

Le espansioni sul gioco base si sono guardate sul backlog vero: 202 giochi ne
avrebbero 521, di cui 22 già possedute. Il volume lo fanno i giochi a pacchetti
(American Truck Simulator e The Sims 4, 21 a testa e nessuna posseduta), cioè
lunghe file di copertine attenuate che non aiutano a scegliere cosa giocare.

## Il bug della riga sotto il titolo

La riga sotto il titolo dice sempre «DLC di X», per qualunque tipo abbia un padre
([game-page.tsx](../apps/web/components/game-page.tsx), `dlcOf`): Full Body
sarebbe «DLC di Catherine». Sul catalogo di sviluppo sono 85 giochi con
un'etichetta sbagliata o imprecisa, oltre ai 3 DLC veri. Letto dal codice e dal
database, non ancora visto a schermo.

## Cosa si fa

1. **Riga sotto il titolo.** Il testo dipende dal tipo:
   - `expansion`, `standalone_expansion`, `dlc`: «Gioco principale: X»;
   - gli altri nominano il proprio tipo: «Edizione estesa di X», «Remaster di X»,
     «Remake di X», «Port di X», «Episodio di X», «Aggiornamento di X», «Mod di
     X».
2. **Edizioni estese.** `expanded_games` nei campi IGDB e il valore `expanded` in
   `relatedKindValues`, **prima di `similar`**: la pagina ordina seguendo l'enum.
   La migration la produce drizzle-kit; va controllato che scriva `BEFORE`.
3. **Titolo della fila.** «Remake e remaster» diventa «Altre versioni». Stesso
   `RelatedRow`, nessuna struttura nuova, quindi niente wireframe.
4. **I giochi già presenti.** `igdb:media` non serve: riprende solo i giochi senza
   artwork. L'enrichment li aggiornerebbe entro 30 giorni. Un arnese
   `igdb:related` riscrive i legami dei giochi già arricchiti, circa 26 richieste
   a IGDB: una volta in sviluppo e una in produzione.
5. **Contorno.** `docs/modello-dati.md`, `apps/web/CLAUDE.md`, la tabella degli
   arnesi di `apps/api/CLAUDE.md`, test dell'enrichment e del service della
   pagina.

## Il limite

La riga compare solo se il gioco principale è già in catalogo, perché del padre
salviamo solo l'id IGDB e non il nome. Sul catalogo di sviluppo:

| Tipo            | Senza riga | Con padre, in totale |
| --------------- | ---------- | -------------------- |
| Espansioni      | 1          | 9                    |
| Standalone      | 9          | 29                   |
| Edizioni estese | 55         | 72                   |
| Remaster        | 62         | 84                   |

Quando il gioco principale entra in catalogo, la riga appare da sola. Mostrare
anche i padri mancanti vuol dire salvarne il nome e gestire il clic su un gioco
non ancora in catalogo: è un lavoro a parte, che qui non si fa.

## Come si verifica

- Songs of the Past dice «Gioco principale: The Witcher 3: Wild Hunt».
- Full Body dice «Edizione estesa di Catherine».
- Catherine mostra Full Body in «Altre versioni».
- `pnpm --filter api test` e `pnpm check-types`.
