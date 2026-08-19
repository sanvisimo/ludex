// Client Steam Web API. Come igdb.ts sta fuori da `services/`: è l'accesso a un
// servizio esterno, non logica di dominio.
//
// Nessuna coda e nessun rate limit da rispettare: l'import di una libreria è
// **una** richiesta, e Steam concede centomila chiamate al giorno per chiave.
// La chiave è dell'applicazione, non dell'utente: identifica noi, e per leggere
// la libreria altrui basta che il profilo sia pubblico.

const OWNED_GAMES_URL =
  "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";

export type SteamLibraryEntry = {
  /** L'appid, come stringa: è la forma in cui vive in `external_ids`. */
  appId: string;
  name: string;
  playtimeMinutes: number;
  /** Null se non l'ha mai avviato: Steam manda 0, che come data non vuol dire nulla. */
  lastPlayedAt: Date | null;
};

/**
 * Steam risponde 200 anche quando non può dirti niente.
 *
 * Profilo privato, "dettagli dei giochi" nascosti, SteamID inesistente: in tutti
 * e tre i casi il corpo è `{"response":{}}`, senza `game_count`. Una libreria
 * pubblica ma vuota invece manda `game_count: 0`. È l'unico modo per distinguere
 * "non posso vedere" da "non ha giochi", e le due cose vanno dette all'utente in
 * modo diverso.
 */
export class SteamLibraryNotVisibleError extends Error {
  constructor(steamId: string) {
    super(
      `Steam non espone la libreria di ${steamId}: profilo privato, dettagli dei giochi nascosti, o SteamID inesistente`,
    );
    this.name = "SteamLibraryNotVisibleError";
  }
}

type OwnedGamesResponse = {
  response?: {
    game_count?: number;
    games?: {
      appid: number;
      name?: string;
      playtime_forever?: number;
      rtime_last_played?: number;
    }[];
  };
};

function apiKey() {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new Error("STEAM_API_KEY non impostata nel .env");
  return key;
}

export async function fetchSteamLibrary(steamId: string): Promise<SteamLibraryEntry[]> {
  const url = new URL(OWNED_GAMES_URL);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("steamid", steamId);
  // Senza `include_appinfo` tornano solo gli appid, e i nomi servono: sono
  // l'unica cosa mostrabile per le voci che non si risolvono.
  url.searchParams.set("include_appinfo", "1");
  // I free-to-play giocati fanno parte della libreria a tutti gli effetti.
  url.searchParams.set("include_played_free_games", "1");

  const response = await fetch(url);
  if (!response.ok) {
    // 403 = chiave sbagliata o revocata. Non è colpa dell'utente e non va
    // confuso con un profilo privato.
    throw new Error(`Steam GetOwnedGames: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as OwnedGamesResponse;
  if (body.response?.game_count === undefined) {
    throw new SteamLibraryNotVisibleError(steamId);
  }

  return (body.response.games ?? []).map((game) => ({
    appId: String(game.appid),
    // Il nome manca solo su appid ritirati dallo store; l'appid è comunque
    // l'identità, quindi la voce non si butta.
    name: game.name?.trim() || `App ${game.appid}`,
    playtimeMinutes: game.playtime_forever ?? 0,
    lastPlayedAt: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null,
  }));
}

const RESOLVE_VANITY_URL = "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/";

// Uno SteamID64 è sempre 17 cifre e comincia per 7656119.
const STEAM_ID_64 = /^\d{17}$/;
// Le due forme di URL di profilo: /profiles/<steamid64> e /id/<nome scelto>.
const PROFILE_URL = /steamcommunity\.com\/(profiles|id)\/([^/?#]+)/i;

export class SteamProfileNotFoundError extends Error {
  constructor(input: string) {
    super(`Nessun profilo Steam per "${input}"`);
    this.name = "SteamProfileNotFoundError";
  }
}

async function resolveVanity(vanity: string) {
  const url = new URL(RESOLVE_VANITY_URL);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("vanityurl", vanity);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Steam ResolveVanityURL: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { response?: { success?: number; steamid?: string } };
  // success 1 = trovato, 42 = nessuna corrispondenza. Non è un errore HTTP.
  if (body.response?.success !== 1 || !body.response.steamid) {
    throw new SteamProfileNotFoundError(vanity);
  }
  return body.response.steamid;
}

/**
 * Da quello che l'utente incolla allo SteamID64.
 *
 * Accetta le tre forme che uno ha davvero sotto mano: l'URL del profilo copiato
 * dalla barra del browser (nelle due varianti che Steam usa), lo SteamID64 nudo,
 * o il solo nome scelto. Chiedere «incolla il tuo SteamID64» e basta vorrebbe
 * dire mandare l'utente a cercarlo, perché su Steam non è in vista da nessuna
 * parte.
 */
export async function resolveSteamId(input: string): Promise<string> {
  const trimmed = input.trim();

  if (STEAM_ID_64.test(trimmed)) return trimmed;

  const fromUrl = PROFILE_URL.exec(trimmed);
  if (fromUrl) {
    const [, kind, value] = fromUrl;
    if (kind === "profiles") {
      if (!STEAM_ID_64.test(value!)) throw new SteamProfileNotFoundError(trimmed);
      return value!;
    }
    return resolveVanity(value!);
  }

  // Né URL né id: l'ultima possibilità sensata è che sia il nome scelto.
  return resolveVanity(trimmed);
}
