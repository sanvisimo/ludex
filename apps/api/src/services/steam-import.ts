import { db, schema } from '@repo/db';
import { and, eq, inArray, sql } from '@repo/db/orm';

import { findIgdbGamesBySteamAppIds } from '../external/igdb';
import { fetchSteamLibrary, type SteamLibraryEntry } from '../external/steam';
import { chunk } from '../lib/chunk';
import { enqueueEnrichment } from '../queue/enrichment';
import { ensureBacklogEntries, ensureOwnerships } from './backlog';
import { findGameIdsByExternalIds, linkExternalGames } from './games';

/**
 * Import della libreria Steam.
 *
 * L'ordine dei passi non è casuale ed è la parte che conta:
 *
 * 1. **prima il nostro DB**: gli appid già in `external_ids` sono risolti senza
 *    uscire. `games` è condivisa fra tutti gli utenti, quindi il secondo che
 *    importa una libreria simile alla prima non paga quasi nulla.
 * 2. **poi IGDB**, e solo per il resto, in blocchi da 500: su 452 giochi sono
 *    quattro richieste. La risoluzione è un'altra cosa dall'enrichment, che
 *    resta un job per gioco.
 * 3. **poi le scritture**, tutte idempotenti: reimportare non deve accumulare
 *    niente né spostare lo stato di ciò che l'utente ha già in mano.
 *
 * Tutto su una piattaforma sola, `pc_windows`: un gioco Steam è PC, e la
 * piattaforma è il filtro hard del motore decisionale.
 */

// Un gioco Steam è PC: la piattaforma è il filtro hard del motore decisionale
// ("stasera ho la Switch accesa"), lo store dice solo da dove si lancia.
export const STEAM_PLATFORM = 'pc_windows';

export type SteamImportReport = {
  /** Voci nella libreria Steam. */
  total: number;
  /** Legate a un gioco, vecchio o nuovo. */
  resolved: number;
  /** Finite in `unresolved_imports`: IGDB non le conosce. */
  unresolved: number;
  /** Righe `games` create: sono le uniche per cui si accoda l'enrichment. */
  newGames: number;
  /** Righe `backlog` create. Le altre c'erano già e non sono state toccate. */
  newEntries: number;
};

/** Le voci che IGDB non conosce. Restano dell'utente, non sporcano `games`. */
async function recordUnresolved(userId: string, entries: SteamLibraryEntry[]) {
  if (entries.length === 0) return;

  for (const page of chunk(entries, 500)) {
    await db
      .insert(schema.unresolvedImports)
      .values(
        page.map((entry) => ({
          userId,
          store: 'steam' as const,
          externalId: entry.appId,
          name: entry.name,
          playtimeMinutes: entry.playtimeMinutes,
          lastPlayedAt: entry.lastPlayedAt,
        })),
      )
      // Un reimport aggiorna nome e ore invece di duplicare la voce.
      .onConflictDoUpdate({
        target: [
          schema.unresolvedImports.userId,
          schema.unresolvedImports.store,
          schema.unresolvedImports.externalId,
        ],
        // `excluded` e non la colonna: riferendo la colonna si riscriverebbe il
        // valore vecchio su sé stesso, e il reimport non aggiornerebbe nulla.
        set: {
          name: sql`excluded.name`,
          playtimeMinutes: sql`excluded.playtime_minutes`,
          lastPlayedAt: sql`excluded.last_played_at`,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Toglie dagli irrisolti le voci che nel frattempo si sono risolte.
 *
 * Serve perché IGDB cresce: un gioco che oggi non c'è può esserci fra un mese, e
 * al reimport la voce va tolta dalla lista degli scarti invece di restare lì a
 * chiedere un intervento manuale che non serve più.
 */
async function clearResolved(userId: string, appIds: string[]) {
  if (appIds.length === 0) return;

  for (const page of chunk(appIds, 1000)) {
    await db
      .delete(schema.unresolvedImports)
      .where(
        and(
          eq(schema.unresolvedImports.userId, userId),
          eq(schema.unresolvedImports.store, 'steam'),
          inArray(schema.unresolvedImports.externalId, page),
        ),
      );
  }
}

export async function importSteamLibrary(
  userId: string,
  steamId: string,
): Promise<SteamImportReport> {
  const library = await fetchSteamLibrary(steamId);

  // 1. Quello che Ludex conosce già.
  const known = await findGameIdsByExternalIds(
    'steam',
    library.map((entry) => entry.appId),
  );

  // 2. Solo il resto va su IGDB.
  const missing = library.filter((entry) => !known.has(entry.appId));
  const matches = await findIgdbGamesBySteamAppIds(
    missing.map((entry) => entry.appId),
  );

  const { byExternalId, createdGameIds } = await linkExternalGames(
    'steam',
    missing
      .map((entry) => {
        const match = matches.get(entry.appId);
        return match ? { externalId: entry.appId, ...match } : null;
      })
      .filter((link): link is NonNullable<typeof link> => link !== null),
  );

  const gameIdByAppId = new Map([...known, ...byExternalId]);
  const resolved = library.filter((entry) => gameIdByAppId.has(entry.appId));
  const unresolved = library.filter((entry) => !gameIdByAppId.has(entry.appId));

  // 3. Le scritture.
  await recordUnresolved(userId, unresolved);
  await clearResolved(
    userId,
    resolved.map((entry) => entry.appId),
  );

  const { byGameId, created } = await ensureBacklogEntries(
    userId,
    resolved.map((entry) => gameIdByAppId.get(entry.appId)!),
  );

  // Un possesso per voce di libreria. Due appid che puntano allo stesso gioco
  // producono la stessa riga: il vincolo unique la collassa, e vince l'ultima
  // che porta le ore.
  await ensureOwnerships(
    resolved.map((entry) => ({
      backlogId: byGameId.get(gameIdByAppId.get(entry.appId)!)!,
      platformSlug: STEAM_PLATFORM,
      store: 'steam' as const,
      playtimeMinutes: entry.playtimeMinutes,
      lastPlayedAt: entry.lastPlayedAt,
    })),
  );

  // Solo i giochi nati adesso: gli altri l'enrichment ce l'hanno già, o ce
  // l'hanno vecchio e ci pensa la spazzata.
  for (const gameId of createdGameIds) await enqueueEnrichment('igdb', gameId);

  await db
    .update(schema.storeAccounts)
    .set({ lastSyncAt: new Date() })
    .where(
      and(
        eq(schema.storeAccounts.userId, userId),
        eq(schema.storeAccounts.store, 'steam'),
      ),
    );

  return {
    total: library.length,
    resolved: resolved.length,
    unresolved: unresolved.length,
    newGames: createdGameIds.length,
    newEntries: created.size,
  };
}
