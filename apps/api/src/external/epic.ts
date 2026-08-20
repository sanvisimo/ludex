import { chunk } from '../lib/chunk';

// Client Epic Games Store. Come gli altri sta fuori da `services/`.
//
// Stesso modello di GOG per la credenziale — un refresh token dell'utente,
// cifrato in `store_accounts` — ma **l'identità dei giochi funziona in modo
// opposto**, e vale la pena scriverlo perché sembra il contrario:
//
// IGDB ha una sorgente Epic con diecimila righe, e gli uid hanno la stessa
// forma degli id che il launcher restituisce. Sono cose diverse. Su una
// libreria vera di 705 giochi:
//
//     catalogItemId → IGDB     0 / 788
//     namespace     → IGDB     0 / 705
//     productId     → IGDB     0 / 705
//
// Gli uid di IGDB sono gli **offer id del negozio** (`store.epicgames.com`),
// in due formati — `6470fe7e-87ec-4443-…` e `f301fd4611f240da…` — e le API del
// launcher non li espongono affatto. Civilization VI su Epic è
// `42ac1ee840304cb1807172a9b47dc8e3`; su IGDB è `f301fd4611f240da87cdc7baf1b67f44`.
//
// Quindi **Epic si risolve per nome**, come Amazon. Non aggiungere `epic` alle
// sorgenti IGDB: costerebbe una richiesta per non trovare mai niente.
//
// `client_id` e `client_secret` sono quelli del launcher, come per GOG. Non sono
// un segreto: stanno nel codice di legendary, che è ciò con cui Heroic parla a
// Epic, e non esiste un programma per sviluppatori terzi da cui averne di propri.

const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';

const OAUTH_URL =
  'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token';
const LIBRARY_URL =
  'https://library-service.live.use1a.on.epicgames.com/library/api/public/items';
const CATALOG_HOST = 'https://catalog-public-service-prod06.ol.epicgames.com';

// Il launcher si identifica così, e alcuni di questi endpoint rispondono male a
// uno User-Agent qualunque.
const USER_AGENT =
  'UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit';

/**
 * Dove mandare l'utente a fare il login.
 *
 * Composto da noi e non preso da `legendary.gl/epiclogin`, che è il servizio di
 * redirect di legendary: quello punta esattamente a questo indirizzo, e
 * dipendere dal dominio di un altro progetto per far entrare i nostri utenti
 * sarebbe fragile per niente.
 *
 * Al termine Epic mostra una **pagina JSON** con dentro `authorizationCode`.
 * Non è un redirect verso di noi e non può esserlo: come GOG e Amazon, la lista
 * dei redirect è legata al `client_id` del launcher.
 */
export function epicLoginUrl() {
  const redirect = new URL('https://www.epicgames.com/id/api/redirect');
  redirect.searchParams.set('clientId', CLIENT_ID);
  redirect.searchParams.set('responseType', 'code');

  const url = new URL('https://www.epicgames.com/id/login');
  url.searchParams.set('redirectUrl', redirect.toString());
  return url.toString();
}

/** Il credenziale è morto: solo un nuovo login lo rimette a posto. */
export class EpicAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpicAuthError';
  }
}

export type EpicCredentials = {
  accessToken: string;
  refreshToken: string;
  /** Epoch in millisecondi. L'access token dura circa 36 ore. */
  expiresAt: number;
  accountId: string;
  displayName: string | null;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  account_id?: string;
  displayName?: string;
  errorCode?: string;
  errorMessage?: string;
};

async function requestToken(
  params: Record<string, string>,
): Promise<EpicCredentials> {
  const response = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      // Basic con le credenziali del launcher: Epic non le accetta come campi
      // del corpo.
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    // `token_type=eg1` chiede il token del launcher; senza, Epic ne rende uno
    // che la libreria non la vede.
    body: new URLSearchParams({ ...params, token_type: 'eg1' }),
  });

  const body = (await response.json().catch(() => null)) as TokenResponse | null;

  // Epic segnala gli errori nel corpo con `errorCode`, e non sempre con uno
  // stato HTTP di errore: guardare solo `response.ok` lascerebbe passare un
  // rifiuto come se fosse un token. Verificato con un codice scaduto, che
  // risponde «authorization code not found» e non un 4xx.
  if (body?.errorCode) {
    throw new EpicAuthError(body.errorMessage ?? body.errorCode);
  }
  if (!response.ok) {
    throw new Error(`Epic oauth/token: ${response.status}`);
  }
  if (!body?.access_token || !body.refresh_token) {
    throw new Error('Epic oauth/token: risposta senza token');
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    // Un minuto di margine, come per gli altri: non si parte con un token che
    // scade a metà import.
    expiresAt: Date.now() + ((body.expires_in ?? 28_800) - 60) * 1000,
    accountId: body.account_id ?? '',
    displayName: body.displayName ?? null,
  };
}

