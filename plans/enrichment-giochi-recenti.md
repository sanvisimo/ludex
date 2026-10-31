# Enrichment dei giochi appena usciti

**Stato: chiuso il 31/10/2026.** Merge in `main` con la PR #101.

## Perché

Una fonte si riprende quando il dato è vecchio: 30 giorni IGDB, 90 OpenCritic e
Metacritic, 180 HLTB, uguali per ogni gioco. Un gioco letto nei giorni
dell'uscita resta fermo alla foto di quel momento.

Il caso vero: _Castlevania: Belmont's Curse_, uscito il 15/10, entrato in un
backlog il 24/10. Le quattro fonti `ok` ma senza voto né durata; a fine ottobre
le fonti li hanno. Senza correzione Ludex li avrebbe ripresi il 23/11 (IGDB),
il 22/01/2027 (OpenCritic, Metacritic) e il 22/04/2027 (HLTB). Lo stesso vale
per un voto preso con 5 recensioni che nel frattempo ne ha 80, e per un
`not_found` scritto quando la scheda sulla fonte non esisteva ancora — che oggi
non torna mai dovuto da solo.

## Decisione

Una regola in più nel predicato di `selectGamesDue`
(`apps/api/src/services/enrichment.ts`), per **tutte e quattro le fonti**:

> Un gioco uscito da **meno di 90 giorni**, o non ancora uscito, torna dovuto
> **7 giorni** dopo l'ultimo tentativo, sia `ok` sia `not_found`.

- La condizione è sulla data di uscita, non su «è vuoto»: copre anche il voto
  che cresce e non serve una join su `game_scores`. Senza data di uscita la
  regola non vale.
- IGDB dentro anche lui: aggiorna i voti (decisione dell'utente).
- `not_found` dentro (opzione 2): un gioco che esce è proprio il caso in cui
  un «non c'è» smette di essere vero. Costo accettato: su OpenCritic un
  `not_found` è una ricerca, e le ricerche sono 25 al giorno.
- I `failed` restano sulla loro regola delle 24 ore.
- Il valore è uguale per le quattro fonti: due costanti accanto a
  `ENRICHMENT_SOURCES`, non un campo per fonte.
- Passa dallo stesso predicato anche `isSourceDue`, quindi vale anche per le
  fonti accodate dopo un rinfresco IGDB.

## Passi

1. Le due costanti e il ramo nuovo in `selectGamesDue`.
2. Test in `enrichment.test.ts`, contro Postgres: uscito da 20 giorni e letto
   8 giorni fa → preso (`ok` e `not_found`); letto 3 giorni fa → saltato;
   uscito 2 anni fa → saltato; senza data → saltato.
3. Commenti sulle soglie in `enrichment.ts`.

Niente roadmap: è una correzione, non una funzione nuova.
