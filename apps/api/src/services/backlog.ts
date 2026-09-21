import type { UserTag, UserTagInput } from '@repo/contracts';
import type {
  BacklogStatus,
  Medium,
  Store,
  Subscription,
} from '@repo/contracts/vocabulary';

import { chunk } from '../lib/chunk';
import { gameColumns } from './games';
import { ensureUserTags } from './tags';
import { db, schema } from '@repo/db';
import { and, eq, inArray, sql } from '@repo/db/orm';

// Forma di BacklogEntrySchema: la riga, il gioco, i possessi, i tag.
//
// Esportata perché il filtraggio dello step 7 (`backlog-search.ts`) idrata le
// righe con questa e non con una copia: due definizioni della stessa forma
// divergerebbero al primo campo aggiunto a una sola delle due.
export const entryQuery = {
  columns: {
    id: true,
    status: true,
    rating: true,
    notes: true,
    hiddenAt: true,
    createdAt: true,
  },
  with: {
    game: { columns: gameColumns },
    ownerships: {
      columns: {
        id: true,
        platformSlug: true,
        store: true,
        playtimeMinutes: true,
        lastPlayedAt: true,
        subscription: true,
        medium: true,
      },
      // Da quale account viene la copia: è ciò che permette alla scheda di
      // scrivere «Amazon — secondo account» invece di due volte «Amazon».
      // Nullo sugli inserimenti manuali, e sui possessi importati prima che gli
      // account fossero più d'uno.
      with: {
        storeAccount: {
          columns: {
            id: true,
            displayName: true,
            label: true,
            externalAccountId: true,
            status: true,
          },
        },
      },
    },
    tags: {
      columns: {},
      with: { tag: { columns: { id: true, kind: true, name: true } } },
    },
  },
} as const;

/**
 * Appiattisce la tabella di raccordo dei tag.
 *
 * La query relazionale rende `tags: [{ tag: {...} }]`, il contratto vuole
 * `tags: [{...}]`. Passa da qui **ogni** funzione che restituisce una riga di
 * backlog, così la forma è una sola e nessun chiamante deve ricordarsene.
 */
export function toEntry<T extends { tags: { tag: UserTag }[] }>(entry: T) {
  const { tags, ...rest } = entry;
  return { ...rest, tags: tags.map((row) => row.tag) };
}

// Il possesso inserito a mano dallo step 5. Nessun `storeAccountId`: l'account
// lo attacca solo un import, e un utente che dichiara «ce l'ho su Amazon» non sta
// dicendo su quale dei suoi account.
//
// Il supporto invece sì, ed è l'unica fonte che possa dirlo per un disco coperto
// da un diritto digitale: un gioco comprato su disco e poi finito nel Plus, per
// il negozio, è digitale e basta.
export type OwnershipInput = {
  platformSlug: string;
  store?: Store | null;
  medium?: Medium | null;
};

// Quante righe per INSERT. Postgres regge 65535 parametri per istruzione: con
// una libreria da qualche migliaio di giochi un colpo solo li sfonderebbe.
const WRITE_CHUNK = 500;

export async function findEntryById(userId: string, id: string) {
  const row = await db.query.backlog.findFirst({
    ...entryQuery,
    // Sempre in AND con lo userId: senza, un id indovinato leggerebbe la riga
    // di un altro utente.
    where: and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)),
  });
  return row ? toEntry(row) : undefined;
}

export async function findEntryByGame(userId: string, gameId: string) {
  const row = await db.query.backlog.findFirst({
    ...entryQuery,
    where: and(
      eq(schema.backlog.userId, userId),
      eq(schema.backlog.gameId, gameId),
    ),
  });
  return row ? toEntry(row) : undefined;
}

/**
 * Crea la riga di backlog e i suoi possessi in transazione: una riga senza
 * piattaforma sarebbe invisibile al filtro hard, quindi o si scrive tutto o niente.
 */
