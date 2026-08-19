import { z } from "zod";

import {
  attributeKindValues,
  backlogStatusValues,
  storeValues,
  userTagKindValues,
} from "./vocabulary";

export const BacklogStatusSchema = z.enum(backlogStatusValues);
export const AttributeKindSchema = z.enum(attributeKindValues);
export const StoreSchema = z.enum(storeValues);
export const UserTagKindSchema = z.enum(userTagKindValues);

// Cinque stelle a mezze stelle: dieci valori da 0.5 a 5. Il `multipleOf` è la
// parte che conta — senza, un client potrebbe mandare 3.7 e il CHECK del
// database risponderebbe con un errore Postgres invece che con un messaggio.
export const RatingSchema = z.number().min(0.5).max(5).multipleOf(0.5);

// Le note sono l'unico campo di testo libero. Il tetto non è arbitrario: serve a
// impedire che una riga di backlog diventi un posto dove archiviare megabyte.
export const NotesSchema = z.string().trim().max(2000);

// Tag e categoria personali. Il `kind` viaggia insieme al nome perché lo stesso
// nome può esistere come tag e come categoria: sono due vocabolari distinti.
export const UserTagSchema = z.object({
  id: z.uuid(),
  kind: UserTagKindSchema,
  name: z.string(),
});

// In scrittura si mandano nome e tipo, non l'id: l'utente scrive una parola e
// non sa (né deve sapere) se quel tag esiste già. È il server a risolverla nel
// suo vocabolario, creandola se serve.
export const UserTagInputSchema = z.object({
  kind: UserTagKindSchema,
  name: z.string().trim().min(1).max(50),
});

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
  // Identificativo dell'immagine su IGDB, non un URL: la dimensione si sceglie
  // al momento di mostrarla. Nullo finché l'enrichment non è passato.
  coverImageId: z.string().nullable(),
  firstReleaseDate: z.date().nullable(),
  // La durata della storia principale, in minuti. È l'unico campo HLTB che sta
  // anche nelle liste: è la domanda a cui serve rispondere a colpo d'occhio
  // ("quanto mi ci vuole"), il resto è roba da scheda.
  hltbMainMinutes: z.number().int().nullable(),
  // Viaggia insieme alla durata perché senza si mostrerebbe una bugia: un gioco
  // senza campagna ha comunque un `hltbMainMinutes` — le 143 ore di
  // Counter-Strike 2 — che però è tempo investito, non una durata.
  hltbHasSolo: z.boolean().nullable(),
  createdAt: z.date(),
});

export const GameAttributeSchema = z.object({
  kind: AttributeKindSchema,
  igdbId: z.number().int(),
  name: z.string(),
});

// Le durate di HowLongToBeat, in minuti. Sono la ragione dello step 6 e la
// materia prima del filtro "stasera ho due ore" dello step 7.
//
// I conteggi viaggiano insieme alle durate perché una media su tre segnalazioni
// e una su tremila non valgono uguale, e chi legge deve poterlo sapere. I flag
// dicono che tipo di tempi quel gioco abbia: senza, "non ha una fine" e "durata
// non ancora presa" sarebbero lo stesso campo vuoto.
export const HltbTimesSchema = z.object({
  hltbMainMinutes: z.number().int().nullable(),
  hltbPlusMinutes: z.number().int().nullable(),
  hltbCompletionistMinutes: z.number().int().nullable(),
  hltbAllStylesMinutes: z.number().int().nullable(),
  hltbMainCount: z.number().int().nullable(),
  hltbPlusCount: z.number().int().nullable(),
  hltbCompletionistCount: z.number().int().nullable(),
  hltbAllStylesCount: z.number().int().nullable(),
  hltbHasSolo: z.boolean().nullable(),
  hltbHasCoop: z.boolean().nullable(),
  hltbHasVersus: z.boolean().nullable(),
});

// Scheda completa: quello che la lista non porta perché sarebbe peso inutile.
export const GameDetailSchema = GameSchema.extend({
  summary: z.string().nullable(),
  coverWidth: z.number().int().nullable(),
  coverHeight: z.number().int().nullable(),
  aggregatedRating: z.number().nullable(),
  aggregatedRatingCount: z.number().int().nullable(),
  attributes: z.array(GameAttributeSchema),
  ...HltbTimesSchema.shape,
  // Quando ciascuna fonte è stata sincronizzata con successo. Nullo = mai, e la
  // scheda può dirlo invece di mostrare campi vuoti senza spiegazione. Sono due
  // campi e non uno perché le fonti arrivano in momenti diversi: un gioco può
  // avere i metadati IGDB e non ancora le durate.
  igdbSyncedAt: z.date().nullable(),
  hltbSyncedAt: z.date().nullable(),
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
  // Come le riporta il negozio da cui viene l'import; nulle sugli inserimenti
  // manuali. Non dicono lo stato: sono un'informazione a sé.
  playtimeMinutes: z.number().int().nullable(),
  lastPlayedAt: z.date().nullable(),
});

export const OwnershipInputSchema = z.object({
  platformSlug: z.string().min(1),
  store: StoreSchema.nullish(),
});

export const BacklogEntrySchema = z.object({
  id: z.uuid(),
  status: BacklogStatusSchema,
  // Nullo = non votato, che non è la stessa cosa di votato male.
  rating: z.number().nullable(),
  notes: z.string().nullable(),
  tags: z.array(UserTagSchema),
  game: GameSchema,
  ownerships: z.array(OwnershipSchema),
  createdAt: z.date(),
});

// --- Import di librerie (step 4) ---

export const StoreAccountSchema = z.object({
  store: StoreSchema,
  // Lo SteamID64 per Steam. Si mostra all'utente: è la prova che ha collegato
  // il profilo giusto.
  externalAccountId: z.string(),
  // Null = collegato ma mai importato.
  lastSyncAt: z.date().nullable(),
  // Import in corso adesso. Letto dalla coda e non dal DB: durante il primo
  // import `lastSyncAt` è ancora nullo e la pagina non avrebbe niente da dire.
  syncing: z.boolean(),
});

// Una voce di libreria che l'import non ha saputo legare a un gioco. Il nome è
// quello del negozio: è tutto ciò che si può mostrare per farla riconoscere.
export const UnresolvedImportSchema = z.object({
  id: z.uuid(),
  store: StoreSchema,
  externalId: z.string(),
  name: z.string(),
  playtimeMinutes: z.number().int().nullable(),
  lastPlayedAt: z.date().nullable(),
});

export type Platform = z.infer<typeof PlatformSchema>;
export type Game = z.infer<typeof GameSchema>;
export type GameDetail = z.infer<typeof GameDetailSchema>;
export type HltbTimes = z.infer<typeof HltbTimesSchema>;
export type GameAttribute = z.infer<typeof GameAttributeSchema>;
export type IgdbSearchHit = z.infer<typeof IgdbSearchHitSchema>;
export type Ownership = z.infer<typeof OwnershipSchema>;
export type OwnershipInput = z.infer<typeof OwnershipInputSchema>;
export type UserTag = z.infer<typeof UserTagSchema>;
export type UserTagInput = z.infer<typeof UserTagInputSchema>;
export type BacklogEntry = z.infer<typeof BacklogEntrySchema>;
export type StoreAccount = z.infer<typeof StoreAccountSchema>;
export type UnresolvedImport = z.infer<typeof UnresolvedImportSchema>;