/**
 * Da quello che l'utente incolla al codice di autorizzazione.
 *
 * Tre forme, e non è generosità: sono le tre cose che uno ha davvero sotto mano
 * davanti a quella pagina. Il JSON intero copiato di peso è la più probabile,
 * perché è letteralmente tutto ciò che si vede a schermo.
 */
export function parseEpicAuthCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { authorizationCode?: unknown };
      return typeof parsed.authorizationCode === 'string'
        ? parsed.authorizationCode
        : null;
    } catch {
      return null;
    }
  }

  // I codici Epic sono 32 caratteri esadecimali.
  const nudo = trimmed.replace(/^"|"$/g, '');
  return /^[0-9a-f]{32}$/i.test(nudo) ? nudo : null;
}

export function exchangeEpicCode(code: string) {
  return requestToken({ grant_type: 'authorization_code', code });
}

export function refreshEpicTokens(refreshToken: string) {
  return requestToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export type EpicLibraryEntry = {
  /**
   * Il `productId`, cioè il **prodotto** del negozio.
   *
   * Non il `catalogItemId`, che è la singola voce installabile: un gioco e i
   * suoi DLC hanno `catalogItemId` diversi e lo stesso `productId`, ed è quello
   * che li fa collassare in una riga sola. Su una libreria vera 836 voci
   * diventano 705 giochi.
   *
   * Nessuno dei due è l'uid di IGDB (vedi in cima), ma questo resta l'identità
   * giusta da scrivere in `external_ids`: al reimport è il nostro database a
   * riconoscerlo, e la ricerca per nome non si rispende.
   */
  externalId: string;
  name: string;
};

type LibraryRecord = {
  namespace?: string;
  catalogItemId?: string;
  appName?: string;
  productId?: string;
  sandboxName?: string;
  sandboxType?: string;
};

type LibraryResponse = {
  records?: LibraryRecord[];
  responseMetadata?: { nextCursor?: string };
};

type CatalogResponse = Record<
  string,
  { title?: string; categories?: { path?: string }[] }
>;

/**
 * La libreria dell'utente, paginata a cursore.
 *
 * Quattro filtri. I primi tre vengono da legendary, il quarto da una libreria
 * vera — e i primi tre non bastavano:
 *
 * - **namespace `ue`**: sono gli asset dello Unreal Engine Marketplace. Su un
 *   account che ha mai toccato Unreal sono migliaia di voci che giochi non
 *   sono, e finirebbero tutte negli scarti da sistemare a mano.
 * - **`sandboxType` PRIVATE**: build interne e roba non pubblica.
 * - **senza `appName`**: voci incomplete che non si possono né riconoscere né
 *   lanciare.
 * Poi la deduplica per `productId`, che toglie di mezzo i DLC: «Kinglet» e
 * «KingletAztec» sono due voci, ma sono Civilization VI e un suo pacchetto, e
 * condividono prodotto.
 *
 * Infine **il catalogo, per tutte le voci**, che dà due cose:
 *
 * - **il titolo**. `sandboxName` sembra il titolo e non lo è: è il nome
 *   dell'ambiente, e coincide col titolo solo per caso. Su una libreria vera
 *   286 voci si chiamano `Live`, 38 «*qualcosa* Production», 24 «UE
 *   Marketplace» — e dietro ci sono *Insurmountable*, *Fallout 3 GOTY*,
 *   *Dishonored: Death of the Outsider*. Indovinare quali etichette siano
 *   generiche è una rincorsa che si perde: ogni forma riconosciuta ne scopre
 *   un'altra, e ogni buco o storpia il nome di un gioco o lo fa sparire.
 * - **la categoria**, che è l'unico modo onesto di dire cosa sia una voce. Si
 *   tiene ciò che il catalogo dichiara `games` e si buttano gli `addons`, gli
 *   asset dello Unreal Marketplace e il resto.
 *
 * Costa una richiesta per prodotto — su 705 giochi circa ottanta secondi — ed è
 * quello che fa legendary. È il prezzo per avere i titoli giusti, e senza si
 * perde un terzo della libreria.
 *
 * Poi la deduplica per `productId`, che è ciò che toglie di mezzo i DLC senza
 * dover interrogare il catalogo: nella libreria «Kinglet» e «KingletAztec» sono
 * due voci, ma sono Civilization VI e un suo pacchetto, e condividono prodotto
 * e titolo.
 *
 * Il titolo viene da **`sandboxName`**, che il record porta già. `appName` no:
 * è un nome in codice interno — Civilization VI si chiama «Kinglet».
 */
export async function fetchEpicLibrary(
  accessToken: string,
): Promise<EpicLibraryEntry[]> {
  const perProdotto = new Map<string, LibraryRecord>();
  let cursor: string | undefined;

  do {
    const url = new URL(LIBRARY_URL);
    url.searchParams.set('includeMetadata', 'true');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url, {
      headers: {
        Authorization: `bearer ${accessToken}`,
        'User-Agent': USER_AGENT,
      },
    });
    if (response.status === 401) {
      throw new EpicAuthError('Epic ha rifiutato il token di accesso');
    }
    if (!response.ok) {
      throw new Error(`Epic library/items: ${response.status}`);
    }

    const body = (await response.json()) as LibraryResponse;

    for (const record of body.records ?? []) {
      if (!record.productId || !record.appName) continue;
      if (record.namespace === 'ue') continue;
      if (record.sandboxType === 'PRIVATE') continue;

      // Vince la prima voce del prodotto: le successive sono i suoi DLC, che
      // portano lo stesso titolo e non aggiungono niente.
      if (perProdotto.has(record.productId)) continue;

      perProdotto.set(record.productId, record);
    }

    cursor = body.responseMetadata?.nextCursor;
  } while (cursor);

  const voci = [...perProdotto.values()];
  const titoli = await fetchCatalogTitles(accessToken, voci);

  return voci
    .filter((record) => titoli.has(record.catalogItemId!))
    .map((record) => ({
      externalId: record.productId!,
      name: titoli.get(record.catalogItemId!)!,
    }));
}

