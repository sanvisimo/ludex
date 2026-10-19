import { randomUUID } from 'node:crypto';

// Client Xbox (9e). Come gli altri sta fuori da `services/`: è l'accesso a un
// servizio esterno, non logica di dominio.
//
// **Non è un'API per sviluppatori terzi.** Il login usa il client di xbox.com
// (`CLIENT_ID`), con un device code: l'utente conferma un codice su
// microsoft.com/link, anche dal telefono, e il server interroga finché non
// risponde. Client, catena dei token e richieste vengono da Unifideck
// (stores/microsoft) e da Playnite (XboxLibrary), e sono **provati il
// 19/10/2026** con `pnpm --filter api xbox:probe` su un account vero: misure e
// decisioni in plans/9e-xbox.md.
//
// Collections, cioè i posseduti, risponde **solo** a questo client: col client
// dell'app Xbox su login.live.com la lista è vuota (misurato da Unifideck).

const CLIENT_ID = '1f907974-e22b-4810-a9de-d9647380c97e';
const SCOPE = 'XboxLive.signin offline_access';
const LOGIN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const XBL_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const COLLECTIONS_URL =
  'https://collections.mp.microsoft.com/v7.0/collections/query';
const TITLEHUB_URL = 'https://titlehub.xboxlive.com/users';
const USERSTATS_URL = 'https://userstats.xboxlive.com/batch';
const ORDERS_URL = 'https://purchase.mp.microsoft.com/v7.0/users/me/orders';
const ACTIONS_URL = 'https://emerald.xboxservices.com/xboxcomfd/productActions';
const CATALOG_URL = 'https://displaycatalog.mp.microsoft.com/v7.0/products';

/**
 * Gli header che Unifideck manda su `user.auth` e XSTS: sono le richieste che
 * loro hanno misurato su account veri, e il probe le ha rifatte uguali.
 */
const XBL_HEADERS = {
  'User-Agent': 'XboxReplay; XboxLiveAuth/3.0',
  'Accept-Language': 'en-US',
};

/**
 * Il mercato per Collections e il catalogo. Quello misurato (90 prodotti su
 * 90 nel catalogo). Un prodotto non venduto in Italia potrebbe non avere
 * scheda: se capitasse, è questa la riga.
 */
export const XBOX_MARKET = 'IT';

const TIMEOUT_MS = 20_000;

/** Un id di correlazione nuovo per richiesta. `productActions` lo pretende. */
const msCv = () => `${randomUUID().replaceAll('-', '').toUpperCase()}.0`;

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Il collegamento è morto e non si aggiusta da sé: solo un nuovo login lo
 * rimette a posto. Distinto perché il chiamante ci fa `needs_reauth` invece di
 * un job che riprova a vuoto.
 */
export class XboxAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XboxAuthError';
  }
}

/**
 * L'account Microsoft c'è, ma Xbox non lo lascia entrare. Si dice all'utente al
 * collegamento: non è un job che riprova, e nemmeno un credenziale scaduto.
 *
 * I codici sono quelli documentati da Unifideck e XboxReplay, **non misurati**:
 * l'account di prova entra.
 */
export class XboxAccountError extends Error {
  constructor(
    readonly reason: 'no_profile' | 'country' | 'child' | 'other',
    readonly xerr: number | null,
  ) {
    super(`Xbox ha rifiutato l'account (${reason}, XErr ${xerr ?? '?'})`);
    this.name = 'XboxAccountError';
  }
}

const XERR_REASONS: Record<number, XboxAccountError['reason']> = {
  2148916233: 'no_profile',
  2148916235: 'country',
  2148916236: 'child',
  2148916237: 'child',
  2148916238: 'child',
};

export type XboxCredentials = {
  accessToken: string;
  /** **Cambia a ogni rinnovo** (misurato): va salvato quello nuovo. */
  refreshToken: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

const form = (body: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body),
  signal: AbortSignal.timeout(TIMEOUT_MS),
});

const readJson = async <T>(response: Response) =>
  (await response.json().catch(() => null)) as T | null;

