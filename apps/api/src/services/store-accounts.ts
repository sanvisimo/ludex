import type { LinkableStore, Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq, inArray, ne, sql } from '@repo/db/orm';

import {
  AmazonAuthError,
  amazonLoginUrl,
  type AmazonCredentials,
  parseAmazonAuthCode,
  refreshAmazonTokens,
  registerAmazonDevice,
} from '../external/amazon';
import {
  EpicAuthError,
  epicLoginUrl,
  exchangeEpicCode,
  parseEpicAuthCode,
  refreshEpicTokens,
} from '../external/epic';
import {
  exchangeGogCode,
  fetchGogUsername,
  gogLoginUrl,
  GogAuthError,
  parseGogAuthCode,
  refreshGogTokens,
} from '../external/gog';
import { fetchSteamPersonaName, resolveSteamId } from '../external/steam';
import { encryptCredentials, decryptCredentials } from '../lib/crypto';
import { isImportRunning } from '../queue/imports';

/**
 * Gli account di negozio collegati, e il ciclo di vita dei loro credenziali.
 *
 * Allo step 4 qui c'era solo Steam, che di credenziali non ne ha: la chiave è
 * dell'applicazione e la libreria si legge se il profilo è pubblico. Dal 9a
 * GOG, Epic e Amazon portano un **refresh token per utente**, cifrato a riposo,
 * che va rinnovato da solo e che un giorno smetterà di funzionare.
 */

/**
 * Il collegamento è morto e non si aggiusta da sé.
 *
 * Segnalato a parte perché il chiamante ci fa una cosa diversa: il job non deve
 * riprovare — nessun tentativo cambierà l'esito — e l'utente va avvisato che
 * deve rifare il gesto. Chi lo alza ha già scritto `needs_reauth` sulla riga.
 */
export class StoreReauthRequiredError extends Error {
  constructor(readonly store: Store) {
    super(`Il collegamento a ${store} è scaduto: ricollega l'account`);
    this.name = 'StoreReauthRequiredError';
  }
}

/**
 * La riga di `store_accounts`, come la leggono i servizi.
 *
 * Le funzioni che parlano con un negozio prendono **la riga** e non
 * `(userId, store)`: da quando gli account per negozio possono essere più d'uno,
 * quella coppia non individua più niente.
 */
export type StoreAccountRow = typeof schema.storeAccounts.$inferSelect;

/** Ciò che di un account esce dall'API. Mai le credenziali. */
const accountColumns = {
  id: schema.storeAccounts.id,
  store: schema.storeAccounts.store,
  externalAccountId: schema.storeAccounts.externalAccountId,
  displayName: schema.storeAccounts.displayName,
  label: schema.storeAccounts.label,
  status: schema.storeAccounts.status,
  lastSyncAt: schema.storeAccounts.lastSyncAt,
};

/**
 * Gli account collegati dall'utente, quanti ne vuole per negozio.
 *
 * Gli `unlinked` restano fuori: sono righe che sopravvivono solo per dire ai
 * possessi da dove venivano, e in `/account` un account scollegato che compare
 * fra quelli collegati sarebbe una bugia. Chi ha bisogno del loro nome — la
 * scheda di un gioco, per scrivere «Amazon (secondo account)» — se lo legge
 * dalla JOIN sul possesso, non da qui.
 *
 * `syncing` non viene dal DB ma dalla coda: durante il primo import `lastSyncAt`
 * è ancora nullo, e senza questo la pagina non avrebbe niente da mostrare per
 * mezzo minuto.
 */
export async function listStoreAccounts(userId: string) {
  const rows = await db
    .select(accountColumns)
    .from(schema.storeAccounts)
    .where(
      and(
        eq(schema.storeAccounts.userId, userId),
        ne(schema.storeAccounts.status, 'unlinked'),
      ),
    )
    .orderBy(schema.storeAccounts.store, schema.storeAccounts.createdAt);

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      syncing: await isImportRunning(row.id),
    })),
  );
}

/**
 * Un account dell'utente, per id.
 *
 * Sempre in AND con lo `userId`: senza, un id indovinato darebbe accesso
 * all'account di un altro — e qui dentro ci sono le credenziali.
 */