/**
 * I titoli dal catalogo, per i soli `catalogItemId` che sono giochi.
 *
 * Chi non compare nella mappa **non va importato**: o il catalogo non l'ha
 * riconosciuto come gioco — DLC, asset Unreal, roba che gioco non è — o non ha
 * risposto affatto. I due casi si trattano uguale di proposito: senza un titolo
 * una voce non la si può né agganciare né mostrare negli scarti, e tenerla
 * vorrebbe dire una riga che dice solo «c'è qualcosa».
 *
 * Il catalogo si interroga **per namespace**, e su Epic quasi ogni prodotto ha
 * il suo: in pratica è una richiesta per gioco.
 */
async function fetchCatalogTitles(
  accessToken: string,
  records: LibraryRecord[],
): Promise<Map<string, string>> {
  const titoli = new Map<string, string>();
  if (records.length === 0) return titoli;

  const perNamespace = new Map<string, string[]>();
  for (const record of records) {
    if (!record.namespace || !record.catalogItemId) continue;
    perNamespace.set(record.namespace, [
      ...(perNamespace.get(record.namespace) ?? []),
      record.catalogItemId,
    ]);
  }

  for (const [namespace, ids] of perNamespace) {
    for (const page of chunk(ids, 50)) {
      const url = new URL(
        `${CATALOG_HOST}/catalog/api/shared/namespace/${encodeURIComponent(namespace)}/bulk/items`,
      );
      for (const id of page) url.searchParams.append('id', id);
      // In inglese, e non nella lingua dell'utente, perché questi titoli vanno
      // confrontati con IGDB, che li tiene in inglese. Col locale italiano il
      // catalogo rende «Ogu e la Foresta Segreta» e «Il Detective del lato
      // Oscuro», che il matcher non aggancia a niente.
      url.searchParams.set('country', 'US');
      url.searchParams.set('locale', 'en');

      const response = await fetch(url, {
        headers: {
          Authorization: `bearer ${accessToken}`,
          'User-Agent': USER_AGENT,
        },
      });
      if (!response.ok) continue;

      const body = (await response.json()) as CatalogResponse;
      for (const [id, item] of Object.entries(body)) {
        // Solo ciò che il catalogo chiama gioco. Gli `addons` sono DLC con un
        // prodotto proprio, che la deduplica per `productId` non ha preso.
        const categorie = item.categories?.map((row) => row.path) ?? [];
        if (!categorie.includes('games')) continue;
        if (categorie.includes('addons')) continue;
        if (item.title) titoli.set(id, item.title.trim());
      }
    }
  }

  return titoli;
}
