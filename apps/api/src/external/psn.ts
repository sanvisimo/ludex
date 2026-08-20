// Client PlayStation Network. Come gli altri sta fuori da `services/`: è
// l'accesso a un servizio esterno, non logica di dominio.
//
// Prima console, e il primo negozio in cui **la piattaforma la dice la riga**:
// la stessa libreria porta PS5, PS4, PS3 e Vita insieme, e il possesso deve
// dirlo. Sui negozi PC la piattaforma era una costante per negozio.
//
// Il credenziale è quello del **client mobile PlayStation**: `client_id` e
// `client_secret` qui sotto sono i suoi, girano da anni in psn-api e nel plugin
// PSN di Playnite, e non esiste un programma per sviluppatori terzi da cui
// averne di propri. Il refresh token dura circa due mesi — il più corto fra
// quelli che abbiamo, e la ragione per cui `needs_reauth` su PSN si vedrà
// davvero, non in teoria.

const CLIENT_ID = '09515159-7237-4370-9b40-3806e67c0891';
const CLIENT_SECRET = 'ucPjka5tntB2KqsP';

/**
 * Il `redirect_uri` è uno schema custom Android, non un indirizzo web.
 *
 * È la stessa storia di GOG, Epic e Amazon e finisce allo stesso modo: la lista
 * dei redirect è fissata sul `client_id` del launcher, un indirizzo nostro non
 * c'è dentro. Qui in più il redirect **non è nemmeno un URL http**, quindi non
 * c'è nessuna pagina su cui l'utente possa atterrare a leggere il codice.
 *
 * Ed è il motivo per cui su PSN si incolla un'altra cosa: non il codice di
 * autorizzazione ma l'**npsso**, che è il cookie di sessione del sito Sony e si
 * legge da una pagina normale (vedi `SSO_COOKIE_URL`). Il codice lo ricava poi
 * il server, che gli schemi custom non deve aprirli.
 */
const REDIRECT_URI = 'com.scee.psxandroid.scecompcall://redirect';
const SCOPE = 'psn:mobile.v2.core psn:clientapp';

const AUTHORIZE_URL = 'https://ca.account.sony.com/api/authz/v3/oauth/authorize';
const TOKEN_URL = 'https://ca.account.sony.com/api/authz/v3/oauth/token';

/**
 * La pagina su cui l'utente legge il proprio npsso, ed è quella che gli apriamo.
 *
 * Fatto il login su playstation.com, questo indirizzo risponde
 * `{"npsso":"…"}` in chiaro nel browser. È lo stesso identico gesto che
 * Playnite chiede al suo utente, ed è il motivo per cui non c'è niente da
 * inventare: si incolla quello che si ha sotto gli occhi.
 */
export const SSO_COOKIE_URL = 'https://ca.account.sony.com/api/v1/ssocookie';

const GRAPHQL_URL = 'https://web.np.playstation.com/api/graphql/v1/op';

/**
 * Gli header senza i quali il gateway risponde 400, e non per colpa nostra.
 *
 * Dietro c'è **Apollo Server con la protezione CSRF attiva**: una GET che porta
 * solo header «semplici» — quelli che un `<form>` HTML può produrre da solo —
 * viene rifiutata per principio, perché potrebbe essere una pagina ostile che
 * fa richieste col cookie di qualcun altro. Il rimedio che Apollo documenta è
 * dichiarare un header che un form non potrebbe mandare, e `Authorization` non
 * conta.
 *
 * Misurato, non supposto: la stessa identica richiesta con e senza questi
 * header dà 400 e 200. Il messaggio che Sony rende lo dice per esteso, ed è la
 * ragione per cui l'errore di `graphql` si porta dietro il corpo.
 *
 * Il locale è invece una **scelta**: la libreria arriva coi titoli del negozio
 * americano, che sono quelli su cui IGDB è scritto. È lo stesso motivo per cui
 * Amazon vive inchiodato al mercato USA, con la differenza che qui è una
 * preferenza e non un vincolo.
 */