export function findStoreAccount(userId: string, accountId: string) {
  return db.query.storeAccounts.findFirst({
    where: and(
      eq(schema.storeAccounts.id, accountId),
      eq(schema.storeAccounts.userId, userId),
    ),
  });
}

/**
 * Scrive il collegamento.
 *
 * Ricollegare **lo stesso account** sovrascrive: è il gesto che rimette in
 * sesto un `needs_reauth`, e riporta a `ok` anche un account scollegato che
 * l'utente ripesca. Collegarne uno **diverso** ne aggiunge uno, che è la ragione
 * per cui la chiave comprende `externalAccountId`.
 *
 * Il prezzo, ed è giusto sia scritto: incollare il profilo Steam sbagliato non
 * si corregge più reincollando quello giusto — si finisce con due account e si
 * scollega quello di troppo.
 *
 * `lastSyncAt` torna nullo perché la libreria di prima non è quella di adesso.
 */
async function upsertAccount(input: {
  userId: string;
  store: Store;
  externalAccountId: string;
  displayName?: string | null;
  label?: string | null;
  credentials?: unknown;
  expiresAt?: Date | null;
}) {
  const credentials =
    input.credentials === undefined
      ? null
      : encryptCredentials(input.credentials);

  const [row] = await db
    .insert(schema.storeAccounts)
    .values({
      userId: input.userId,
      store: input.store,
      externalAccountId: input.externalAccountId,
      displayName: input.displayName ?? null,
      label: input.label ?? null,
      credentials,
      credentialsExpireAt: input.expiresAt ?? null,
      status: 'ok',
    })
    .onConflictDoUpdate({
      target: [
        schema.storeAccounts.userId,
        schema.storeAccounts.store,
        schema.storeAccounts.externalAccountId,
      ],
      set: {
        displayName: input.displayName ?? null,
        // L'etichetta è dell'utente, non del negozio: ricollegare non deve
        // cancellargliela. Si sovrascrive solo se ne ha scritta una nuova.
        label: input.label
          ? input.label
          : sql`${schema.storeAccounts.label}`,
        credentials,
        credentialsExpireAt: input.expiresAt ?? null,
        status: 'ok',
        lastSyncAt: null,
        updatedAt: new Date(),
      },
    })
    .returning(accountColumns);

  return row!;
}

/**
 * Cosa porta via lo scollegamento, **prima** di portarlo via.
 *
 * Esiste per il dialogo: cancellare i possessi di un account è irreversibile e
 * la sua portata non si vede da fuori — «84 giochi» non dice quanti spariscono
 * dal backlog, perché quelli che stanno anche su GOG restano. E fra quelli che
 * spariscono possono esserci giochi su cui l'utente ha messo un voto o dei tag,
 * che sono roba sua e non del negozio.
 */
export async function unlinkImpact(userId: string, accountId: string) {
  const account = await findStoreAccount(userId, accountId);
  if (!account) return null;

  const orfani = await orphanEntries(accountId);
  const conteggio = await db
    .select({ possessi: sql<number>`count(*)::int` })
    .from(schema.ownerships)
    .where(eq(schema.ownerships.storeAccountId, accountId));

  return {
    // Possessi che questo account ha portato.
    ownerships: conteggio[0]?.possessi ?? 0,
    // Di quelli, i giochi che uscirebbero dal backlog: quelli che stanno solo
    // qui. Gli altri hanno un altro possesso e restano.
    removedEntries: orfani.length,
    // E di questi, quelli su cui l'utente ha messo qualcosa di suo.
    withPersonalData: orfani.filter((row) => row.personale).length,
  };
}

/**
 * Le righe di backlog che resterebbero **senza nessun possesso** togliendo
 * quelli di questo account.
 *
 * `is distinct from` e non `<>`: gli altri possessi possono avere l'account
 * nullo (inseriti a mano, o importati prima che gli account fossero più d'uno),
 * e con `<>` un NULL non è né uguale né diverso — quelle righe sparirebbero dal
 * conteggio e verrebbero cancellate pur avendo ancora un possesso valido.
 */
