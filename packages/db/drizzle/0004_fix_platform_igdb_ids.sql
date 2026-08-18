-- Riconciliazione della mappatura `platforms.igdb_id` contro l'elenco vero di
-- IGDB (220 piattaforme, endpoint /v4/platforms), fatta con
-- `pnpm --filter api platforms:audit`.
--
-- Il seed 0002 prendeva gli id dal file di Playnite senza poterli verificare:
-- mancavano le credenziali IGDB. Ora ci sono, e il risultato è che le 78
-- mappature esistenti sono **tutte corrette** — le differenze di nome
-- ("Sega Genesis" contro "Sega Mega Drive/Genesis") sono solo differenze di
-- nome. Nessuna UPDATE su quelle.
--
-- Restano i buchi. Nove si chiudono qui; nove restano NULL, e il perché sta nel
-- commento sulla tabella in src/schema/platforms.ts.

-- Il caso che il seed 0002 aveva rimandato: Playnite dà a Vectrex il 67, che su
-- IGDB è Intellivision. Vectrex è il 70, e la mappatura di
-- `mattel_intellivision` era giusta — non c'era nessuna collisione, solo un
-- buco.
UPDATE "platforms" SET "igdb_id" = 70 WHERE "slug" = 'vectrex';

UPDATE "platforms" SET "igdb_id" = 438 WHERE "slug" = 'arduboy';
UPDATE "platforms" SET "igdb_id" = 127 WHERE "slug" = 'fairchild_channelf';
UPDATE "platforms" SET "igdb_id" = 408 WHERE "slug" = 'megaduck';
UPDATE "platforms" SET "igdb_id" = 77 WHERE "slug" = 'sharp_x1';
UPDATE "platforms" SET "igdb_id" = 504 WHERE "slug" = 'uzebox';
UPDATE "platforms" SET "igdb_id" = 415 WHERE "slug" = 'watara_supervision';
UPDATE "platforms" SET "igdb_id" = 307 WHERE "slug" = 'nintendo_gameandwatch';

-- IGDB la chiama "PC-8800 Series". Trovata a mano: un abbinamento automatico sui
-- nomi non la prende, perché "88" e "8800" sono token diversi, e proponeva 157
-- (PC-6000 Series) che è un'altra macchina.
UPDATE "platforms" SET "igdb_id" = 125 WHERE "slug" = 'nec_pc88';

-- Non è una mappatura: è la grafia del nome, che Playnite scrive senza trattino.
-- Lo slug resta com'è anche se ha una trasposizione (`vci20`), perché è la
-- primary key e il punto di confronto con la fonte.
UPDATE "platforms" SET "name" = 'Commodore VIC-20' WHERE "slug" = 'commodore_vci20';