function toCredentials(payload: TokenResponse): XboxCredentials {
  if (!payload.access_token || !payload.refresh_token) {
    throw new Error('Xbox: risposta del token senza access o refresh token');
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
}

// --- Il device code ---

export type XboxDeviceCode = {
  /** Resta sul server: è ciò con cui si interroga, e vale un login. */
  deviceCode: string;
  /** Il codice da scrivere su `verificationUri`. */
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalMs: number;
};

/** Apre un login: rende il codice da mostrare all'utente. */
export async function startXboxDeviceCode(): Promise<XboxDeviceCode> {
  const response = await fetch(
    `${LOGIN_URL}/devicecode`,
    form({ client_id: CLIENT_ID, scope: SCOPE }),
  );
  const payload = await readJson<{
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
  }>(response);
  if (!response.ok || !payload?.device_code || !payload.user_code) {
    throw new Error(`Xbox devicecode: ${response.status}`);
  }
  return {
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUri:
      payload.verification_uri ?? 'https://www.microsoft.com/link',
    expiresAt: Date.now() + (payload.expires_in ?? 900) * 1000,
    intervalMs: (payload.interval ?? 5) * 1000,
  };
}

export type XboxDevicePoll =
  | { status: 'pending' }
  /** Microsoft chiede di interrogare più piano: +5 secondi. */
  | { status: 'slow_down' }
  | { status: 'expired' }
  /** L'utente ha premuto «Nega», o il codice non vale più. */
  | { status: 'declined' }
  | { status: 'ok'; credentials: XboxCredentials };

/**
 * Un'interrogazione sola. Il ritmo lo tiene chi chiama: è la sessione di login
 * che vive nel processo dell'API (`services/xbox-login.ts`).
 */
export async function pollXboxDeviceCode(
  deviceCode: string,
): Promise<XboxDevicePoll> {
  const response = await fetch(
    `${LOGIN_URL}/token`,
    form({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: CLIENT_ID,
      device_code: deviceCode,
    }),
  );
  const payload = await readJson<TokenResponse>(response);
  if (response.ok && payload?.access_token) {
    return { status: 'ok', credentials: toCredentials(payload) };
  }
  switch (payload?.error) {
    case 'authorization_pending':
      return { status: 'pending' };
    case 'slow_down':
      return { status: 'slow_down' };
    case 'expired_token':
      return { status: 'expired' };
    case 'authorization_declined':
    case 'bad_verification_code':
    case 'invalid_grant':
      return { status: 'declined' };
    default:
      throw new Error(
        `Xbox token (device code): ${response.status} ${payload?.error ?? ''}`.trim(),
      );
  }
}

/**
 * Rinnovo. Un errore OAuth del server dei token è definitivo (`invalid_grant`,
 * revoca, password cambiata); una rete che cade o un 5xx no, e lì il job
 * riprova. È la stessa distinzione di Unifideck (`classify_token_reply`).
 */
export async function refreshXboxTokens(
  refreshToken: string,
): Promise<XboxCredentials> {
  const response = await fetch(
    `${LOGIN_URL}/token`,
    form({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      scope: SCOPE,
    }),
  );
  const payload = await readJson<TokenResponse>(response);
  if (!response.ok) {
    if (response.status < 500 && payload?.error) {
      throw new XboxAuthError(
        payload.error_description ?? payload.error ?? 'rinnovo rifiutato',
      );
    }
    throw new Error(`Xbox refresh: ${response.status}`);
  }
  return toCredentials(payload ?? {});
}

// --- Xbox Live: user token e i due XSTS ---

export type XboxSession = {
  /** Lo `xid` dell'XSTS: l'account, stabile. */
  xuid: string;
  /** Il nome leggibile, che l'utente può cambiare. */
  gamertag: string | null;
  /** `Authorization` per i servizi Xbox Live (storico, ore). */
  live: string;
  /** `Authorization` per il negozio (Collections, ordini, productActions). */
  store: string;
};

type XboxTokenResponse = {
  Token?: string;
  DisplayClaims?: { xui?: { uhs?: string; xid?: string; gtg?: string }[] };
  XErr?: number;
};

/**
 * Dall'access token alle due autorizzazioni. Tre richieste, rifatte a ogni
 * import e mai salvate: durano sedici ore, l'import un minuto.
 *
 * `d=` e non `t=`: col token di login.microsoftonline.com è quello giusto, al
 * primo colpo nel probe. Un 401 qui è un token revocato.
 */
export async function openXboxSession(
  accessToken: string,
): Promise<XboxSession> {
  const user = await fetch(XBL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-xbl-contract-version': '1',
      ...XBL_HEADERS,
    },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${accessToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const userToken = (await readJson<XboxTokenResponse>(user))?.Token;
  if (!user.ok || !userToken) {
    if (user.status === 400 || user.status === 401) {
      throw new XboxAuthError('Xbox Live ha rifiutato il token');
    }
    throw new Error(`Xbox user.auth: ${user.status}`);
  }

  const live = await xsts(userToken, 'http://xboxlive.com');
  const store = await xsts(userToken, 'http://mp.microsoft.com/');
  const claims = live.DisplayClaims!.xui![0]!;

  return {
    xuid: claims.xid!,
    gamertag: claims.gtg ?? null,
    live: `XBL3.0 x=${claims.uhs};${live.Token}`,
    store: `XBL3.0 x=${store.DisplayClaims!.xui![0]!.uhs};${store.Token}`,
  };
}

async function xsts(userToken: string, relyingParty: string) {
  const response = await fetch(XSTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-xbl-contract-version': '1',
      ...XBL_HEADERS,
    },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [userToken] },
      RelyingParty: relyingParty,
      TokenType: 'JWT',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = await readJson<XboxTokenResponse>(response);
  if (response.status === 401 && payload?.XErr) {
    throw new XboxAccountError(
      XERR_REASONS[payload.XErr] ?? 'other',
      payload.XErr,
    );
  }
  const claims = payload?.DisplayClaims?.xui?.[0];
  if (!response.ok || !payload?.Token || !claims?.uhs) {
    throw new Error(`Xbox XSTS (${relyingParty}): ${response.status}`);
  }
  if (relyingParty === 'http://xboxlive.com' && !claims.xid) {
    throw new Error('Xbox XSTS: manca lo xuid');
  }
  return payload;
}

/** GET o POST con un'autorizzazione Xbox; 401 = token revocato a metà. */
async function xboxJson<T>(
  what: string,
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new XboxAuthError(`Xbox ${what}: token rifiutato`);
    }
    throw new Error(`Xbox ${what}: ${response.status}`);
  }
  return (await response.json()) as T;
}