function orphanEntries(accountId: string) {
  return db
    .select({
      id: schema.backlog.id,
      personale: sql<boolean>`(
        ${schema.backlog.rating} is not null
        or ${schema.backlog.notes} is not null
        or ${schema.backlog.status} <> 'backlog'
        or exists (
          select 1 from ${schema.backlogTags}
           where ${schema.backlogTags.backlogId} = ${schema.backlog.id}
        )
      )`,
    })
    .from(schema.backlog)
    .where(
      and(
        sql`exists (
          select 1 from ${schema.ownerships}
           where ${schema.ownerships.backlogId} = ${schema.backlog.id}
             and ${schema.ownerships.storeAccountId} = ${accountId}
        )`,
        sql`not exists (
          select 1 from ${schema.ownerships}
           where ${schema.ownerships.backlogId} = ${schema.backlog.id}
             and ${schema.ownerships.storeAccountId} is distinct from ${accountId}
        )`,
      ),
    );
}

/**
 * Scollega un account, in uno dei due modi che l'utente ha scelto.
 *
 * **`keep`** — i giochi restano suoi, come se li avesse inseriti a mano. La riga
 * dell'account **non si cancella**: diventa `unlinked` e perde le credenziali.
 * Sopravvive perché i possessi puntano a lei, ed è l'unica cosa che ancora
 * ricordi da quale dei due account Amazon veniva un gioco. Cancellarla e mettere
 * a nullo i possessi vorrebbe dire ricreare esattamente il buco che gli account
 * multipli sono venuti a chiudere.
 *
 * **`purge`** — i possessi di questo account se ne vanno, e con loro le righe di
 * backlog che restano senza nessun possesso: voto, note e tag compresi. È roba
 * dell'utente e la butta l'utente, che l'ha chiesto sapendo quanta ce n'era —
 * gliel'ha detto `unlinkImpact`. Qui la riga dell'account si cancella davvero:
 * non è rimasto niente che debba ricordarsene.
 *
 * In entrambi i casi gli scarti se ne vanno: senza l'account collegato sono voci
 * di una libreria che non sappiamo più leggere. Nel ramo `purge` li porta via il
 * `cascade`, nel ramo `keep` vanno tolti a mano.
 *
 * E in nessuno dei due casi si tocca `games`: la scheda del gioco, i suoi
 * metadata e la mappatura in `external_ids` restano nel catalogo condiviso. Il
 * prossimo utente che importa quel gioco non deve ripagarne l'enrichment perché
 * qualcun altro ha scollegato un account.
 */
export async function unlinkStoreAccount(
  userId: string,
  accountId: string,
  mode: 'keep' | 'purge',
) {
  const account = await findStoreAccount(userId, accountId);
  if (!account) return null;

  if (mode === 'keep') {
    return db.transaction(async (tx) => {
      await tx
        .delete(schema.unresolvedImports)
        .where(eq(schema.unresolvedImports.storeAccountId, accountId));

      const [row] = await tx
        .update(schema.storeAccounts)
        .set({
          status: 'unlinked',
          // Le credenziali se ne vanno subito: la riga sopravvive per dire da
          // dove veniva un gioco, non per tenere un token che nessuno rinnoverà
          // più.
          credentials: null,
          credentialsExpireAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.storeAccounts.id, accountId))
        .returning({ id: schema.storeAccounts.id });

      return row!;
    });
  }

  return db.transaction(async (tx) => {
    // Prima si guarda chi resterebbe orfano, perché subito dopo i possessi non
    // ci sono più e la domanda non si può più fare.
    const orfani = await orphanEntries(accountId);

    await tx
      .delete(schema.ownerships)
      .where(eq(schema.ownerships.storeAccountId, accountId));

    if (orfani.length > 0) {
      await tx.delete(schema.backlog).where(
        and(
          eq(schema.backlog.userId, userId),
          inArray(
            schema.backlog.id,
            orfani.map((row) => row.id),
          ),
        ),
      );
    }

    const [row] = await tx
      .delete(schema.storeAccounts)
      .where(eq(schema.storeAccounts.id, accountId))
      .returning({ id: schema.storeAccounts.id });

    return row!;
  });
}

// --- Steam: nessun credenziale, solo l'identità pubblica ---

