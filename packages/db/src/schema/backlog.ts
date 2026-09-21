import {
  backlogStatusValues,
  mediumValues,
  subscriptionValues,
} from '@repo/contracts/vocabulary';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { user } from './auth';
import { games, store } from './games';
import { storeAccounts } from './imports';
import { platforms } from './platforms';
import { timestamps } from './timestamps';

// `excluded` ("non voglio giocarlo") è uno stato, non una tabella a parte: è un
// segnale negativo esplicito e allo step 12 vale più di molte valutazioni
// positive.
// Valori da @repo/contracts, vedi il commento su `store` in games.ts.
export const backlogStatus = pgEnum('backlog_status', backlogStatusValues);

// Da quale abbonamento viene il diritto di giocare a una copia. Valori da
// @repo/contracts, vedi il commento su `store` in games.ts.
export const subscription = pgEnum('subscription', subscriptionValues);

// Disco o digitale. Valori da @repo/contracts, vedi il commento lì.
export const medium = pgEnum('medium', mediumValues);

// L'esistenza della riga È il possesso: nessun flag "posseduto". La wishlist è
// una tabella separata, così ogni query qui resta semplice.
export const backlog = pgTable(
  'backlog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // text e non uuid: gli id di Better Auth sono stringhe.
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    status: backlogStatus('status').notNull().default('backlog'),

    // --- campi personali (step 5) ---
    // Stanno qui e non su `ownerships` perché sono un giudizio sul gioco, non
    // sulla copia: la stessa recensione non cambia se ce l'hai anche su GOG.
    //
    // Da 0.5 a 5 a mezze stelle: dieci valori. `real` e non un intero in mezzi
    // punti perché 0.5 è esattamente rappresentabile in virgola mobile, quindi i
    // confronti del filtraggio (step 7) restano esatti senza dover tradurre la
    // scala a ogni lettura. Nullo = non votato, che è diverso da votato male.
    rating: real('rating'),
    // Testo libero. È l'unico campo non strutturato ammesso, e proprio perché è
    // testo per l'utente non diventa un campo su cui filtrare o ragionare.
    notes: text('notes'),
    // Nascosto dalla lista. **Il possesso resta**: il gioco è tuo, e allo
    // scollegamento di un account si conta fra quelli che spariscono. Per
    // questo il campo sta qui e non su `ownerships`.
    //
    // Non è `excluded`, e fonderli sarebbe l'errore: `excluded` è un giudizio
    // sul gioco e allo step 13 pesa più di molte valutazioni positive, questo è
    // una preferenza di vista — il motore non lo propone, ma non ne impara
    // niente. Sopravvive ai reimport da solo, perché `ensureBacklogEntries` le
    // righe esistenti non le tocca.
    hiddenAt: timestamp('hidden_at'),

    ...timestamps,
  },
  (table) => [
    // Una riga per gioco/utente: stato, voto e note non si duplicano.
    unique('backlog_user_id_game_id_key').on(table.userId, table.gameId),
    // Il filtro per utente è una JOIN backlog → games, parte sempre da qui.
    index('backlog_user_id_idx').on(table.userId),
    // Il vincolo sta nel database e non solo in Zod: `rating` lo scrivono anche
    // i test e gli script, che non passano dal contratto.
    check(
      'backlog_rating_scale',
      sql`${table.rating} is null or (${table.rating} >= 0.5 and ${table.rating} <= 5 and (${table.rating} * 2) = floor(${table.rating} * 2))`,
    ),
  ],
);

