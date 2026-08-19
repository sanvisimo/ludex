import type { UserTagInput } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, asc, eq, or, sql } from '@repo/db/orm';

/**
 * Il vocabolario personale dell'utente: i suoi tag e le sue categorie.
 *
 * Tutto qui dentro parte dallo `userId` e non è un dettaglio di sicurezza fra i
 * tanti: è ciò che distingue questa tabella da `igdb_attributes`. Un tag è di
 * chi l'ha scritto, e "quando sono stanco" non vuol dire la stessa cosa a due
 * persone diverse.
 */
export function listUserTags(userId: string) {
  return db
    .select({
      id: schema.userTags.id,
      kind: schema.userTags.kind,
      name: schema.userTags.name,
    })
    .from(schema.userTags)
    .where(eq(schema.userTags.userId, userId))
    .orderBy(
      asc(schema.userTags.kind),
      asc(sql`lower(${schema.userTags.name})`),
    );
}

/**
 * Risolve nomi in id, creando i tag che l'utente non ha ancora.
 *
 * È il motivo per cui in scrittura viaggiano i nomi e non gli id: chi scrive
 * "da rigiocare" in un campo di testo non sa se quel tag esiste già, e non deve
 * saperlo. Il confronto è **insensibile alle maiuscole** — lo impone l'indice
 * unico su `lower(name)` — quindi riscrivere "Da Rigiocare" ritrova la riga di
 * prima invece di crearne una seconda che sembra uguale.
 *
 * Creati e ritrovati passano dalla stessa strada, quindi la funzione è
 * idempotente: chiamarla due volte con gli stessi nomi rende gli stessi id.
 */
export async function ensureUserTags(userId: string, inputs: UserTagInput[]) {
  if (inputs.length === 0)
    return [] as { id: string; kind: UserTagInput['kind']; name: string }[];

  // Deduplica per (tipo, nome minuscolo) conservando la prima grafia: è quella
  // che finirà scritta se il tag è nuovo.
  const wanted = new Map<string, UserTagInput>();
  for (const input of inputs) {
    const key = `${input.kind}|${input.name.toLowerCase()}`;
    if (!wanted.has(key)) wanted.set(key, input);
  }
  const rows = [...wanted.values()];

  // Senza `target`: il conflitto da ignorare è quello sull'indice unico, che è
  // su un'espressione (`lower(name)`) e non su colonne. `DO NOTHING` regge anche
  // i doppioni dentro la stessa INSERT, al contrario di `DO UPDATE`.
  await db
    .insert(schema.userTags)
    .values(rows.map((row) => ({ userId, kind: row.kind, name: row.name })))
    .onConflictDoNothing();

  // Rilettura invece del RETURNING: quello rende solo le righe appena create, e
  // qui servono anche quelle che c'erano già.
  return db
    .select({
      id: schema.userTags.id,
      kind: schema.userTags.kind,
      name: schema.userTags.name,
    })
    .from(schema.userTags)
    .where(
      and(
        eq(schema.userTags.userId, userId),
        or(
          ...rows.map((row) =>
            and(
              eq(schema.userTags.kind, row.kind),
              sql`lower(${schema.userTags.name}) = ${row.name.toLowerCase()}`,
            ),
          ),
        ),
      ),
    );
}

/**
 * Toglie una parola dal vocabolario dell'utente.
 *
 * Distruttiva e volutamente semplice: il raccordo `backlog_tags` ha
 * `on delete cascade`, quindi il tag si stacca da solo da tutti i giochi che ce
 * l'avevano. È il motivo per cui la UI chiede conferma — un click qui può
 * toccare venti righe di backlog.
 *
 * Lo `userId` nel WHERE non è una formalità: senza, un id indovinato
 * cancellerebbe il tag di un altro.
 */
export async function deleteUserTag(userId: string, id: string) {
  const [row] = await db
    .delete(schema.userTags)
    .where(and(eq(schema.userTags.id, id), eq(schema.userTags.userId, userId)))
    .returning({ id: schema.userTags.id });

  return row;
}