/**
 * Collega Steam a partire da quello che l'utente ha incollato.
 *
 * Accetta l'URL del profilo, lo SteamID64 nudo o il solo nome scelto: sono le
 * tre forme che uno ha davvero sotto mano, perché lo SteamID su Steam non è in
 * vista da nessuna parte. È la stessa idea con cui il 9a accetta l'URL intero di
 * atterraggio degli altri negozi invece del codice estratto.
 */
export async function linkSteamAccount(
  userId: string,
  profile: string,
  label?: string | null,
) {
  const steamId = await resolveSteamId(profile);
  return upsertAccount({
    userId,
    store: 'steam',
    externalAccountId: steamId,
    // Il nome che si è dato: senza, `/account` mostrerebbe uno SteamID64 nudo.
    // Costa una richiesta con la nostra chiave e non fallisce mai in modo
    // rumoroso — al massimo rende null e si ripiega sull'id, come prima.
    displayName: await fetchSteamPersonaName(steamId),
    label,
  });
}

// --- GOG: refresh token cifrato ---

export class GogCodeError extends Error {
  constructor() {
    super(
      "Non trovo il codice: incolla l'indirizzo intero della pagina su cui sei atterrato",
    );
    this.name = 'GogCodeError';
  }
}

/**
 * Collega GOG dal codice di autorizzazione.
 *
 * `pasted` è quello che l'utente ha copiato dalla barra degli indirizzi dopo il
 * login — l'URL intero o il solo codice. Non può essere un redirect verso di
 * noi: GOG accetta solo i propri, e questo l'abbiamo verificato, non supposto
 * (vedi `external/gog.ts`).
 */
export async function linkGogAccount(
  userId: string,
  pasted: string,
  label?: string | null,
) {
  const code = parseGogAuthCode(pasted);
  if (!code) throw new GogCodeError();

  const credentials = await exchangeGogCode(code);

  return upsertAccount({
    userId,
    store: 'gog',
    externalAccountId: credentials.userId,
    // Lo scambio del token dà solo l'id, che a un umano non dice niente: il nome
    // sta su `userData.json` e costa una richiesta in più. L'id resta quello del
    // token — vedi l'avvertenza su `fetchGogUsername`.
    displayName: await fetchGogUsername(credentials.accessToken),
    credentials,
    expiresAt: new Date(credentials.expiresAt),
    label,
  });
}

// --- Epic: stesso modello di GOG ---

export class EpicCodeError extends Error {
  constructor() {
    super(
      'Non trovo il codice: incolla il JSON che vedi a schermo, o il solo valore di authorizationCode',
    );
    this.name = 'EpicCodeError';
  }
}

/**
 * Collega Epic dal codice di autorizzazione.
 *
 * Epic, al contrario di GOG, dà un nome leggibile insieme al token: è quello
 * che `/account` mostra, invece dell'id dell'account che non dice niente.
 */
export async function linkEpicAccount(
  userId: string,
  pasted: string,
  label?: string | null,
) {
  const code = parseEpicAuthCode(pasted);
  if (!code) throw new EpicCodeError();

  const credentials = await exchangeEpicCode(code);

  return upsertAccount({
    userId,
    store: 'epic',
    externalAccountId: credentials.accountId,
    displayName: credentials.displayName,
    credentials,
    expiresAt: new Date(credentials.expiresAt),
    label,
  });
}

// --- Amazon: registrazione di un dispositivo ---

export class AmazonCodeError extends Error {
  constructor() {
    super(
      "Non trovo il codice: incolla l'indirizzo intero della pagina Amazon su cui sei atterrato",
    );
    this.name = 'AmazonCodeError';
  }
}

/**
 * Collega Amazon.
 *
 * È il negozio per cui l'etichetta esiste: `customer_info` rende il **nome di
 * battesimo**, quindi due account della stessa persona arrivano con lo stesso
 * `displayName` e nessun dato dell'API li separa. Misurato su due account veri.
 */
export async function linkAmazonAccount(
  userId: string,
  pasted: string,
  label?: string | null,
) {
  const code = parseAmazonAuthCode(pasted);
  if (!code) throw new AmazonCodeError();

  const credentials = await registerAmazonDevice(userId, code);

  return upsertAccount({
    userId,
    store: 'amazon',
    externalAccountId: credentials.accountId,
    displayName: credentials.displayName,
    credentials,
    expiresAt: null,
    label,
  });
}

