import { ORPCError } from '@orpc/server';
import { auth } from '@repo/auth';

import {
  addOwnershipToEntry,
  addToBacklog,
  findEntryByGame,
  findEntryById,
  pickRandomBacklogGame,
  removeFromBacklog,
  removeOwnershipFromEntry,
  setBacklogHidden,
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
  findGameIdBySlug,
  resolveGameFromIgdb,
  searchGames,
} from '../services/games';
import {
  findSourceIdOwner,
  listMissing,
  missingSummary,
  parseSourceId,
  retrySource,
  searchSource,
  setSourceExternalId,
} from '../services/admin-sources';
import {
  hideUnresolvedForAll,
  listGlobalHidden,
  listUnresolvedGroups,
  resolveUnresolvedForAll,
  unhideUnresolvedForAll,
} from '../services/admin-unresolved';
import {
  gameAdminDetail,
  linkGameToIgdb,
  listUnlinkedGames,
  previewRepoint,
  repointLink,
} from '../services/admin-games';
import { exportAccount } from '../services/account-export';
import { listUsers } from '../services/admin-users';
import { listHomeBands } from '../services/home';
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  movePlaylist,
  openPlaylist,
  sharePlaylist,
  unsharePlaylist,
  updatePlaylist,
} from '../services/playlists';
import { openSharedPlaylist } from '../services/shared-playlists';
import {
  addToWishlist,
  createWishlist,
  deleteWishlist,
  listWishlists,
  moveWishlist,
  openWishlist,
  removeFromWishlist,
  renameWishlist,
  wishlistsForGame,
} from '../services/wishlist';
import {
  closeReports,
  createReports,
  listOpenReports,
  openReportsForGame,
} from '../services/reports';
import {
  removeSteamLogin,
  startSteamLogin,
  steamLoginStatus,
} from '../services/steam-login';
import {
  searchCatalog,
  searchIgdbNotInCatalog,
} from '../services/catalog-search';
import {
  findExistingPlatformSlugs,
  listPlatforms,
} from '../services/platforms';
import { deleteUserTag, listUserTags } from '../services/tags';
import {
  findStoreAccount,
  linkSteamWebToken,
  linkStore,
  listStoreAccounts,
  renameStoreAccount,
  setStoreAccountAutoSync,
  StoreAccountMismatchError,
  storeLoginUrl,
  syncAllStoreAccounts,
  unlinkImpact,
  unlinkStoreAccount,
} from '../services/store-accounts';
import {
  listUnresolvedImports,
  resolveUnresolvedImport,
  setUnresolvedImportHidden,
} from '../services/unresolved-imports';
import { getUserSettings, updateUserSettings } from '../services/user-settings';
import { eventForUser, liveEvents } from '../lib/events';
import { SteamLibraryNotVisibleError } from '../external/steam';
import { SteamWebTokenError } from '../external/steam-auth';
import { enqueueImport, isImportRunning } from '../queue/imports';
import { admin, authed, maybeAuthed, os } from './context';
import { asAdminAuthCall } from './admin-auth';

/**
 * L'account che si sta ricollegando, se la richiesta ne nomina uno.
 *
 * Sempre dell'utente e dello stesso negozio: un id di un altro utente, o di un
 * account GOG passato a un ricollegamento Amazon, è un 404 e non un collegamento
 * nuovo fatto di nascosto.
 */
async function relinkTarget(
  userId: string,
  store: string,
  accountId: string | null | undefined,
) {
  if (!accountId) return null;
  const account = await findStoreAccount(userId, accountId);
  if (!account || account.store !== store) {
    throw new ORPCError('NOT_FOUND', { message: 'Account inesistente' });
  }
  return account;
}

