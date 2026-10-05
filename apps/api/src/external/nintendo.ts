import { createHash, createHmac, randomBytes } from 'node:crypto';

import { storeTokenKey } from '../lib/crypto';

// Client Nintendo. Come gli altri sta fuori da `services/`: è l'accesso a un
// servizio esterno, non logica di dominio.
//
// **Non esiste una API per sviluppatori terzi.** Questo è il backend che usa
// l'app Nintendo (`com.nintendo.znej`), e `CLIENT_ID`, `USER_AGENT` e i path
// sono quelli del suo client open source nintendo-go: letti nel suo sorgente il
// 05/10/2026 e **provati lo stesso giorno** con `pnpm --filter api
// nintendo:probe`, su un account vero. Un client non ufficiale può violare il
// contratto Nintendo: vedi «Il rischio» in plans/9d-nintendo.md.
//
// La libreria è lo **storico di gioco**: ciò che è stato avviato, non ciò che è
// stato comprato. Vedi `services/nintendo-import.ts`.

const CLIENT_ID = '5c38e31cd085304b';
const REDIRECT_URI = `npf${CLIENT_ID}://auth`;
const ACCOUNTS_URL = 'https://accounts.nintendo.com';
const APP_URL = 'https://app-api.znej.nintendo.com';

/**
 * Il gateway rifiuta le richieste senza uno `User-Agent`, e si presenta come
 * l'app. È un'identità che non è nostra: se Nintendo la rifiuta un giorno, è
 * questa la riga da aggiornare.
 */
const USER_AGENT = 'com.nintendo.znej/3.0.3 (iOS/26.0.1)';

/**
 * Lo scope che chiede l'app. Altri non sono provati, e un `invalid_scope`
 * costerebbe un login: restiamo su quello del client di riferimento.
 */
const SCOPE = 'openid user user.mii user.email user.links[].id';

/**
 * I titoli arrivano nella lingua del locale. Inglese britannico perché è quello
 * su cui IGDB è scritto, la stessa scelta di PSN (`en-US`) e di Amazon.
 */
const LOCALE = 'en-GB';

const TIMEOUT_MS = 15_000;

/**
 * Il collegamento è morto e non si aggiusta da sé: solo un nuovo login lo
 * rimette a posto.
 *
 * Distinto da un errore qualunque perché il chiamante ci fa una cosa diversa —
 * `needs_reauth` invece di un job che riproverà a vuoto per sempre.
 */
export class NintendoAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NintendoAuthError';
  }
}

export type NintendoCredentials = {
  accessToken: string;
  /**
   * Il **session token**, che dura due anni (730 giorni, misurato). Si chiama
   * `refreshToken` perché è la forma che il rinnovo comune dei negozi OAuth si
   * aspetta (`OAuthCredentials`), ma **non ruota**: il rinnovo rende un access
   * token nuovo e lascia il session token com'è. Che non ruoti è ciò che il
   * client di riferimento assume, e **non è verificato** su un rinnovo vero.
   */
  refreshToken: string;
  /** Epoch in millisecondi. L'access token dura 900 secondi. */
  expiresAt: number;
  /** L'id numerico dell'account (`sub` dell'`id_token`), immutabile. */
  accountId: string;
  /**
   * L'`id_token`, che dura quanto l'access token (15 minuti, misurato). Non serve
   * per lo storico di gioco (basta l'access token) ma è ciò che il GraphQL delle
   * Virtual Game Cards vuole come variabile `idToken`: **accettato anche quello
   * del nostro login**, non solo quello del portale (misurato il 06/10/2026).
   */
  idToken: string;
  /**
   * Il paese dell'account (`IT`), che il GraphQL vuole nel contesto. **Da dove
   * arrivi non è misurato**: la claim `country` dell'`id_token` se c'è, altrimenti
   * il profilo (`fetchNintendoProfile`) al collegamento. Assente nel rinnovo, che
   * lo lascia com'era: vedi `storeAccessToken`. Nullo = non lo sappiamo, e allora
   * l'import salta le Virtual Game Cards invece di indovinare un paese.
   */
  country?: string | null;
};

// --- Il login, nel browser dell'utente ---

/** Un `state` nuovo per ogni apertura del login. */
export function newNintendoState() {
  return randomBytes(36).toString('base64url');
}

