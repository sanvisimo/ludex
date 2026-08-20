import type { LinkableStore, Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';

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
  gogLoginUrl,
  GogAuthError,
  parseGogAuthCode,
  refreshGogTokens,
} from '../external/gog';
import { resolveSteamId } from '../external/steam';
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
 * Gli account collegati dall'utente.
 *
 * `syncing` non viene dal DB ma dalla coda: durante il primo import `lastSyncAt`
 * è ancora nullo, e senza questo la pagina non avrebbe niente da mostrare per
 * mezzo minuto.
 */
export async function listStoreAccounts(userId: string) {
  const rows = await db
    .select({
      store: schema.storeAccounts.store,
      externalAccountId: schema.storeAccounts.externalAccountId,
      displayName: schema.storeAccounts.displayName,
      status: schema.storeAccounts.status,
      lastSyncAt: schema.storeAccounts.lastSyncAt,
    })
    .from(schema.storeAccounts)
    .where(eq(schema.storeAccounts.userId, userId));

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      syncing: await isImportRunning(row.store, userId),
    })),
  );
}

export function findStoreAccount(userId: string, store: Store) {
  return db.query.storeAccounts.findFirst({
    where: and(
      eq(schema.storeAccounts.userId, userId),
      eq(schema.storeAccounts.store, store),
    ),
  });
}

/**
 * Scrive il collegamento.
 *
 * Ricollegare **sovrascrive**: un utente che si accorge di aver messo il profilo
 * sbagliato deve poter correggere senza scollegare prima. `lastSyncAt` torna
 * nullo, perché la libreria di prima non è quella di adesso, e `status` torna
 * `ok`, perché è esattamente il gesto che rimette in sesto un `needs_reauth`.
 */
async function upsertAccount(input: {
  userId: string;
  store: Store;
  externalAccountId: string;
  displayName?: string | null;
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
      credentials,
      credentialsExpireAt: input.expiresAt ?? null,
      status: 'ok',
    })
    .onConflictDoUpdate({
      target: [schema.storeAccounts.userId, schema.storeAccounts.store],
      set: {
        externalAccountId: input.externalAccountId,
        displayName: input.displayName ?? null,
        credentials,
        credentialsExpireAt: input.expiresAt ?? null,
        status: 'ok',
        lastSyncAt: null,
        updatedAt: new Date(),
      },
    })
    .returning({
      store: schema.storeAccounts.store,
      externalAccountId: schema.storeAccounts.externalAccountId,
      displayName: schema.storeAccounts.displayName,
      status: schema.storeAccounts.status,
      lastSyncAt: schema.storeAccounts.lastSyncAt,
    });

  return row!;
}

/**
 * Scollega un negozio.
 *
 * Non tocca il backlog: i giochi importati restano dell'utente, come se li avesse
 * inseriti a mano. Toglie invece gli irrisolti di quel negozio, che senza
 * l'account collegato non vogliono più dire niente.
 */
export async function unlinkStoreAccount(userId: string, store: Store) {
  await db
    .delete(schema.unresolvedImports)
    .where(
      and(
        eq(schema.unresolvedImports.userId, userId),
        eq(schema.unresolvedImports.store, store),
      ),
    );

  const [row] = await db
    .delete(schema.storeAccounts)
    .where(
      and(
        eq(schema.storeAccounts.userId, userId),
        eq(schema.storeAccounts.store, store),
      ),
    )
    .returning({ id: schema.storeAccounts.id });

  return row;
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
export async function linkSteamAccount(userId: string, profile: string) {
  const steamId = await resolveSteamId(profile);
  return upsertAccount({
    userId,
    store: 'steam',
    externalAccountId: steamId,
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
export async function linkGogAccount(userId: string, pasted: string) {
  const code = parseGogAuthCode(pasted);
  if (!code) throw new GogCodeError();

  const credentials = await exchangeGogCode(code);

  return upsertAccount({
    userId,
    store: 'gog',
    externalAccountId: credentials.userId,
    // GOG non dà un nome leggibile insieme al token: resta l'id, e la UI mostra
    // quello. Amazon ed Epic invece lo daranno.
    displayName: null,
    credentials,
    expiresAt: new Date(credentials.expiresAt),
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
export async function linkEpicAccount(userId: string, pasted: string) {
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

export async function linkAmazonAccount(userId: string, pasted: string) {
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
export async function amazonAccess(userId: string) {
  const account = await findStoreAccount(userId, 'amazon');
  if (!account?.credentials) throw new Error('Nessun account amazon collegato');
  if (account.status === 'needs_reauth') {
    throw new StoreReauthRequiredError('amazon');
  }

  let credentials: AmazonCredentials;
  try {
    credentials = decryptCredentials<AmazonCredentials>(account.credentials);
  } catch {
    return requireReauth(userId, 'amazon');
  }

  if (credentials.expiresAt > Date.now()) {
    return { accessToken: credentials.accessToken, serial: credentials.serial };
  }

  let rinnovato;
  try {
    rinnovato = await refreshAmazonTokens(credentials.refreshToken);
  } catch (error) {
    if (error instanceof AmazonAuthError) return requireReauth(userId, 'amazon');
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
    .where(
      and(
        eq(schema.storeAccounts.userId, userId),
        eq(schema.storeAccounts.store, 'amazon'),
      ),
    );

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
export function linkStore(userId: string, store: LinkableStore, value: string) {
  switch (store) {
    case 'steam':
      return linkSteamAccount(userId, value);
    case 'gog':
      return linkGogAccount(userId, value);
    case 'epic':
      return linkEpicAccount(userId, value);
    case 'amazon':
      return linkAmazonAccount(userId, value);
  }
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
  userId: string,
  store: Store,
): Promise<never> {
  await db
    .update(schema.storeAccounts)
    .set({ status: 'needs_reauth', updatedAt: new Date() })
    .where(
      and(
        eq(schema.storeAccounts.userId, userId),
        eq(schema.storeAccounts.store, store),
      ),
    );
  throw new StoreReauthRequiredError(store);
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
  userId: string,
  store: OAuthStore,
): Promise<string> {
  const account = await findStoreAccount(userId, store);
  if (!account?.credentials) {
    throw new Error(`Nessun account ${store} collegato`);
  }
  if (account.status === 'needs_reauth') {
    throw new StoreReauthRequiredError(store);
  }

  let credentials: OAuthCredentials;
  try {
    credentials = decryptCredentials<OAuthCredentials>(account.credentials);
  } catch {
    // Chiave ruotata, o byte corrotti: il credenziale non è recuperabile e
    // l'unica uscita onesta è chiedere di ricollegare.
    return requireReauth(userId, store);
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
    if (error instanceof AuthError) return requireReauth(userId, store);
    throw error;
  }

  await db
    .update(schema.storeAccounts)
    .set({
      credentials: encryptCredentials(rinnovato),
      credentialsExpireAt: new Date(rinnovato.expiresAt),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.storeAccounts.userId, userId),
        eq(schema.storeAccounts.store, store),
      ),
    );

  return rinnovato.accessToken;
}

export const gogAccessToken = (userId: string) =>
  storeAccessToken(userId, 'gog');
export const epicAccessToken = (userId: string) =>
  storeAccessToken(userId, 'epic');
