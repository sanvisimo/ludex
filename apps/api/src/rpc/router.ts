import { ORPCError } from '@orpc/server';

import {
  addOwnershipToEntry,
  addToBacklog,
  findEntryByGame,
  findEntryById,
  removeFromBacklog,
  setBacklogStatus,
  updateBacklogEntry,
} from '../services/backlog';
import {
  listBacklogFilterOptions,
  searchBacklog,
} from '../services/backlog-search';
import {
  createGame,
  findGameById,
  findGameDetailById,
  listLatestGames,
  resolveGameFromIgdb,
  searchGames,
} from '../services/games';
import {
  findExistingPlatformSlugs,
  listPlatforms,
} from '../services/platforms';
import { gogLoginUrl } from '../external/gog';
import { deleteUserTag, listUserTags } from '../services/tags';
import {
  findStoreAccount,
  linkStore,
  listStoreAccounts,
  unlinkStoreAccount,
} from '../services/store-accounts';
import {
  dismissUnresolvedImport,
  listUnresolvedImports,
  resolveUnresolvedImport,
} from '../services/unresolved-imports';
import { enqueueImport, isImportRunning } from '../queue/imports';
import { authed, maybeAuthed, os } from './context';

export const router = os.router({
  platforms: {
    list: os.platforms.list.handler(() => listPlatforms()),
  },

  games: {
    latest: os.games.latest.handler(({ input }) =>
      listLatestGames(input.limit),
    ),

    byId: os.games.byId.use(maybeAuthed).handler(async ({ input, context }) => {
      const game = await findGameDetailById(input.id);
      if (!game)
        throw new ORPCError('NOT_FOUND', { message: 'Gioco inesistente' });

      // Da sloggati la scheda esiste comunque, semplicemente senza stato personale.
      const entry = context.user
        ? ((await findEntryByGame(context.user.id, game.id)) ?? null)
        : null;

      return { game, entry };
    }),

    create: os.games.create.use(authed).handler(async ({ input }) => {
      const game = await createGame(input.name);
      if (!game) throw new ORPCError('INTERNAL_SERVER_ERROR');
      return game;
    }),

    search: os.games.search
      .use(authed)
      .handler(({ input }) => searchGames(input.query)),

    fromIgdb: os.games.fromIgdb.use(authed).handler(async ({ input }) => {
      const game = await resolveGameFromIgdb(input.igdbId);
      if (!game)
        throw new ORPCError('NOT_FOUND', {
          message: 'IGDB non conosce questo id',
        });
      return game;
    }),
  },

  accounts: {
    list: os.accounts.list
      .use(authed)
      .handler(({ context }) => listStoreAccounts(context.user.id)),

    loginUrl: os.accounts.loginUrl.use(authed).handler(({ input }) => ({
      // Steam non ha un login da fare: l'utente incolla il proprio profilo, che
      // è pubblico. Gli altri mandano su una pagina del negozio.
      url: input.store === 'gog' ? gogLoginUrl() : null,
    })),

    link: os.accounts.link.use(authed).handler(async ({ input, context }) => {
      const account = await linkStore(context.user.id, input.store, input.value);

      // Collegare e importare sono la stessa azione per l'utente: non ha senso
      // fargli premere un secondo bottone per avere i suoi giochi.
      await enqueueImport({
        store: input.store,
        userId: context.user.id,
        steamId:
          input.store === 'steam' ? account.externalAccountId : undefined,
      });

      return { ...account, syncing: true };
    }),

    unlink: os.accounts.unlink
      .use(authed)
      .handler(async ({ input, context }) => {
        const removed = await unlinkStoreAccount(context.user.id, input.store);
        if (!removed)
          throw new ORPCError('NOT_FOUND', {
            message: `Nessun account ${input.store} collegato`,
          });
      }),

    sync: os.accounts.sync.use(authed).handler(async ({ input, context }) => {
      const account = await findStoreAccount(context.user.id, input.store);
      if (!account)
        throw new ORPCError('NOT_FOUND', {
          message: `Nessun account ${input.store} collegato`,
        });

      // Un credenziale morto non si sblocca riprovando: accodare qui vorrebbe
      // dire un job che fallisce e un utente che non capisce perché.
      if (account.status === 'needs_reauth') {
        throw new ORPCError('FORBIDDEN', {
          message: `Il collegamento a ${input.store} è scaduto: ricollega l'account`,
        });
      }

      // La coda deduplica per utente e negozio, quindi due click non fanno due
      // import; il controllo qui serve solo a dirlo, invece di far finta di
      // aver accodato.
      if (await isImportRunning(input.store, context.user.id)) {
        throw new ORPCError('CONFLICT', { message: 'Import già in corso' });
      }

      await enqueueImport({
        store: input.store,
        userId: context.user.id,
        steamId:
          input.store === 'steam' ? account.externalAccountId : undefined,
      });
    }),
  },

  imports: {
    unresolved: os.imports.unresolved
      .use(authed)
      .handler(({ context }) => listUnresolvedImports(context.user.id)),

    resolve: os.imports.resolve
      .use(authed)
      .handler(async ({ input, context }) => {
        const esito = await resolveUnresolvedImport(
          context.user.id,
          input.id,
          input.igdbId,
        );

        if (esito.status === 'not_found') {
          throw new ORPCError('NOT_FOUND', { message: 'Voce inesistente' });
        }
        if (esito.status === 'unknown_igdb_id') {
          throw new ORPCError('NOT_FOUND', {
            message: 'IGDB non conosce questo id',
          });
        }
        if (!esito.entry) throw new ORPCError('INTERNAL_SERVER_ERROR');

        return esito.entry;
      }),

    dismiss: os.imports.dismiss
      .use(authed)
      .handler(async ({ input, context }) => {
        const removed = await dismissUnresolvedImport(
          context.user.id,
          input.id,
        );
        if (!removed)
          throw new ORPCError('NOT_FOUND', { message: 'Voce inesistente' });
      }),
  },

  tags: {
    list: os.tags.list
      .use(authed)
      .handler(({ context }) => listUserTags(context.user.id)),

    remove: os.tags.remove.use(authed).handler(async ({ input, context }) => {
      const removed = await deleteUserTag(context.user.id, input.id);
      if (!removed)
        throw new ORPCError('NOT_FOUND', { message: 'Tag inesistente' });
    }),
  },

  backlog: {
    list: os.backlog.list
      .use(authed)
      .handler(({ input, context }) => searchBacklog(context.user.id, input)),

    filterOptions: os.backlog.filterOptions
      .use(authed)
      .handler(({ context }) => listBacklogFilterOptions(context.user.id)),

    add: os.backlog.add.use(authed).handler(async ({ input, context }) => {
      const game = await findGameById(input.gameId);
      if (!game)
        throw new ORPCError('NOT_FOUND', { message: 'Gioco inesistente' });

      // Una riga per gioco/utente: il secondo inserimento è un conflitto, non un
      // duplicato silenzioso.
      const existing = await findEntryByGame(context.user.id, input.gameId);
      if (existing)
        throw new ORPCError('CONFLICT', { message: 'Gioco già nel backlog' });

      // Validato qui e non lasciato alla foreign key, per dare un messaggio
      // sensato invece di un errore Postgres.
      const slugs = input.ownerships.map((ownership) => ownership.platformSlug);
      const known = await findExistingPlatformSlugs(slugs);
      const unknown = slugs.filter((slug) => !known.has(slug));
      if (unknown.length > 0) {
        throw new ORPCError('BAD_REQUEST', {
          message: `Piattaforme sconosciute: ${unknown.join(', ')}`,
        });
      }

      const id = await addToBacklog({
        userId: context.user.id,
        gameId: input.gameId,
        status: input.status,
        ownerships: input.ownerships,
      });

      const entry = await findEntryById(context.user.id, id);
      if (!entry) throw new ORPCError('INTERNAL_SERVER_ERROR');
      return entry;
    }),

    setStatus: os.backlog.setStatus
      .use(authed)
      .handler(async ({ input, context }) => {
        const updated = await setBacklogStatus(
          context.user.id,
          input.id,
          input.status,
        );
        if (!updated)
          throw new ORPCError('NOT_FOUND', { message: 'Riga inesistente' });

        const entry = await findEntryById(context.user.id, input.id);
        if (!entry) throw new ORPCError('INTERNAL_SERVER_ERROR');
        return entry;
      }),

    update: os.backlog.update
      .use(authed)
      .handler(async ({ input, context }) => {
        const updated = await updateBacklogEntry(context.user.id, input);
        if (!updated)
          throw new ORPCError('NOT_FOUND', { message: 'Riga inesistente' });

        const entry = await findEntryById(context.user.id, input.id);
        if (!entry) throw new ORPCError('INTERNAL_SERVER_ERROR');
        return entry;
      }),

    addOwnership: os.backlog.addOwnership
      .use(authed)
      .handler(async ({ input, context }) => {
        // Validata qui e non lasciata alla foreign key, come in `add`: un errore
        // Postgres grezzo non è un messaggio da mostrare a nessuno.
        const known = await findExistingPlatformSlugs([
          input.ownership.platformSlug,
        ]);
        if (!known.has(input.ownership.platformSlug)) {
          throw new ORPCError('BAD_REQUEST', {
            message: `Piattaforme sconosciute: ${input.ownership.platformSlug}`,
          });
        }

        const added = await addOwnershipToEntry(
          context.user.id,
          input.id,
          input.ownership,
        );
        if (!added)
          throw new ORPCError('NOT_FOUND', { message: 'Riga inesistente' });

        const entry = await findEntryById(context.user.id, input.id);
        if (!entry) throw new ORPCError('INTERNAL_SERVER_ERROR');
        return entry;
      }),

    remove: os.backlog.remove
      .use(authed)
      .handler(async ({ input, context }) => {
        const removed = await removeFromBacklog(context.user.id, input.id);
        if (!removed)
          throw new ORPCError('NOT_FOUND', { message: 'Riga inesistente' });
      }),
  },
});

export type AppRouter = typeof router;