/**
 * Il verifier PKCE e la sua sfida, derivati da `STORE_TOKEN_KEY`.
 *
 * Come Amazon, e per la stessa ragione: il verifier deve esistere **prima** del
 * login e ritrovarsi **dopo**, e tenerlo in una tabella o in memoria vorrebbe
 * dire uno stato server per un login che può non finire mai. Lo si ricalcola
 * dall'utente e dallo `state`, che torna dentro l'indirizzo incollato: nessuna
 * richiesta in più e nessun valore da portare avanti e indietro dal client.
 *
 * Il segreto è il verifier, e resta tale perché dipende dalla chiave. Uno
 * `state` cambiato a mano dà un verifier diverso, e Nintendo rifiuta il codice:
 * il controllo è già nella derivazione.
 */
function pkceFor(userId: string, state: string) {
  const verifier = createHmac('sha256', storeTokenKey())
    .update(`nintendo:${userId}:${state}`)
    .digest('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function nintendoLoginUrl(userId: string, state: string) {
  const { challenge } = pkceFor(userId, state);
  return `${ACCOUNTS_URL}/connect/1.0.0/authorize?${new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'session_token_code',
    scope: SCOPE,
    session_token_code_challenge: challenge,
    session_token_code_challenge_method: 'S256',
    state,
    theme: 'login_form',
  })}`;
}

/**
 * Da ciò che l'utente incolla al codice e allo `state`.
 *
 * Il pulsante «Select this account» punta a `npf…://auth#session_token_code=…`,
 * uno schema che il browser non apre: l'utente deve copiare l'indirizzo del link
 * (clic destro), e quello che si incolla è l'URL intero. Senza `state` il codice
 * non si può scambiare, perché il verifier si ricava da lui.
 */
export function parseNintendoAuthCode(
  input: string,
): { code: string; state: string } | null {
  const code = /session_token_code=([^&\s]+)/.exec(input)?.[1];
  const state = /[#&?]state=([^&\s]+)/.exec(input)?.[1];
  return code && state ? { code, state } : null;
}

// --- I token ---

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  session_token?: string;
  error?: string;
  error_description?: string;
};

/**
 * Un rifiuto definitivo, o un guasto?
 *
 * 400 e 401 sono il «non vale più»: codice scaduto o già speso, session token
 * revocato. Tutto il resto — 403 di un filtro davanti, 429, 5xx, la rete — è
 * temporaneo, e mandare l'utente a ricollegare per un 429 sarebbe peggio di un
 * job che riprova. **Il codice preciso che Nintendo dà a un session token
 * scaduto non è misurato**, e farlo vorrebbe dire revocare o aspettare due anni:
 * se si scoprisse un altro stato, è questa la riga.
 */
const isRejection = (status: number) => status === 400 || status === 401;

async function post(url: string, init: RequestInit): Promise<TokenResponse> {
  const response = await fetch(url, {
    method: 'POST',
    ...init,
    headers: { 'User-Agent': USER_AGENT, ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = (await response
    .json()
    .catch(() => null)) as TokenResponse | null;

  if (!response.ok) {
    if (isRejection(response.status)) {
      throw new NintendoAuthError(
        payload?.error_description ??
          payload?.error ??
          'Nintendo ha rifiutato il credenziale',
      );
    }
    throw new Error(`Nintendo: ${response.status} ${url.split('?')[0]}`);
  }
  return payload ?? {};
}

function claimsOf(idToken: string | undefined): Record<string, unknown> {
  const payload = idToken?.split('.')[1];
  if (!payload) return {};
  try {
    return JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * La claim `sub` dell'`id_token`: l'id dell'account. Vuota se non c'è.
 *
 * Lo stesso valore è `ownerNaId` e `userNaId` sulle Virtual Game Cards
 * (`3247fa748f1dd367`, misurato il 06/10/2026 sul login e sul GraphQL).
 */
export function nintendoAccountId(idToken: string | undefined): string {
  const { sub } = claimsOf(idToken);
  return typeof sub === 'string' ? sub : '';
}

/** La claim `country`, se c'è ed è un codice a due lettere. **Non misurato** che ci sia. */
export function nintendoCountry(idToken: string | undefined): string | null {
  const { country } = claimsOf(idToken);
  return typeof country === 'string' && /^[A-Za-z]{2}$/.test(country)
    ? country.toUpperCase()
    : null;
}

/** Dal session token a un access token, con l'identità. È il «rinnovo». */
async function accessTokenFor(
  sessionToken: string,
): Promise<NintendoCredentials> {
  const token = await post(`${ACCOUNTS_URL}/connect/1.0.0/api/token`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      session_token: sessionToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
    }),
  });

  if (!token.access_token) {
    throw new Error('Nintendo token: risposta senza access token');
  }
  const accountId = nintendoAccountId(token.id_token);
  if (!accountId || !token.id_token) {
    throw new Error("Nintendo token: l'id_token non porta l'id dell'account");
  }
  const country = nintendoCountry(token.id_token);

  return {
    accessToken: token.access_token,
    idToken: token.id_token,
    // Solo se la claim c'è: il rinnovo non deve **azzerare** un paese che il
    // collegamento ha preso dal profilo (vedi `storeAccessToken`).
    ...(country ? { country } : {}),
    refreshToken: sessionToken,
    // Un minuto di margine, come per GOG e PSN: non si parte con un token che
    // scade a metà import.
    expiresAt: Date.now() + ((token.expires_in ?? 900) - 60) * 1000,
    accountId,
  };
}

/** Primo collegamento: dal codice incollato al session token e al primo access token. */
export async function exchangeNintendoCode(
  userId: string,
  code: string,
  state: string,
): Promise<NintendoCredentials> {
  const { verifier } = pkceFor(userId, state);
  const session = await post(
    `${ACCOUNTS_URL}/connect/1.0.0/api/session_token`,
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        session_token_code: code,
        session_token_code_verifier: verifier,
      }),
    },
  );
  if (!session.session_token) {
    throw new Error('Nintendo session_token: risposta senza token');
  }
  return accessTokenFor(session.session_token);
}

