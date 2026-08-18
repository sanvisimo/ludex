import { z } from "zod";

import { backlogStatusValues, storeValues } from "./vocabulary";

export const BacklogStatusSchema = z.enum(backlogStatusValues);
export const StoreSchema = z.enum(storeValues);

export const PlatformSchema = z.object({
  slug: z.string(),
  name: z.string(),
  // Nullable: 17 piattaforme non hanno un id IGDB in Playnite. Vedi il commento
  // sulla tabella `platforms` in packages/db.
  igdbId: z.number().int().nullable(),
});

export const GameSchema = z.object({
  id: z.uuid(),
  // Un gioco non ancora risolto su IGDB è legittimo: nessun consumatore può dare
  // per scontato che i metadata siano popolati.
  igdbId: z.number().int().nullable(),
  name: z.string(),
  createdAt: z.date(),
});

// Risultato di ricerca su IGDB: NON è una riga `games`, è un candidato da cui
// scegliere. Anno, sviluppatore e tipo servono solo a disambiguare nella lista
// (fra tre "Resident Evil 4" il titolo da solo non basta) e non vengono salvati:
// i metadata sono lo step 3.
export const IgdbSearchHitSchema = z.object({
  igdbId: z.number().int(),
  name: z.string(),
  releaseYear: z.number().int().nullable(),
  developer: z.string().nullable(),
  // Valorizzato solo quando non è un gioco principale: "Port", "Remake"…
  gameType: z.string().nullable(),
});

export const OwnershipSchema = z.object({
  id: z.uuid(),
  platformSlug: z.string(),
  // Vuoto sugli inserimenti manuali: la piattaforma si sa sempre, il negozio no.
  store: StoreSchema.nullable(),
});

export const OwnershipInputSchema = z.object({
  platformSlug: z.string().min(1),
  store: StoreSchema.nullish(),
});

export const BacklogEntrySchema = z.object({
  id: z.uuid(),
  status: BacklogStatusSchema,
  game: GameSchema,
  ownerships: z.array(OwnershipSchema),
  createdAt: z.date(),
});

export type Platform = z.infer<typeof PlatformSchema>;
export type Game = z.infer<typeof GameSchema>;
export type IgdbSearchHit = z.infer<typeof IgdbSearchHitSchema>;
export type Ownership = z.infer<typeof OwnershipSchema>;
export type BacklogEntry = z.infer<typeof BacklogEntrySchema>;
