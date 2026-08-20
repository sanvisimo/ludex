import type { Store } from '@repo/contracts/vocabulary';

import { chunk } from '../lib/chunk';

// Client IGDB. Sta fuori da `services/` perché è l'accesso a un servizio
// esterno, non logica di dominio: i servizi lo usano, non lo sono.
//
// L'autenticazione passa da Twitch: `client_credentials` restituisce un token
// applicativo che dura settimane. Va tenuto in memoria e rinnovato quando scade
// o quando IGDB risponde 401, mai richiesto a ogni ricerca.

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_URL = 'https://api.igdb.com/v4';

// IGDB consente 4 richieste al secondo. Le richieste vengono serializzate e
// distanziate: allo step 2 ne parte una per ricerca, ma allo step 3 il worker
// userà lo stesso client per l'enrichment in blocco.
const MIN_INTERVAL_MS = 250;

let cachedToken: { value: string; expiresAt: number } | null = null;
let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function credentials() {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'IGDB_CLIENT_ID e IGDB_CLIENT_SECRET non impostate nel .env',
    );
  }
  return { clientId, clientSecret };
}

async function fetchToken() {
  const { clientId, clientSecret } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const response = await fetch(`${TOKEN_URL}?${params}`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`IGDB: token rifiutato (${response.status})`);
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  // Un minuto di margine, così non si parte con un token che scade a metà richiesta.
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return Promise.resolve(cachedToken.value);
  }
  return fetchToken();
}

/** Serializza le chiamate e le distanzia, per non sforare il rate limit. */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  // La coda non deve fermarsi se una richiesta fallisce.
  queue = run.catch(() => undefined);
  return run;
}

