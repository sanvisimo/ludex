import type { UserSettings } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';

/**
 * Le preferenze dell'utente, coi default per chi non ne ha mai cambiata una.
 *
 * Nessuna riga vuol dire i default, e i default stanno sulle colonne della
 * tabella: qui si legge quello che c'è, e se non c'è niente si chiede al
 * database che cosa metterebbe. Scriverli una seconda volta in TypeScript
 * vorrebbe dire due posti da tenere allineati.
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const row = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, userId),
  });
  if (row) return { autoSyncLibrary: row.autoSyncLibrary };

  return { autoSyncLibrary: defaults().autoSyncLibrary };
}

/**
 * Scrive solo i campi che arrivano.
 *
 * Upsert: la prima preferenza cambiata è anche quella che crea la riga.
 */
export async function updateUserSettings(
  userId: string,
  changes: Partial<UserSettings>,
): Promise<UserSettings> {
  // Un campo presente ma `undefined` non è un cambiamento: senza filtrarlo, una
  // richiesta vuota creerebbe la riga per niente.
  const clean = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as Partial<UserSettings>;
  if (Object.keys(clean).length === 0) return getUserSettings(userId);

  const [row] = await db
    .insert(schema.userSettings)
    .values({ userId, ...clean })
    .onConflictDoUpdate({
      target: schema.userSettings.userId,
      set: { ...clean, updatedAt: new Date() },
    })
    .returning();

  return { autoSyncLibrary: row!.autoSyncLibrary };
}

/** I default dichiarati sulle colonne, letti dallo schema e non riscritti. */
function defaults() {
  const column = schema.userSettings.autoSyncLibrary;
  return { autoSyncLibrary: column.default as boolean };
}
