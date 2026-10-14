-- I visori come piattaforme (9b PSN). Il seed 0002 viene da Playnite, che non
-- li ha; IGDB sì, e li tiene separati dalle console: _Moss_ è solo
-- «PlayStation VR», non «PlayStation 4». Id verificati su /v4/platforms il
-- 14/10/2026.
--
-- I visori dei negozi che importiamo o che sono in roadmap: PSN, Steam e il
-- Meta Quest Store. Restano fuori «Oculus VR» (162), voce generica dell'epoca
-- Rift, e Oculus Go (387).
--
-- Le copie restano dove sono: scegliere la piattaforma VR all'import, e
-- spostare quelle già scritte, è un lotto a parte.
INSERT INTO "platforms" ("slug", "name", "igdb_id") VALUES
  ('sony_playstation_vr', 'Sony PlayStation VR', 165),
  ('sony_playstation_vr2', 'Sony PlayStation VR2', 390),
  ('pc_steamvr', 'SteamVR', 163),
  ('oculus_quest', 'Oculus Quest', 384),
  ('meta_quest2', 'Meta Quest 2', 386),
  ('meta_quest3', 'Meta Quest 3', 471),
  ('oculus_rift', 'Oculus Rift', 385);