const GRAPHQL_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-PSN-Store-Locale-Override': 'en-US',
  'Accept-Language': 'en-US',
};

/**
 * L'elenco degli acquisti, che sul sito Sony è la pagina «Libreria giochi».
 *
 * È una *persisted query*: il corpo della query non si manda, si manda il suo
 * hash, e Sony rifiuta gli hash che non conosce. Cambia quando il sito cambia,
 * ed è la parte fragile di questo client — la stessa fragilità dell'endpoint
 * HLTB, con la stessa cura: quando smette, si aggiorna qui e basta.
 */
const PURCHASED_QUERY_HASH =
  '2c045408b0a4d0264bb5a3edfed4efd49fb4749cf8d216be9043768adff905e2';

/**
 * Quali piattaforme chiedere. Sony le vuole in minuscolo e le filtra lei.
 *
 * Non è la lista di ciò che sappiamo tradurre (quella sta in
 * `services/psn-platforms.ts`): è la lista di ciò che si chiede. Chiedere una
 * piattaforma di troppo costa nulla, non chiederne una vuol dire non vedere
 * quei giochi affatto.
 */
const PURCHASED_PLATFORMS = ['ps3', 'ps4', 'ps5'];

/** Quante voci per pagina: il massimo che il sito stesso usa. */
const PAGE_SIZE = 50;

/** L'elenco dei giochi **giocati**, da cui vengono le ore. */
// `{accountId}` e non `me`: l'alias non risponde su queste API, misurato al
// primo giro del probe. L'id numerico invece va, ed è quello dell'`id_token`.
const GAMELIST_URL =
  'https://m.np.playstation.com/api/gamelist/v2/users/{accountId}/titles';

/**
 * Il collegamento è morto e non si aggiusta da sé: solo un npsso nuovo lo
 * rimette a posto.
 *
 * Distinto da un errore qualunque perché il chiamante ci fa una cosa diversa —
 * `needs_reauth` invece di un job che riproverà a vuoto per sempre.
 */
export class PsnAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PsnAuthError';
  }
}

export type PsnCredentials = {
  accessToken: string;
  refreshToken: string;
  /** Epoch in millisecondi. L'access token dura un'ora. */
  expiresAt: number;
  /**
   * Quando muore il **refresh token**, che su PSN sono circa due mesi.
   *
   * Tenuto dentro il credenziale e non nella colonna `credentialsExpireAt`, che
   * è dell'access token: qui serve a sapere, un giorno, che l'account sta per
   * scadere *prima* che smetta di funzionare. Zero se Sony non lo dichiara.
   */
  refreshExpiresAt: number;
  /** L'id numerico dell'account, immutabile. Vedi `psnIdentity`. */
  accountId: string;
  /** Il PSN ID leggibile. Può cambiare: non è l'identità, è la decorazione. */
  onlineId: string | null;
};

/**
 * Da quello che l'utente incolla all'npsso.
 *
 * Accetta la risposta JSON intera o il solo valore, che sono le due cose che
 * Playnite stesso ammette — e per la stessa ragione per cui `parseGogAuthCode`
 * accetta l'URL o il codice: si prende quello che uno ha davvero sotto mano.
 */
export function parseNpsso(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const body = JSON.parse(trimmed) as { npsso?: unknown };
      return typeof body.npsso === 'string' && body.npsso.length > 0
        ? body.npsso
        : null;
    } catch {
      return null;
    }
  }

  // Un npsso nudo: base64url lungo, senza spazi. Le virgolette si tolgono
  // perché copiando *dentro* il JSON ci si porta via anche quelle, ed è il
  // modo più naturale di sbagliare un copia-incolla riuscito.
  const nudo = trimmed.replace(/^"|"$/g, '');
  return /^[\w-]{40,}$/.test(nudo) ? nudo : null;
}