export async function addToBacklog(input: {
  userId: string;
  gameId: string;
  status: BacklogStatus;
  ownerships: OwnershipInput[];
}) {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(schema.backlog)
      .values({
        userId: input.userId,
        gameId: input.gameId,
        status: input.status,
      })
      .returning({ id: schema.backlog.id });

    if (!entry) throw new Error('insert su backlog non ha restituito la riga');

    await tx.insert(schema.ownerships).values(
      input.ownerships.map((ownership) => ({
        backlogId: entry.id,
        platformSlug: ownership.platformSlug,
        store: ownership.store ?? null,
        medium: ownership.medium ?? null,
      })),
    );

    return entry.id;
  });
}

export async function setBacklogStatus(
  userId: string,
  id: string,
  status: BacklogStatus,
) {
  const [row] = await db
    .update(schema.backlog)
    .set({ status })
    .where(and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)))
    .returning({ id: schema.backlog.id });
  return row;
}

/**
 * Nasconde il gioco dalla lista, o lo rimette.
 *
 * Tocca solo `hiddenAt`: né lo stato né i possessi. Nascondere non è «non ce
 * l'ho» — il possesso resta, e il prossimo import non ricrea niente perché non
 * c'è niente da ricreare — e non è `excluded`, che è un giudizio sul gioco.
 *
 * Nascondere un gioco già nascosto non ne sposta la data: la vista dei nascosti
 * è in ordine di quando, e un secondo clic non deve riportarlo in cima.
 */
export async function setBacklogHidden(
  userId: string,
  id: string,
  hidden: boolean,
) {
  const [row] = await db
    .update(schema.backlog)
    .set({
      hiddenAt: hidden
        ? sql`coalesce(${schema.backlog.hiddenAt}, now())`
        : null,
    })
    .where(and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)))
    .returning({ id: schema.backlog.id });
  return row;
}

/**
 * I campi personali dello step 5, in una sola scrittura.
 *
 * Due proprietà da leggere insieme:
 *
 * - **assente ≠ null**. `undefined` vuol dire "non toccare", `null` vuol dire
 *   "togli". Senza la distinzione un form che manda solo il voto cancellerebbe
 *   le note, e un `set` costruito a partire dalle chiavi presenti è l'unico modo
 *   di rispettarla.
 * - **i tag si riscrivono in blocco**, come fa l'enrichment con gli attributi
 *   IGDB: si cancella il raccordo e si riscrive. È ciò che rende la mutazione
 *   idempotente e gestisce da solo i tag tolti, senza un endpoint apposta.
 *
 * Restituisce `null` se la riga non è dell'utente: la proprietà si verifica qui,
 * prima di toccare i tag, perché la scrittura sul raccordo passa dal `backlogId`
 * e non avrebbe più modo di sapere di chi è.
 */
export async function updateBacklogEntry(
  userId: string,
  input: {
    id: string;
    status?: BacklogStatus;
    rating?: number | null;
    notes?: string | null;
    tags?: UserTagInput[];
  },
) {
  const owned = await db.query.backlog.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.backlog.id, input.id),
      eq(schema.backlog.userId, userId),
    ),
  });
  if (!owned) return null;

  // I tag si risolvono **fuori** dalla transazione e sempre partendo dallo
  // userId: è qui che si impedisce a un utente di attaccarsi il tag di un altro.
  // Un id arrivato dal client non basterebbe, perché non dice di chi è.
  const tagIds =
    input.tags === undefined
      ? null
      : (await ensureUserTags(userId, input.tags)).map((tag) => tag.id);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.backlog)
      .set({
        // `updatedAt` c'è sempre, e non solo per correttezza: senza, una
        // modifica dei soli tag lascerebbe `set` vuoto e Drizzle rifiuterebbe
        // la query.
        updatedAt: new Date(),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        // Il campo svuotato dalla UI arriva come stringa vuota: vale "nessuna
        // nota", non "una nota vuota".
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      })
      .where(eq(schema.backlog.id, input.id));

    if (tagIds === null) return;

    await tx
      .delete(schema.backlogTags)
      .where(eq(schema.backlogTags.backlogId, input.id));

    if (tagIds.length > 0) {
      await tx
        .insert(schema.backlogTags)
        .values(tagIds.map((tagId) => ({ backlogId: input.id, tagId })));
    }
  });

  return owned;
}

