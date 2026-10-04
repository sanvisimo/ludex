-- Lo slug dei giochi che c'erano prima della colonna (12f). Da qui in poi lo
-- scrive chi crea il gioco, con la regola di apps/api/src/services/game-slug.ts;
-- qui la stessa regola in SQL: il nome, ai doppioni l'anno di uscita, poi l'id
-- IGDB. Fra giochi con lo stesso nome il primo entrato in Ludex tiene lo slug
-- pulito.
--
-- Gli accenti si tolgono con `translate` e non con l'estensione `unaccent`, che
-- per una migration sola non vale un'estensione in più sul server. La lista
-- copre le lettere latine accentate che `normalize('NFD')` scompone in JS.
CREATE TEMP TABLE "slug_base" AS
SELECT
  "id",
  "igdb_id",
  extract(year FROM "first_release_date")::int AS "year",
  "created_at",
  coalesce(
    nullif(
      rtrim(
        left(
          btrim(
            regexp_replace(
              regexp_replace(
                translate(
                  lower("name"),
                  'àáâãäåāăąçćčďèéêëēėęěìíîïīįñńňòóôõöōőùúûüūůűųýÿžźżšśşťř',
                  'aaaaaaaaacccdeeeeeeeeiiiiiinnnooooooouuuuuuuuyyzzzssstr'
                ),
                '[''’]', '', 'g'
              ),
              '[^a-z0-9]+', '-', 'g'
            ),
            '-'
          ),
          80
        ),
        '-'
      ),
      ''
    ),
    'game'
  ) AS "base"
FROM "games"
WHERE "slug" IS NULL;
--> statement-breakpoint
-- 1. Il nome, al primo arrivato.
UPDATE "games" g SET "slug" = r."base"
FROM (
  SELECT "id", "base",
    row_number() OVER (PARTITION BY "base" ORDER BY "created_at", "id") AS "n"
  FROM "slug_base"
) r
WHERE r."id" = g."id" AND r."n" = 1
  AND NOT EXISTS (SELECT 1 FROM "games" x WHERE x."slug" = r."base");
--> statement-breakpoint
-- 2. Ai doppioni l'anno, se c'è e se è libero.
UPDATE "games" g SET "slug" = r."candidate"
FROM (
  SELECT b."id", b."base" || '-' || b."year" AS "candidate",
    row_number() OVER (
      PARTITION BY b."base" || '-' || b."year" ORDER BY b."created_at", b."id"
    ) AS "n"
  FROM "slug_base" b
  JOIN "games" s ON s."id" = b."id" AND s."slug" IS NULL
  WHERE b."year" IS NOT NULL
) r
WHERE r."id" = g."id" AND r."n" = 1
  AND NOT EXISTS (SELECT 1 FROM "games" x WHERE x."slug" = r."candidate");
--> statement-breakpoint
-- 3. Poi l'id IGDB, che è unique: fra loro non si scontrano.
UPDATE "games" g SET "slug" = b."base" || '-' || b."igdb_id"
FROM "slug_base" b
WHERE b."id" = g."id" AND g."slug" IS NULL AND b."igdb_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "games" x WHERE x."slug" = b."base" || '-' || b."igdb_id"
  );
--> statement-breakpoint
-- 4. Ciò che resta — un gioco non risolto, senza id IGDB, che ha un omonimo —
--    prende un pezzo del suo UUID. Intero, se anche quel pezzo è preso.
UPDATE "games" g SET "slug" = b."base" || '-' || left(replace(g."id"::text, '-', ''), 8)
FROM "slug_base" b
WHERE b."id" = g."id" AND g."slug" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "games" x
    WHERE x."slug" = b."base" || '-' || left(replace(g."id"::text, '-', ''), 8)
  );
--> statement-breakpoint
UPDATE "games" g SET "slug" = b."base" || '-' || replace(g."id"::text, '-', '')
FROM "slug_base" b
WHERE b."id" = g."id" AND g."slug" IS NULL;
--> statement-breakpoint
DROP TABLE "slug_base";