/**
 * Un access token Amazon valido, più il serial che serve agli entitlement.
 *
 * Non passa da `storeAccessToken` perché Amazon rinnova in modo suo: rende solo
 * l'access token, e refresh token e serial vanno riportati dentro dal
 * credenziale salvato. Fondere i due casi avrebbe voluto dire un ramo dentro la
 * funzione condivisa, che è il modo in cui le funzioni condivise smettono di
 * esserlo.
 */
export async function amazonAccess(account: StoreAccountRow) {
  if (!account.credentials) throw new Error('Nessun account amazon collegato');
  if (account.status !== 'ok') {
    throw new StoreReauthRequiredError('amazon');
  }

  let credentials: AmazonCredentials;
  try {
    credentials = decryptCredentials<AmazonCredentials>(account.credentials);
  } catch {
    return requireReauth(account);
  }

  if (credentials.expiresAt > Date.now()) {
    return { accessToken: credentials.accessToken, serial: credentials.serial };
  }

  let rinnovato;
  try {
    rinnovato = await refreshAmazonTokens(credentials.refreshToken);
  } catch (error) {
    if (error instanceof AmazonAuthError) return requireReauth(account);
    throw error;
  }

  const aggiornato: AmazonCredentials = {
    ...credentials,
    accessToken: rinnovato.accessToken,
    expiresAt: rinnovato.expiresAt,
  };

  await db
    .update(schema.storeAccounts)
    .set({
      credentials: encryptCredentials(aggiornato),
      credentialsExpireAt: new Date(aggiornato.expiresAt),
      updatedAt: new Date(),
    })
    .where(eq(schema.storeAccounts.id, account.id));

  return { accessToken: aggiornato.accessToken, serial: aggiornato.serial };
}

/**
 * Dove mandare l'utente a fare il login, per i negozi che ne hanno uno.
 *
 * Prende l'utente perché Amazon lo richiede: il suo `client_id` è derivato per
 * utente (vedi `external/amazon.ts`). Steam non c'è — lì si incolla il proprio
 * profilo, che è pubblico, e non c'è nessun login da fare.
 */
export function storeLoginUrl(userId: string, store: LinkableStore) {
  switch (store) {
    case 'gog':
      return gogLoginUrl();
    case 'epic':
      return epicLoginUrl();
    case 'amazon':
      return amazonLoginUrl(userId);
    default:
      return null;
  }
}

/**
 * Collega un negozio da quello che l'utente ha incollato.
 *
 * L'unico punto in cui un negozio diventa una funzione, come `enrichers` nel
 * worker: il router non sa quali negozi esistano, sa che ce n'è uno da
 * collegare. Aggiungere Epic sarà aggiungere una riga qui.
 */
export function linkStore(
  userId: string,
  store: LinkableStore,
  value: string,
  label?: string | null,
) {
  switch (store) {
    case 'steam':
      return linkSteamAccount(userId, value, label);
    case 'gog':
      return linkGogAccount(userId, value, label);
    case 'epic':
      return linkEpicAccount(userId, value, label);
    case 'amazon':
      return linkAmazonAccount(userId, value, label);
  }
}

/**
 * Rinomina un account.
 *
 * Serve **anche** per gli account già collegati: se l'etichetta si potesse
 * scrivere solo al collegamento, chi ha già due Amazon in tabella dovrebbe
 * scollegarne uno e rifarlo da capo per poterli distinguere — cioè rifare il
 * giro dal browser per un campo di testo.
 *
 * Stringa vuota o soli spazi la tolgono: cancellare l'etichetta è un gesto
 * legittimo, e non merita una mutazione sua.
 */
export async function renameStoreAccount(
  userId: string,
  accountId: string,
  label: string | null,
) {
  const pulita = label?.trim();

  const [row] = await db
    .update(schema.storeAccounts)
    .set({ label: pulita ? pulita : null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.storeAccounts.id, accountId),
        eq(schema.storeAccounts.userId, userId),
      ),
    )
    .returning(accountColumns);

  return row;
}