/**
 * Aggiunge una piattaforma a un gioco già nel backlog.
 *
 * Non passa da `ensureOwnerships`, e non è una svista: quella scrittura è fatta
 * per righe **più** specifiche di quelle che trova — un import porta negozio e
 * account, e adotta ciò che ne ha meno. Qui è il contrario: chi scrive a mano
 * porta *meno* di ciò che c'è già, perché un account non ce l'ha e spesso
 * nemmeno un negozio, e con il vincolo largo finirebbe su una riga sua.
 *
 * Quindi la regola è la compatibilità: dire «ce l'ho su PS5, fisico» quando
 * quella copia è già lì non ne crea una seconda, perché ciò che non si dichiara
 * vale come «non lo so», non come «diverso». Al contrario dichiarare il disco
 * dove c'è solo il digitale scrive una riga nuova: sono due copie, ed è tutto il
 * punto del supporto dentro la chiave.
 */
export async function addOwnershipToEntry(
  userId: string,
  id: string,
  ownership: OwnershipInput,
) {
  const owned = await db.query.backlog.findFirst({
    columns: { id: true },
    // I possessi si raggiungono dal `backlogId`, che da solo non dice di chi è
    // la riga: la proprietà va verificata prima di scrivere.
    where: and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)),
  });
  if (!owned) return null;

  const store = ownership.store ?? null;
  const medium = ownership.medium ?? null;

  const esistenti = await db
    .select({
      id: schema.ownerships.id,
      store: schema.ownerships.store,
      medium: schema.ownerships.medium,
    })
    .from(schema.ownerships)
    .where(
      and(
        eq(schema.ownerships.backlogId, id),
        eq(schema.ownerships.platformSlug, ownership.platformSlug),
      ),
    );

  const compatibili = esistenti.filter(
    (riga) =>
      (store === null || riga.store === store) &&
      (medium === null || riga.medium === null || riga.medium === medium),
  );

  // Prima chi dice già la stessa cosa, poi chi non dice niente, poi chiunque:
  // l'ordine conta solo dichiarando un supporto — «fisico» dove ci sono una riga
  // fisica e una muta non deve andare a riscrivere quella muta. Chi non
  // dichiara niente si accontenta di qualunque copia già nota, perché non sta
  // affermando che ne esista un'altra.
  const gia =
    compatibili.find((riga) => riga.medium === medium) ??
    compatibili.find((riga) => riga.medium === null) ??
    compatibili[0];

  if (!gia) {
    await db.insert(schema.ownerships).values({
      backlogId: id,
      platformSlug: ownership.platformSlug,
      store,
      medium,
    });
    return owned;
  }

  // Una riga che non diceva il supporto e ora lo sa: è l'unico caso in cui
  // l'aggiunta **modifica** invece di aggiungere, e resta un'aggiunta di
  // informazione — nessun valore dichiarato viene riscritto.
  if (gia.medium === null && medium !== null) {
    await db
      .update(schema.ownerships)
      .set({ medium, updatedAt: new Date() })
      .where(eq(schema.ownerships.id, gia.id));
  }

  return owned;
}

export async function removeFromBacklog(userId: string, id: string) {
  const [row] = await db
    .delete(schema.backlog)
    .where(and(eq(schema.backlog.id, id), eq(schema.backlog.userId, userId)))
    .returning({ id: schema.backlog.id });
  return row;
}

/**
 * Crea le righe di backlog che mancano, in un colpo solo.
 *
 * **Non tocca lo stato di quelle che ci sono già.** È la regola che rende un
 * import innocuo su una libreria curata a mano: se hai messo Hollow Knight su
 * Switch come `playing`, l'import di Steam aggiunge il possesso e ti lascia lo
 * stato dov'era.
 *
 * Restituisce la mappa gameId → backlogId per *tutte* le righe chieste, e
 * l'insieme di quelle appena create — che al chiamante serve per il resoconto.
 */
