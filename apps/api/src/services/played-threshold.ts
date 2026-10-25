import { db, schema } from '@repo/db';
import { and, eq, gte, inArray, isNotNull, sql } from '@repo/db/orm';

/**
 * La soglia «conta come giocato» di un account (plans/soglia-giocato.md): un
 * gioco con almeno tanti minuti sulle copie di quell'account passa da
 * `backlog` a `played`.
 *
 * Contraddice apposta una regola di `docs/import-librerie.md` («le ore non si
 * usano per indovinare lo stato»): la regola resta vera finché l'utente non
 * sceglie una soglia, e la sceglie per account, perché è lui a sapere se due
 * ore su quel negozio vogliono dire «provato» o «finito».
 *
 * **Si promuove soltanto**: da `backlog` a `played`, mai altri stati e mai
 * indietro. `playing`, `completed`, `dropped` ed `excluded` sono giudizi
 * dell'utente, che un numero del negozio non corregge.
 */

/** Con 0 basta un minuto: un gioco a zero minuti non l'hai giocato. */
function floor(minMinutes: number) {
  return Math.max(minMinutes, 1);
}

/**
 * Le ore di ogni riga di backlog sulle copie di questo account: la copia con
 * più minuti, perché Xbox mette le ore su una sola (la console più recente).
 */
export async function playtimeByBacklog(
  storeAccountId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      backlogId: schema.ownerships.backlogId,
      minutes: sql<number>`max(${schema.ownerships.playtimeMinutes})::int`,
    })
    .from(schema.ownerships)
    .where(
      and(
        eq(schema.ownerships.storeAccountId, storeAccountId),
        isNotNull(schema.ownerships.playtimeMinutes),
      ),
    )
    .groupBy(schema.ownerships.backlogId);
  return new Map(rows.map((row) => [row.backlogId, row.minutes]));
}

/**
 * Dopo un import: i giochi che **con questo giro** hanno passato la soglia —
 * prima erano sotto, o la copia non c'era, e adesso sono sopra.
 *
 * Solo il passaggio, e non tutto ciò che sta sopra: un gioco che l'utente ha
 * riportato a mano in `backlog` non deve tornare `played` al giro dopo, come
 * una copia tolta non torna (`ownership_rejections`). Applicarla a tutto è il
 * gesto del salvataggio, `applyPlayedThreshold`.
 */
export async function promoteCrossed(
  storeAccountId: string,
  minMinutes: number,
  before: Map<string, number>,
) {
  const soglia = floor(minMinutes);
  const after = await playtimeByBacklog(storeAccountId);
  const crossed = [...after]
    .filter(
      ([backlogId, minutes]) =>
        minutes >= soglia && (before.get(backlogId) ?? 0) < soglia,
    )
    .map(([backlogId]) => backlogId);
  if (crossed.length === 0) return 0;

  const promoted = await db
    .update(schema.backlog)
    .set({ status: 'played' })
    .where(
      and(
        inArray(schema.backlog.id, crossed),
        eq(schema.backlog.status, 'backlog'),
      ),
    )
    .returning({ id: schema.backlog.id });
  return promoted.length;
}

/**
 * Applica la soglia a **tutto** ciò che l'account ha già: è il gesto di chi la
 * salva dalle impostazioni, e vuole vederla valere subito, senza un import.
 */
export async function applyPlayedThreshold(
  storeAccountId: string,
  minMinutes: number,
) {
  const sopra = db
    .select({ backlogId: schema.ownerships.backlogId })
    .from(schema.ownerships)
    .where(
      and(
        eq(schema.ownerships.storeAccountId, storeAccountId),
        gte(schema.ownerships.playtimeMinutes, floor(minMinutes)),
      ),
    );

  const promoted = await db
    .update(schema.backlog)
    .set({ status: 'played' })
    .where(
      and(
        inArray(schema.backlog.id, sopra),
        eq(schema.backlog.status, 'backlog'),
      ),
    )
    .returning({ id: schema.backlog.id });
  return promoted.length;
}