// --- Collections: i posseduti ---

export type XboxCollectionKind =
  | 'owned'
  /** Games with Gold: giocabile solo con l'abbonamento. */
  | 'gold'
  | 'pass'
  | 'not_game'
  | 'inactive'
  | 'trial';

type CollectionsItem = {
  productId?: string;
  productKind?: string;
  status?: string;
  isTrial?: boolean;
  skuType?: string;
  licensingRequired?: boolean;
  acquiredDate?: string;
};

/** Gli abbonamenti, non giochi: Game Pass, Gold. */
const PASS_PREFIX = 'CFQ7TTC0';

/**
 * Le regole di Unifideck, che sul loro account coincidono titolo per titolo
 * con le schede «Owned games» e «Games with Gold» della console.
 * `acquisitionType` è sempre nullo, misurato: non distingue niente.
 */
export function classifyCollectionsItem(
  item: CollectionsItem,
): XboxCollectionKind {
  const pid = item.productId?.toUpperCase() ?? '';
  if (pid.startsWith(PASS_PREFIX) || item.productKind === 'Pass') return 'pass';
  if (item.productKind !== 'Game') return 'not_game';
  if (item.status !== 'Active') return 'inactive';
  if (item.isTrial === true || item.skuType === 'Trial') return 'trial';
  if (item.licensingRequired === true) return 'gold';
  return 'owned';
}

export type XboxOwnedProduct = {
  /** 12 caratteri, in maiuscolo: è l'uid della sorgente IGDB 11. */
  productId: string;
  kind: 'owned' | 'gold';
  /** C'è su tutte le voci (misurato: 223 su 223). */
  acquiredAt: Date | null;
};

/** Una libreria vera è qualche centinaio di voci; ~100 query ogni 5 minuti. */
const MAX_COLLECTION_PAGES = 30;

/**
 * I giochi posseduti e i Games with Gold, a pagine da 100. **Mai una lista a
 * metà**: oltre il tetto di pagine fallisce, e il job riprova, invece di
 * importare mezza libreria e potare il resto.
 */