/**
 * L'npsso diventa un codice di autorizzazione.
 *
 * Il passo che su GOG ed Epic fa il browser dell'utente, qui lo fa il server:
 * si chiede l'authorize con l'npsso come cookie e **non si segue il redirect**,
 * perché il redirect punta a uno schema custom Android che non porta da nessuna
 * parte. Il codice è nel `Location`, e ci fermiamo lì.
 */
export async function exchangeNpssoForCode(npsso: string): Promise<string> {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);

  const response = await fetch(url, {
    redirect: 'manual',
    headers: { Cookie: `npsso=${npsso}` },
  });

  const location = response.headers.get('location') ?? '';
  const code = /[?&]code=([^&]+)/.exec(location)?.[1];

  if (!code) {
    // Sony non dice «npsso scaduto»: rimanda al login, o redirige con un
    // `error=` addosso. In entrambi i casi l'uscita è la stessa — l'utente deve
    // riprendersi l'npsso — e non è un caso da riprovare.
    throw new PsnAuthError(
      "L'npsso non è più valido: riprendilo dalla pagina di Sony e ricollega l'account",
    );
  }

  return decodeURIComponent(code);
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

/**
 * L'identità dell'account, letta dall'`id_token`.
 *
 * Si prende da lì e non da una chiamata al profilo per una ragione pratica: il
 * token ce l'abbiamo già in mano, e una richiesta in meno al collegamento è una
 * cosa in meno che può fallire mentre l'utente aspetta.
 *
 * L'`accountId` numerico è l'identità e non cambia mai; l'`onlineId` è il nome
 * che si vede e Sony lascia cambiarlo. Per questo il primo finisce in
 * `external_account_id` e il secondo in `display_name` — sbagliare verso
 * vorrebbe dire che un utente che si rinomina si ritrova due account collegati
 * e i possessi appesi a quello vecchio.
 */
function psnIdentity(idToken: string | undefined) {
  const payload = idToken?.split('.')[1];
  if (!payload) return { accountId: '', onlineId: null as string | null };

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    const accountId =
      typeof claims.account_id === 'string'
        ? claims.account_id
        : typeof claims.sub === 'string'
          ? claims.sub
          : '';
    const onlineId =
      typeof claims.online_id === 'string' ? claims.online_id : null;

    return { accountId, onlineId };
  } catch {
    return { accountId: '', onlineId: null as string | null };
  }
}

async function requestToken(
  body: Record<string, string>,
): Promise<PsnCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ ...body, token_format: 'jwt' }),
  });

  const payload = (await response
    .json()
    .catch(() => null)) as TokenResponse | null;

  if (!response.ok) {
    // `invalid_grant` è definitivo: il codice è scaduto o già speso, o il
    // refresh token non vale più. Riprovare non cambia nulla.
    if (payload?.error === 'invalid_grant') {
      throw new PsnAuthError(
        payload.error_description ?? 'Sony ha rifiutato il credenziale',
      );
    }
    throw new Error(
      `PSN token: ${response.status} ${JSON.stringify(payload) || ''}`,
    );
  }

  if (!payload?.access_token || !payload.refresh_token) {
    throw new Error('PSN token: risposta senza token');
  }

  const { accountId, onlineId } = psnIdentity(payload.id_token);

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    // Un minuto di margine, come per GOG: non si parte con un token che scade a
    // metà import.
    expiresAt: Date.now() + ((payload.expires_in ?? 3600) - 60) * 1000,
    refreshExpiresAt: payload.refresh_token_expires_in
      ? Date.now() + payload.refresh_token_expires_in * 1000
      : 0,
    accountId,
    onlineId,
  };
}

/** Primo collegamento: dal codice ricavato dall'npsso alla coppia di token. */
export function exchangePsnCode(code: string) {
  return requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
  });
}

/** Rinnovo silenzioso: è ciò che rende l'npsso un gesto solo per due mesi. */
export function refreshPsnTokens(refreshToken: string) {
  return requestToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPE,
  });
}

