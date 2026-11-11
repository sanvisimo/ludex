import { storeAccountName } from '@repo/contracts';
import type { HiddenKind, Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, asc, eq, inArray, sql } from '@repo/db/orm';

import {
  advanceAddedAt,
  ensureBacklogEntries,
  ensureOwnerships,
  findEntryByGame,
} from './backlog';
import { reopenSourcesForNewExternalIds } from './enrichment';
import { resolveGameFromIgdb } from './games';
import {
  birthTags,
  hideEntriesFromHiddenUnresolved,
  platformFor,
  tagNewEntries,
} from './library-import';

export async function listUnresolvedImports(userId: string, ids?: string[]) {
  if (ids?.length === 0) return [];
  // Il nome dell'account lo compone storeAccountName in JS: un coalesce in SQL lo sbagliava.
  const rows = await db
    .select({
      id: schema.unresolvedImports.id,
      store: schema.unresolvedImports.store,
      label: schema.storeAccounts.label,
      displayName: schema.storeAccounts.displayName,
      externalAccountId: schema.storeAccounts.externalAccountId,
      externalId: schema.unresolvedImports.externalId,
      name: schema.unresolvedImports.name,
      playtimeMinutes: schema.unresolvedImports.playtimeMinutes,
      lastPlayedAt: schema.unresolvedImports.lastPlayedAt,
      createdAt: schema.unresolvedImports.createdAt,
      imageUrl: schema.unresolvedImports.imageUrl,
      storePage: schema.unresolvedImports.storePage,
      hiddenAt: schema.unresolvedImports.hiddenAt,
      hiddenKind: schema.unresolvedImports.hiddenKind,
      sameProductAs: schema.unresolvedImports.sameProductAs,
    })
    .from(schema.unresolvedImports)
    // La FK è NOT NULL: sinistra solo per non perdere uno scarto se il vincolo cambiasse.
    .leftJoin(
      schema.storeAccounts,
      eq(schema.unresolvedImports.storeAccountId, schema.storeAccounts.id),
    )
    .where(
      and(
        eq(schema.unresolvedImports.userId, userId),
        ids ? inArray(schema.unresolvedImports.id, ids) : undefined,
      ),
    )
    .orderBy(asc(schema.unresolvedImports.name));

  const principali = await sameProductMains(userId, rows);

  return rows.map(
    ({
      label,
      displayName,
      externalAccountId,
      sameProductAs,
      ...unresolved
    }) => ({
      ...unresolved,
      storeName: storeAccountName({
        label,
        displayName,
        externalAccountId: externalAccountId ?? '',
      }),
      sameProduct: sameProductAs
        ? (principali.get(`${unresolved.store}:${sameProductAs}`) ?? {
            externalId: sameProductAs,
            name: sameProductAs,
            imageUrl: null,
            gameSlug: null,
          })
        : null,
    }),
  );
}

// Il gioco collegato vince sullo scarto, come all'import che guarda prima `external_ids`.
async function sameProductMains(
  userId: string,
  rows: { store: Store; sameProductAs: string | null }[],
) {
  const principali = new Map<
    string,
    {
      externalId: string;
      name: string;
      imageUrl: string | null;
      gameSlug: string | null;
    }
  >();
  const chiavi = rows.filter((row) => row.sameProductAs !== null);
  if (chiavi.length === 0) return principali;
  const ids = [...new Set(chiavi.map((row) => row.sameProductAs!))];

  const scarti = await db
    .select({
      store: schema.unresolvedImports.store,
      externalId: schema.unresolvedImports.externalId,
      name: schema.unresolvedImports.name,
      imageUrl: schema.unresolvedImports.imageUrl,
    })
    .from(schema.unresolvedImports)
    .where(
      and(
        eq(schema.unresolvedImports.userId, userId),
        inArray(schema.unresolvedImports.externalId, ids),
      ),
    );
  for (const scarto of scarti) {
    principali.set(`${scarto.store}:${scarto.externalId}`, {
      externalId: scarto.externalId,
      name: scarto.name,
      imageUrl: scarto.imageUrl,
      gameSlug: null,
    });
  }

  const collegati = await db
    .select({
      source: schema.externalIds.source,
      externalId: schema.externalIds.externalId,
      imageUrl: schema.externalIds.storeImageUrl,
      name: schema.games.name,
      gameSlug: schema.games.slug,
    })
    .from(schema.externalIds)
    .innerJoin(schema.games, eq(schema.games.id, schema.externalIds.gameId))
    .where(
      and(
        inArray(schema.externalIds.source, [
          ...new Set(chiavi.map((row) => row.store)),
        ]),
        inArray(schema.externalIds.externalId, ids),
      ),
    );
  for (const { source, ...collegato } of collegati) {
    principali.set(`${source}:${collegato.externalId}`, collegato);
  }

  return principali;
}

