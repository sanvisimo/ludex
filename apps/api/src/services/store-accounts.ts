import type { LinkableStore, Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';

import {
  exchangeGogCode,
  type GogCredentials,
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
 * Un access token GOG valido, rinnovandolo se serve.
 *
 * È il pezzo che rende il copia-incolla **un gesto solo**: l'access token dura
 * un'ora, il refresh token no, e l'utente non deve accorgersi di niente.
 *
 * Il token nuovo si riscrive subito, prima di usarlo: GOG rende un refresh token
 * diverso a ogni rinnovo e quello vecchio smette di valere. Tenerlo in memoria e
 * salvarlo a fine import vorrebbe dire che un import fallito a metà lascia in
 * tabella un credenziale già morto.
 */
export async function gogAccessToken(userId: string): Promise<string> {
  const account = await findStoreAccount(userId, 'gog');
  if (!account?.credentials) {
    throw new Error('Nessun account GOG collegato');
  }
  if (account.status === 'needs_reauth') {
    throw new StoreReauthRequiredError('gog');
  }

  let credentials: GogCredentials;
  try {
    credentials = decryptCredentials<GogCredentials>(account.credentials);
  } catch {
    // Chiave ruotata, o byte corrotti: il credenziale non è recuperabile e
    // l'unica uscita onesta è chiedere di ricollegare.
    return requireReauth(userId, 'gog');
  }

  if (credentials.expiresAt > Date.now()) return credentials.accessToken;

  let rinnovato: GogCredentials;
  try {
    rinnovato = await refreshGogTokens(credentials.refreshToken);
  } catch (error) {
    // Solo un rifiuto di GOG è definitivo. Una rete che cade o un 500 sono
    // temporanei, e lì il job deve riprovare invece di mandare l'utente a
    // ricollegare un account che sta benissimo.
    if (error instanceof GogAuthError) return requireReauth(userId, 'gog');
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
        eq(schema.storeAccounts.store, 'gog'),
      ),
    );

  return rinnovato.accessToken;
}