/**
 * Il profilo dell'account: il PSN ID come lo vede il mondo.
 *
 * Serve a due cose diverse. Al collegamento è il ripiego per `display_name`
 * quando l'`id_token` non porta l'`online_id`, e come tale non deve far fallire
 * niente: rende null e si tira avanti, come `fetchGogUsername`.
 *
 * Ma è anche **la verifica dell'identità**: chiamarlo con l'`accountId` letto
 * dall'`id_token` e riavere indietro un profilo vuol dire che quell'id è
 * davvero l'account, e non un'altra claim che gli somiglia. È la ragione per
 * cui il probe lo chiama sempre.
 */
export async function fetchPsnProfile(
  accessToken: string,
  accountId: string,
): Promise<{ onlineId: string | null; isPlus: boolean | null } | null> {
  try {
    const response = await fetch(
      `https://m.np.playstation.com/api/userProfile/v1/internal/users/${accountId}/profiles`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as {
      onlineId?: string;
      // Dichiarato qui e non usato ancora: è l'abbonamento, e sarà lo step 14 a
      // farne qualcosa. Costa zero saperlo ora che siamo su questa risposta.
      isPlus?: boolean | number;
    };

    return {
      onlineId: body.onlineId ?? null,
      isPlus: body.isPlus === undefined ? null : Boolean(body.isPlus),
    };
  } catch {
    return null;
  }
}

export type PsnLibraryEntry = {
  /**
   * Il `conceptId`, che è ciò che IGDB conosce come sorgente 36 — non il
   * `titleId`, non il `productId`. Il concept è **il gioco**; le altre due sono
   * l'edizione per una console e la voce a catalogo del negozio.
   *
   * **Nullable, e non è un dettaglio**: Sony lo omette su una parte delle
   * righe. Quante siano lo dice il probe, e da lì dipende se su PSN l'identità
   * si prende dal concept o se serve un ripiego.
   */
  conceptId: string | null;
  name: string;
  /** Come la chiama Sony: `PS5`, `PS4`, `PS3`… Tradotta in `psn-platforms.ts`. */
  platform: string;
  /**
   * L'edizione per console (`CUSA…`, `PPSA…`), che è la chiave con cui l'elenco
   * dei giocati indicizza le ore.
   *
   * Sony non la dichiara come campo suo su questa risposta: sta **dentro**
   * l'`entitlementId`, che è fatto `UP3971-PPSA33764_00-WALKWALKWALKWALK`. Il
   * pezzo di mezzo è il titleId, ed è da lì che lo si estrae.
   */
  titleId: string | null;
  /** Come Sony identifica il diritto. Tenuto perché è da qui che esce il titleId. */
  entitlementId: string | null;
  /**
   * Da dove viene il diritto di giocarci: `NONE` è un acquisto, il resto è un
   * abbonamento (PS Plus Extra/Premium). Oggi entrano tutti in libreria; è lo
   * step 14 a doverne fare qualcosa.
   */
  subscription: string | null;
};

/**
 * Il `titleId` dall'`entitlementId`.
 *
 * `UP3971-PPSA33764_00-WALKWALKWALKWALK` → `PPSA33764_00`. Il primo pezzo è il
 * service id del publisher, l'ultimo un'etichetta interna; quello di mezzo è
 * l'unico che l'elenco dei giocati conosca, ed è così che le ore trovano il
 * possesso a cui appartengono senza passare da un match per titolo.
 */
export function titleIdFromEntitlement(
  entitlementId: string | null | undefined,
): string | null {
  return /\b((?:CUSA|PPSA|PCJS|PCSE|PCSF|PCSG|PCSH|NPWR)\d+_\d+)\b/i.exec(
    entitlementId ?? '',
  )?.[1] ?? null;
}

type PurchasedGame = {
  conceptId?: string | null;
  titleId?: string | null;
  productId?: string | null;
  entitlementId?: string | null;
  name?: string | null;
  platform?: string | null;
  subscriptionService?: string | null;
  isActive?: boolean | null;
};

type PurchasedResponse = {
  data?: {
    purchasedTitlesRetrieve?: {
      games?: PurchasedGame[] | null;
      pageInfo?: { isLast?: boolean; offset?: number; totalCount?: number };
    } | null;
  };
  errors?: { message?: string }[];
};

async function graphql<T>(
  accessToken: string,
  operationName: string,
  variables: unknown,
  sha256Hash: string,
): Promise<T> {
  const url = new URL(GRAPHQL_URL);
  url.searchParams.set('operationName', operationName);
  url.searchParams.set('variables', JSON.stringify(variables));
  url.searchParams.set(
    'extensions',
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash } }),
  );

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...GRAPHQL_HEADERS,
      // Apollo vuole il nome dell'operazione, non un valore qualunque: è la
      // forma documentata del salvacondotto, e si legge nei log di Sony.
      'x-apollo-operation-name': operationName,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new PsnAuthError('Sony ha rifiutato il token di accesso');
  }
  if (!response.ok) {
    // Il corpo, non solo lo stato: il gateway GraphQL di Sony dice **quale**
    // pezzo non gli va giù — hash sconosciuto, variabile invalida, header
    // mancante — e buttarlo via vuol dire tirare a indovinare con in mezzo un
    // giro di login per ogni tentativo.
    const detail = (await response.text().catch(() => '')).slice(0, 500);
    throw new Error(`PSN ${operationName}: ${response.status} ${detail}`);
  }

  return (await response.json()) as T;
}

