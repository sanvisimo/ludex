# Filtri: quale durata, voto critica come intervallo, quale fonte

Richiesta dell'utente del 23/11/2026. Anticipa `criticMax`, che
[ordine-sviluppo](../docs/ordine-sviluppo.md) teneva fra i prerequisiti del 13c.
In corso; si chiude quando l'utente dice che è pronto.

## Cosa chiede

1. Nei filtri scegliere **a quale tempo HLTB** si riferisce la durata: storia
   principale, con gli extra, completista, tutti gli stili.
2. Il **voto della critica come la durata**, un intervallo: «tutti i giochi
   sotto 50».
3. Scegliere **la fonte** del voto. Senza fonte, quella che le card mostrano
   (`games.criticScore`: Metacritic, se manca IGDB).

## Decisioni

- **`durationBasis`** (`main` · `plus` · `completionist` · `allStyles`),
  assente = `main`. Il server sceglie la colonna di `games`; il guard «ha una
  fine» resta. «Senza durata» segue il tempo scelto. Card e ordinamento per
  durata restano sulla storia principale.
- **`criticMax`** accanto a `criticMin`. I non votati restano fuori, come per
  ogni intervallo.
- **`criticSource`** (`metacritic` · `igdb` · `opencritic`), una sola: fonti
  con scale diverse non si mettono in OR. Con una fonte il filtro legge il voto
  **complessivo** in `game_scores` (`platform_slug` nullo), con un `EXISTS`;
  per Metacritic è il numero di testa, non quello di una piattaforma.
- **OpenCritic** compare fra le fonti solo con `SHOW_OPENCRITIC` acceso
  (scelta dell'utente: opzione a). Il web lo sa da `filterOptions.showOpenCritic`;
  il server, se spento, tratta `opencritic` come nessuna fonte.
- Nel web i due qualificatori stanno nell'URL e nelle playlist, ma **non
  contano fra i filtri accesi** e vanno al server **solo con l'intervallo
  acceso**: una playlist non salva un tempo HLTB che non filtra niente.
- Il pannello: una tendina sopra ciascuno slider («Quale tempo», «Fonte»). Il
  chip dice il qualificatore quando non è il default: «Durata (Completista)
  fino a 10 h», «Voto critica (IGDB) fino a 80». L'aiuto «Durata della storia
  principale (ore)» se ne va: la tendina e il «fino a 10 h» lo dicono già.

## Dove

- contratto: `durationBasisValues` in `packages/contracts/src/vocabulary.ts`,
  i tre campi in `BacklogFilterSchema` e `showOpenCritic` in
  `BacklogFilterOptionsSchema` (`schemas.ts`);
- server: `buildConditions` e `criticConditions` in
  `apps/api/src/services/backlog-search.ts`;
- web: `apps/web/lib/backlog-filter.ts`, `apps/web/components/backlog-filters.tsx`,
  i messaggi `filters.*` e la voce `filterTimesScores` della roadmap.

## Verifiche

- `backlog-search.test.ts` (Postgres vero): tempo completista e «senza durata»
  sul tempo scelto; `criticMax` da solo e con `criticMin`; la fonte sullo
  stesso gioco (Metacritic 66, IGDB 85, Metacritic PC 88 che non conta); un
  gioco senza voto di quella fonte; OpenCritic spento; `showOpenCritic`.
- `backlog-filter.test.ts`: i qualificatori vanno al server solo con
  l'intervallo, non contano, stanno nell'URL e nelle playlist.
- Screenshot del pannello, chiaro e scuro, desktop e telefono.