export async function ensureBacklogEntries(
  userId: string,
  gameIds: string[],
): Promise<{ byGameId: Map<string, string>; created: Set<string> }> {
  const byGameId = new Map<string, string>();
  const created = new Set<string>();
  if (gameIds.length === 0) return { byGameId, created };

  // Lo stesso gioco può arrivare due volte dalla stessa libreria: su Steam due
  // appid diversi possono puntare allo stesso gioco IGDB. Senza questa riga
  // l'INSERT proporrebbe due volte la stessa coppia (utente, gioco).
  const unique = [...new Set(gameIds)];

  for (const page of chunk(unique, WRITE_CHUNK)) {
    const inserted = await db
      .insert(schema.backlog)
      .values(page.map((gameId) => ({ userId, gameId })))
      .onConflictDoNothing({
        target: [schema.backlog.userId, schema.backlog.gameId],
      })
      .returning({ id: schema.backlog.id, gameId: schema.backlog.gameId });

    for (const row of inserted) {
      byGameId.set(row.gameId, row.id);
      created.add(row.gameId);
    }

    // Le righe che c'erano già non tornano dal RETURNING: si rileggono.
    const mancanti = page.filter((gameId) => !byGameId.has(gameId));
    if (mancanti.length === 0) continue;

    const esistenti = await db
      .select({ id: schema.backlog.id, gameId: schema.backlog.gameId })
      .from(schema.backlog)
      .where(
        and(
          eq(schema.backlog.userId, userId),
          inArray(schema.backlog.gameId, mancanti),
        ),
      );

    for (const row of esistenti) byGameId.set(row.gameId, row.id);
  }

  return { byGameId, created };
}

/**
 * Fonde le righe che finirebbero sullo stesso possesso.
 *
 * Non è prudenza: su Steam due appid diversi possono puntare allo stesso gioco
 * IGDB (445 giochi distinti per 447 appid su una libreria vera), e allora la
 * chiave `(backlog, piattaforma, store)` è la stessa per entrambe. Postgres
 * rifiuta una ON CONFLICT DO UPDATE che tocchi la stessa riga due volte nello
 * stesso comando, quindi vanno fuse **prima** di scrivere.
 *
 * Le ore si sommano: sono due voci di libreria dello stesso gioco, e il tempo
 * speso è la somma dei due. L'ultima partita è la più recente delle due.
 *
 * Sul supporto non c'è niente da decidere, e prima che entrasse nella chiave
 * c'era: due voci che finiscono qui insieme lo hanno per forza uguale. Il disco
 * PSN con un codice diverso dalla copia comprata sulla stessa console — due
 * voci, un gioco, una console — non cade più sulla stessa chiave, e resta
 * quello che è: due copie.
 */
function fondiDoppioni(rows: OwnershipUpsert[]) {
  const perChiave = new Map<string, OwnershipUpsert>();

  for (const row of rows) {
    const chiave = chiavePossesso(row);
    const gia = perChiave.get(chiave);

    if (!gia) {
      perChiave.set(chiave, row);
      continue;
    }

    perChiave.set(chiave, {
      ...gia,
      playtimeMinutes:
        gia.playtimeMinutes == null && row.playtimeMinutes == null
          ? null
          : (gia.playtimeMinutes ?? 0) + (row.playtimeMinutes ?? 0),
      lastPlayedAt:
        [gia.lastPlayedAt, row.lastPlayedAt]
          .filter((date): date is Date => date instanceof Date)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    });
  }

  return [...perChiave.values()];
}

/** La chiave del vincolo unique, scritta una volta sola. */
function chiavePossesso(row: {
  backlogId: string;
  platformSlug: string;
  store?: Store | null;
  storeAccountId?: string | null;
  medium?: Medium | null;
}) {
  return [
    row.backlogId,
    row.platformSlug,
    row.store ?? '',
    row.storeAccountId ?? '',
    row.medium ?? '',
  ].join('|');
}

export type OwnershipUpsert = {
  backlogId: string;
  platformSlug: string;
  store?: Store | null;
  storeAccountId?: string | null;
  playtimeMinutes?: number | null;
  lastPlayedAt?: Date | null;
  /** Nullo = comprato. Vedi la colonna omonima su `ownerships`. */
  subscription?: Subscription | null;
  /** Nullo = non dichiarato. Vedi la colonna omonima su `ownerships`. */
  medium?: Medium | null;
};