export async function fetchXboxCollections(
  session: XboxSession,
  market = XBOX_MARKET,
): Promise<XboxOwnedProduct[]> {
  const items: CollectionsItem[] = [];
  let continuationToken: string | undefined;
  for (let pagina = 1; pagina <= MAX_COLLECTION_PAGES; pagina += 1) {
    const body = await xboxJson<{
      items?: CollectionsItem[];
      continuationToken?: string;
    }>('collections', COLLECTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: session.store,
        'MS-CV': msCv(),
      },
      body: JSON.stringify({
        maxPageSize: 100,
        excludeDuplicates: true,
        market,
        validityType: 'All',
        beneficiaries: [
          {
            identityType: 'xuid',
            identityValue: session.xuid,
            localTicketReference: 'ludex',
          },
        ],
        ...(continuationToken ? { continuationToken } : {}),
      }),
    });
    const got = body.items ?? [];
    items.push(...got);
    continuationToken = body.continuationToken;
    if (!continuationToken || got.length === 0) {
      return toOwned(items);
    }
  }
  throw new Error(
    `Xbox collections: più di ${MAX_COLLECTION_PAGES} pagine, non importo mezza libreria`,
  );
}

function toOwned(items: CollectionsItem[]): XboxOwnedProduct[] {
  const byId = new Map<string, XboxOwnedProduct>();
  for (const item of items) {
    const kind = classifyCollectionsItem(item);
    const productId = item.productId?.toUpperCase();
    if (!productId || (kind !== 'owned' && kind !== 'gold')) continue;
    // Comprato vince su Gold, se lo stesso prodotto compare due volte.
    if (byId.get(productId)?.kind === 'owned') continue;
    byId.set(productId, {
      productId,
      kind,
      acquiredAt: toDate(item.acquiredDate),
    });
  }
  return [...byId.values()];
}

const toDate = (value: string | undefined) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

// --- Lo storico (titlehub) e le ore (userstats) ---

export type XboxPlayedTitle = {
  /** Decimale: è la chiave di userstats. */
  titleId: string;
  name: string;
  /**
   * `PC`, `XboxOne`, `XboxSeries`, `Xbox360`, `Win32`. **`Win32` da solo vuol
   * dire un gioco di un altro negozio** che l'app Xbox per PC ha visto (Portal,
   * Hollow Knight…): misurato, 40 su 164, tutti a zero minuti.
   */
  devices: string[];
  /** Da `detail.availabilities`, in maiuscolo. Vuoto sui `Win32`. */
  productIds: string[];
  lastPlayedAt: Date | null;
};

type TitlehubTitle = {
  titleId?: string;
  name?: string;
  type?: string;
  devices?: string[];
  detail?: { availabilities?: { ProductId?: string }[] };
  titleHistory?: { lastTimePlayed?: string };
};

/** Tutti i giochi avviati almeno una volta, in una richiesta (164 nel probe). */
export async function fetchXboxTitleHistory(
  session: XboxSession,
): Promise<XboxPlayedTitle[]> {
  const body = await xboxJson<{ titles?: TitlehubTitle[] }>(
    'titlehub',
    `${TITLEHUB_URL}/xuid(${session.xuid})/titles/titlehistory/decoration/detail?maxItems=5000`,
    {
      headers: {
        Authorization: session.live,
        'x-xbl-contract-version': '2',
        'Accept-Language': 'en-US',
      },
    },
  );
  return (body.titles ?? []).flatMap((title) =>
    title.type === 'Game' && title.titleId && title.name
      ? [
          {
            titleId: title.titleId,
            name: title.name,
            devices: title.devices ?? [],
            productIds: [
              ...new Set(
                (title.detail?.availabilities ?? []).flatMap((a) =>
                  a.ProductId ? [a.ProductId.toUpperCase()] : [],
                ),
              ),
            ],
            lastPlayedAt: toDate(title.titleHistory?.lastTimePlayed),
          },
        ]
      : [],
  );
}

/**
 * I minuti giocati, per titolo e non per dispositivo. Arrivano per 83 titoli su
 * 164 (misurato); un titolo senza minuti non è nella mappa.
 */
