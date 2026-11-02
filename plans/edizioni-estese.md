# Le edizioni estese e il gioco principale

**Stato: in corso** (02/11/2026), voce `gameVersions` della roadmap.

## La richiesta

[Catherine](http://localhost:8085/games/catherine) e
[Catherine: Full Body](http://localhost:8085/games/catherine-full-body) sono lo
stesso gioco in due edizioni, e la pagina del primo non nomina il secondo. Full
Body è un'edizione estesa: va mostrata insieme a remake e remaster.

Dall'altra parte, la pagina di un'espansione
([Songs of the Past](http://localhost:8085/games/the-witcher-3-wild-hunt-songs-of-the-past))
deve portare al gioco principale.

## Cosa dà IGDB

L'enrichment chiede solo `remakes`, `remasters` e `similar_games`
([igdb.ts](../apps/api/src/external/igdb.ts), `DETAIL_FIELDS`). Misurato il
02/11/2026 sui 2525 giochi del catalogo di sviluppo:

| Campo IGDB              | Giochi | Voci | Max | Deciso                                    |
| ----------------------- | ------ | ---- | --- | ----------------------------------------- |
| `expanded_games`        | 91     | 94   | 2   | **sì**, nella fila di remake e remaster   |
| `ports`                 | 214    | 325  | 10  | no                                        |
| `expansions`            | 177    | 475  | 21  | no: si va dall'espansione al gioco, sotto |
| `standalone_expansions` | 52     | 65   | 3   | no: come le espansioni                    |
| `dlcs`                  | 533    | 2417 | 129 | no: livree e tratte di Train Sim World 5  |
| `bundles`               | 978    | 2118 | –   | no                                        |
| `forks`                 | 4      | 4    | –   | no                                        |
| `version_parent`        | 81     | –    | –   | no: lo stesso gioco in un'altra edizione  |

Le espansioni sul gioco base si sono guardate sul backlog vero: 202 giochi ne
avrebbero 521, di cui 22 già possedute. Il volume lo fanno i giochi a pacchetti
(American Truck Simulator e The Sims 4, 21 a testa e nessuna posseduta), cioè
lunghe file di copertine attenuate che non aiutano a scegliere cosa giocare.

## Il padre: una scheda, non una frase

La riga sotto il titolo diceva sempre «DLC di X», per qualunque tipo abbia un
padre: Full Body era «DLC di Catherine», e sul catalogo di sviluppo erano 85
giochi con un'etichetta sbagliata o imprecisa. Il primo tentativo (`5af2db1`) le
dava un testo per tipo; vista a schermo, l'utente l'ha scartata il 02/11/2026: il
padre va mostrato **come scheda**, come i giochi simili. Il badge accanto al
titolo dice già che cos'è il gioco.

La scheda toglie anche un limite: la frase compariva solo col padre in catalogo,
perché ne salvavamo solo l'id. Ora mancavano 55 edizioni estese su 72 e 62
remaster su 84. Con nome e copertina in `game_related`, il padre si mostra anche
se non è in `games`, con la regola degli altri giochi legati.

## Cosa si fa

1. **Dati. Fatto.** `expanded_games` e `parent_game` (con nome e copertina) nei
   campi IGDB, `expanded` e `parent` in `relatedKindValues`. L'ordine conta,
   perché la pagina ordina seguendo l'enum: `parent` prima di `remake`, `expanded`
   prima di `similar` (migration 0064 e 0065, controllate). `parent_igdb_id` resta
   su `games`.
2. **Pagina. Fatto.** Via la frase e il campo `parent` da contratto e service.
   Le file sono `splitRelated` di
   [related-games.ts](../apps/web/lib/related-games.ts), con lo stesso
   `RelatedRow`, quindi niente wireframe:
   - espansione, standalone, DLC, episodio, ogni altro tipo: il padre in **«Gioco
     principale»**;
   - remake, remaster, edizione estesa, port: il padre per primo in **«Altre
     versioni»**, il nuovo titolo di «Remake e remaster». Così Catherine e Full
     Body si mostrano a vicenda.
3. **I giochi già presenti.** `igdb:media` non serve: riprende solo i giochi senza
   artwork. L'enrichment li aggiornerebbe entro 30 giorni. Un arnese
   `igdb:related` riscrive i legami dei giochi già arricchiti, circa 26 richieste
   a IGDB. **Si lancia sul server**, una volta (deciso il 02/11/2026): in sviluppo
   non serve. Finché non gira, un gioco non riarricchito non ha la scheda del padre.
4. **Contorno.** `docs/modello-dati.md`, `apps/web/CLAUDE.md`, la tabella degli
   arnesi di `apps/api/CLAUDE.md`.

## Come si verifica

Sul server, dopo il punto 3:

- Iceborne mostra Monster Hunter: World in «Gioco principale».
- Full Body mostra Catherine in «Altre versioni», e Catherine mostra Full Body.
- Un'edizione estesa col padre fuori catalogo mostra la scheda attenuata.
- `pnpm --filter api test` e `pnpm check-types`.