function findOwn(userId: string, id: string) {
  return db.query.unresolvedImports.findFirst({
    // Sempre con lo userId: senza, un id indovinato toccherebbe la riga di un altro.
    where: and(
      eq(schema.unresolvedImports.id, id),
      eq(schema.unresolvedImports.userId, userId),
    ),
  });
}

// Scrive `external_ids`: da qui l'id del negozio è risolto per tutti, non solo per chi collega.
export async function resolveUnresolvedImport(
  userId: string,
  id: string,
  igdbId: number,
  // Solo «Collega per tutti» (11a): chi collega da sé lo vuole vedere, anche se era nascosto.
  { keepHidden = false }: { keepHidden?: boolean } = {},
) {
  const pending = await findOwn(userId, id);
  if (!pending) return { status: 'not_found' as const };

  // Prima la piattaforma della riga, come all'import: indovinare scriverebbe dati sbagliati.
  const platformSlug = pending.platformSlug ?? platformFor(pending.store);

  const game = await resolveGameFromIgdb(igdbId);
  if (!game) return { status: 'unknown_igdb_id' as const };

  const inserted = await db
    .insert(schema.externalIds)
    .values({
      gameId: game.id,
      source: pending.store,
      externalId: pending.externalId,
      storeTitle: pending.name,
      storeImageUrl: pending.imageUrl,
    })
    .onConflictDoNothing({
      target: [schema.externalIds.source, schema.externalIds.externalId],
    })
    .returning({
      gameId: schema.externalIds.gameId,
      source: schema.externalIds.source,
    });
  // Un appid collegato a mano è lo stesso evento di quando lo porta IGDB.
  await reopenSourcesForNewExternalIds(inserted);

  // Stato e tag del CSV (10) solo alla nascita: un gioco che c'era già resta com'è.
  const birth = pending.atBirth;
  const { byGameId, created } = await ensureBacklogEntries(
    userId,
    [game.id],
    birth?.status ? new Map([[game.id, birth.status]]) : undefined,
  );
  const backlogId = byGameId.get(game.id)!;
  if (birth && created.has(game.id)) {
    await tagNewEntries(userId, [{ backlogId, tags: birthTags(birth) }]);
  }
  if (keepHidden && pending.hiddenAt)
    await hideEntriesFromHiddenUnresolved(
      [{ gameId: game.id, hidden: true }],
      created,
      byGameId,
    );

  await ensureOwnerships([
    {
      backlogId,
      platformSlug,
      store: pending.store,
      // Risolvere a mano è un import finito a mano: la copia sa da che account viene.
      storeAccountId: pending.storeAccountId,
      playtimeMinutes: pending.playtimeMinutes,
      lastPlayedAt: pending.lastPlayedAt,
      acquiredAt: pending.acquiredAt,
      // Senza, diventava un acquisto senza supporto e il reimport le affiancava quella giusta.
      subscription: pending.subscription,
      medium: pending.medium ?? 'digital',
      storePage: pending.storePage,
    },
  ]);
  // Senza, il gioco risulterebbe aggiunto il giorno del collegamento.
  await advanceAddedAt([backlogId]);

  await db
    .delete(schema.unresolvedImports)
    .where(eq(schema.unresolvedImports.id, pending.id));

  const entry = await findEntryByGame(userId, game.id);
  return { status: 'ok' as const, entry };
}

// Nasconde e non cancella: `dismiss` cancellava, e il prossimo import riportava la voce.
export async function setUnresolvedImportHidden(
  userId: string,
  id: string,
  kind: HiddenKind | null,
) {
  const [row] = await db
    .update(schema.unresolvedImports)
    .set(
      kind
        ? {
            hiddenKind: kind,
            // Cambiare il tipo è la stessa decisione corretta: la data non si sposta.
            hiddenAt: sql`coalesce(${schema.unresolvedImports.hiddenAt}, now())`,
          }
        : { hiddenKind: null, hiddenAt: null },
    )
    .where(
      and(
        eq(schema.unresolvedImports.id, id),
        eq(schema.unresolvedImports.userId, userId),
      ),
    )
    .returning({ id: schema.unresolvedImports.id });

  return row;
}