export async function fetchXboxMinutes(
  session: XboxSession,
  titleIds: string[],
): Promise<Map<string, number>> {
  const minuti = new Map<string, number>();
  if (titleIds.length === 0) return minuti;
  const body = await xboxJson<{
    statlistscollection?: { stats?: { titleid?: string; value?: string }[] }[];
  }>('userstats', USERSTATS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: session.live,
      'x-xbl-contract-version': '2',
    },
    body: JSON.stringify({
      arrangebyfield: 'xuid',
      stats: titleIds.map((titleid) => ({ name: 'MinutesPlayed', titleid })),
      xuids: [session.xuid],
    }),
  });
  for (const stat of body.statlistscollection?.[0]?.stats ?? []) {
    const value = Number(stat.value);
    if (stat.titleid && value > 0) minuti.set(stat.titleid, value);
  }
  return minuti;
}

// --- Il catalogo, pubblico ---

export type XboxProduct = {
  title: string;
  /** Ha un pacchetto Windows: si gioca su PC. */
  pc: boolean;
  /** Xbox One (`ConsoleGen8`). */
  gen8: boolean;
  /** Xbox Series (`ConsoleGen9`). */
  gen9: boolean;
  playAnywhere: boolean;
  demo: boolean;
};

type CatalogProduct = {
  ProductId?: string;
  LocalizedProperties?: { ProductTitle?: string }[];
  Properties?: {
    XboxConsoleGenCompatible?: string[] | string | null;
    IsDemo?: boolean;
    Attributes?: { Name?: string }[];
  };
  DisplaySkuAvailabilities?: {
    Sku?: {
      Properties?: {
        XboxXPA?: boolean;
        Packages?: { PlatformDependencies?: { PlatformName?: string }[] }[];
      };
    };
  }[];
};

/**
 * Titolo e piattaforme di un prodotto, dal catalogo (le regole di Unifideck,
 * `catalog_platforms.py`). `Windows.Desktop` o `Windows.Universal` è PC. La
 * generazione della console la dice `XboxConsoleGenCompatible`; se manca e c'è
 * un pacchetto `Windows.Xbox`, è una console di cui non si sa la generazione,
 * e vale come Xbox One (che gira anche sulla Series).
 */
export function productPlatforms(product: CatalogProduct): XboxProduct {
  const nomi = new Set<string>();
  let xpa = false;
  for (const availability of product.DisplaySkuAvailabilities ?? []) {
    const sku = availability.Sku?.Properties;
    if (sku?.XboxXPA === true) xpa = true;
    for (const pkg of sku?.Packages ?? []) {
      for (const dep of pkg.PlatformDependencies ?? []) {
        if (dep.PlatformName) nomi.add(dep.PlatformName);
      }
    }
  }
  const props = product.Properties ?? {};
  const raw = props.XboxConsoleGenCompatible;
  const gen = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const console = gen.length > 0 || nomi.has('Windows.Xbox');
  return {
    title: product.LocalizedProperties?.[0]?.ProductTitle ?? '',
    pc: nomi.has('Windows.Desktop') || nomi.has('Windows.Universal'),
    gen8: gen.includes('ConsoleGen8') || (console && gen.length === 0),
    gen9: gen.includes('ConsoleGen9'),
    playAnywhere: xpa || (props.Attributes ?? []).some((a) => a.Name === 'XPA'),
    demo: props.IsDemo === true,
  };
}

/**
 * Le schede del catalogo, 20 prodotti a richiesta. Pubblico, senza l'account.
 * Un prodotto che il catalogo non conosce non è nella mappa.
 */
export async function fetchXboxCatalog(
  productIds: string[],
  market = XBOX_MARKET,
): Promise<Map<string, XboxProduct>> {
  const out = new Map<string, XboxProduct>();
  for (let i = 0; i < productIds.length; i += 20) {
    const page = productIds.slice(i, i + 20);
    const body = await xboxJson<{ Products?: CatalogProduct[] }>(
      'catalogo',
      `${CATALOG_URL}?${new URLSearchParams({
        bigIds: page.join(','),
        market,
        languages: 'en-US',
      })}`,
      {},
    );
    for (const product of body.Products ?? []) {
      if (product.ProductId) {
        out.set(product.ProductId.toUpperCase(), productPlatforms(product));
      }
    }
  }
  return out;
}

// --- Gli Xbox 360 retrocompatibili ---

