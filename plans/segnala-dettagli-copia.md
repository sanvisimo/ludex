# «Segnala un errore» con i dettagli della copia

Ritocco della segnalazione dell'11a, chiesto dall'utente il 15/10/2026: la
roadmap non cambia.

## Com'è oggi

Sulla pagina di _Sonic the Hedgehog 2_ (Steam) l'utente vuole dire che la sua
copia non è quel gioco. «Segnala un errore»
([report-error.tsx](../apps/web/components/report-error.tsx)) offre la spunta
«la copia Steam» e basta: non dice come il negozio chiama il gioco, né l'id,
né l'account. La pagina nemmeno: nel pannello del backlog ci sono l'icona del
negozio e l'account. E «Cerca su IGDB» parte dal nome del gioco in Ludex, che è
proprio quello sbagliato.

Il blocco che serve esiste già: è la testa di «Collega al gioco giusto»
([resolve-import-dialog.tsx](../apps/web/components/resolve-import-dialog.tsx)),
con copertina del negozio, titolo, «negozio · account», «Id sul negozio», ore e
date, e «Apri su …».

## Il nodo: quale id è della copia

Lo scarto sa da quale id del negozio viene; la copia no. Titolo e copertina del
negozio stanno su `external_ids`, per gioco e negozio, e un gioco può averne
più d'uno per negozio (su PSN PS4, PS5 e il concept). Ma la copia ha
`store_page`, che su Steam, PSN ed EA contiene il suo id (`app/71163`,
`product/EP5360-PPSA10248_00-…`).

**La regola**: l'id della copia è quello che compare fra i pezzi della sua
pagina del negozio (separati da `/` e `-`); senza, l'unico id di quel negozio
sul gioco; altrimenti è ambigua, e si mostrano tutti.

Misurata sul DB di sviluppo il 15/10/2026, 2703 copie dei negozi:

| negozio  | copie | id della copia                | titolo | copertina  |
| -------- | ----- | ----------------------------- | ------ | ---------- |
| Steam    | 772   | dalla pagina 772              | 772    | dall'appid |
| PSN      | 326   | dalla pagina 311, id unico 15 | 326    | 326        |
| Epic     | 673   | id unico 673                  | 673    | 673        |
| GOG      | 431   | id unico 430, **ambigua 1**   | 431    | 431        |
| Amazon   | 426   | id unico 424, **ambigue 2**   | 426    | 426        |
| Nintendo | 34    | id unico 34                   | 34     | 15         |
| EA       | 41    | dalla pagina 2, id unico 39   | **0**  | **0**      |

Nessuna copia senza id. I ripieghi, perché il blocco non sparisca mai:

- **ambigua**: «Id sul negozio» li elenca tutti, senza titolo né copertina;
- **senza copertina**: il riquadro con l'icona del negozio (`UnresolvedCover`);
- **senza titolo**: resta l'id, e la ricerca parte dal nome del gioco;
- **Xbox** (9e) non c'è ancora: arriverà sotto la stessa regola.

## La proposta

Decisa dall'utente il 15/10/2026. **Nessun wireframe**: il blocco esiste già.

1. **`reports.myCopies({ gameId })`**, da loggati: per ogni copia di un negozio
   dell'utente su quel gioco, l'id (o gli id, se ambigua) con titolo e
   copertina del negozio, secondo la regola. Account, ore, date e pagina la
   schermata li ha già in `entry.ownerships`.
2. **Un blocco solo** (`StoreEntryCard`), estratto dalla testa di «Collega al
   gioco giusto» e usato da tutti e due i dialoghi.
3. **In «Segnala un errore»**: spuntata «la copia Steam», sotto compare un
   blocco per ogni copia di quel negozio (PS4 e PS5 sono due blocchi), con la
   piattaforma.
4. **«Cerca su IGDB»** parte dal titolo del negozio della prima copia spuntata
   che ne ha uno; altrimenti dal nome del gioco.

## Passi

- [x] branch `feat/segnala-dettagli-copia`, da `main`
- [x] questo piano, approvato
- [x] la regola dell'id della copia, coi test (pagina, id unico, ambigua)
- [x] `reports.myCopies` nel contratto e nel router, coi test (solo le copie
      dell'utente)
- [x] `StoreEntryCard`, e «Collega al gioco giusto» che lo usa
- [x] «Segnala un errore»: il blocco sotto la copia spuntata, la ricerca dal
      titolo del negozio
- [x] `apps/web/CLAUDE.md`, se serve

## Aggiunto in corsa: l'anno del negozio

Visto il lotto in uso (15/10/2026), l'utente ha chiesto anche la data: fra
_State of Mind_ del 2018 e del 2022 su GOG il titolo non basta. GOG ed EA
l'anno lo danno, e l'import lo usava per il match per nome e poi lo buttava.
Ora sta in `external_ids.store_release_year` (migration 0054), scritto da
`recordStoreDetails` come la copertina, e la scheda lo mostra dopo il titolo,
«State of Mind (2018)», come i risultati di IGDB. Gli altri negozi non lo danno
nella libreria: servirebbe una chiamata per gioco, e non si fa. Le copie già
importate lo prendono al prossimo import di GOG o EA.

- [x] la colonna, l'import che la scrive e non la cancella, coi test
- [x] `storeReleaseYear` su `reports.myCopies` e nella scheda

**EA senza titolo né copertina non è un difetto**: l'unico import EA è del
13/10/2026, la colonna del titolo del 14/10. Si riempiono al prossimo import
(EA si importa a mano, una volta).

## Verifica

`pnpm --filter api test`, `pnpm check-types`, `pnpm lint`. A occhio in locale:
_Sonic the Hedgehog 2_, «Segnala un errore», spuntata «la copia Steam» compare
il blocco con copertina Steam, «Sonic The Hedgehog 2», «Steam · sanvisimo»,
«Id sul negozio 71163» e «Apri su Steam»; «Cerca su IGDB» parte da «Sonic The
Hedgehog 2». Poi un gioco PSN con copie PS4 e PS5 (due blocchi) e uno EA (senza
titolo né copertina).