/** Rinnovo: una POST sola, e il session token resta quello. */
export function refreshNintendoTokens(sessionToken: string) {
  return accessTokenFor(sessionToken);
}

// --- Lo storico di gioco ---

export type NintendoPlayedTitle = {
  /** 16 esadecimali. Non è un id che IGDB conosca. */
  titleId: string;
  name: string;
  /**
   * Il codice hardware: `HAC` per la Switch 1, misurato. Quello della Switch 2
   * **non è misurato**: l'account di prova non ha giochi Switch 2.
   * `deviceType` è assente su tutte le righe viste.
   */
  platform: string | null;
  playtimeMinutes: number | null;
  lastPlayedAt: Date | null;
  firstPlayedAt: Date | null;
};

type PlayHistoryResponse = {
  playHistories?: Array<{
    titleId?: string;
    titleName?: string;
    platform?: string;
    totalPlayedMinutes?: number;
    firstPlayedAt?: string;
    lastPlayedAt?: string;
  }>;
};

const toDate = (value: string | undefined) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

/**
 * Tutti i giochi che l'account ha avviato, in **una richiesta**: non c'è
 * paginazione (37 titoli nel campione).
 *
 * Un 401 qui, dopo un access token appena rinnovato, vuol dire revocato mentre
 * giravamo: è lo stesso `NintendoAuthError` del rinnovo. Il client di
 * riferimento ritenta con l'`id_token`; non lo facciamo, perché sull'account
 * provato l'access token ha sempre bastato.
 */
export async function fetchNintendoPlayHistory(
  accessToken: string,
): Promise<NintendoPlayedTitle[]> {
  const response = await fetch(`${APP_URL}/api/v2.0/users/me/play_histories`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Gentry-Locale': LOCALE,
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new NintendoAuthError('Nintendo ha rifiutato il token');
    }
    throw new Error(`Nintendo play_histories: ${response.status}`);
  }

  const payload = (await response.json()) as PlayHistoryResponse;

  return (payload.playHistories ?? []).flatMap((title) =>
    title.titleId && title.titleName
      ? [
          {
            titleId: title.titleId,
            name: title.titleName,
            platform: title.platform ?? null,
            playtimeMinutes:
              typeof title.totalPlayedMinutes === 'number'
                ? title.totalPlayedMinutes
                : null,
            lastPlayedAt: toDate(title.lastPlayedAt),
            firstPlayedAt: toDate(title.firstPlayedAt),
          },
        ]
      : [],
  );
}