/** Una richiesta per candidato: sul conto misurato 19 candidati, 14 tuoi. */
const MAX_ACTIONS = 30;
const MAX_ORDER_PAGES = 50;
const ACTIONS_PAUSE_MS = 300;

type ProductActions = {
  productActions?: {
    productActions?: { actionType?: string }[];
    skuActionsBySkuId?: Record<string, { actionType?: string }[]>;
  }[];
};

/**
 * Il verdetto di xbox.com su un prodotto: tuo solo con «Install» e senza
 * «BuyToOwn» (giocabile col Game Pass) né «NotSoldSeparately» (un titolo di un
 * abbonamento, che non si può giudicare). `BuyToOwn` può stare sullo sku.
 */
export function actionsOwned(payload: ProductActions): boolean {
  const entry = payload.productActions?.[0];
  if (!entry) return false;
  const azioni = new Set((entry.productActions ?? []).map((a) => a.actionType));
  for (const lista of Object.values(entry.skuActionsBySkuId ?? {})) {
    for (const a of lista ?? []) azioni.add(a.actionType);
  }
  return (
    azioni.has('Install') &&
    !azioni.has('BuyToOwn') &&
    !azioni.has('NotSoldSeparately')
  );
}

type Order = {
  orderState?: string;
  orderLineItems?: {
    productId?: string;
    productType?: string;
    billingState?: string;
    title?: string;
  }[];
};

/**
 * I giochi Xbox 360 comprati, che Collections non elenca mai. Candidati dagli
 * ordini pagati e dallo storico col dispositivo `Xbox360`, e ciascuno confermato
 * da `productActions`, al più `MAX_ACTIONS`.
 *
 * **Al meglio**: se gli ordini non si leggono si va avanti con lo storico, e un
 * `productActions` che non risponde vuol dire «non lo so», cioè non tuo. Una
 * cosa che sfugge qui si ritrova al prossimo import; un import fallito per i
 * 360 lascerebbe indietro tutta la libreria. Un 401 invece è un token revocato,
 * e alza come altrove.
 */
export async function findXboxBackcompatOwned(
  session: XboxSession,
  history: XboxPlayedTitle[],
  known: Set<string>,
): Promise<Map<string, string>> {
  const candidati = new Map<string, string>();
  for (const title of history) {
    if (!title.devices.includes('Xbox360')) continue;
    for (const pid of title.productIds) {
      if (!candidati.has(pid)) candidati.set(pid, title.name);
    }
  }

  try {
    let url: string | null = ORDERS_URL; // niente market=: è un 400
    for (let pagina = 0; url && pagina < MAX_ORDER_PAGES; pagina += 1) {
      const body: { items?: Order[]; '@nextLink'?: string } = await xboxJson(
        'orders',
        url,
        { headers: { Authorization: session.store } },
      );
      for (const order of body.items ?? []) {
        if (order.orderState !== 'Purchased' && order.orderState !== 'Refunded')
          continue;
        for (const line of order.orderLineItems ?? []) {
          const pid = line.productId?.toUpperCase();
          const kind = (line.productType ?? 'Game').toLowerCase();
          if (pid && line.billingState === 'Charged' && kind === 'game') {
            if (!candidati.has(pid)) candidati.set(pid, line.title ?? '');
          }
        }
      }
      url = body['@nextLink'] || null;
    }
  } catch (error) {
    if (error instanceof XboxAuthError) throw error;
    console.log(
      `[import] xbox: ordini non letti (${error instanceof Error ? error.message : error}), i 360 solo dallo storico`,
    );
  }

  const owned = new Map<string, string>();
  const daControllare = [...candidati].filter(([pid]) => !known.has(pid));
  for (const [pid, name] of daControllare.slice(0, MAX_ACTIONS)) {
    try {
      const body = await xboxJson<ProductActions>(
        'productActions',
        `${ACTIONS_URL}/${pid}?locale=en-US`,
        {
          headers: {
            Authorization: session.store,
            'x-ms-api-version': '1.0',
            // Senza, 400 «Header MS-CV is missing» (misurato il 19/10/2026).
            'MS-CV': msCv(),
          },
        },
      );
      if (actionsOwned(body)) owned.set(pid, name);
    } catch (error) {
      if (error instanceof XboxAuthError) throw error;
    }
    await pausa(ACTIONS_PAUSE_MS);
  }
  return owned;
}