// I possessi stanno a parte così stato e voto non si duplicano per piattaforma.
// Una riga per (backlog, piattaforma, store): su PC lo stesso gioco può stare su
// Steam *e* GOG. La piattaforma è il filtro hard ("stasera ho la Switch accesa"),
// lo store dice da dove lanciarlo e da quale import proviene.
export const ownerships = pgTable(
  'ownerships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    backlogId: uuid('backlog_id')
      .notNull()
      .references(() => backlog.id, { onDelete: 'cascade' }),
    platformSlug: text('platform_slug')
      .notNull()
      .references(() => platforms.slug),
    // Vuoto sugli inserimenti manuali: si sa su che console ci giochi, non
    // necessariamente da dove viene la copia.
    store: store('store'),
    // **Da quale account** viene questa copia. Nullo sugli inserimenti manuali,
    // che un account non ce l'hanno, e nullo su tutto ciò che è stato importato
    // prima che gli account fossero più d'uno.
    //
    // È la riga che risponde a due domande insieme: scollegando un account si sa
    // esattamente quali possessi erano suoi, e avendo due account Amazon si sa
    // da quale dei due lanciare il gioco. `store` resta accanto e non diventa
    // ridondante: sugli inserimenti manuali è l'unica cosa che c'è, ed è la
    // colonna su cui filtra la ricerca dello step 7.
    //
    // `restrict` e non `cascade`: quale dei due rami dello scollegamento si sta
    // percorrendo lo decide l'utente, non la foreign key. Cancellare i possessi
    // è una scelta esplicita, e un `cascade` la farebbe di nascosto anche
    // quando l'utente ha chiesto di tenersi i giochi.
    storeAccountId: uuid('store_account_id').references(
      () => storeAccounts.id,
      {
        onDelete: 'restrict',
      },
    ),
    // Ore giocate e ultima partita, come le riporta il negozio da cui viene
    // l'import. Stanno qui e non su `backlog` perche' sono una proprieta' di
    // *questa copia*: lo stesso gioco su GOG avrebbe le sue.
    //
    // Sono dato oggettivo del negozio, non un campo personale dello step 5, e
    // restano nulli sugli inserimenti manuali. Non si usano per indovinare lo
    // stato: due ore su un GDR da sessanta non vogliono dire "giocato", e
    // `played` allo step 12 pesa.
    playtimeMinutes: integer('playtime_minutes'),
    lastPlayedAt: timestamp('last_played_at'),
    // **Questa copia è tua, o ce l'hai finché paghi?**
    //
    // Nullo = comprata, che è il caso normale. Valorizzato = il diritto viene da
    // un abbonamento, e il giorno che finisce quella riga dice il falso.
    //
    // Sta qui e non su `backlog` per la stessa ragione delle ore: è una
    // proprietà della copia, non un giudizio sul gioco. Lo stesso titolo
    // comprato su Steam resta comprato anche se su PS5 ce l'hai col Plus.
    //
    // Nasce col 9b perché PSN è il primo posto in cui la cosa si vede: su una
    // libreria vera sono 274 righe su 336. Cosa farne è lo step 14; questa
    // colonna serve a non aver buttato l'informazione prima di arrivarci.
    subscription: subscription('subscription'),
    // **Disco o digitale?** Nullo = non dichiarato: le righe di prima che il
    // campo si potesse scrivere a mano, e chi non se ne cura.
    //
    // L'import lo dice sempre: `digital` per ogni libreria di un negozio, che
    // è fatta di diritti digitali, `physical` per i dischi PSN, che dalla
    // libreria non passano e arrivano dall'elenco dei giocati.
    //
    // **Entra nella chiave del vincolo**, ed è la cosa da capire di questa
    // colonna: non descrive com'è fatta una copia, dice *quale* copia è. Il
    // disco sullo scaffale e il diritto sul Plus sono due copie dello stesso
    // gioco sulla stessa console, esattamente come Steam e GOG sono due copie
    // sullo stesso PC, e stanno su due righe.
    //
    // Non sono simmetriche, ed è il motivo per cui la chiave è larga: a
    // sparire è sempre il digitale — l'abbonamento finisce, il gioco esce dal
    // negozio — mentre un disco che l'import non vede più non è un disco che
    // non hai, è un disco che Sony non ha modo di dichiarare. Con la chiave
    // stretta l'arrivo di un diritto digitale riscriveva la riga e il disco
    // spariva dal database: è la storia di God of War (2018), comprato su
    // disco e poi finito nel catalogo Plus.
    medium: medium('medium'),
    ...timestamps,
  },
  (table) => [
    // NULLS NOT DISTINCT perché store e account sono nullable: con il
    // comportamento standard di Postgres i NULL sono tutti diversi fra loro, e
    // "PC / nessuno store" si potrebbe inserire due volte sullo stesso gioco.
    //
    // Account e supporto sono **dentro la chiave** per la stessa ragione: lo
    // stesso gioco su due account Amazon, o su disco e in digitale sulla stessa
    // console, sono due copie, e fonderle vorrebbe dire non sapere più da quale
    // delle due si parte. Il rovescio è che un possesso inserito a mano (account
    // nullo, e supporto nullo finché non lo si dichiara) e uno importato non
    // sono più la stessa riga — vedi `ensureOwnerships`, che prima di scrivere
    // adotta quello a mano invece di sdoppiarlo.
    unique('ownerships_backlog_platform_store_key')
      .on(
        table.backlogId,
        table.platformSlug,
        table.store,
        table.storeAccountId,
        table.medium,
      )
      .nullsNotDistinct(),
    index('ownerships_backlog_id_idx').on(table.backlogId),
  ],
);
