import { createHash, createHmac } from 'node:crypto';

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
 * Le credenziali PKCE di questo utente, **derivate invece che conservate**.
 *
 * Il flusso di Amazon vuole che `code_verifier` e `client_id` siano decisi
 * prima di mandare l'utente al login e ritrovati dopo, quando torna col codice.
 * Fra i due momenti passa un giro dal browser, quindi qualcosa va tenuto da
 * qualche parte: di solito una riga in Redis con una scadenza.
 *
 * Qui si derivano da `STORE_TOKEN_KEY` e dall'id dell'utente. Niente stato,
 * niente scadenza da azzeccare, niente flusso che muore perché l'utente ci ha
 * messo venti minuti a fare il login. Il verifier resta segreto perché lo è la
 * chiave, e non lascia mai il server: nel giro del browser passa solo il codice
 * di autorizzazione, che è monouso e dura pochi minuti.
 *
 * Un effetto di lato che è desiderabile: il `serial` è sempre lo stesso, quindi
 * ricollegare **riscrive lo stesso dispositivo** sull'account Amazon invece di
 * accumularne uno per tentativo.
 */
function pkceFor(userId: string) {
  const verifier = b64url(
    createHmac('sha256', storeTokenKey()).update(`amazon:v:${userId}`).digest(),
  );
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const serial = createHmac('sha256', storeTokenKey())
    .update(`amazon:s:${userId}`)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();
  const clientId = Buffer.from(`${serial}#${DEVICE_TYPE}`, 'ascii').toString(
    'hex',
  );
  return { verifier, challenge, serial, clientId };
}

/**
 * Dove mandare l'utente a fare il login.
 *
 * `openid.return_to` è di Amazon e non nostro, come per GOG ed Epic: con un
 * indirizzo nostro Amazon risponde 404 invece di mostrare il login, e anche
 * questo è verificato. L'utente atterra sulla home di amazon.com con il codice
 * nella barra degli indirizzi.
 */
export function amazonLoginUrl(userId: string) {
  const { challenge, clientId } = pkceFor(userId);

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
  code: string,
): Promise<AmazonCredentials> {
  const { verifier, serial, clientId } = pkceFor(userId);

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

  if (!response.ok || !body?.access_token) {
    throw new AmazonAuthError(
      `Amazon ha rifiutato il refresh token (${response.status})`,
    );
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
