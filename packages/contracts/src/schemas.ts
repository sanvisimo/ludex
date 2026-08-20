import { z } from 'zod';

import {
  attributeKindValues,
  backlogSortValues,
  backlogStatusValues,
  linkableStoreValues,
  scoreSourceValues,
  sortDirectionValues,
  storeAccountStatusValues,
  storeValues,
  userTagKindValues,
} from './vocabulary';

export const BacklogStatusSchema = z.enum(backlogStatusValues);
export const AttributeKindSchema = z.enum(attributeKindValues);
export const StoreSchema = z.enum(storeValues);
export const LinkableStoreSchema = z.enum(linkableStoreValues);
export const StoreAccountStatusSchema = z.enum(storeAccountStatusValues);
export const ScoreSourceSchema = z.enum(scoreSourceValues);
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

// Un voto della critica. `platformSlug` nullo è il voto complessivo del gioco:
// è l'unico che IGDB e OpenCritic danno, mentre Metacritic ne dà uno per
// piattaforma — e le due cose divergono parecchio (Mafia vale 88 su PC e 66 sul
// port Xbox, che è quello che loro pubblicano come voto del gioco).
//
// I campi dopo `reviewCount` valgono per una fonte sola e sono nulli sulle
// altre: sono l'unione di quello che le tre danno, non l'intersezione.
export const GameScoreSchema = z.object({
  source: ScoreSourceSchema,
  platformSlug: z.string().nullable(),
  score: z.number(),
  reviewCount: z.number().int().nullable(),
  medianScore: z.number().nullable(),
  percentRecommended: z.number().nullable(),
  tier: z.string().nullable(),
  positiveCount: z.number().int().nullable(),
  neutralCount: z.number().int().nullable(),
  negativeCount: z.number().int().nullable(),
  sentiment: z.string().nullable(),
});

export type GameScore = z.infer<typeof GameScoreSchema>;