function send(endpoint: string, body: string, token: string) {
  const { clientId } = credentials();
  return fetch(`${API_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body,
  });
}

async function query<T>(endpoint: string, body: string): Promise<T> {
  return schedule(async () => {
    let response = await send(endpoint, body, await getToken());

    // Token scaduto o revocato prima della sua scadenza dichiarata: si butta
    // la cache e si riprova una volta sola.
    if (response.status === 401) {
      cachedToken = null;
      response = await send(endpoint, body, await getToken());
    }

    if (!response.ok) {
      throw new Error(
        `IGDB ${endpoint}: ${response.status} ${await response.text()}`,
      );
    }

    return (await response.json()) as T;
  });
}

type IgdbGame = {
  id: number;
  name: string;
  first_release_date?: number;
  game_type?: number;
  total_rating_count?: number;
  involved_companies?: {
    developer: boolean;
    company?: { name: string };
  }[];
};

// Da GET /v4/game_types. Il tipo si mostra solo quando NON è un gioco
// principale: serve a distinguere port, remake e bundle nella lista di scelta.
const GAME_TYPES: Record<number, string> = {
  1: 'DLC',
  2: 'Espansione',
  3: 'Bundle',
  4: 'Espansione standalone',
  5: 'Mod',
  6: 'Episodio',
  7: 'Stagione',
  8: 'Remake',
  9: 'Remaster',
  10: 'Edizione estesa',
  11: 'Port',
  12: 'Fork',
  13: 'Pacchetto',
  14: 'Aggiornamento',
};

// Tipi esclusi dalla ricerca: non sono cose che si possiedono in una libreria.
// Come fa Playnite, che cercando "Hollow Knight" non mostra mod.
//
// Si escludono solo questi: remake, remaster, port ed espansioni restano, perché
// sono esattamente ciò che va distinto (i tre "Resident Evil 4" diversi).
// Il filtro sta nella query e non qui, così il limite di 20 risultati non viene
// consumato da roba che poi si butta.
//
// Nota: IGDB rifiuta `sort` insieme a `search` (406, ordina per rilevanza), ma
// `where` insieme a `search` lo accetta.
const EXCLUDED_TYPES = [
  5, // mod
  12, // fork
  14, // aggiornamento
];

const SEARCH_FIELDS =
  'fields name, first_release_date, game_type, total_rating_count,' +
  ' involved_companies.developer, involved_companies.company.name;';

/**
 * Il valore finisce dentro una stringa apicalypse fra virgolette: vanno
 * neutralizzati backslash e virgolette, o l'utente potrebbe chiudere la stringa
 * e appendere clausole alla query.
 */
function escapeSearchTerm(value: string) {
  return (
    value
      // I caratteri di controllo qui sono voluti: sono proprio ciò che va ripulito.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
  );
}

export type IgdbSearchHit = {
  igdbId: number;
  name: string;
  releaseYear: number | null;
  developer: string | null;
  gameType: string | null;
  /**
   * Quante recensioni aggregate ha la scheda. Non è un voto: è **quanto quella
   * scheda è vissuta**, e serve a distinguere un gioco da un doppione vuoto.
   *
   * IGDB è pieno di schede omonime senza niente dentro: cercando «Inside» ne
   * escono tre con lo stesso titolo esatto, e solo una ha 1666 recensioni. Fra
   * titoli identici è l'unico segnale che resta quando il negozio non dà
   * nemmeno l'anno — ed è il caso di Epic.
   */
  totalRatingCount: number | null;
};

function toHit(game: IgdbGame): IgdbSearchHit {
  const developer = game.involved_companies?.find((entry) => entry.developer)
    ?.company?.name;

  return {
    igdbId: game.id,
    name: game.name,
    releaseYear: game.first_release_date
      ? new Date(game.first_release_date * 1000).getUTCFullYear()
      : null,
    developer: developer ?? null,
    gameType: game.game_type ? (GAME_TYPES[game.game_type] ?? null) : null,
    totalRatingCount: game.total_rating_count ?? null,
  };
}

export async function searchIgdbGames(
  term: string,
  limit = 20,
): Promise<IgdbSearchHit[]> {
  const games = await query<IgdbGame[]>(
    'games',
    `search "${escapeSearchTerm(term)}"; ${SEARCH_FIELDS} ` +
      `where game_type != (${EXCLUDED_TYPES.join(',')}); limit ${limit};`,
  );
  return games.map(toHit);
}

export async function findIgdbGameById(
  igdbId: number,
): Promise<IgdbSearchHit | null> {
  const games = await query<IgdbGame[]>(
    'games',
    `where id = ${Math.trunc(igdbId)}; ${SEARCH_FIELDS} limit 1;`,
  );
  const game = games[0];
  return game ? toHit(game) : null;
}

// --- Enrichment (step 3): metadati completi, non la ricerca ---

const DETAIL_FIELDS = [
  'fields name, slug, summary, first_release_date, aggregated_rating, aggregated_rating_count,',
  'cover.image_id, cover.width, cover.height,',
  'genres.id, genres.name, themes.id, themes.name,',
  'game_modes.id, game_modes.name, player_perspectives.id, player_perspectives.name,',
  // Gli id che il gioco ha sugli altri negozi. Non costano una richiesta in
  // più: sono due campi su una chiamata che si fa comunque.
  'external_games.uid, external_games.external_game_source;',
].join(' ');

type IgdbNamed = { id: number; name: string };

type IgdbGameDetail = {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  first_release_date?: number;
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  cover?: { image_id?: string; width?: number; height?: number };
  genres?: IgdbNamed[];
  themes?: IgdbNamed[];
  game_modes?: IgdbNamed[];
  player_perspectives?: IgdbNamed[];
  external_games?: { uid?: string; external_game_source?: number }[];
};

export type IgdbAttribute = {
  kind: 'genre' | 'theme' | 'game_mode' | 'player_perspective';
  igdbId: number;
  name: string;
};

export type IgdbGameMetadata = {
  igdbId: number;
  name: string;
  /** Lo slug IGDB: l'aggancio a Wikidata, e da lì a OpenCritic. */
  slug: string | null;
  summary: string | null;
  firstReleaseDate: Date | null;
  coverImageId: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  aggregatedRating: number | null;
  aggregatedRatingCount: number | null;
  attributes: IgdbAttribute[];
  /**
   * Gli id che questo gioco ha sui negozi che sappiamo tradurre.
   *
   * Serve soprattutto per **l'appid Steam**, che è la prova d'identità su cui
   * poggiano HLTB (l'appid dichiarato dalla pagina) e Metacritic (lo slug
   * dichiarato dalla scheda del negozio). Fino al 9a l'appid ce l'avevano solo i
   * giochi arrivati da un import Steam; con Epic, GOG e Amazon ne è rimasto
   * senza il 68% del catalogo, e con lui senza quelle due strade.
   *
   * È identità, non possesso: dire «questo gioco su Steam si chiama 638990» non
   * dice che l'utente ce l'abbia. Il possesso sta in `ownerships`.
   */
  storeIds: { store: Store; externalId: string }[];
};

function collect(
  kind: IgdbAttribute['kind'],
  entries: IgdbNamed[] | undefined,
): IgdbAttribute[] {
  return (entries ?? []).map((entry) => ({
    kind,
    igdbId: entry.id,
    name: entry.name,
  }));
}

/**
 * Metadati completi per l'enrichment. Separato da `findIgdbGameById`, che serve
 * alla risoluzione sincrona dello step 2 e chiede molti meno campi: sono due usi
 * distinti di IGDB e vanno tenuti distinti.
 */
export async function fetchIgdbGameMetadata(
  igdbId: number,
): Promise<IgdbGameMetadata | null> {
  const games = await query<IgdbGameDetail[]>(
    'games',
    `where id = ${Math.trunc(igdbId)}; ${DETAIL_FIELDS} limit 1;`,
  );

  const game = games[0];
  if (!game) return null;

  return {
    igdbId: game.id,
    name: game.name,
    slug: game.slug ?? null,
    summary: game.summary ?? null,
    firstReleaseDate: game.first_release_date
      ? new Date(game.first_release_date * 1000)
      : null,
    coverImageId: game.cover?.image_id ?? null,
    coverWidth: game.cover?.width ?? null,
    coverHeight: game.cover?.height ?? null,
    aggregatedRating: game.aggregated_rating ?? null,
    aggregatedRatingCount: game.aggregated_rating_count ?? null,
    // Solo i negozi che sappiamo tradurre: IGDB rende anche GiantBomb, Twitch e
    // YouTube, che non sono posti da cui si compra.
    storeIds: (game.external_games ?? []).flatMap(
      (row): { store: Store; externalId: string }[] => {
        if (row.external_game_source === undefined || !row.uid) return [];
        const store = STORE_BY_IGDB_SOURCE.get(row.external_game_source);
        return store ? [{ store, externalId: row.uid }] : [];
      },
    ),
    attributes: [
      ...collect('genre', game.genres),
      ...collect('theme', game.themes),
      ...collect('game_mode', game.game_modes),
      ...collect('player_perspective', game.player_perspectives),
    ],
  };
}

// --- Piattaforme: arnese di riconciliazione, non codice di runtime ---
//
// La nostra tabella `platforms` è seedata da Playnite e la colonna `igdb_id`
// arriva dallo stesso file, presa sulla fiducia: mai verificata contro IGDB, con
// almeno un id duplicato fra due righe. Questo serve allo script di audit che
// mette le due liste a confronto. Non lo chiama nessun servizio.

export type IgdbPlatform = {
  igdbId: number;
  name: string;
  slug: string;
  alternativeName: string | null;
  abbreviation: string | null;
  generation: number | null;
};

type IgdbPlatformRow = {
  id: number;
  name: string;
  slug: string;
  alternative_name?: string;
  abbreviation?: string;
  generation?: number;
};

const PLATFORM_FIELDS =
  'fields name, slug, alternative_name, abbreviation, generation;';

// 500 è il massimo che IGDB accetta. Le piattaforme sono un paio di centinaio,
// quindi in pratica basta un giro: si scorre comunque, per non dipendere da un
// conteggio che può crescere.
const PLATFORM_PAGE = 500;

export async function fetchIgdbPlatforms(): Promise<IgdbPlatform[]> {
  const collected: IgdbPlatform[] = [];

  for (let offset = 0; ; offset += PLATFORM_PAGE) {
    const page = await query<IgdbPlatformRow[]>(
      'platforms',
      `${PLATFORM_FIELDS} sort id asc; limit ${PLATFORM_PAGE}; offset ${offset};`,
    );

    collected.push(
      ...page.map((row) => ({
        igdbId: row.id,
        name: row.name,
        slug: row.slug,
        alternativeName: row.alternative_name ?? null,
        abbreviation: row.abbreviation ?? null,
        generation: row.generation ?? null,
      })),
    );

    if (page.length < PLATFORM_PAGE) return collected;
  }
}

// --- Risoluzione per id esterno (step 4, generalizzata al 9a) ---

/**
 * Gli id delle sorgenti su IGDB, da GET /v4/external_game_sources.
 *
 * Il filtro sulla sorgente non è prudenziale, è obbligatorio: gli `uid` sono
 * unici solo dentro la propria sorgente, e "220" è Half-Life 2 su Steam ma anche
 * altre due cose su GiantBomb e Twitch.
 *
 * **Non tutti i negozi ci sono**, ed è la cosa che decide quanto costa un
 * import. Righe censite su IGDB al momento dello step 9:
 *
 *     Steam    174.084      GOG        9.340
 *     Microsoft 15.547      Amazon ADG   678
 *     PS Store  15.322      Epic      10.145
 *
 * Per EA, Ubisoft, Battle.net e Nintendo **non esiste alcuna sorgente**, e
 * Amazon ne ha una vuota in pratica: quei negozi si risolvono solo per nome.
 *
 * **Epic è assente di proposito, ed è il caso che inganna**: la sorgente 26
 * esiste e ha diecimila righe, ma i suoi uid sono gli offer id del negozio,
 * mentre le API del launcher danno `catalogItemId`, `namespace` e `productId`.
 * Su una libreria vera di 705 giochi nessuno dei tre trova niente — zero su
 * 705, misurato. Rimetterla qui costerebbe una richiesta per non trovare mai
 * nulla.
 *
 * **PSN è uscito di qui col 9b, ed è la stessa trappola di Epic vista due
 * volte.** La sorgente 36 esiste e ha quindicimila righe, ma i suoi uid sono i
 * `conceptId` numerici dello store — *Dying Light 2* è `232374` — mentre la
 * libreria dell'utente porta `titleId` come `CUSA12555_00`. Il campo
 * `conceptId` c'è nella risposta di Sony e arriva **nullo su ogni riga**: 336
 * su 336, misurato. Tenerla qui costava una richiesta per non trovare mai
 * niente.
 *
 * Un negozio assente da questa mappa è quindi legittimo, non un buco da tappare:
 * dice «questa libreria si risolve per nome».
 */
const IGDB_SOURCES: Partial<Record<Store, number>> = {
  steam: 1,
  gog: 5,
  xbox: 11,
};

/** L'id della sorgente IGDB per un negozio, o null se IGDB non la mappa. */
export function igdbSourceFor(store: Store): number | null {
  return IGDB_SOURCES[store] ?? null;
}

/** La direzione opposta: da una sorgente IGDB al nostro negozio, se lo è. */
const STORE_BY_IGDB_SOURCE = new Map<number, Store>(
  Object.entries(IGDB_SOURCES).map(([store, source]) => [
    source as number,
    store as Store,
  ]),
);

// IGDB accetta al massimo 500 risultati per richiesta. Su una libreria vera di
// 452 giochi bastano quattro richieste: la risoluzione non è il collo di
// bottiglia dell'import, e non va confusa con l'enrichment, che resta un job per
// gioco.
const EXTERNAL_PAGE = 500;

export type IgdbExternalMatch = { igdbId: number; name: string };

type IgdbExternalGame = {
  uid: string;
  // Espanso: una richiesta sola dà l'id **e** il nome vero del gioco, invece di
  // quello che gli dà il negozio.
  game?: { id: number; name: string };
};

/**
 * Mappa id del negozio → gioco IGDB, in blocco.
 *
 * Gli id che IGDB non conosce semplicemente non compaiono nella mappa: sta al
 * chiamante decidere cosa farne. Quanti siano dipende moltissimo dal negozio, e
 * sono numeri misurati su librerie vere: su Steam l'1%, su GOG il 5,5% (24 voci
 * su 435, per lo più artbook e prologhi), su Amazon **il 100%**.
 *
 * Con un negozio che IGDB non mappa affatto rende una mappa vuota senza uscire
 * in rete: chiamarla è sempre lecito, e il chiamante ha già la strada del match
 * per nome per tutto ciò che non trova.
 */
export async function findIgdbGamesByExternalIds(
  store: Store,
  externalIds: string[],
): Promise<Map<string, IgdbExternalMatch>> {
  const matches = new Map<string, IgdbExternalMatch>();
  const source = igdbSourceFor(store);
  if (source === null || externalIds.length === 0) return matches;

  for (const page of chunk(externalIds, EXTERNAL_PAGE)) {
    // Gli id dei negozi sono spesso numerici, ma finiscono dentro una stringa
    // apicalypse: si passano dallo stesso filtro delle ricerche.
    const uids = page.map((id) => `"${escapeSearchTerm(id)}"`).join(',');

    const rows = await query<IgdbExternalGame[]>(
      'external_games',
      `fields uid, game, game.name;` +
        ` where external_game_source = ${source} & uid = (${uids});` +
        ` limit ${EXTERNAL_PAGE};`,
    );

    for (const row of rows) {
      if (!row.game) continue;
      matches.set(row.uid, { igdbId: row.game.id, name: row.game.name });
    }
  }

  return matches;
}