/**
 * La prima pagina **grezza**, per gli arnesi.
 *
 * Serve a una cosa che il tipo sopra non può dare: vedere quali campi Sony
 * mandi davvero, invece di quelli che noi ci aspettiamo. Un campo che smette di
 * arrivare, letto attraverso un tipo, sembra semplicemente sempre nullo.
 */
export async function fetchPsnLibraryRawPage(accessToken: string) {
  const body = await graphql<PurchasedResponse>(
    accessToken,
    'getPurchasedGameList',
    {
      isActive: true,
      platform: PURCHASED_PLATFORMS,
      size: PAGE_SIZE,
      start: 0,
      subscriptionService: 'NONE',
    },
    PURCHASED_QUERY_HASH,
  );
  return (body.data?.purchasedTitlesRetrieve?.games ?? []) as Record<
    string,
    unknown
  >[];
}

/**
 * La libreria: **cosa possiedi**, non cosa hai giocato.
 *
 * È la pagina «Libreria giochi» del sito Sony, e comprende gli acquisti di ogni
 * console più ciò che si ha con l'abbonamento. Ogni riga porta la sua
 * piattaforma, ed è per questo che il 9b tocca `LibraryEntry`: lo stesso gioco
 * comprato su PS4 e riscattato su PS5 sono due righe, che è la verità — sono
 * due copie, e a lanciarle si accende una console diversa.
 *
 * `restituisce` le voci grezze: la traduzione della piattaforma e la scelta di
 * cosa tenere stanno nel servizio, non qui.
 */
