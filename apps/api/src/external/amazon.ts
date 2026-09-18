import { createHash, createHmac, randomBytes } from 'node:crypto';

import { storeTokenKey } from '../lib/crypto';

// Client Amazon Games. Come gli altri sta fuori da `services/`.
//
// Terzo negozio col credenziale dell'utente, e il terzo con un modo tutto suo
// di consegnarlo. Due cose lo distinguono da GOG ed Epic:
//
// - **si registra un dispositivo**, non si autorizza un'applicazione. Il
//   collegamento fa comparire un «AGSLauncher for Windows» fra i dispositivi
//   dell'account Amazon, che l'utente può togliere da lì.
// - **vive solo sul mercato americano**. L'`assoc_handle` del launcher non è
//   registrato altrove: su `amazon.it` la stessa richiesta è un 404, verificato.
//   Un conto italiano si autentica benissimo lì dentro, quindi il mercato si
//   inchioda e non si parametrizza — è quello che fa anche nile.
//
// E come per gli altri, IGDB non aiuta: la sua sorgente «Amazon ADG» ha 678
// righe in tutto e su una libreria vera non ne aggancia nemmeno una. Si va di
// nome, come su Epic.

const AMAZON_API = 'https://api.amazon.com';
const ENTITLEMENTS_URL =
  'https://gaming.amazon.com/api/distribution/entitlements';

// Il tipo di dispositivo del launcher Amazon Games, e il mercato USA.
const DEVICE_TYPE = 'A2UMVHOX7UP4V7';
const MARKETPLACE_US = 'ATVPDKIKX0DER';
const APP_NAME = 'AGSLauncher for Windows';

const b64url = (value: Buffer) => value.toString('base64url');

/**
 * Il serial di un dispositivo nuovo.
 *
 * **Uno per account Amazon, non uno per utente.** Fino a qui era derivato
 * dall'utente, quindi il secondo account Amazon della stessa persona
 * registrava lo *stesso* dispositivo — e Amazon, che tiene un dispositivo su un
 * account solo, lo toglieva al primo. Il risultato visto da fuori era un
 * ping-pong: dei due account ne restava vivo uno, quello collegato per ultimo.
 * Visto su due account veri.
 *
 * Casuale e non derivato perché al momento del login non sappiamo ancora con
 * quale account l'utente entrerà: non c'è niente da cui derivarlo. Chi ricollega
 * un account che ha già un serial lo riusa (vedi `storeLoginUrl`), così il
 * dispositivo non si moltiplica a ogni ricollegamento.
 */
export function newAmazonSerial() {
  return randomBytes(16).toString('hex').toUpperCase();
}

/** Ha la forma di un serial nostro? È un valore che torna dal client. */
export function isAmazonSerial(value: string) {
  return /^[0-9A-F]{32}$/.test(value);
}

/**
 * Le credenziali PKCE di un collegamento, **derivate invece che conservate**.
 *
 * Il flusso di Amazon vuole che `code_verifier` e `client_id` siano decisi
 * prima di mandare l'utente al login e ritrovati dopo, quando torna col codice.
 * Fra i due momenti passa un giro dal browser, quindi qualcosa va tenuto da
 * qualche parte: di solito una riga in Redis con una scadenza.
 *
 * Qui il server non tiene niente. Il serial fa il giro dal client — lo rende
 * `loginUrl`, torna con `link` — e il verifier si deriva da `STORE_TOKEN_KEY`,
 * dall'utente e dal serial. Niente stato, niente scadenza da azzeccare, niente
 * flusso che muore perché l'utente ci ha messo venti minuti a fare il login.
 *
 * Che il serial passi dal client non è un problema: non è un segreto, è il
 * numero del dispositivo. Il segreto è il verifier, che resta tale perché lo è
 * la chiave, e non lascia mai il server.
 */
function pkceFor(userId: string, serial: string) {
  const verifier = b64url(
    createHmac('sha256', storeTokenKey())
      .update(`amazon:v:${userId}:${serial}`)
      .digest(),
  );
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const clientId = Buffer.from(`${serial}#${DEVICE_TYPE}`, 'ascii').toString(
    'hex',
  );
  return { verifier, challenge, clientId };
}

/**
 * Dove mandare l'utente a fare il login.
 *
 * `openid.return_to` è di Amazon e non nostro, come per GOG ed Epic: con un
 * indirizzo nostro Amazon risponde 404 invece di mostrare il login, e anche
 * questo è verificato. L'utente atterra sulla home di amazon.com con il codice
 * nella barra degli indirizzi.
 */
