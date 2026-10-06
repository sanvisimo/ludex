import {
  hiddenKindValues,
  storeAccountStatusValues,
} from '@repo/contracts/vocabulary';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { user } from './auth';
import { store } from './games';
import { platforms } from './platforms';
import { timestamps } from './timestamps';

export const hiddenKind = pgEnum('hidden_kind', hiddenKindValues);

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
    // Come il **negozio** chiama l'account: `personaname` su Steam, `username`
    // su GOG, il display name su Epic, il nome di battesimo su Amazon. Nullable
    // perché non tutti ne danno uno, e in quel caso la UI ripiega sull'id.
    //
    // Preso al collegamento e non ad ogni import: è decorazione, e un nome
    // cambiato nel frattempo non vale una richiesta in più per libreria.
    displayName: text('display_name'),
    // Come lo chiama **l'utente**. Sempre nullo finché non lo scrive lui.
    //
    // Esiste perché il nome del negozio non basta a distinguere due account
    // della stessa persona, ed è misurato: i due account Amazon dello stesso
    // utente rendono lo stesso `given_name`, quindi due schede identiche. Nessun
    // dato dell'API risolve quel caso — l'unico che sa quale dei due è «quello
    // di famiglia» è chi li ha collegati.
    //
    // Vale anche per i negozi che verranno: EA, Nintendo e Xbox non danno
    // nessun nome leggibile, e qui c'è già la risposta invece di doverne
    // inventare una per ciascuno.
    label: text('label'),

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
    // Se questo account si aggiorna da solo. Vale solo con l'interruttore
    // generale acceso (`user_settings.auto_sync_library`): servono tutti e due.
    //
    // Per account perché ci sono librerie che non cambiano più — un account
    // Amazon su cui non si riscatta niente da un anno — e aggiornarle è solo
    // una manciata di ricerche IGDB buttate a ogni giro.
    autoSync: boolean('auto_sync').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    // **Un account per negozio per utente non basta.** Due account Amazon sono
    // un caso vero, non un'ipotesi: senza l'id del negozio nella chiave, il
    // secondo collegamento sovrascrive il primo, i suoi giochi restano in
    // backlog senza niente che ricordi da dove venissero, e il vincolo su
    // `ownerships` ha già fuso i due possessi in uno.
    //
    // Con l'id dentro, ricollegare **lo stesso** account resta un aggiornamento
    // (è ciò che rimette a posto un `needs_reauth`), collegarne uno diverso ne
    // aggiunge uno. Il prezzo è che incollare il profilo Steam sbagliato non si
    // corregge più reincollando: si scollega quello di troppo.
    unique('store_accounts_user_store_external_key').on(
      table.userId,
      table.store,
      table.externalAccountId,
    ),
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
    // **Da quale account** viene lo scarto. `cascade`: scollegando, gli scarti
    // di quell'account se ne vanno da soli in entrambi i rami — senza l'account
    // sono voci di una libreria che non possiamo più leggere.
    //
    // Non nullable, al contrario di `ownerships.storeAccountId`: uno scarto
    // esiste solo perché un import l'ha prodotto, non c'è il caso
    // dell'inserimento manuale. `store` resta accanto perché è denormalizzato e
    // ci si filtra sopra senza JOIN.
    storeAccountId: uuid('store_account_id')
      .notNull()
      .references(() => storeAccounts.id, { onDelete: 'cascade' }),
    // L'appid su Steam. Stessa forma di `external_ids.external_id`: risolta la
    // voce, è questo il valore che ci finisce.
    externalId: text('external_id').notNull(),
    // Il nome che dà il negozio. È tutto ciò che si può mostrare all'utente per
    // fargli capire di che gioco si tratta.
    name: text('name').notNull(),
    // Su quale piattaforma stava la voce, quando il negozio lo dice.
    //
    // Nulla sui negozi PC, dove la piattaforma è una costante del negozio e la
    // ricava `platformFor`. Valorizzata da PSN in poi, dove la piattaforma la
    // dice la riga: senza, risolvere a mano uno scarto PS5 non saprebbe su cosa
    // scrivere il possesso — e `platformFor('psn')` alzerebbe, com'era giusto
    // che facesse finché nessuno aveva risposto a quella domanda.
    platformSlug: text('platform_slug').references(() => platforms.slug),
    playtimeMinutes: integer('playtime_minutes'),
    lastPlayedAt: timestamp('last_played_at'),
    // Quando la voce è entrata nella libreria del negozio, dove il negozio lo
    // dice (Epic, Amazon, GOG). Risolta la voce diventa `acquired_at` della
    // copia: senza, il gioco risolto a mano risultava aggiunto il giorno in cui
    // lo si collegava, finché un reimport non lo riportava indietro.
    acquiredAt: timestamp('acquired_at'),
    // La copertina, **come URL del negozio**: la voce non è un gioco, quindi non
    // ha né `games` né IGDB, e questa è l'unica immagine che esiste. Già pronta
    // da mostrare — GOG ne dà solo l'hash e il suffisso lo mette l'import — e
    // solo per i negozi che la mandano: Steam non ne ha bisogno, la compone la
    // UI dall'appid, e dove manca resta nulla e la riga mostra l'icona del
    // negozio. Riscritta a ogni import insieme al nome, come tutto ciò che
    // viene dal negozio.
    imageUrl: text('image_url'),
    // Dove sta la voce sul negozio, come pezzo di indirizzo: la stessa forma di
    // `ownerships.store_page`, e il link lo compone lo stesso `storePageUrl`.
    // Nulla dove il negozio non la dà (Epic, Amazon).
    storePage: text('store_page'),
    // Nascosta dall'utente: non compare più fra i «da sistemare».
    //
    // Prima c'era `dismiss`, che **cancellava** la riga — e il prossimo import
    // la riportava, perché la voce nella libreria c'è ancora. Un campo invece
    // sopravvive da sé: l'upsert di `recordUnresolved` riscrive nome, ore e
    // piattaforma e non tocca questi due. Una data e non un booleano perché la
    // vista dei nascosti li mette in ordine di quando.
    hiddenAt: timestamp('hidden_at'),
    // Perché: vedi `hiddenKindValues`. C'è se e solo se c'è `hiddenAt`.
    hiddenKind: hiddenKind('hidden_kind'),
    ...timestamps,
  },
  (table) => [
    check(
      'unresolved_imports_hidden_kind',
      sql`(${table.hiddenAt} is null) = (${table.hiddenKind} is null)`,
    ),
    // Reimportare non deve accumulare doppioni degli stessi scarti. Per account
    // e non per negozio: due account Amazon hanno ciascuno i suoi scarti, e con
    // la chiave vecchia il secondo import sovrascriveva le voci del primo.
    unique('unresolved_imports_account_external_key').on(
      table.storeAccountId,
      table.externalId,
    ),
    index('unresolved_imports_user_id_idx').on(table.userId),
  ],
);