/**
 * Fa proprie le righe **meno specifiche** di quelle in arrivo.
 *
 * Serve perché account e supporto stanno nella chiave del vincolo. Un possesso
 * scritto a mano non ha un account, spesso non ha nemmeno un negozio, e finché
 * non lo si dichiara non ha un supporto: senza questo passo, il primo import
 * sdoppierebbe in silenzio ogni riga che l'utente si era scritto da sé — la
 * scheda del gioco mostrerebbe «PS5» e «PS5 · PlayStation Store» come se
 * fossero due copie.
 *
 * Cosa può essere adottato, e cosa no:
 *
 * - **mai una riga di un altro account** (`store_account_id is null`): due
 *   account Amazon sono due copie, ed è il caso per cui l'account sta nella
 *   chiave.
 * - **mai una riga di un altro negozio**: «PC · GOG» scritto a mano non è la
 *   copia che sta arrivando da Steam.
 * - **mai una riga di un altro supporto**: è tutto il punto del disco dentro la
 *   chiave. Il disco che dichiari resta tuo anche il giorno che il gioco entra
 *   nel catalogo dell'abbonamento, e quella è una riga nuova, non un aggiornamento
 *   della tua.
 *
 * Ciò che non dichiara niente invece si adotta: una riga senza supporto dice
 * «non lo so», non «un altro».
 *
 * Quando la riga di destinazione **esiste già** — l'import era passato, e la
 * riga a mano è rimasta lì accanto — adottare vorrebbe dire violare il vincolo:
 * lì la riga meno specifica si cancella, perché le due sono la stessa copia e
 * quella più specifica sa tutto ciò che sapeva l'altra.
 *
 * Una SELECT per pagina, e quasi sempre nessuna scrittura: su una libreria
 * importata una seconda volta non c'è più niente di meno specifico da adottare.
 */
async function adottaPossessiMenoSpecifici(rows: OwnershipUpsert[]) {
  const backlogIds = [...new Set(rows.map((row) => row.backlogId))];
  if (backlogIds.length === 0) return;

  const esistenti = await db
    .select({
      id: schema.ownerships.id,
      backlogId: schema.ownerships.backlogId,
      platformSlug: schema.ownerships.platformSlug,
      store: schema.ownerships.store,
      storeAccountId: schema.ownerships.storeAccountId,
      medium: schema.ownerships.medium,
    })
    .from(schema.ownerships)
    .where(inArray(schema.ownerships.backlogId, backlogIds));

  if (esistenti.length === 0) return;

  const occupate = new Set(esistenti.map(chiavePossesso));
  // Una riga meno specifica si adotta una volta sola, e una destinazione la
  // sistema una riga sola: senza questi due insiemi la seconda passata
  // riprenderebbe ciò che ha già fatto la prima.
  const prese = new Set<string>();
  const servite = new Set<string>();

  // Da adottare, raggruppate per la destinazione: dentro un import negozio,
  // account e supporto sono quasi sempre gli stessi, quindi quattrocento giochi
  // restano una UPDATE invece di quattrocento andate e ritorni.
  const daAdottare = new Map<string, { row: OwnershipUpsert; ids: string[] }>();
  const daCancellare: string[] = [];

  // Due passate: prima chi dichiara già lo stesso supporto, poi chi non lo
  // dichiara affatto. Senza, con una riga «fisico» e una senza supporto sulla
  // stessa piattaforma, a farsi adottare sarebbe quella che càpita per prima.
  for (const esatto of [true, false]) {
    for (const row of rows) {
      const destinazione = chiavePossesso(row);
      if (servite.has(destinazione)) continue;

      const candidata = esistenti.find(
        (riga) =>
          !prese.has(riga.id) &&
          riga.backlogId === row.backlogId &&
          riga.platformSlug === row.platformSlug &&
          riga.storeAccountId === null &&
          (riga.store === null || riga.store === (row.store ?? null)) &&
          (esatto
            ? riga.medium !== null && riga.medium === (row.medium ?? null)
            : riga.medium === null) &&
          chiavePossesso(riga) !== destinazione,
      );
      if (!candidata) continue;

      prese.add(candidata.id);
      servite.add(destinazione);

      // La destinazione esiste già: adottare violerebbe il vincolo, e non
      // c'è niente da salvare — la riga più specifica sa già tutto.
      if (occupate.has(destinazione)) {
        daCancellare.push(candidata.id);
        continue;
      }

      occupate.add(destinazione);
      const gruppo = `${row.platformSlug}|${row.store ?? ''}|${row.storeAccountId ?? ''}|${row.medium ?? ''}`;
      const gia = daAdottare.get(gruppo);
      if (gia) gia.ids.push(candidata.id);
      else daAdottare.set(gruppo, { row, ids: [candidata.id] });
    }
  }

  for (const { row, ids } of daAdottare.values()) {
    await db
      .update(schema.ownerships)
      .set({
        store: row.store ?? null,
        storeAccountId: row.storeAccountId ?? null,
        medium: row.medium ?? null,
        updatedAt: new Date(),
      })
      .where(inArray(schema.ownerships.id, ids));
  }

  if (daCancellare.length > 0) {
    await db
      .delete(schema.ownerships)
      .where(inArray(schema.ownerships.id, daCancellare));
  }
}

