import { db } from "@repo/db";
import { sql } from "@repo/db/orm";
import { afterAll, beforeEach } from "vitest";

// Tabelle di riferimento popolate dalle migration: troncarle non lascerebbe un
// database pulito, ne lascerebbe uno rotto — `ownerships.platform_slug` ha una
// foreign key verso `platforms`. Se un domani si seeda un'altra tabella di
// riferimento, va aggiunta qui.
const PRESERVED = new Set(["platforms"]);

let tables: string[] | null = null;

async function tableList() {
  if (tables) return tables;

  // Lette dal catalogo invece che elencate a mano, così una tabella nuova viene
  // ripulita senza che nessuno si ricordi di aggiornare una lista.
  const rows = (await db.execute(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  )) as unknown as { tablename: string }[];

  tables = rows.map((row) => row.tablename).filter((name) => !PRESERVED.has(name));
  return tables;
}

beforeEach(async () => {
  const names = await tableList();
  // Le virgolette servono: `user` è una parola riservata. CASCADE perché le
  // foreign key fra queste tabelle sono un grafo, non una lista ordinata.
  await db.execute(
    sql.raw(
      `truncate table ${names.map((name) => `"${name}"`).join(", ")} restart identity cascade`,
    ),
  );
});

// Senza, il pool di postgres-js resta aperto e vitest non riesce a chiudere il
// processo: aspetta dieci secondi e stampa un avviso a ogni corsa.
afterAll(async () => {
  await db.$client.end();
});
