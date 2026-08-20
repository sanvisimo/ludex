import { storeAccountStatusValues } from '@repo/contracts/vocabulary';
import {
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { store } from './games';
import { timestamps } from './timestamps';

export const storeAccountStatus = pgEnum(
  'store_account_status',
  storeAccountStatusValues,
);

// `bytea`, che drizzle-orm non espone fra i tipi di prima classe. Il driver
// `postgres` lo rende già come Buffer e accetta un Buffer in scrittura, quindi
// qui non c'è nessuna conversione da fare: serve solo dichiarare il tipo SQL.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * L'account dell'utente su un negozio: da dove si importa la libreria.
 *
 * Non è una colonna su `user` perché `auth.ts` è generato e viene riscritto
 * intero da `pnpm auth:generate`. Ed è una tabella generica invece che una
 * `steam_accounts`, perché gli altri negozi arriveranno sullo stesso modello.
 *
 * Allo step 4 teneva **solo l'identità pubblica** dell'account, perché a Steam
 * basta uno SteamID64 e una chiave applicativa nostra. Dal 9a tiene anche il
 * credenziale, che per GOG, Epic e Amazon è un refresh token per utente.
 */
export const storeAccounts = pgTable(
  'store_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    store: store('store').notNull(),
    // SteamID64 per Steam, `user_id` per GOG e Amazon. Testo e non numero: gli
    // altri negozi usano UUID, email o handle.
    externalAccountId: text('external_account_id').notNull(),
    // Come chiamare l'account davanti all'utente.
    //
    // Su Steam bastava `externalAccountId`, perché lo SteamID64 è la prova che
    // hai collegato il profilo giusto — lo si riconosce. Su GOG lo stesso campo
    // è `50771470519354436`, che a un umano non dice niente; Amazon invece dà il
    // nome di battesimo ed Epic il display name. Nullable perché non tutti i
    // negozi ne danno uno, e in quel caso la UI ripiega sull'id.
    displayName: text('display_name'),

    // --- il credenziale (step 9a) ---
    //
    // Un campo solo e opaco invece di colonne separate, perché la forma cambia
    // da negozio a negozio: GOG ha access + refresh, PSN avrà l'npsso, Xbox una
    // chiave. A colonne separate questa tabella diventerebbe l'unione di tutte
    // le forme, con la maggior parte delle celle vuote su ogni riga.
    //
    // Cifrato in AES-256-GCM con `STORE_TOKEN_KEY`: vedi `lib/crypto.ts`. Null
    // per Steam, che non ha credenziali per utente.
    credentials: bytea('credentials'),
    // Quando scade l'access token dentro `credentials`. **Fuori** dal cifrato
    // perché è l'unica parte su cui serve poter interrogare il database, e
    // perché non è un segreto. Null = nessun credenziale, o non scade.
    credentialsExpireAt: timestamp('credentials_expire_at'),
    // `needs_reauth` quando il rinnovo è fallito in modo definitivo: l'utente
    // deve rifare il collegamento, e nessun reimport lo aggiusta.
    status: storeAccountStatus('status').notNull().default('ok'),

    // Ultimo import andato a buon fine. Null = collegato ma mai importato.
    lastSyncAt: timestamp('last_sync_at'),
    ...timestamps,
  },
  (table) => [
    // Un account per negozio per utente: collegare due volte Steam è un
    // ricollegamento, non un secondo account.
    unique('store_accounts_user_id_store_key').on(table.userId, table.store),
    index('store_accounts_user_id_idx').on(table.userId),
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
  'unresolved_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    store: store('store').notNull(),
    // L'appid su Steam. Stessa forma di `external_ids.external_id`: risolta la
    // voce, è questo il valore che ci finisce.
    externalId: text('external_id').notNull(),
    // Il nome che dà il negozio. È tutto ciò che si può mostrare all'utente per
    // fargli capire di che gioco si tratta.
    name: text('name').notNull(),
    playtimeMinutes: integer('playtime_minutes'),
    lastPlayedAt: timestamp('last_played_at'),
    ...timestamps,
  },
  (table) => [
    // Reimportare non deve accumulare doppioni degli stessi scarti.
    unique('unresolved_imports_user_store_external_key').on(
      table.userId,
      table.store,
      table.externalId,
    ),
    index('unresolved_imports_user_id_idx').on(table.userId),
  ],
);
