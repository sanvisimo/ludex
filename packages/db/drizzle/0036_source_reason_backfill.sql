-- Il motivo dei `not_found` che c'erano prima della colonna (11a). Da qui in
-- poi lo scrive l'enrichment, con `markSource`; qui si ricava dal testo di
-- `error`, che finora era l'unico posto dove stava. I testi sono quelli dei
-- servizi di enrichment al 06/10/2026: uno che non torna resta nullo, e la
-- sezione admin lo tratta come da sistemare.
UPDATE "game_sources"
SET "reason" = CASE
  WHEN "error" LIKE 'uscito nel % nasce nel %' THEN 'too_old'
  WHEN "error" LIKE '% non ha nulla per %' THEN 'no_results'
  WHEN "error" LIKE 'nessun candidato convincente%'
    OR "error" LIKE 'nessuna scheda % convincente%' THEN 'ambiguous'
  WHEN "error" LIKE '% è del %, il nostro del %' THEN 'year_mismatch'
  WHEN "error" LIKE '%già agganciata a un altro gioco' THEN 'taken'
  WHEN "error" LIKE '% non esiste più'
    OR "error" LIKE 'la scheda % non esiste'
    OR "error" LIKE 'IGDB non conosce l''id %' THEN 'gone'
END::"source_reason"
WHERE "status" = 'not_found';