/**
 * Scrive i possessi che mancano e aggiorna il tempo di gioco di quelli che ci sono.
 *
 * Idempotente per costruzione: la chiave è `(backlog, piattaforma, store,
 * account, supporto)`, e il vincolo è `NULLS NOT DISTINCT` — senza, "PC /
 * nessuno store" si potrebbe inserire due volte perché in Postgres i NULL sono
 * tutti diversi fra loro.
 *
 * Sul conflitto aggiorna **solo** le ore e l'abbonamento: il supporto sta nella
 * chiave, quindi una riga non lo cambia mai — cambiarlo vorrebbe dire che è
 * un'altra copia, e un'altra copia è un'altra riga.
 */
export async function ensureOwnerships(rows: OwnershipUpsert[]) {
  if (rows.length === 0) return { created: 0 };

  let created = 0;

  for (const page of chunk(fondiDoppioni(rows), WRITE_CHUNK)) {
    await adottaPossessiMenoSpecifici(page);

    const inserted = await db
      .insert(schema.ownerships)
      .values(
        page.map((row) => ({
          backlogId: row.backlogId,
          platformSlug: row.platformSlug,
          store: row.store ?? null,
          storeAccountId: row.storeAccountId ?? null,
          playtimeMinutes: row.playtimeMinutes ?? null,
          lastPlayedAt: row.lastPlayedAt ?? null,
          subscription: row.subscription ?? null,
          medium: row.medium ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [
          schema.ownerships.backlogId,
          schema.ownerships.platformSlug,
          schema.ownerships.store,
          schema.ownerships.storeAccountId,
          schema.ownerships.medium,
        ],
        set: {
          // COALESCE e non assegnazione secca: se questa scrittura non porta le
          // ore, restano quelle che c'erano.
          playtimeMinutes: sql`coalesce(excluded.playtime_minutes, ${schema.ownerships.playtimeMinutes})`,
          lastPlayedAt: sql`coalesce(excluded.last_played_at, ${schema.ownerships.lastPlayedAt})`,
          // **Non** in COALESCE, al contrario delle ore, ed è una differenza
          // voluta: il negozio è l'unica autorità su come possiedi quella copia,
          // e il caso che conta è quello in cui il valore **sparisce** — compri
          // un gioco che avevi col Plus, e il possesso deve smettere di dire che
          // dipende dall'abbonamento. Con COALESCE resterebbe marcato per
          // sempre. Le ore sono il caso opposto: un import che non le porta non
          // deve cancellare quelle che un altro aveva scritto.
          subscription: sql`excluded.subscription`,
          // Il supporto **non c'è**, e prima c'era: è entrato nella chiave, e su
          // una riga trovata per conflitto è uguale per definizione. Il giorno
          // che il disco lo compri anche in digitale non cambia questa riga,
          // ne nasce un'altra — il disco resta sullo scaffale.
          updatedAt: new Date(),
        },
      })
      .returning({
        id: schema.ownerships.id,
        createdAt: schema.ownerships.createdAt,
      });

    created += inserted.length;
  }

  // Con DO UPDATE il RETURNING rende anche le righe aggiornate, quindi questo
  // conta le scritture, non le creazioni. Chi vuole il numero esatto dei nuovi
  // possessi lo ricava dai backlog creati, che è l'unico dato che serve nel
  // resoconto.
  return { created };
}
