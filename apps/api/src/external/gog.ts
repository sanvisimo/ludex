// Client GOG. Come igdb.ts e steam.ts sta fuori da `services/`: è l'accesso a un
// servizio esterno, non logica di dominio.
//
// A differenza di Steam la credenziale è **dell'utente**, non nostra: un refresh
// token per account collegato. Chi lo tiene legge quella libreria, e per questo
// vive cifrato in `store_accounts.credentials`.
//
// Il `client_id` e il `client_secret` qui sotto sono quelli del client GOG
// Galaxy. Non sono un segreto: stanno nella documentazione pubblica delle API
// GOG e nel codice di gogdl, che è il pezzo con cui Heroic parla a GOG. Non
// esiste un programma per sviluppatori terzi da cui averne di propri.

const CLIENT_ID = '46899977096215655';
const CLIENT_SECRET =
  '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9';

/**
 * L'unico `redirect_uri` ammesso, e non è una nostra scelta.
 *
 * GOG valida il redirect contro la lista registrata per quel `client_id`, e la
 * lista contiene solo suoi indirizzi: con uno nostro risponde
 * `redirect_uri_mismatch` — **dopo** il login riuscito, quindi non lo si scopre
 * senza provare fino in fondo. Verificato, non supposto: non riproporlo.
 *
 * La conseguenza è il gesto che l'utente deve fare: atterra su una pagina di
 * GOG con il codice nella barra degli indirizzi e la incolla in Ludex. Vedi
 * `parseGogAuthCode`.
 */
const REDIRECT_URI = 'https://embed.gog.com/on_login_success?origin=client';

const AUTH_URL = 'https://auth.gog.com/auth';
const TOKEN_URL = 'https://auth.gog.com/token';
const LIBRARY_URL = 'https://embed.gog.com/account/getFilteredProducts';

/** L'indirizzo su cui mandare l'utente a fare il login. */
export function gogLoginUrl() {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('layout', 'client2');
  return url.toString();
}

/**
 * Un collegamento che non si aggiusta da sé: il credenziale è morto e l'unica
 * via d'uscita è che l'utente rifaccia il login.
 *
 * Distinto da un errore qualunque perché il chiamante ci fa una cosa diversa —
 * `status: 'needs_reauth'` invece di un job che riproverà a vuoto per sempre.
 */
export class GogAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GogAuthError';
  }
}

export type GogCredentials = {
  accessToken: string;
  refreshToken: string;
  /** Epoch in millisecondi. L'access token dura un'ora. */
  expiresAt: number;
  /** L'id numerico dell'account GOG. */
  userId: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: string;
  error?: string;
  error_description?: string;
};

async function requestToken(
  params: Record<string, string>,
): Promise<GogCredentials> {
  const url = new URL(TOKEN_URL);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('client_secret', CLIENT_SECRET);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);
  const body = (await response
    .json()
    .catch(() => null)) as TokenResponse | null;

  if (!response.ok) {
    // `invalid_grant` è definitivo: il codice è scaduto o già speso, oppure il
    // refresh token non vale più. Riprovare non cambia nulla.
    if (body?.error === 'invalid_grant') {
      throw new GogAuthError(
        body.error_description ?? 'GOG ha rifiutato il credenziale',
      );
    }
    throw new Error(
      `GOG token: ${response.status} ${JSON.stringify(body) || ''}`,
    );
  }

  if (!body?.access_token || !body.refresh_token) {
    throw new Error('GOG token: risposta senza token');
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    // Un minuto di margine, come per il token IGDB: non si parte con un token
    // che scade a metà import.
    expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
    userId: body.user_id ?? '',
  };
}