// Scheda completa: quello che la lista non porta perché sarebbe peso inutile.
export const GameDetailSchema = GameSchema.extend({
  summary: z.string().nullable(),
  coverWidth: z.number().int().nullable(),
  coverHeight: z.number().int().nullable(),
  // Il voto scelto per precedenza, con la fonte da cui viene. È quello su cui
  // filtra e ordina lo step 7, e viaggia insieme a `scores` perché la
  // precedenza la decide il server: se la rifacesse il client, due punti del
  // sistema potrebbero rispondere in modo diverso alla stessa domanda.
  criticScore: z.number().nullable(),
  criticScoreSource: ScoreSourceSchema.nullable(),
  scores: z.array(GameScoreSchema),
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
  // Lo SteamID64 per Steam, il `user_id` per GOG. Si mostra all'utente quando
  // non c'è di meglio: su Steam è la prova che ha collegato il profilo giusto,
  // su GOG è un numero che non dice niente — per quello c'è `displayName`.
  externalAccountId: z.string(),
  // Come chiamare l'account davanti all'utente, dove il negozio lo dice.
  displayName: z.string().nullable(),
  // `needs_reauth`: il credenziale è scaduto o è stato revocato e nessun
  // reimport lo rimette a posto. La UI deve chiedere di ricollegare, non
  // mostrare un account che ha semplicemente smesso di aggiornarsi.
  status: StoreAccountStatusSchema,
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

// --- Filtraggio (step 7) ---

/**
 * I criteri con cui si interroga il proprio backlog.
 *
 * Tre regole valgono per tutto lo schema e spiegano quasi ogni scelta qui sotto:
 *
 * - **assente = non filtrare**. Nessun criterio ha un default che restringe: una
 *   richiesta vuota rende il backlog intero. I default che l'utente vede
 *   (nascondere `excluded`) li mette il client, che è l'unico posto dove può
 *   anche mostrarli spuntati.
 * - **i multi-valore sono in AND**: un gioco deve avere *tutti* i valori
 *   selezionati. In SQL è un `EXISTS` correlato per valore, tutti in AND, senza
 *   casi speciali. L'eccezione è `status`, che non è un insieme: una riga ha
 *   esattamente uno stato, quindi lì l'AND darebbe sempre zero ed è un `IN`.
 * - **un criterio attivo esclude i NULL**. Un gioco senza durata non è un gioco
 *   corto, e un gioco non votato non è un gioco votato male. Il client deve
 *   dirlo, o l'utente crede di aver perso metà libreria.
 */
export const BacklogFilterSchema = z.object({
  // Solo il nome del gioco. Le note sono testo libero per scelta, e per la
  // stessa scelta non sono un campo su cui si cerca.
  q: z.string().trim().min(1).max(100).optional(),
  // In OR fra loro: è l'unico criterio a valore singolo per riga. Vedi sopra.
  status: z.array(BacklogStatusSchema).max(10).optional(),
  platforms: z.array(z.string().min(1)).max(20).optional(),
  stores: z.array(StoreSchema).max(20).optional(),
  // Gli id di `igdb_attributes`, non le coppie (kind, igdbId): sono la chiave
  // che `game_attributes` referenzia davvero, e il client li riceve da
  // `backlog.filterOptions` senza doverli comporre.
  attributes: z.array(z.number().int().positive()).max(20).optional(),
  // Per id e non per nome, al contrario della scrittura: là l'utente scrive una
  // parola e non deve sapere se esiste, qui la spunta da una lista che esiste.
  tags: z.array(z.uuid()).max(20).optional(),
  // Minuti, come la colonna: "stasera ho due ore" senza conversioni. Confronta
  // la storia principale, ed è vincolato ai giochi che una fine ce l'hanno —
  // le 143 ore di Counter-Strike 2 sono tempo investito, non una durata.
  durationMin: z.number().int().min(0).max(600_000).optional(),
  durationMax: z.number().int().min(0).max(600_000).optional(),
  ratingMin: RatingSchema.optional(),
  ratingMax: RatingSchema.optional(),
  criticMin: z.number().min(0).max(100).optional(),
  // Anni interi, non date: nessuno filtra la propria libreria per giorno.
  releasedFrom: z.number().int().min(1950).max(2100).optional(),
  releasedTo: z.number().int().min(1950).max(2100).optional(),
  // Nessun possesso con ore giocate. Attenzione a cosa vuol dire: sugli
  // inserimenti manuali `playtimeMinutes` è NULL — "non lo so", non "zero" —
  // e quei giochi rientrano qui, perché nessuno ha mai detto il contrario.
  neverPlayed: z.boolean().optional(),
});

// I NULL vanno in fondo su ogni chiave: ordinando per durata, senza, la prima
// schermata sarebbe tutta di giochi non ancora arricchiti.
export const BacklogSortSchema = z.enum(backlogSortValues);

export const SortDirectionSchema = z.enum(sortDirectionValues);

export const BacklogQuerySchema = BacklogFilterSchema.extend({
  sort: BacklogSortSchema.default('addedAt'),
  direction: SortDirectionSchema.default('desc'),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

// `total` è il conteggio **prima** di limit/offset: serve a dire "128 giochi" e
// a sapere se c'è dell'altro da caricare, e non si ricava contando `entries`.
export const BacklogListSchema = z.object({
  entries: z.array(BacklogEntrySchema),
  total: z.number().int(),
});

/**
 * Di che cosa si compone il pannello dei filtri per *questo* utente.
 *
 * Solo i valori presenti nel suo backlog, non gli elenchi completi: una tendina
 * con 96 piattaforme di cui ne possiedi tre, o con 23 generi di cui ne usi otto,
 * è rumore che nasconde le voci che contano. I tag personali non sono qui perché
 * `tags.list` li dà già, ed è giusto che li dia tutti: il vocabolario è chiuso e
 * corto per costruzione.
 */
export const FilterAttributeSchema = z.object({
  id: z.number().int(),
  kind: AttributeKindSchema,
  name: z.string(),
});

export const BacklogFilterOptionsSchema = z.object({
  platforms: z.array(PlatformSchema),
  stores: z.array(StoreSchema),
  attributes: z.array(FilterAttributeSchema),
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
export type BacklogFilter = z.infer<typeof BacklogFilterSchema>;
export type BacklogSort = z.infer<typeof BacklogSortSchema>;
export type SortDirection = z.infer<typeof SortDirectionSchema>;
// L'input **dopo** il parse: `sort`, `direction`, `limit` e `offset` hanno un
// default, quindi il servizio li riceve sempre valorizzati. È il tipo che serve
// a `apps/api`; il client ne manda una versione con quei quattro opzionali.
export type BacklogQuery = z.infer<typeof BacklogQuerySchema>;
export type BacklogQueryInput = z.input<typeof BacklogQuerySchema>;
export type BacklogFilterOptions = z.infer<typeof BacklogFilterOptionsSchema>;
export type FilterAttribute = z.infer<typeof FilterAttributeSchema>;
