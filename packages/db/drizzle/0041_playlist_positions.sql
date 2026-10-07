-- Le playlist già salvate nascono con la posizione 0, il default della colonna
-- appena aggiunta: tutte a pari merito. Si numerano una volta nell'ordine in cui
-- l'utente le vedeva fino ad ora, cioè per nome, così il riordino a mano parte
-- da ciò che c'era e non da un ordine casuale. Per utente, da 0.
UPDATE "playlists" AS p
SET "position" = r."pos"
FROM (
  SELECT "id",
         row_number() OVER (PARTITION BY "user_id" ORDER BY lower("name"), "id") - 1 AS "pos"
  FROM "playlists"
) AS r
WHERE p."id" = r."id";
