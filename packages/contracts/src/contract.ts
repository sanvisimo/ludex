import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  BacklogEntrySchema,
  BacklogStatusSchema,
  GameSchema,
  OwnershipInputSchema,
  PlatformSchema,
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
      .output(z.object({ game: GameSchema, entry: BacklogEntrySchema.nullable() })),

    // Inserimento di un gioco non risolto, con il solo titolo. Serve a poter
    // usare l'app prima che la ricerca IGDB esista; l'`igdbId` resta null e
    // l'enrichment dello step 3 lo riempirà.
    create: oc.input(z.object({ name: z.string().trim().min(1).max(200) })).output(GameSchema),
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

    remove: oc.input(z.object({ id: z.uuid() })).output(z.void()),
  },
};
