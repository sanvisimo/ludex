import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { store } from "./games";
import { timestamps } from "./timestamps";

/**
 * L'account dell'utente su un negozio: da dove si importa la libreria.
 *
 * Non è una colonna su `user` perché `auth.ts` è generato e viene riscritto
 * intero da `pnpm auth:generate`. Ed è una tabella generica invece che una
 * `steam_accounts`, perché gli altri negozi arriveranno sullo stesso modello.
 *
 * Tiene volutamente **solo l'identità pubblica** dell'account. Steam si accontenta
 * di uno SteamID64 e di una chiave applicativa nostra; i negozi che vorranno un
 * token OAuth per utente avranno bisogno di cifratura a riposo e di un ciclo di
 * rinnovo, che sono decisioni da prendere quando ci si arriva, non adesso.
 */
export const storeAccounts = pgTable(
  "store_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    store: store("store").notNull(),
    // SteamID64 per Steam. Testo e non numero: gli altri negozi useranno UUID,
    // email o handle.
    externalAccountId: text("external_account_id").notNull(),
    // Ultimo import andato a buon fine. Null = collegato ma mai importato.
    lastSyncAt: timestamp("last_sync_at"),
    ...timestamps,
  },
  (table) => [
    // Un account per negozio per utente: collegare due volte Steam è un
    // ricollegamento, non un secondo account.
    unique("store_accounts_user_id_store_key").on(table.userId, table.store),
    index("store_accounts_user_id_idx").on(table.userId),
  ],
);

/**
 * Le voci della libreria che l'import non è riuscito a legare a un gioco.
 *
 * Stanno qui e **non in `games` come righe non risolte** perché `games` è
 * condivisa fra tutti gli utenti: su una libreria vera gli scarti sono client
 * beta, "Friend's Pass" e branch instabili, e riversarli lì sporcherebbe il
 * catalogo di tutti per un problema di uno.
 *
 * Per utente e non globali: la voce è un pezzo della *sua* libreria, con le sue
 * ore, e sarà lui a deciderne il gioco giusto. Risolta, la riga sparisce.
 */
export const unresolvedImports = pgTable(
  "unresolved_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    store: store("store").notNull(),
    // L'appid su Steam. Stessa forma di `external_ids.external_id`: risolta la
    // voce, è questo il valore che ci finisce.
    externalId: text("external_id").notNull(),
    // Il nome che dà il negozio. È tutto ciò che si può mostrare all'utente per
    // fargli capire di che gioco si tratta.
    name: text("name").notNull(),
    playtimeMinutes: integer("playtime_minutes"),
    lastPlayedAt: timestamp("last_played_at"),
    ...timestamps,
  },
  (table) => [
    // Reimportare non deve accumulare doppioni degli stessi scarti.
    unique("unresolved_imports_user_store_external_key").on(
      table.userId,
      table.store,
      table.externalId,
    ),
    index("unresolved_imports_user_id_idx").on(table.userId),
  ],
);