// --- Il profilo: paese e nickname, solo al collegamento ---

/**
 * Il profilo dell'account, per il paese e il nome leggibile.
 *
 * **L'endpoint è quello che la comunità documenta per questo token e non è
 * misurato da noi**: `GET /2.0.0/users/me` con lo scope `user`, che il nostro
 * login chiede. Per questo **non fa mai fallire il collegamento**: rende null e
 * si tira avanti, come `fetchGogUsername`. Senza paese l'import non perde lo
 * storico, salta solo le Virtual Game Cards, e lo dice.
 */
export async function fetchNintendoProfile(
  accessToken: string,
): Promise<{ country: string | null; nickname: string | null } | null> {
  try {
    const response = await fetch(
      'https://api.accounts.nintendo.com/2.0.0/users/me',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const profile = (await response.json()) as {
      country?: unknown;
      nickname?: unknown;
    };
    return {
      country:
        typeof profile.country === 'string' &&
        /^[A-Za-z]{2}$/.test(profile.country)
          ? profile.country.toUpperCase()
          : null,
      nickname:
        typeof profile.nickname === 'string' && profile.nickname
          ? profile.nickname
          : null,
    };
  } catch {
    return null;
  }
}

// --- Le Virtual Game Cards: la libreria digitale, anche mai avviata ---

/**
 * Il GraphQL del portale `accounts.nintendo.com/portal/vgcs`, su un host
 * `*.srv.nintendo.net` e **non** nintendo.com. Misurato il 06/10/2026: con
 * l'`id_token` del nostro login e senza cookie risponde 200.
 */
const VGC_URL = 'https://wb.lp1.savanna.srv.nintendo.net/graphql';

/**
 * Il client del portale, preso dalla sua richiesta. **Non è nostro e non è un
 * segreto** (sta nell'HTML che il portale serve a chiunque sia dentro), ma non so
 * se sia uguale per tutti gli account né se Nintendo lo cambi: Playnite lo legge
 * dalla pagina a ogni giro. Se un giorno il GraphQL risponde 401 su un token
 * fresco, è la prima riga da guardare.
 */
const SAVANNA_CLIENT_ID =
  'cb610bc1048f7abce1a9a81a5cdb9b63b2add68c8bf5a4616e5eb8ea27b9e7ba';

/** `shopId` 3 è «fuori dalla console», quello del portale web (anche in Playnite). */
const VGC_SHOP_ID = 3;

const VGC_PAGE_SIZE = 300;

/**
 * Il browser con cui il portale parla al GraphQL. Il GraphQL è fatto per essere
 * chiamato da una pagina di accounts.nintendo.com, quindi si presenta come tale:
 * **provato con l'origine e lo User-Agent del browser dell'utente**, non senza.
 * Seconda identità non nostra, dopo quella dell'app per i token: stesso rischio
 * di prodotto, e va scritto.
 */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

/** La query del portale, ridotta ai campi che ci servono. */
const VGC_QUERY = `
query getVgcsVgcs(
  $idToken: String!
  $country: CountryCode!
  $language: LanguageCode!
  $shopId: Int!
  $limit: Int!
  $nasLanguage: String!
  $offset: Int!
  $order: RequestableVgcViewOrder!
  $sortBy: RequestableVgcViewSortBy!
  $vgcViewType: VgcViewTypeInput
  $vgcViewStatus: VgcViewStatusInput
) @inContext(country: $country, language: $language, shopId: $shopId) {
  account {
    vgc {
      vgcViews(
        idToken: $idToken,
        limit: $limit,
        nasLanguage: $nasLanguage,
        offset: $offset,
        order: $order,
        sortBy: $sortBy,
        isHidden: false,
        vgcViewType: $vgcViewType,
        vgcViewStatus: $vgcViewStatus,
      ) {
        offsetInfo { total offset }
        views {
          applicationId
          applicationName
          apparentPlatform
          icon { url }
          ownerNaId
          userNaId
          isLending
          hasReleasedApplication
          hasReleasedAddOnContents
        }
      }
    }
  }
}
`;

export type NintendoVgcEntry = {
  /** 16 esadecimali, minuscoli: la stessa forma del `titleId` dello storico. */
  applicationId: string;
  name: string;
  /** `NX` (Switch) sulle 19 righe misurate; `OUNCE` è la Switch 2 secondo Playnite, **non misurato**. */
  platform: string | null;
  /**
   * C'è **il gioco**, non solo contenuti aggiuntivi. Misurato: *Zelda: Breath of
   * the Wild*, *Monster Hunter Rise* e *Mario + Rabbids: Sparks of Hope* sono voci
   * con `hasReleasedApplication: false` e solo `hasReleasedAddOnContents: true`:
   * l'aggiornamento o i DLC di un gioco che si ha altrove (nel caso di Zelda, in
   * cartuccia). Non sono una copia digitale del gioco.
   */
  hasApplication: boolean;
  ownerNaId: string | null;
  userNaId: string | null;
  isLending: boolean;
  /** Sostituito `${size}` con 512, una delle misure dichiarate (3, 128, 256, 512, 1024). */
  imageUrl: string | null;
};

type VgcResponse = {
  errors?: Array<{ message?: string }>;
  data?: {
    account?: {
      vgc?: {
        vgcViews?: {
          offsetInfo?: { total?: number };
          views?: Array<{
            applicationId?: string;
            applicationName?: string;
            apparentPlatform?: string;
            icon?: { url?: string | null } | null;
            ownerNaId?: string | null;
            userNaId?: string | null;
            isLending?: boolean;
            hasReleasedApplication?: boolean;
          }>;
        };
      };
    };
  };
};

/**
 * Le licenze digitali dell'account, a pagine da 300.
 *
 * 401 è un token rifiutato — appena rinnovato, quindi revocato mentre giravamo o
 * client del portale cambiato: stessa uscita del rinnovo fallito. Un errore
 * GraphQL dentro un 200 è invece **un guasto**, e **fa fallire l'import**: con le
 * Virtual Game Cards mancanti lo storico direbbe «fisico» di giochi che sono
 * digitali, e scriverlo sarebbe peggio che riprovare.
 */
export async function fetchNintendoVgc(
  idToken: string,
  country: string,
): Promise<NintendoVgcEntry[]> {
  const entries: NintendoVgcEntry[] = [];
  let offset = 0;

  // Il tetto fa da guardia a un `total` che non torna mai: non esiste una
  // libreria da seimila giochi, esiste un server che risponde male.
  for (let page = 0; page < 20; page++) {
    const response = await fetch(VGC_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        origin: 'https://accounts.nintendo.com',
        referer: 'https://accounts.nintendo.com/',
        'user-agent': BROWSER_USER_AGENT,
        'x-nintendo-savanna-client-id': SAVANNA_CLIENT_ID,
      },
      body: JSON.stringify({
        operationName: 'getVgcsVgcs',
        query: VGC_QUERY,
        variables: {
          idToken,
          country,
          // Inglese, come per PSN e Amazon: IGDB è scritto in inglese.
          language: 'en',
          nasLanguage: 'en-US',
          shopId: VGC_SHOP_ID,
          limit: VGC_PAGE_SIZE,
          offset,
          order: 'DESC',
          sortBy: 'ACTIVATED_DATE',
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 401) {
      throw new NintendoAuthError('Nintendo ha rifiutato il token');
    }
    if (!response.ok) {
      throw new Error(`Nintendo Virtual Game Cards: ${response.status}`);
    }

    const payload = (await response.json()) as VgcResponse;
    if (payload.errors?.length) {
      throw new Error(
        `Nintendo Virtual Game Cards: ${payload.errors[0]?.message ?? 'errore GraphQL'}`,
      );
    }

    const views = payload.data?.account?.vgc?.vgcViews;
    if (!views?.views) {
      throw new Error('Nintendo Virtual Game Cards: risposta incompleta');
    }

    for (const view of views.views) {
      if (!view.applicationId || !view.applicationName) continue;
      entries.push({
        applicationId: view.applicationId.toLowerCase(),
        name: view.applicationName,
        platform: view.apparentPlatform ?? null,
        hasApplication: view.hasReleasedApplication === true,
        ownerNaId: view.ownerNaId ?? null,
        userNaId: view.userNaId ?? null,
        isLending: view.isLending === true,
        imageUrl: view.icon?.url
          ? view.icon.url.replace('${size}', '512')
          : null,
      });
    }

    offset += VGC_PAGE_SIZE;
    if (offset >= (views.offsetInfo?.total ?? 0)) break;
  }

  return entries;
}