/**
 * Il nome utente GOG, per non mostrare `50771470519354436`.
 *
 * Lo scambio del token non lo dà — rende solo l'id — e `userData.json` è
 * l'unico posto dove GOG dice qualcosa di leggibile. Misurato: risponde 200 con
 * `username`, `email` e `avatar`.
 *
 * **Attenzione all'id**: `userData.json` porta un `userId` che *non* è quello
 * che salviamo. Il nostro `externalAccountId` viene dallo scambio del token ed è
 * il `galaxyUserId`; il campo `userId` di qui è un altro numero. Di questa
 * risposta si prende il nome e nient'altro, o l'identità dell'account
 * cambierebbe sotto ai possessi che ci puntano.
 *
 * Rende `null` invece di alzare, come l'equivalente Steam: è decorazione, e non
 * deve far fallire un collegamento riuscito.
 */
export async function fetchGogUsername(
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await fetch('https://embed.gog.com/userData.json', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { username?: string };
    return body.username ?? null;
  } catch {
    return null;
  }
}

/**
 * Da quello che l'utente incolla al codice di autorizzazione.
 *
 * Accetta l'URL intero di atterraggio o il solo codice, per la stessa ragione
 * per cui `resolveSteamId` accetta tre forme: si prende quello che l'utente ha
 * davvero sotto mano, che è la barra degli indirizzi copiata di peso.
 */
export function parseGogAuthCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).searchParams.get('code');
    } catch {
      return null;
    }
  }

  // Un codice nudo: GOG li fa lunghi e in base64url, senza spazi.
  return /^[\w-]{20,}$/.test(trimmed) ? trimmed : null;
}

/** Primo collegamento: il codice incollato diventa una coppia di token. */
export function exchangeGogCode(code: string) {
  return requestToken({
    grant_type: 'authorization_code',
    code,
    // Deve combaciare con quello usato per il login, o GOG rifiuta lo scambio.
    redirect_uri: REDIRECT_URI,
  });
}

/** Rinnovo silenzioso: è ciò che rende il copia-incolla un gesto solo. */
export function refreshGogTokens(refreshToken: string) {
  return requestToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export type GogLibraryEntry = {
  /** Il product id, come stringa: è la forma in cui vive in `external_ids`. */
  externalId: string;
  name: string;
  /**
   * L'anno che GOG dichiara. Serve solo al match per nome, per le voci che IGDB
   * non mappa: è ciò che separa un gioco dal suo remake.
   *
   * Contrariamente a quanto si direbbe **non è la data di messa in vendita su
   * GOG**, è l'uscita del gioco: nel catalogo *Akalabeth* è datato 1979, che è
   * l'anno vero, mentre IGDB dice 1998.
   */
  releaseYear: number | null;
  /**
   * Il percorso della pagina del gioco sul sito, es. `/en/game/bioshock_remastered`.
   *
   * È l'`url` del prodotto e **non** lo `slug`: i due coincidono quasi
   * sempre, ma non sempre — BioShock Remastered ha `slug`
   * `bioshock_remastered_game`, e il link costruito da lì finisce sull'elenco
   * dei giochi. Qualche prodotto l'`url` non ce l'ha: nullo, e il link porta
   * alla libreria dell'utente. Misurato in `docs/negozi.md`.
   */
  storePage: string | null;
  /**
   * La copertina verticale. GOG manda solo il percorso senza protocollo e senza
   * suffisso (`//images-1.gog-statics.com/<hash>`), e il formato lo si sceglie
   * aggiungendolo: `_glx_vertical_cover.webp` è quello da copertina, provato
   * aperto. Nulla se il prodotto non ha immagine.
   */
  imageUrl: string | null;
};

type FilteredProductsResponse = {
  totalPages?: number;
  products?: {
    id: number;
    title?: string;
    url?: string;
    image?: string;
    isGame?: boolean;
    isMovie?: boolean;
    // Non un timestamp: `{ date: "2018-12-13 00:00:00.000000", … }`.
    releaseDate?: { date?: string } | null;
  }[];
};

function releaseYearOf(product: { releaseDate?: { date?: string } | null }) {
  const raw = product.releaseDate?.date;
  if (!raw) return null;
  const year = new Date(raw.replace(' ', 'T')).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

/** `//images-1.gog-statics.com/<hash>` → l'URL della copertina verticale. */
export function gogCoverUrl(image: string | null | undefined): string | null {
  if (!image) return null;
  const base = image.startsWith('//') ? `https:${image}` : image;
  return base.startsWith('https://') ? `${base}_glx_vertical_cover.webp` : null;
}

/**
 * La libreria dell'utente.
 *
 * Si usa `getFilteredProducts` e **non** `user/data/games`, che pure sarebbe una
 * richiesta sola: quello rende gli id di tutto ciò che l'account possiede — DLC
 * e film compresi — mentre questo rende i giochi base con il titolo accanto. Su
 * una libreria vera sono 781 contro 435, e il titolo serve comunque per le voci
 * che non si risolvono.
 *
 * **Niente ore giocate**: l'API dell'account non le espone. Playnite le prende
 * dalla pagina del profilo, che vuole la sessione web del browser e non questo
 * token.
 */
export async function fetchGogLibrary(
  accessToken: string,
): Promise<GogLibraryEntry[]> {
  const entries: GogLibraryEntry[] = [];

  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const url = new URL(LIBRARY_URL);
    // mediaType 1 = giochi, 2 = film.
    url.searchParams.set('mediaType', '1');
    url.searchParams.set('page', String(page));

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      throw new GogAuthError('GOG ha rifiutato il token di accesso');
    }
    if (!response.ok) {
      throw new Error(`GOG getFilteredProducts: ${response.status}`);
    }

    const body = (await response.json()) as FilteredProductsResponse;
    totalPages = body.totalPages ?? 1;

    for (const product of body.products ?? []) {
      if (product.isMovie) continue;
      entries.push({
        externalId: String(product.id),
        name: product.title?.trim() || `GOG ${product.id}`,
        releaseYear: releaseYearOf(product),
        // `url` e non `slug`: vedi `storePage` qui sopra.
        storePage: product.url?.startsWith('/') ? product.url : null,
        imageUrl: gogCoverUrl(product.image),
      });
    }
  }

  return entries;
}