export function amazonLoginUrl(userId: string, serial: string) {
  const { challenge, clientId } = pkceFor(userId, serial);

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.mode': 'checkid_setup',
    'openid.oa2.scope': 'device_auth_access',
    'openid.ns.oa2': 'http://www.amazon.com/ap/ext/oauth/2',
    'openid.oa2.response_type': 'code',
    'openid.oa2.code_challenge_method': 'S256',
    'openid.oa2.client_id': `device:${clientId}`,
    language: 'en_US',
    marketPlaceId: MARKETPLACE_US,
    'openid.return_to': 'https://www.amazon.com',
    'openid.pape.max_auth_age': '0',
    'openid.assoc_handle': 'amzn_sonic_games_launcher',
    pageId: 'amzn_sonic_games_launcher',
    'openid.oa2.code_challenge': challenge,
  });

  return `https://www.amazon.com/ap/signin?${params}`;
}

/** Il credenziale è morto: solo un nuovo login lo rimette a posto. */
export class AmazonAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmazonAuthError';
  }
}

export type AmazonCredentials = {
  accessToken: string;
  /**
   * Non cambia mai dopo la registrazione: il rinnovo rende solo un access
   * token nuovo, al contrario di GOG ed Epic che ruotano anche questo.
   */
  refreshToken: string;
  /** Epoch in millisecondi. */
  expiresAt: number;
  /** Il serial del dispositivo, che serve a ogni chiamata agli entitlement. */
  serial: string;
  accountId: string;
  displayName: string | null;
};

/**
 * Da quello che l'utente incolla al codice di autorizzazione.
 *
 * Accetta l'URL di atterraggio intero — che è quello che uno ha sotto mano — o
 * il solo codice. Stessa idea di GOG ed Epic.
 */
export function parseAmazonAuthCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).searchParams.get('openid.oa2.authorization_code');
    } catch {
      return null;
    }
  }

  return /^[A-Za-z0-9._-]{10,}$/.test(trimmed) ? trimmed : null;
}

/**
 * Registra il dispositivo: è l'unica scrittura che facciamo sull'account
 * Amazon, e da lì in poi si legge soltanto.
 */
