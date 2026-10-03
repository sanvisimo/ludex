-- Il voto denormalizzato su `games` non sceglie più OpenCritic (12e): la
-- precedenza è Metacritic, poi IGDB (`CRITIC_PRECEDENCE` in
-- apps/api/src/services/scores.ts). Il codice la applica dalla prossima
-- scrittura di `game_scores`; qui si ricalcolano una volta le righe già
-- scritte con la regola vecchia, che sono soltanto quelle dove aveva vinto
-- OpenCritic: fra Metacritic e IGDB l'ordine non è cambiato.
--
-- Una sottoquery che non trova righe mette entrambe le colonne a NULL: è il
-- caso del gioco che aveva solo OpenCritic, e il voto giusto per lui è nessuno.
UPDATE "games" SET ("critic_score", "critic_score_source") = (
  SELECT s."score", s."source"
  FROM "game_scores" s
  WHERE s."game_id" = "games"."id"
    AND s."platform_slug" IS NULL
    AND s."source" IN ('metacritic', 'igdb')
  ORDER BY s."source" = 'metacritic' DESC
  LIMIT 1
)
WHERE "critic_score_source" = 'opencritic';
