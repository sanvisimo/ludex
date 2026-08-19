import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  BacklogEntrySchema,
  BacklogStatusSchema,
  GameDetailSchema,
  GameSchema,
  IgdbSearchHitSchema,
  NotesSchema,
  OwnershipInputSchema,
  PlatformSchema,
  RatingSchema,
  StoreAccountSchema,
  UnresolvedImportSchema,
  UserTagInputSchema,
  UserTagSchema,
} from "./schemas";

// Contratto oRPC: sola descrizione di input e output, nessuna implementazione.
// È la ragione per cui questo package non dipende da `packages/db` — web e
// mobile importano da qui e ottengono i tipi senza tirarsi dietro il server.
// L'implementazione sta in `apps/api`, che chiama `implement(contract)`.
export const contract = {
  platforms: {
    // Lista di riferimento per le tendine di inserimento. Pubblica: è dato
    // statico, non dice nulla su nessun utente.
    list: oc.output(z.array(PlatformSchema)),
  },

  games: {
    // Catalogo pubblico: "questi giochi Ludex li conosce". Ordinato per data di
    // inserimento e volutamente anonimo — non dice chi li ha aggiunti.
    latest: oc
      .input(z.object({ limit: z.number().int().min(1).max(50).default(24) }))
      .output(z.array(GameSchema)),

    // Scheda gioco. Il gioco si vede sempre; `entry` è popolato solo se chi
    // guarda è autenticato e ha quel gioco nel backlog. È la pagina auth/no-auth.
    byId: oc
      .input(z.object({ id: z.uuid() }))
      .output(z.object({ game: GameDetailSchema, entry: BacklogEntrySchema.nullable() })),

    // Inserimento di un gioco non risolto, con il solo titolo. Via di scampo
    // quando IGDB non conosce il gioco: l'`igdbId` resta null e l'enrichment
    // dello step 3 non avrà nulla su cui lavorare finché non viene risolto.
    create: oc.input(z.object({ name: z.string().trim().min(1).max(200) })).output(GameSchema),

    // Cerca su IGDB. Sincrona e senza coda: è il passo 2 del flusso di
    // risoluzione, distinto dall'enrichment asincrono dello step 3.
    // Autenticata perché consuma il rate limit delle nostre credenziali.
    search: oc
      .input(z.object({ query: z.string().trim().min(2).max(100) }))
      .output(z.array(IgdbSearchHitSchema)),

    // Scelto un candidato, crea la riga `games` **o riusa quella già presente**
    // se un altro utente aveva già importato lo stesso gioco. È qui che vive la
    // regola "l'enrichment si paga una volta sola".
    fromIgdb: oc.input(z.object({ igdbId: z.number().int().positive() })).output(GameSchema),
  },

  accounts: {
    // Gli account di negozio collegati. Oggi solo Steam, ma la forma è quella
    // che serviranno anche GOG ed Epic.
    list: oc.output(z.array(StoreAccountSchema)),

    // Accetta l'URL del profilo, lo SteamID64 o il solo nome scelto: sono le
    // tre cose che un utente ha davvero sotto mano. Collegare fa partire subito
    // il primo import.
    linkSteam: oc
      .input(z.object({ profile: z.string().trim().min(1).max(200) }))
      .output(StoreAccountSchema),

    unlinkSteam: oc.output(z.void()),

    // Rilancia l'import di una libreria già collegata.
    syncSteam: oc.output(z.void()),
  },

  imports: {
    // Le voci che l'import non ha saputo legare a un gioco.
    unresolved: oc.output(z.array(UnresolvedImportSchema)),

    // L'utente sceglie il gioco giusto su IGDB: la voce diventa un gioco nel
    // backlog, col possesso del negozio da cui veniva, e sparisce dalla lista.
    resolve: oc
      .input(z.object({ id: z.uuid(), igdbId: z.number().int().positive() }))
      .output(BacklogEntrySchema),

    // "Non è un gioco": i client beta e i Friend's Pass non si risolveranno mai,
    // e senza una via d'uscita resterebbero nella lista per sempre.
    dismiss: oc.input(z.object({ id: z.uuid() })).output(z.void()),
  },

  tags: {
    // Il vocabolario personale, per suggerire mentre si scrive invece di
    // costringere a ricordarsi come si era chiamato un tag il mese scorso.
    list: oc.output(z.array(UserTagSchema)),
  },

  backlog: {
    list: oc.output(z.array(BacklogEntrySchema)),

    // Almeno un possesso è obbligatorio: la piattaforma è il filtro hard del
    // motore decisionale, e una riga senza piattaforma sarebbe invisibile a
    // "stasera ho la Switch accesa".
    add: oc
      .input(
        z.object({
          gameId: z.uuid(),
          status: BacklogStatusSchema.default("backlog"),
          ownerships: z.array(OwnershipInputSchema).min(1),
        }),
      )
      .output(BacklogEntrySchema),

    setStatus: oc
      .input(z.object({ id: z.uuid(), status: BacklogStatusSchema }))
      .output(BacklogEntrySchema),

    // I campi personali dello step 5. Ogni campo è **opzionale e distingue
    // assente da null**: assente vuol dire "non toccare", `null` vuol dire
    // "togli". Senza questa distinzione un form che manda solo il voto
    // cancellerebbe le note.
    //
    // I tag si mandano interi, non a differenza: il server riscrive l'insieme,
    // come fa l'enrichment con gli attributi IGDB. È ciò che rende la
    // mutazione idempotente e toglie di mezzo un endpoint "stacca tag".
    update: oc
      .input(
        z.object({
          id: z.uuid(),
          status: BacklogStatusSchema.optional(),
          rating: RatingSchema.nullish(),
          notes: NotesSchema.nullish(),
          tags: z.array(UserTagInputSchema).max(50).optional(),
        }),
      )
      .output(BacklogEntrySchema),

    // Aggiunge una piattaforma a un gioco già nel backlog: fino a qui l'unico
    // modo era cancellare la riga e rifarla. Idempotente — riaggiungere lo
    // stesso possesso non è un errore e non duplica nulla.
    addOwnership: oc
      .input(z.object({ id: z.uuid(), ownership: OwnershipInputSchema }))
      .output(BacklogEntrySchema),

    remove: oc.input(z.object({ id: z.uuid() })).output(z.void()),
  },
};
