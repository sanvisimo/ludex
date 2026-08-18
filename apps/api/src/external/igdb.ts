// Client IGDB. Sta fuori da `services/` perché è l'accesso a un servizio
// esterno, non logica di dominio: i servizi lo usano, non lo sono.
//
// L'autenticazione passa da Twitch: `client_credentials` restituisce un token
// applicativo che dura settimane. Va tenuto in memoria e rinnovato quando scade
// o quando IGDB risponde 401, mai richiesto a ogni ricerca.

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_URL = "https://api.igdb.com/v4";

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
    throw new Error("IGDB_CLIENT_ID e IGDB_CLIENT_SECRET non impostate nel .env");
  }
  return { clientId, clientSecret };
}

async function fetchToken() {
  const { clientId, clientSecret } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch(`${TOKEN_URL}?${params}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`IGDB: token rifiutato (${response.status})`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
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
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
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
      throw new Error(`IGDB ${endpoint}: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as T;
  });
}

type IgdbGame = {
  id: number;
  name: string;
  first_release_date?: number;
  game_type?: number;
  involved_companies?: {
    developer: boolean;
    company?: { name: string };
  }[];
};

// Da GET /v4/game_types. Il tipo si mostra solo quando NON è un gioco
// principale: serve a distinguere port, remake e bundle nella lista di scelta.
const GAME_TYPES: Record<number, string> = {
  1: "DLC",
  2: "Espansione",
  3: "Bundle",
  4: "Espansione standalone",
  5: "Mod",
  6: "Episodio",
  7: "Stagione",
  8: "Remake",
  9: "Remaster",
  10: "Edizione estesa",
  11: "Port",
  12: "Fork",
  13: "Pacchetto",
  14: "Aggiornamento",
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
  "fields name, first_release_date, game_type, involved_companies.developer, involved_companies.company.name;";

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
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
  );
}

export type IgdbSearchHit = {
  igdbId: number;
  name: string;
  releaseYear: number | null;
  developer: string | null;
  gameType: string | null;
};

function toHit(game: IgdbGame): IgdbSearchHit {
  const developer = game.involved_companies?.find((entry) => entry.developer)?.company?.name;

  return {
    igdbId: game.id,
    name: game.name,
    releaseYear: game.first_release_date
      ? new Date(game.first_release_date * 1000).getUTCFullYear()
      : null,
    developer: developer ?? null,
    gameType: game.game_type ? (GAME_TYPES[game.game_type] ?? null) : null,
  };
}

export async function searchIgdbGames(term: string, limit = 20): Promise<IgdbSearchHit[]> {
  const games = await query<IgdbGame[]>(
    "games",
    `search "${escapeSearchTerm(term)}"; ${SEARCH_FIELDS} ` +
      `where game_type != (${EXCLUDED_TYPES.join(",")}); limit ${limit};`,
  );
  return games.map(toHit);
}

export async function findIgdbGameById(igdbId: number): Promise<IgdbSearchHit | null> {
  const games = await query<IgdbGame[]>(
    "games",
    `where id = ${Math.trunc(igdbId)}; ${SEARCH_FIELDS} limit 1;`,
  );
  const game = games[0];
  return game ? toHit(game) : null;
}

// --- Enrichment (step 3): metadati completi, non la ricerca ---

const DETAIL_FIELDS = [
  "fields name, summary, first_release_date, aggregated_rating, aggregated_rating_count,",
  "cover.image_id, cover.width, cover.height,",
  "genres.id, genres.name, themes.id, themes.name,",
  "game_modes.id, game_modes.name, player_perspectives.id, player_perspectives.name;",
].join(" ");

type IgdbNamed = { id: number; name: string };

type IgdbGameDetail = {
  id: number;
  name: string;
  summary?: string;
  first_release_date?: number;
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  cover?: { image_id?: string; width?: number; height?: number };
  genres?: IgdbNamed[];
  themes?: IgdbNamed[];
  game_modes?: IgdbNamed[];
  player_perspectives?: IgdbNamed[];
};

export type IgdbAttribute = {
  kind: "genre" | "theme" | "game_mode" | "player_perspective";
  igdbId: number;
  name: string;
};

export type IgdbGameMetadata = {
  igdbId: number;
  name: string;
  summary: string | null;
  firstReleaseDate: Date | null;
  coverImageId: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  aggregatedRating: number | null;
  aggregatedRatingCount: number | null;
  attributes: IgdbAttribute[];
};

function collect(
  kind: IgdbAttribute["kind"],
  entries: IgdbNamed[] | undefined,
): IgdbAttribute[] {
  return (entries ?? []).map((entry) => ({ kind, igdbId: entry.id, name: entry.name }));
}

/**
 * Metadati completi per l'enrichment. Separato da `findIgdbGameById`, che serve
 * alla risoluzione sincrona dello step 2 e chiede molti meno campi: sono due usi
 * distinti di IGDB e vanno tenuti distinti.
 */
export async function fetchIgdbGameMetadata(igdbId: number): Promise<IgdbGameMetadata | null> {
  const games = await query<IgdbGameDetail[]>(
    "games",
    `where id = ${Math.trunc(igdbId)}; ${DETAIL_FIELDS} limit 1;`,
  );

  const game = games[0];
  if (!game) return null;

  return {
    igdbId: game.id,
    name: game.name,
    summary: game.summary ?? null,
    firstReleaseDate: game.first_release_date
      ? new Date(game.first_release_date * 1000)
      : null,
    coverImageId: game.cover?.image_id ?? null,
    coverWidth: game.cover?.width ?? null,
    coverHeight: game.cover?.height ?? null,
    aggregatedRating: game.aggregated_rating ?? null,
    aggregatedRatingCount: game.aggregated_rating_count ?? null,
    attributes: [
      ...collect("genre", game.genres),
      ...collect("theme", game.themes),
      ...collect("game_mode", game.game_modes),
      ...collect("player_perspective", game.player_perspectives),
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

const PLATFORM_FIELDS = "fields name, slug, alternative_name, abbreviation, generation;";

// 500 è il massimo che IGDB accetta. Le piattaforme sono un paio di centinaio,
// quindi in pratica basta un giro: si scorre comunque, per non dipendere da un
// conteggio che può crescere.
const PLATFORM_PAGE = 500;

export async function fetchIgdbPlatforms(): Promise<IgdbPlatform[]> {
  const collected: IgdbPlatform[] = [];

  for (let offset = 0; ; offset += PLATFORM_PAGE) {
    const page = await query<IgdbPlatformRow[]>(
      "platforms",
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
