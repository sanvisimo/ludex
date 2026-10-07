import { db, schema } from '@repo/db';
import { asc, eq, inArray } from '@repo/db/orm';
import type { AccountExport } from '@repo/contracts';

/**
 * Tutto ciò che Ludex ha di una persona, in una forma che un altro servizio sa
 * leggere (GDPR art. 20): è il file dell'esportazione dell'account.
 *
 * **Cosa non c'è, apposta.** Né i token dei negozi (`store_accounts.credentials`
 * e `credentials_expire_at`: sono segreti e non sono dati dell'utente), né
 * l'hash della password, né le sessioni. I giochi compaiono col nome e l'id
 * IGDB per ritrovarli altrove, mai con i metadata, che sono di tutti.
 *
 * Una lettura sola per tabella, poi si ricompone in memoria: la libreria più
 * grande che abbiamo misurato sta sulle poche migliaia di righe.
 */
export async function exportAccount(userId: string): Promise<AccountExport> {
  const [profile] = await db
    .select({
      name: schema.user.name,
      email: schema.user.email,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  if (!profile) throw new Error(`utente ${userId} non trovato`);

  const [settings] = await db
    .select({ autoSyncLibrary: schema.userSettings.autoSyncLibrary })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));

  const accounts = await db
    .select({
      id: schema.storeAccounts.id,
      store: schema.storeAccounts.store,
      storeName: schema.storeAccounts.displayName,
      label: schema.storeAccounts.label,
      linkedAt: schema.storeAccounts.createdAt,
      lastSyncAt: schema.storeAccounts.lastSyncAt,
    })
    .from(schema.storeAccounts)
    .where(eq(schema.storeAccounts.userId, userId))
    .orderBy(asc(schema.storeAccounts.createdAt));
  const accountName = new Map(
    accounts.map((a) => [a.id, a.label ?? a.storeName] as const),
  );

  const entries = await db
    .select({
      id: schema.backlog.id,
      name: schema.games.name,
      igdbId: schema.games.igdbId,
      status: schema.backlog.status,
      rating: schema.backlog.rating,
      notes: schema.backlog.notes,
      addedAt: schema.backlog.addedAt,
      hiddenAt: schema.backlog.hiddenAt,
    })
    .from(schema.backlog)
    .innerJoin(schema.games, eq(schema.games.id, schema.backlog.gameId))
    .where(eq(schema.backlog.userId, userId))
    .orderBy(asc(schema.games.name));
  const ids = entries.map((e) => e.id);

  const ownerships = ids.length
    ? await db
        .select()
        .from(schema.ownerships)
        .where(inArray(schema.ownerships.backlogId, ids))
    : [];
  const tags = ids.length
    ? await db
        .select({
          backlogId: schema.backlogTags.backlogId,
          kind: schema.userTags.kind,
          name: schema.userTags.name,
        })
        .from(schema.backlogTags)
        .innerJoin(
          schema.userTags,
          eq(schema.userTags.id, schema.backlogTags.tagId),
        )
        .where(inArray(schema.backlogTags.backlogId, ids))
    : [];

  // Le playlist tengono i tag per id, e un id non dice niente fuori da Ludex:
  // nel file ci vanno i nomi. Un tag già cancellato non ha più un nome, e si
  // lascia fuori come fa la playlist quando gira.
  const vocabulary = await db
    .select({ id: schema.userTags.id, name: schema.userTags.name })
    .from(schema.userTags)
    .where(eq(schema.userTags.userId, userId));
  const tagName = new Map(vocabulary.map((tag) => [tag.id, tag.name] as const));
  const playlists = await db
    .select()
    .from(schema.playlists)
    .where(eq(schema.playlists.userId, userId))
    .orderBy(asc(schema.playlists.position), asc(schema.playlists.name));

  const unresolved = await db
    .select()
    .from(schema.unresolvedImports)
    .where(eq(schema.unresolvedImports.userId, userId))
    .orderBy(asc(schema.unresolvedImports.name));

  const reports = await db
    .select({
      game: schema.games.name,
      igdbId: schema.games.igdbId,
      store: schema.gameReports.store,
      source: schema.gameReports.source,
      suggestedName: schema.gameReports.suggestedName,
      suggestedIgdbId: schema.gameReports.suggestedIgdbId,
      note: schema.gameReports.note,
      createdAt: schema.gameReports.createdAt,
      resolvedAt: schema.gameReports.resolvedAt,
    })
    .from(schema.gameReports)
    .innerJoin(schema.games, eq(schema.games.id, schema.gameReports.gameId))
    .where(eq(schema.gameReports.userId, userId))
    .orderBy(asc(schema.gameReports.createdAt));

  return {
    exportedAt: new Date(),
    profile,
    settings: { autoSyncLibrary: settings?.autoSyncLibrary ?? true },
    storeAccounts: accounts.map((account) => ({
      store: account.store,
      storeName: account.storeName,
      label: account.label,
      linkedAt: account.linkedAt,
      lastSyncAt: account.lastSyncAt,
    })),
    library: entries.map((entry) => ({
      game: { name: entry.name, igdbId: entry.igdbId },
      status: entry.status,
      rating: entry.rating,
      notes: entry.notes,
      addedAt: entry.addedAt,
      hiddenAt: entry.hiddenAt,
      tags: tags
        .filter((tag) => tag.backlogId === entry.id)
        .map(({ kind, name }) => ({ kind, name })),
      ownerships: ownerships
        .filter((o) => o.backlogId === entry.id)
        .map((o) => ({
          platform: o.platformSlug,
          store: o.store,
          account: o.storeAccountId
            ? (accountName.get(o.storeAccountId) ?? null)
            : null,
          medium: o.medium,
          subscription: o.subscription,
          playtimeMinutes: o.playtimeMinutes,
          lastPlayedAt: o.lastPlayedAt,
          acquiredAt: o.acquiredAt,
          storePage: o.storePage,
        })),
    })),
    unresolvedImports: unresolved.map((u) => ({
      store: u.store,
      name: u.name,
      externalId: u.externalId,
      platform: u.platformSlug,
      playtimeMinutes: u.playtimeMinutes,
      hiddenAt: u.hiddenAt,
      hiddenKind: u.hiddenKind,
    })),
    playlists: playlists.map((playlist) => {
      const { tags: tagIds, ...query } = playlist.query;
      const names = (tagIds ?? []).flatMap((id) => tagName.get(id) ?? []);
      return {
        name: playlist.name,
        query: { ...query, ...(names.length > 0 && { tags: names }) },
        createdAt: playlist.createdAt,
      };
    }),
    reports,
  };
}