/**
 * Gli scarti nascosti **per tutti** (11a): una voce che non è un gioco per
 * nessuno — Netflix su PSN è un'app in ogni libreria. La decide un admin.
 *
 * Una regola, non uno stato: le righe di `unresolved_imports` restano ciascuna
 * dell'utente suo. La regola agisce in due momenti soli — quando l'admin la
 * scrive, sulle righe ancora visibili, e quando un import fa **nascere** una
 * riga con quella chiave. Le righe già nascoste dall'utente non si toccano, e
 * un utente che rimette la voce fra i «da sistemare» resta libero di farlo:
 * l'upsert di un reimport non tocca `hidden_at`. Togliere la regola smette di
 * applicarla alle righe nuove e non tocca quelle già scritte.
 */
export const globalHiddenImports = pgTable(
  'global_hidden_imports',
  {
    store: store('store').notNull(),
    externalId: text('external_id').notNull(),
    // Il nome della voce quando la si è nascosta. Senza, nella vista «Nascosti
    // per tutti» una chiave che non ha più scarti attivi sarebbe solo un id:
    // `97205382-970c-…` non dice a nessuno che era Dream Daddy.
    name: text('name').notNull(),
    // Solo i tipi che sono un fatto: `unwanted` è una preferenza, e una
    // preferenza non si decide per tutti. Lo esclude il CHECK qui sotto.
    hiddenKind: hiddenKind('hidden_kind').notNull(),
    // Chi l'ha decisa. `set null` e non `cascade`: cancellare l'account
    // dell'admin (step 16) non deve portarsi via la regola.
    decidedBy: text('decided_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.store, table.externalId] }),
    check(
      'global_hidden_imports_not_unwanted',
      sql`${table.hiddenKind} <> 'unwanted'`,
    ),
  ],
);
