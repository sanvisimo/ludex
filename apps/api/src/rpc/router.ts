import { ORPCError } from "@orpc/server";

import {
  addToBacklog,
  findEntryByGame,
  findEntryById,
  listBacklog,
  removeFromBacklog,
  setBacklogStatus,
} from "../services/backlog";
import {
  createGame,
  findGameById,
  findGameDetailById,
  listLatestGames,
  resolveGameFromIgdb,
  searchGames,
} from "../services/games";
import { findExistingPlatformSlugs, listPlatforms } from "../services/platforms";
import { authed, maybeAuthed, os } from "./context";

export const router = os.router({
  platforms: {
    list: os.platforms.list.handler(() => listPlatforms()),
  },

  games: {
    latest: os.games.latest.handler(({ input }) => listLatestGames(input.limit)),

    byId: os.games.byId.use(maybeAuthed).handler(async ({ input, context }) => {
      const game = await findGameDetailById(input.id);
      if (!game) throw new ORPCError("NOT_FOUND", { message: "Gioco inesistente" });

      // Da sloggati la scheda esiste comunque, semplicemente senza stato personale.
      const entry = context.user ? ((await findEntryByGame(context.user.id, game.id)) ?? null) : null;

      return { game, entry };
    }),

    create: os.games.create.use(authed).handler(async ({ input }) => {
      const game = await createGame(input.name);
      if (!game) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return game;
    }),

    search: os.games.search.use(authed).handler(({ input }) => searchGames(input.query)),

    fromIgdb: os.games.fromIgdb.use(authed).handler(async ({ input }) => {
      const game = await resolveGameFromIgdb(input.igdbId);
      if (!game) throw new ORPCError("NOT_FOUND", { message: "IGDB non conosce questo id" });
      return game;
    }),
  },

  backlog: {
    list: os.backlog.list.use(authed).handler(({ context }) => listBacklog(context.user.id)),

    add: os.backlog.add.use(authed).handler(async ({ input, context }) => {
      const game = await findGameById(input.gameId);
      if (!game) throw new ORPCError("NOT_FOUND", { message: "Gioco inesistente" });

      // Una riga per gioco/utente: il secondo inserimento è un conflitto, non un
      // duplicato silenzioso.
      const existing = await findEntryByGame(context.user.id, input.gameId);
      if (existing) throw new ORPCError("CONFLICT", { message: "Gioco già nel backlog" });

      // Validato qui e non lasciato alla foreign key, per dare un messaggio
      // sensato invece di un errore Postgres.
      const slugs = input.ownerships.map((ownership) => ownership.platformSlug);
      const known = await findExistingPlatformSlugs(slugs);
      const unknown = slugs.filter((slug) => !known.has(slug));
      if (unknown.length > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Piattaforme sconosciute: ${unknown.join(", ")}`,
        });
      }

      const id = await addToBacklog({
        userId: context.user.id,
        gameId: input.gameId,
        status: input.status,
        ownerships: input.ownerships,
      });

      const entry = await findEntryById(context.user.id, id);
      if (!entry) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return entry;
    }),

    setStatus: os.backlog.setStatus.use(authed).handler(async ({ input, context }) => {
      const updated = await setBacklogStatus(context.user.id, input.id, input.status);
      if (!updated) throw new ORPCError("NOT_FOUND", { message: "Riga inesistente" });

      const entry = await findEntryById(context.user.id, input.id);
      if (!entry) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return entry;
    }),

    remove: os.backlog.remove.use(authed).handler(async ({ input, context }) => {
      const removed = await removeFromBacklog(context.user.id, input.id);
      if (!removed) throw new ORPCError("NOT_FOUND", { message: "Riga inesistente" });
    }),
  },
});

export type AppRouter = typeof router;