export const router = os.router({
  platforms: {
    list: os.platforms.list.handler(() => listPlatforms()),
  },

  games: {
    home: os.games.home
      .use(maybeAuthed)
      .handler(({ context }) => listHomeBands(context.user?.id ?? null)),

    bySlug: os.games.bySlug
      .use(maybeAuthed)
      .handler(async ({ input, context }) => {
        const id = await findGameIdBySlug(input.slug);
        const game = id
          ? await findGameDetailById(id, context.user?.id ?? null)
          : null;
        if (!game)
          throw new ORPCError('NOT_FOUND', { message: 'Gioco inesistente' });

        // Da sloggati la scheda esiste comunque, semplicemente senza stato personale.
        const entry = context.user
          ? ((await findEntryByGame(context.user.id, game.id)) ?? null)
          : null;

        return { game, entry };
      }),

    find: os.games.find
      .use(maybeAuthed)
      .handler(({ input, context }) =>
        searchCatalog(input, context.user?.id ?? null),
      ),

    findOnIgdb: os.games.findOnIgdb
      .use(authed)
      .handler(({ input }) => searchIgdbNotInCatalog(input.query)),

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

    loginUrl: os.accounts.loginUrl
      .use(authed)
      .handler(async ({ input, context }) => {
        const relinking = await relinkTarget(
          context.user.id,
          input.store,
          input.accountId,
        );
        // Steam non ha un login da fare: l'utente incolla il proprio profilo,
        // che è pubblico. Gli altri mandano su una pagina del negozio.
        return storeLoginUrl(context.user.id, input.store, relinking);
      }),

    link: os.accounts.link.use(authed).handler(async ({ input, context }) => {
      const relinking = await relinkTarget(
        context.user.id,
        input.store,
        input.accountId,
      );

      const account = await linkStore(
        context.user.id,
        input.store,
        input.value,
        {
          label: input.label,
          state: input.state,
          relinking,
        },
      ).catch((error: unknown) => {
        if (error instanceof StoreAccountMismatchError) {
          throw new ORPCError('CONFLICT', { message: error.message });
        }
        // Un profilo Steam privato: la libreria non si può leggere. Non è un
        // input mal scritto (BAD_REQUEST, che la schermata legge come un campo
        // sbagliato) ma uno stato del profilo che l'utente può cambiare.
        if (error instanceof SteamLibraryNotVisibleError) {
          throw new ORPCError('PRECONDITION_FAILED', {
            message: error.message,
          });
        }
        throw error;
      });

      // Collegare e importare sono la stessa azione per l'utente: non ha senso
      // fargli premere un secondo bottone per avere i suoi giochi.
      await enqueueImport(account.store, { storeAccountId: account.id });

      return { ...account, syncing: true };
    }),

    steamLogin: {
      start: os.accounts.steamLogin.start
        .use(authed)
        .handler(async ({ input, context }) => {
          const relinking = await relinkTarget(
            context.user.id,
            'steam',
            input.accountId,
          );
          return startSteamLogin(context.user.id, {
            label: input.label,
            relinking,
          });
        }),

      token: os.accounts.steamLogin.token
        .use(authed)
        .handler(async ({ input, context }) => {
          const relinking = await relinkTarget(
            context.user.id,
            'steam',
            input.accountId,
          );
          const account = await linkSteamWebToken(
            context.user.id,
            input.token,
            { label: input.label, relinking },
          ).catch((error: unknown) => {
            if (error instanceof SteamWebTokenError) {
              throw new ORPCError('BAD_REQUEST', {
                message: error.message,
                // La schermata dice cosa non va dalla `reason`, non dal testo.
                data: { reason: error.reason },
              });
            }
            if (error instanceof StoreAccountMismatchError) {
              throw new ORPCError('CONFLICT', { message: error.message });
            }
            throw error;
          });
          await enqueueImport('steam', { storeAccountId: account.id });
          return { ...account, syncing: true };
        }),

      status: os.accounts.steamLogin.status
        .use(authed)
        .handler(({ input, context }) =>
          steamLoginStatus(context.user.id, input.loginId),
        ),

      remove: os.accounts.steamLogin.remove
        .use(authed)
        .handler(async ({ input, context }) => {
          const account = await findStoreAccount(
            context.user.id,
            input.accountId,
          );
          if (!account || account.store !== 'steam')
            throw new ORPCError('NOT_FOUND', {
              message: 'Account inesistente',
            });

          // Un import in corso riscriverebbe le copie appena tolte.
          if (await isImportRunning(account.id)) {
            throw new ORPCError('CONFLICT', { message: 'Import in corso' });
          }

          const removed = await removeSteamLogin(
            context.user.id,
            input.accountId,
          );
          if (!removed)
            throw new ORPCError('NOT_FOUND', {
              message: 'Account inesistente',
            });
          return removed;
        }),
    },

    rename: os.accounts.rename
      .use(authed)
      .handler(async ({ input, context }) => {
        const account = await renameStoreAccount(
          context.user.id,
          input.accountId,
          input.label ?? null,
        );
        if (!account)
          throw new ORPCError('NOT_FOUND', { message: 'Account inesistente' });
        return { ...account, syncing: await isImportRunning(account.id) };
      }),

    unlinkImpact: os.accounts.unlinkImpact
      .use(authed)
      .handler(async ({ input, context }) => {
        const impact = await unlinkImpact(context.user.id, input.accountId);
        if (!impact)
          throw new ORPCError('NOT_FOUND', { message: 'Account inesistente' });
        return impact;
      }),

    unlink: os.accounts.unlink
      .use(authed)
      .handler(async ({ input, context }) => {
        const account = await findStoreAccount(
          context.user.id,
          input.accountId,
        );
        if (!account || account.status === 'unlinked')
          throw new ORPCError('NOT_FOUND', { message: 'Account inesistente' });

        // Il worker guarda `unlinked` solo quando parte: scollegando a metà, il
        // job continuerebbe a scrivere possessi su un account che non c'è più,
        // e con `purge` la cancellazione della riga si scontrerebbe con i
        // possessi appena scritti.
        if (await isImportRunning(account.id)) {
          throw new ORPCError('CONFLICT', { message: 'Import in corso' });
        }

        const removed = await unlinkStoreAccount(
          context.user.id,
          input.accountId,
          input.ownerships === 'purge' ? 'purge' : 'keep',
        );
        if (!removed)
          throw new ORPCError('NOT_FOUND', { message: 'Account inesistente' });
      }),

    sync: os.accounts.sync.use(authed).handler(async ({ input, context }) => {
      const account = await findStoreAccount(context.user.id, input.accountId);
      if (!account || account.status === 'unlinked')
        throw new ORPCError('NOT_FOUND', { message: 'Account inesistente' });

      // Un credenziale morto non si sblocca riprovando: accodare qui vorrebbe
      // dire un job che fallisce e un utente che non capisce perché.
      if (account.status === 'needs_reauth') {
        throw new ORPCError('FORBIDDEN', {
          message: `Il collegamento a ${account.store} è scaduto: ricollega l'account`,
        });
      }

      // La coda deduplica per account, quindi due click non fanno due import; il
      // controllo qui serve solo a dirlo, invece di far finta di aver accodato.
      if (await isImportRunning(account.id)) {
        throw new ORPCError('CONFLICT', { message: 'Import già in corso' });
      }

      await enqueueImport(account.store, { storeAccountId: account.id });
    }),

    syncAll: os.accounts.syncAll
      .use(authed)
      .handler(({ context }) => syncAllStoreAccounts(context.user.id)),

    setAutoSync: os.accounts.setAutoSync
      .use(authed)
      .handler(async ({ input, context }) => {
        const account = await setStoreAccountAutoSync(
          context.user.id,
          input.accountId,
          input.autoSync,
        );
        if (!account)
          throw new ORPCError('NOT_FOUND', { message: 'Account inesistente' });
        return { ...account, syncing: await isImportRunning(account.id) };
      }),
  },

  settings: {
    get: os.settings.get
      .use(authed)
      .handler(({ context }) => getUserSettings(context.user.id)),

    update: os.settings.update
      .use(authed)
      .handler(({ input, context }) =>
        updateUserSettings(context.user.id, input),
      ),
  },

  accountData: {
    export: os.accountData.export
      .use(authed)
      .handler(({ context }) => exportAccount(context.user.id)),
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

    setHidden: os.imports.setHidden
      .use(authed)
      .handler(async ({ input, context }) => {
        const row = await setUnresolvedImportHidden(
          context.user.id,
          input.id,
          input.kind,
        );
        if (!row)
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

  playlists: {
    list: os.playlists.list
      .use(authed)
      .handler(({ context }) => listPlaylists(context.user.id)),

    get: os.playlists.get.use(authed).handler(async ({ input, context }) => {
      const playlist = await openPlaylist(context.user.id, input);
      if (!playlist)
        throw new ORPCError('NOT_FOUND', { message: 'Playlist inesistente' });
      return playlist;
    }),

    create: os.playlists.create
      .use(authed)
      .handler(async ({ input, context }) => {
        const playlist = await createPlaylist(context.user.id, input);
        if (!playlist)
          throw new ORPCError('CONFLICT', {
            message: 'Hai già una playlist con questo nome',
          });
        return playlist;
      }),

    update: os.playlists.update
      .use(authed)
      .handler(async ({ input, context }) => {
        const playlist = await updatePlaylist(context.user.id, input);
        if (playlist === null)
          throw new ORPCError('CONFLICT', {
            message: 'Hai già una playlist con questo nome',
          });
        if (!playlist)
          throw new ORPCError('NOT_FOUND', { message: 'Playlist inesistente' });
        return playlist;
      }),

    share: os.playlists.share
      .use(authed)
      .handler(async ({ input, context }) => {
        const token = await sharePlaylist(context.user.id, input.id);
        if (!token)
          throw new ORPCError('NOT_FOUND', { message: 'Playlist inesistente' });
        return { token };
      }),

    unshare: os.playlists.unshare
      .use(authed)
      .handler(async ({ input, context }) => {
        const done = await unsharePlaylist(context.user.id, input.id);
        if (!done)
          throw new ORPCError('NOT_FOUND', { message: 'Playlist inesistente' });
      }),

    move: os.playlists.move.use(authed).handler(async ({ input, context }) => {
      const moved = await movePlaylist(
        context.user.id,
        input.id,
        input.direction,
      );
      if (!moved)
        throw new ORPCError('NOT_FOUND', { message: 'Playlist inesistente' });
    }),

    remove: os.playlists.remove
      .use(authed)
      .handler(async ({ input, context }) => {
        const removed = await deletePlaylist(context.user.id, input.id);
        if (!removed)
          throw new ORPCError('NOT_FOUND', { message: 'Playlist inesistente' });
      }),
  },

  wishlists: {
    list: os.wishlists.list
      .use(authed)
      .handler(({ context }) => listWishlists(context.user.id)),

    create: os.wishlists.create
      .use(authed)
      .handler(async ({ input, context }) => {
        const list = await createWishlist(context.user.id, input.name);
        if (!list)
          throw new ORPCError('CONFLICT', {
            message: 'Hai già una lista con questo nome',
          });
        return list;
      }),

    rename: os.wishlists.rename
      .use(authed)
      .handler(async ({ input, context }) => {
        const list = await renameWishlist(
          context.user.id,
          input.id,
          input.name,
        );
        if (list === null)
          throw new ORPCError('CONFLICT', {
            message: 'Hai già una lista con questo nome',
          });
        if (!list)
          throw new ORPCError('NOT_FOUND', { message: 'Lista inesistente' });
        return list;
      }),

    remove: os.wishlists.remove
      .use(authed)
      .handler(async ({ input, context }) => {
        if (!(await deleteWishlist(context.user.id, input.id)))
          throw new ORPCError('NOT_FOUND', { message: 'Lista inesistente' });
      }),

    move: os.wishlists.move.use(authed).handler(async ({ input, context }) => {
      if (!(await moveWishlist(context.user.id, input.id, input.direction)))
        throw new ORPCError('NOT_FOUND', { message: 'Lista inesistente' });
    }),

    get: os.wishlists.get.use(authed).handler(async ({ input, context }) => {
      const list = await openWishlist(context.user.id, input);
      if (!list)
        throw new ORPCError('NOT_FOUND', { message: 'Lista inesistente' });
      return list;
    }),

    add: os.wishlists.add.use(authed).handler(async ({ input, context }) => {
      const result = await addToWishlist(context.user.id, input);
      if (result.ok) return result.list;
      if (result.reason === 'owned')
        // Il gioco è già nel backlog: il suo posto è lì.
        throw new ORPCError('CONFLICT', {
          message: 'Hai già questo gioco nel backlog',
        });
      throw new ORPCError('NOT_FOUND', {
        message:
          result.reason === 'game' ? 'Gioco inesistente' : 'Lista inesistente',
      });
    }),

    removeGame: os.wishlists.removeGame
      .use(authed)
      .handler(async ({ input, context }) => {
        if (
          !(await removeFromWishlist(
            context.user.id,
            input.listId,
            input.gameId,
          ))
        )
          throw new ORPCError('NOT_FOUND', { message: 'Lista inesistente' });
      }),

    forGame: os.wishlists.forGame
      .use(authed)
      .handler(({ input, context }) =>
        wishlistsForGame(context.user.id, input.gameId),
      ),
  },

  sharedPlaylists: {
    // Pubblica: `maybeAuthed` serve solo allo stato di chi guarda.
    get: os.sharedPlaylists.get
      .use(maybeAuthed)
      .handler(async ({ input, context }) => {
        const playlist = await openSharedPlaylist(
          input,
          context.user?.id ?? null,
        );
        if (!playlist)
          throw new ORPCError('NOT_FOUND', { message: 'Playlist inesistente' });
        return playlist;
      }),
  },

  backlog: {
    list: os.backlog.list
      .use(authed)
      .handler(({ input, context }) => searchBacklog(context.user.id, input)),

    random: os.backlog.random.use(authed).handler(async ({ context }) => {
      const slug = await pickRandomBacklogGame(context.user.id);
      return slug ? { slug } : null;
    }),

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
        // `hidden` perché «ce l'hai già» su un gioco che in lista non si vede
        // non si capisce: il client deve poter dire «è fra i nascosti».
        throw new ORPCError('CONFLICT', {
          message: 'Gioco già nel backlog',
          data: { hidden: existing.hiddenAt !== null },
        });

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

    removeOwnership: os.backlog.removeOwnership
      .use(authed)
      .handler(async ({ input, context }) => {
        const esito = await removeOwnershipFromEntry(
          context.user.id,
          input.id,
          input.ownershipId,
        );
        if (esito === 'not-found')
          throw new ORPCError('NOT_FOUND', { message: 'Possesso inesistente' });
        // Un 409 e non un 400: la richiesta è scritta bene, è lo stato della
        // riga a non permetterla, e il client la rifarà volentieri dopo aver
        // aggiunto un'altra piattaforma.
        if (esito === 'last')
          throw new ORPCError('CONFLICT', {
            message: 'Un gioco deve restare con almeno un possesso',
          });

        const entry = await findEntryById(context.user.id, input.id);
        if (!entry) throw new ORPCError('INTERNAL_SERVER_ERROR');
        return entry;
      }),

    setHidden: os.backlog.setHidden
      .use(authed)
      .handler(async ({ input, context }) => {
        const row = await setBacklogHidden(
          context.user.id,
          input.id,
          input.hidden,
        );
        if (!row)
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

  reports: {
    create: os.reports.create
      .use(authed)
      .handler(async ({ input, context }) => {
        const esito = await createReports(context.user.id, input);
        if (esito.status === 'not_found')
          throw new ORPCError('NOT_FOUND', { message: 'Gioco inesistente' });
        if (esito.status === 'not_owned')
          throw new ORPCError('BAD_REQUEST', {
            message: 'Si segnala solo una copia che hai',
          });
        return esito.open;
      }),

    openForGame: os.reports.openForGame
      .use(authed)
      .handler(({ input, context }) =>
        openReportsForGame(context.user.id, input.gameId),
      ),
  },

  admin: {
    reports: {
      list: os.admin.reports.list
        .use(authed)
        .use(admin)
        .handler(({ input }) => listOpenReports(input)),

      archive: os.admin.reports.archive
        .use(authed)
        .use(admin)
        .handler(async ({ input, context }) => ({
          closed: await closeReports(
            input.gameId,
            input.target,
            context.user.id,
          ),
        })),
    },

    games: {
      unlinked: os.admin.games.unlinked
        .use(authed)
        .use(admin)
        .handler(({ input }) => listUnlinkedGames(input)),

      linkIgdb: os.admin.games.linkIgdb
        .use(authed)
        .use(admin)
        .handler(async ({ input }) => {
          const esito = await linkGameToIgdb(input.gameId, input.igdbId);
          if (esito.status === 'not_found')
            throw new ORPCError('NOT_FOUND', { message: 'Gioco inesistente' });
          if (esito.status === 'already_linked')
            throw new ORPCError('CONFLICT', {
              message: 'Il gioco ha già un id IGDB',
            });
          if (esito.status === 'taken')
            throw new ORPCError('CONFLICT', {
              message: `L'id è già di «${esito.game}»: i due giochi vanno fusi (11b)`,
            });
          if (esito.status === 'unknown_igdb_id')
            throw new ORPCError('NOT_FOUND', {
              message: 'IGDB non conosce questo id',
            });
        }),

      detail: os.admin.games.detail
        .use(authed)
        .use(admin)
        .handler(async ({ input }) => {
          const detail = await gameAdminDetail(input.slug);
          if (!detail)
            throw new ORPCError('NOT_FOUND', { message: 'Gioco inesistente' });
          return detail;
        }),
    },

    links: {
      repointPreview: os.admin.links.repointPreview
        .use(authed)
        .use(admin)
        .handler(async ({ input }) => {
          const esito = await previewRepoint(input.linkId, input.igdbId);
          if (esito.status === 'not_found')
            throw new ORPCError('NOT_FOUND', {
              message: 'Collegamento inesistente',
            });
          if (esito.status === 'unknown_igdb_id')
            throw new ORPCError('NOT_FOUND', {
              message: 'IGDB non conosce questo id',
            });
          if (esito.status === 'same_game')
            throw new ORPCError('CONFLICT', {
              message: 'Il collegamento punta già a questo gioco',
            });
          return {
            from: esito.from,
            to: esito.to,
            link: esito.link,
            moves: esito.moves,
            otherIdsSameStore: esito.otherIdsSameStore,
          };
        }),

      repoint: os.admin.links.repoint
        .use(authed)
        .use(admin)
        .handler(async ({ input, context }) => {
          const esito = await repointLink(
            context.user.id,
            input.linkId,
            input.igdbId,
          );
          if (esito.status === 'not_found')
            throw new ORPCError('NOT_FOUND', {
              message: 'Collegamento inesistente',
            });
          if (esito.status === 'unknown_igdb_id')
            throw new ORPCError('NOT_FOUND', {
              message: 'IGDB non conosce questo id',
            });
          return { wholeRows: esito.wholeRows, copies: esito.copies };
        }),
    },

    missing: {
      summary: os.admin.missing.summary
        .use(authed)
        .use(admin)
        .handler(() => missingSummary()),

      list: os.admin.missing.list
        .use(authed)
        .use(admin)
        .handler(({ input }) => listMissing(input)),
    },

    sources: {
      retry: os.admin.sources.retry
        .use(authed)
        .use(admin)
        .handler(async ({ input }) => {
          if (!(await retrySource(input.gameId, input.source)))
            throw new ORPCError('NOT_FOUND', {
              message: 'Il gioco non ha questa fonte',
            });
        }),

      lookup: os.admin.sources.lookup
        .use(authed)
        .use(admin)
        .handler(async ({ input }) => {
          const externalId = parseSourceId(input.source, input.externalId);
          if (!externalId)
            throw new ORPCError('BAD_REQUEST', {
              message: 'Non è un id né un indirizzo di quella fonte',
            });
          const owner = await findSourceIdOwner(
            input.source,
            externalId,
            input.gameId,
          );
          return { externalId, owner };
        }),

      search: os.admin.sources.search
        .use(authed)
        .use(admin)
        .handler(async ({ input }) => {
          const esito = await searchSource(input.source, input.query);
          if (esito.status === 'disabled')
            throw new ORPCError('PRECONDITION_FAILED', {
              message: 'OpenCritic è spento in questo ambiente',
            });
          if (esito.status === 'quota')
            throw new ORPCError('TOO_MANY_REQUESTS', {
              message: 'Le ricerche OpenCritic di oggi sono finite',
            });
          return { hits: esito.hits, searchesLeft: esito.searchesLeft };
        }),

      setExternalId: os.admin.sources.setExternalId
        .use(authed)
        .use(admin)
        .handler(async ({ input, context }) => {
          const externalId = parseSourceId(input.source, input.externalId);
          if (!externalId)
            throw new ORPCError('BAD_REQUEST', {
              message: 'Non è un id né un indirizzo di quella fonte',
            });
          if (!(await findGameById(input.gameId)))
            throw new ORPCError('NOT_FOUND', { message: 'Gioco inesistente' });
          await setSourceExternalId(
            input.gameId,
            input.source,
            externalId,
            context.user.id,
          );
          return { externalId };
        }),
    },

    users: {
      list: os.admin.users.list
        .use(authed)
        .use(admin)
        .handler(({ input }) => listUsers(input)),

      setRole: os.admin.users.setRole
        .use(authed)
        .use(admin)
        .handler(async ({ input, context }) => {
          if (input.userId === context.user.id && input.role !== 'admin')
            throw new ORPCError('BAD_REQUEST', {
              message: 'Il tuo ruolo non lo togli da solo',
            });
          await asAdminAuthCall(() =>
            auth.api.setRole({
              body: { userId: input.userId, role: input.role },
              headers: context.headers,
            }),
          );
        }),

      ban: os.admin.users.ban
        .use(authed)
        .use(admin)
        .handler(async ({ input, context }) => {
          await asAdminAuthCall(() =>
            auth.api.banUser({
              body: {
                userId: input.userId,
                banReason: input.reason,
                banExpiresIn: input.expiresInDays
                  ? input.expiresInDays * 24 * 60 * 60
                  : undefined,
              },
              headers: context.headers,
            }),
          );
        }),

      unban: os.admin.users.unban
        .use(authed)
        .use(admin)
        .handler(async ({ input, context }) => {
          await asAdminAuthCall(() =>
            auth.api.unbanUser({
              body: { userId: input.userId },
              headers: context.headers,
            }),
          );
        }),

      revokeSessions: os.admin.users.revokeSessions
        .use(authed)
        .use(admin)
        .handler(async ({ input, context }) => {
          await asAdminAuthCall(() =>
            auth.api.revokeUserSessions({
              body: { userId: input.userId },
              headers: context.headers,
            }),
          );
        }),
    },

    unresolved: {
      list: os.admin.unresolved.list
        .use(authed)
        .use(admin)
        .handler(({ input }) => listUnresolvedGroups(input)),

      globalHidden: os.admin.unresolved.globalHidden
        .use(authed)
        .use(admin)
        .handler(() => listGlobalHidden()),

      resolve: os.admin.unresolved.resolve
        .use(authed)
        .use(admin)
        .handler(async ({ input }) => {
          const esito = await resolveUnresolvedForAll(
            input.store,
            input.externalId,
            input.igdbId,
          );
          if (esito.status === 'linked_elsewhere')
            throw new ORPCError('CONFLICT', {
              message: `È già collegata a «${esito.game}»: si ripunta dalla scheda del gioco`,
            });
          if (esito.status === 'unknown_igdb_id')
            throw new ORPCError('NOT_FOUND', {
              message: 'IGDB non conosce questo id',
            });
          return { resolved: esito.resolved };
        }),

      hide: os.admin.unresolved.hide
        .use(authed)
        .use(admin)
        .handler(({ input, context }) =>
          hideUnresolvedForAll(
            context.user.id,
            input.store,
            input.externalId,
            input.kind,
          ),
        ),

      unhide: os.admin.unresolved.unhide
        .use(authed)
        .use(admin)
        .handler(async ({ input }) => {
          if (!(await unhideUnresolvedForAll(input.store, input.externalId)))
            throw new ORPCError('NOT_FOUND', {
              message: 'Non è nascosta per tutti',
            });
        }),
    },
  },

  events: {
    // Resta aperta finché la pagina è aperta: `signal` scatta quando il
    // browser chiude la connessione, e con lui finisce l'abbonamento.
    subscribe: os.events.subscribe.use(authed).handler(async function* ({
      context,
      signal,
    }) {
      for await (const event of liveEvents.subscribe('event', { signal })) {
        const visible = eventForUser(event, context.user.id);
        if (visible) yield visible;
      }
    }),
  },
});

export type AppRouter = typeof router;