export async function fetchPsnLibrary(
  accessToken: string,
): Promise<PsnLibraryEntry[]> {
  const entries: PsnLibraryEntry[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const body = await graphql<PurchasedResponse>(
      accessToken,
      'getPurchasedGameList',
      {
        isActive: true,
        platform: PURCHASED_PLATFORMS,
        size: PAGE_SIZE,
        start,
        // Sony vuole la chiave, ma la lista non si restringe agli acquisti: è
        // il valore da cui *ripartire*, e la risposta dichiara riga per riga da
        // dove viene il diritto.
        subscriptionService: 'NONE',
      },
      PURCHASED_QUERY_HASH,
    );

    if (body.errors?.length) {
      throw new Error(
        `PSN getPurchasedGameList: ${body.errors[0]?.message ?? 'errore'}`,
      );
    }

    const page = body.data?.purchasedTitlesRetrieve;
    for (const game of page?.games ?? []) {
      // Le voci senza concept **non si buttano qui**: chi chiama deve poterle
      // contare e decidere. Scartarle nel client vorrebbe dire che una libreria
      // dimezzata assomiglia a una libreria piccola.
      entries.push({
        conceptId: game.conceptId ? String(game.conceptId) : null,
        name: game.name?.trim() || '',
        platform: game.platform?.trim() ?? '',
        titleId:
          game.titleId ?? titleIdFromEntitlement(game.entitlementId ?? null),
        entitlementId: game.entitlementId ?? null,
        subscription: game.subscriptionService ?? null,
      });
    }

    const games = page?.games?.length ?? 0;
    if (games < PAGE_SIZE || page?.pageInfo?.isLast) break;
  }

  return entries;
}

export type PsnPlayedTitle = {
  /** `CUSA…` o `PPSA…`: la stessa chiave che la libreria porta come `titleId`. */
  titleId: string;
  name: string;
  playtimeMinutes: number | null;
  lastPlayedAt: Date | null;
};

type GameListResponse = {
  titles?: {
    titleId?: string;
    name?: string;
    localizedName?: string;
    playDuration?: string;
    lastPlayedDateTime?: string;
    category?: string;
  }[];
  nextOffset?: number | null;
  totalItemCount?: number;
};

/**
 * `PT34H12M45S` → minuti.
 *
 * Sony dà le ore in durata ISO 8601, non in secondi. I giorni non compaiono —
 * misurato — ma si leggono lo stesso: costa una riga e non doverci tornare.
 */
export function parsePlayDuration(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(
    duration,
  );
  if (!match) return null;

  const [, giorni, ore, minuti, secondi] = match;
  const totale =
    Number(giorni ?? 0) * 1440 +
    Number(ore ?? 0) * 60 +
    Number(minuti ?? 0) +
    Number(secondi ?? 0) / 60;

  return Math.round(totale);
}

/**
 * I giochi **giocati**, con le ore.
 *
 * Elenco separato dalla libreria e più piccolo: solo PS4 e PS5, solo ciò che si
 * è davvero avviato. Per questo le ore su PSN sono parziali per costruzione, e
 * non c'è modo di averle per un PS3 o per un gioco mai aperto.
 *
 * **Non è una fonte di possessi.** Qui dentro finisce anche ciò che si è giocato
 * senza possederlo, e `backlog` oggi vuol dire possesso: questo elenco serve a
 * decorare i possessi che la libreria ha già dichiarato, non ad aggiungerne.
 */
export async function fetchPsnPlayedTitles(
  accessToken: string,
  accountId: string,
): Promise<PsnPlayedTitle[]> {
  const titles: PsnPlayedTitle[] = [];

  for (let offset = 0; ; ) {
    const url = new URL(GAMELIST_URL.replace('{accountId}', accountId));
    url.searchParams.set('limit', '200');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('categories', 'ps4_game,ps5_native_game');

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new PsnAuthError('Sony ha rifiutato il token di accesso');
    }
    if (!response.ok) throw new Error(`PSN gamelist: ${response.status}`);

    const body = (await response.json()) as GameListResponse;

    for (const title of body.titles ?? []) {
      if (!title.titleId) continue;
      titles.push({
        titleId: title.titleId,
        name: (title.localizedName ?? title.name ?? '').trim(),
        playtimeMinutes: parsePlayDuration(title.playDuration),
        lastPlayedAt: title.lastPlayedDateTime
          ? new Date(title.lastPlayedDateTime)
          : null,
      });
    }

    if (!body.nextOffset || body.nextOffset <= offset) break;
    offset = body.nextOffset;
  }

  return titles;
}