export async function registerAmazonDevice(
  userId: string,
  serial: string,
  code: string,
): Promise<AmazonCredentials> {
  const { verifier, clientId } = pkceFor(userId, serial);

  const response = await fetch(`${AMAZON_API}/auth/register`, {
    method: 'POST',
    headers: {
      'User-Agent': 'AGSLauncher/1.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_data: {
        authorization_code: code,
        client_domain: 'DeviceLegacy',
        client_id: clientId,
        code_algorithm: 'SHA-256',
        code_verifier: verifier,
        use_global_authentication: false,
      },
      registration_data: {
        app_name: APP_NAME,
        app_version: '1.0.0',
        device_model: 'Windows',
        device_name: null,
        device_serial: serial,
        device_type: DEVICE_TYPE,
        domain: 'Device',
        os_version: '10.0.19044.0',
      },
      requested_extensions: ['customer_info', 'device_info'],
      requested_token_type: ['bearer', 'mac_dms'],
      user_context_map: {},
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    response?: {
      success?: {
        tokens?: { bearer?: { access_token?: string; refresh_token?: string } };
        extensions?: {
          customer_info?: { given_name?: string; user_id?: string };
        };
      };
    };
  } | null;

  const success = body?.response?.success;
  const bearer = success?.tokens?.bearer;
  if (!response.ok || !bearer?.access_token || !bearer.refresh_token) {
    // Amazon non distingue un codice scaduto da uno mai esistito, e in nessuno
    // dei due casi riprovare serve: è sempre un login da rifare.
    throw new AmazonAuthError(
      `Amazon ha rifiutato il codice (${response.status})`,
    );
  }

  return {
    accessToken: bearer.access_token,
    refreshToken: bearer.refresh_token,
    // Amazon non dichiara la durata alla registrazione: si tratta come già
    // scaduto, così il primo import passa dal rinnovo e la scopre.
    expiresAt: 0,
    serial,
    accountId: success?.extensions?.customer_info?.user_id ?? '',
    displayName: success?.extensions?.customer_info?.given_name ?? null,
  };
}

/**
 * Uno stato HTTP che vuol dire «questo credenziale non vale più».
 *
 * Fino a qui ogni risposta non-ok del rinnovo era un rifiuto, e un 503 di
 * Amazon mandava in `needs_reauth` un account sano: l'utente doveva rifare il
 * login per colpa di un loro guasto. GOG distingue guardando `invalid_grant`;
 * qui non si fa, perché la risposta di Amazon a un dispositivo tolto
 * dall'account non è misurata, e sbagliarla vorrebbe dire il caso peggiore —
 * un account che resta «ok» e smette di aggiornarsi senza dirlo. Quindi la
 * regola è sullo stato: sono **temporanei** i 5xx, il 429 e il 408, e ogni altro
 * 4xx è un rifiuto.
 */
export function isAmazonRejection(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Rinnovo.
 *
 * Al contrario di GOG ed Epic, Amazon **non ruota il refresh token**: rende solo
 * un access token nuovo. Chi chiama deve quindi riportarsi dietro il refresh
 * token e il serial, che di suo la risposta non contiene.
 */
export async function refreshAmazonTokens(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch(`${AMAZON_API}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_token: refreshToken,
      source_token_type: 'refresh_token',
      requested_token_type: 'access_token',
      app_name: APP_NAME,
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;

  if (!response.ok) {
    if (isAmazonRejection(response.status)) {
      throw new AmazonAuthError(
        `Amazon ha rifiutato il refresh token (${response.status})`,
      );
    }
    throw new Error(`Amazon token: ${response.status}`);
  }
  // Un 200 senza token non è un rifiuto: è una risposta rotta, e riprovare è
  // l'unica cosa sensata da fare.
  if (!body?.access_token) {
    throw new Error('Amazon token: risposta senza access token');
  }

  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
  };
}

export type AmazonLibraryEntry = {
  /** L'id del prodotto: `amzn1.adg.product.<uuid>`. */
  externalId: string;
  name: string;
};

type EntitlementsResponse = {
  entitlements?: {
    product?: { id?: string; title?: string; productLine?: string };
  }[];
  nextToken?: string | null;
};

/**
 * Toglie dal titolo la decorazione dell'edizione.
 *
 * Amazon marca le Collector's Edition con un `- CE` in coda, e IGDB quei giochi
 * li tiene col titolo nudo. Su una libreria vera è **nove voci su tredici** fra
 * quelle che il matcher non aggancia — quasi tutti casual della scuderia Big
 * Fish, che su Amazon Games sono tanti.
 */
function stripEdition(title: string) {
  return title.replace(/\s*[-–]\s*CE\s*$/i, '').trim();
}

/**
 * La libreria dell'utente.
 *
 * Paginata con `nextToken`. Si scartano le voci `Twitch:FuelEntitlement`, che
 * sono i vantaggi di Prime Gaming e non giochi da possedere.
 */
export async function fetchAmazonLibrary(
  accessToken: string,
  serial: string,
): Promise<AmazonLibraryEntry[]> {
  const entries: AmazonLibraryEntry[] = [];
  let nextToken: string | null = null;

  do {
    const response: Response = await fetch(ENTITLEMENTS_URL, {
      method: 'POST',
      headers: {
        'User-Agent': 'com.amazon.agslauncher.win/3.0.9495.3',
        'X-Amz-Target':
          'com.amazon.animusdistributionservice.entitlement.AnimusEntitlementsService.GetEntitlements',
        'x-amzn-token': accessToken,
        'Content-Type': 'application/json',
        'Content-Encoding': 'amz-1.0',
      },
      body: JSON.stringify({
        // Senza `Operation` e `clientId` l'API risponde 400: la forma è quella
        // di nile, non quella (più vecchia) del plugin Playnite.
        Operation: 'GetEntitlements',
        clientId: 'Sonic',
        syncPoint: null,
        nextToken,
        maxResults: 50,
        productIdFilter: null,
        keyId: 'd5dc8b8b-86c8-4fc4-ae93-18c0def5314d',
        // Deterministico dal serial, non casuale.
        hardwareHash: createHash('sha256')
          .update(serial)
          .digest('hex')
          .toUpperCase(),
      }),
    });

    if (response.status === 401 || response.status === 403) {
      throw new AmazonAuthError('Amazon ha rifiutato il token di accesso');
    }
    if (!response.ok) {
      throw new Error(`Amazon entitlements: ${response.status}`);
    }

    const body = (await response.json()) as EntitlementsResponse;

    for (const row of body.entitlements ?? []) {
      const product = row.product;
      if (!product?.id || !product.title) continue;
      if (product.productLine === 'Twitch:FuelEntitlement') continue;

      entries.push({
        externalId: product.id,
        name: stripEdition(product.title),
      });
    }

    nextToken = body.nextToken ?? null;
  } while (nextToken);

  return entries;
}