type GalaxyReleasesResponse = {
  items?: {
    /** `gog`, ma anche `steam`, `epic`, `psn`…: Galaxy integra gli altri negozi. */
    platform_id?: string;
    /** Il product id, lo stesso di `getFilteredProducts`. */
    external_id?: string | number;
    /** Secondi dall'epoch. */
    owned_since?: number | null;
    date_created?: number | null;
  }[];
  next_page_token?: string | null;
};

/**
 * Quando ogni gioco è entrato nella libreria, per product id.
 *
 * `getFilteredProducts` non lo dice: lo dice la libreria di **Galaxy**, un'altra
 * API con lo stesso token. Porta anche i giochi degli altri negozi che Galaxy
 * integra, e di quelli qui non si tiene niente: la loro data è quando Galaxy li
 * ha visti, non quando li hai comprati.
 *
 * Le date sono due, e misurate non valgono uguale. `owned_since` è la data vera
 * ma c'è su 344 giochi su 442; `date_created` c'è sempre ma non va prima del
 * 20/04/2019, quando Galaxy ha registrato gli acquisti vecchi — 23 giochi su
 * quel giorno solo. Quindi la prima, e la seconda dove la prima manca.
 */
export async function fetchGogAcquiredDates(
  accessToken: string,
  galaxyUserId: string,
): Promise<Map<string, Date>> {
  const dates = new Map<string, Date>();
  let pageToken: string | null = null;

  do {
    const url = new URL(
      `https://galaxy-library.gog.com/users/${galaxyUserId}/releases`,
    );
    if (pageToken) url.searchParams.set('page_token', pageToken);

    const response: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      throw new GogAuthError('GOG ha rifiutato il token di accesso');
    }
    if (!response.ok) {
      throw new Error(`GOG galaxy-library: ${response.status}`);
    }

    const body = (await response.json()) as GalaxyReleasesResponse;

    for (const item of body.items ?? []) {
      if (item.platform_id !== 'gog' || item.external_id == null) continue;
      const seconds = item.owned_since || item.date_created;
      if (!seconds) continue;
      dates.set(String(item.external_id), new Date(seconds * 1000));
    }

    pageToken = body.next_page_token || null;
  } while (pageToken);

  return dates;
}