/**
 * Marca il collegamento come da rifare, e lo dice a chi ha chiamato.
 *
 * Esportata perché il credenziale può morire in due momenti diversi: al rinnovo,
 * qui sotto, ma anche **a metà import**, se il negozio revoca un token che un
 * istante prima era valido. Se quel secondo caso alzasse senza passare da qui,
 * l'utente vedrebbe un account «ok» che ha semplicemente smesso di aggiornarsi.
 */
export async function requireReauth(
  account: Pick<StoreAccountRow, 'id' | 'store'>,
): Promise<never> {
  await db
    .update(schema.storeAccounts)
    .set({ status: 'needs_reauth', updatedAt: new Date() })
    .where(eq(schema.storeAccounts.id, account.id));
  throw new StoreReauthRequiredError(account.store);
}

/**
 * Come si rinnova il credenziale, per i negozi che ne hanno uno.
 *
 * Estratta quando i negozi OAuth sono diventati due, non prima: con GOG da solo
 * sarebbe stata un'astrazione disegnata su un caso e mezzo. Ciò che varia è
 * esattamente questo — chi chiede il rinnovo, e come si riconosce un rifiuto
 * definitivo da una rete che cade.
 *
 * Steam non c'è: non ha credenziali che scadano.
 */
const OAUTH_STORES = {
  gog: { refresh: refreshGogTokens, AuthError: GogAuthError },
  epic: { refresh: refreshEpicTokens, AuthError: EpicAuthError },
} as const;

// Amazon **non è qui** e non è una dimenticanza: il suo rinnovo non ruota il
// refresh token e non rende un credenziale completo — rende un solo access
// token, e il resto (refresh token e serial del dispositivo) va riportato
// dentro da chi chiama. Ha il suo `amazonAccess` qui sotto.

type OAuthStore = keyof typeof OAUTH_STORES;

const isOAuthStore = (store: Store): store is OAuthStore =>
  store in OAUTH_STORES;

/** La forma minima che ogni credenziale OAuth condivide. */
type OAuthCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

/**
 * Un access token valido per un negozio, rinnovandolo se serve.
 *
 * È il pezzo che rende il copia-incolla **un gesto solo**: l'access token dura
 * poco — un'ora su GOG, otto ore su Epic — il refresh token no, e l'utente non
 * deve accorgersi di niente.
 *
 * Il token nuovo si riscrive **subito, prima di usarlo**: entrambi i negozi
 * rendono un refresh token diverso a ogni rinnovo e quello vecchio smette di
 * valere. Tenerlo in memoria e salvarlo a fine import vorrebbe dire che un
 * import fallito a metà lascia in tabella un credenziale già morto, e l'utente
 * dovrebbe ricollegare per colpa di una rete andata giù.
 */
export async function storeAccessToken(
  account: StoreAccountRow,
): Promise<string> {
  const store = account.store;
  if (!isOAuthStore(store)) {
    throw new Error(`Il negozio ${store} non ha un credenziale da rinnovare`);
  }
  if (!account.credentials) {
    throw new Error(`Nessun account ${store} collegato`);
  }
  if (account.status !== 'ok') {
    throw new StoreReauthRequiredError(store);
  }

  let credentials: OAuthCredentials;
  try {
    credentials = decryptCredentials<OAuthCredentials>(account.credentials);
  } catch {
    // Chiave ruotata, o byte corrotti: il credenziale non è recuperabile e
    // l'unica uscita onesta è chiedere di ricollegare.
    return requireReauth(account);
  }

  if (credentials.expiresAt > Date.now()) return credentials.accessToken;

  const { refresh, AuthError } = OAUTH_STORES[store];

  let rinnovato: OAuthCredentials;
  try {
    rinnovato = await refresh(credentials.refreshToken);
  } catch (error) {
    // Solo un rifiuto del negozio è definitivo. Una rete che cade o un 500 sono
    // temporanei, e lì il job deve riprovare invece di mandare l'utente a
    // ricollegare un account che sta benissimo.
    if (error instanceof AuthError) return requireReauth(account);
    throw error;
  }

  await db
    .update(schema.storeAccounts)
    .set({
      credentials: encryptCredentials(rinnovato),
      credentialsExpireAt: new Date(rinnovato.expiresAt),
      updatedAt: new Date(),
    })
    .where(eq(schema.storeAccounts.id, account.id));

  return rinnovato.accessToken;
}
