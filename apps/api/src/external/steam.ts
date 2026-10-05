// Client Steam Web API. Come igdb.ts sta fuori da `services/`: è l'accesso a un
// servizio esterno, non logica di dominio.
//
// Nessuna coda e nessun rate limit da rispettare: l'import di una libreria è
// **una** richiesta, e Steam concede centomila chiamate al giorno per chiave.
// La chiave è dell'applicazione, non dell'utente: identifica noi, e per leggere
// la libreria altrui basta che il profilo sia pubblico.

const OWNED_GAMES_URL =
  'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/';

export type SteamLibraryEntry = {
  /**
   * L'appid, come stringa: è la forma in cui vive in `external_ids`.
   *
   * Si chiama `externalId` e non `appId` perché dal 9a questa è una
   * `LibraryEntry` come quelle di GOG e Amazon, e l'import che la consuma è lo
   * stesso per tutti i negozi.
   */
  externalId: string;
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
      `Steam non espone la libreria di ${steamId}: profilo privato, dettagli dei giochi nascosti, o SteamID inesistente. ` +
        'Rendi pubblici il profilo e i dettagli dei giochi, oppure accedi con Steam.',
    );
    this.name = 'SteamLibraryNotVisibleError';
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
  if (!key) throw new Error('STEAM_API_KEY non impostata nel .env');
  return key;
}

/**
 * Steam ha rifiutato il token, o la chiave dove non vale.
 *
 * Distinto da un errore qualunque perché il chiamante ci fa una cosa diversa:
 * con un token di un utente che ha fatto il login vuol dire che il credenziale
 * è morto e va rifatto, mentre un 500 è Steam in affanno e il job riprova.
 *
 * Il messaggio porta lo stato e **mai l'URL**, che contiene il token.
 */
export class SteamUnauthorizedError extends Error {
  constructor(
    what: string,
    readonly status: number,
  ) {
    super(`Steam ${what}: accesso rifiutato (${status})`);
    this.name = 'SteamUnauthorizedError';
  }
}

/**
 * La libreria propria, con la chiave (profilo pubblico) o, se c'è un token, con
 * quello (9f): a profilo privato la chiave risponde vuota, mentre il token è
 * l'utente stesso e vede la sua libreria come la vede l'app.
 */
export async function fetchSteamLibrary(
  steamId: string,
  accessToken?: string,
): Promise<SteamLibraryEntry[]> {
  const url = new URL(OWNED_GAMES_URL);
  if (accessToken) url.searchParams.set('access_token', accessToken);
  else url.searchParams.set('key', apiKey());
  url.searchParams.set('steamid', steamId);
  // Senza `include_appinfo` tornano solo gli appid, e i nomi servono: sono
  // l'unica cosa mostrabile per le voci che non si risolvono.
  url.searchParams.set('include_appinfo', '1');
  // I free-to-play giocati fanno parte della libreria a tutti gli effetti.
  url.searchParams.set('include_played_free_games', '1');

  const response = await fetch(url);
  // Col token un rifiuto è il credenziale che non vale più. Con la chiave resta
  // l'errore di sempre, qui sotto: non è colpa dell'utente.
  if (accessToken && (response.status === 401 || response.status === 403)) {
    throw new SteamUnauthorizedError('GetOwnedGames', response.status);
  }
  if (!response.ok) {
    // 403 = chiave sbagliata o revocata. Non è colpa dell'utente e non va
    // confuso con un profilo privato.
    throw new Error(
      `Steam GetOwnedGames: ${response.status} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as OwnedGamesResponse;
  if (body.response?.game_count === undefined) {
    throw new SteamLibraryNotVisibleError(steamId);
  }

  return (body.response.games ?? []).map((game) => ({
    externalId: String(game.appid),
    // Il nome manca solo su appid ritirati dallo store; l'appid è comunque
    // l'identità, quindi la voce non si butta.
    name: game.name?.trim() || `App ${game.appid}`,
    playtimeMinutes: game.playtime_forever ?? 0,
    lastPlayedAt: game.rtime_last_played
      ? new Date(game.rtime_last_played * 1000)
      : null,
  }));
}

const PLAYER_SUMMARIES_URL =
  'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/';

/**
 * Il nome che l'utente si è dato su Steam, per non mostrargli uno SteamID64.
 *
 * Costa una richiesta con la **nostra** chiave applicativa, non con una
 * credenziale sua: Steam resta il negozio senza credenziali per utente, e questo
 * non lo cambia.
 *
 * Rende `null` invece di alzare, sempre: è decorazione. Un profilo che non
 * risponde o un nome che manca non devono far fallire il collegamento di un
 * account che per il resto funziona benissimo — la libreria si legge con lo
 * SteamID, non col nome.
 */
export async function fetchSteamPersonaName(
  steamId: string,
): Promise<string | null> {
  const url = new URL(PLAYER_SUMMARIES_URL);
  url.searchParams.set('key', apiKey());
  url.searchParams.set('steamids', steamId);

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const body = (await response.json()) as {
      response?: { players?: { personaname?: string }[] };
    };
    return body.response?.players?.[0]?.personaname ?? null;
  } catch {
    return null;
  }
}

// --- La famiglia (9f) ---
//
// Non è la Web API pubblica: `IFamilyGroupsService` non è documentata da Valve, e
// vuole il token di un membro. Playnite la usa allo stesso modo. Misurato il
// 05/10/2026 su una famiglia da cinque membri, vedi docs/negozi.md.

const FAMILY_GROUP_URL =
  'https://api.steampowered.com/IFamilyGroupsService/GetFamilyGroupForUser/v1/';
const SHARED_LIBRARY_URL =
  'https://api.steampowered.com/IFamilyGroupsService/GetSharedLibraryApps/v1/';

/** Un'app della libreria condivisa, ridotta a ciò che l'import usa. */
export type SteamSharedApp = {
  /** L'appid, come stringa: stessa forma di `SteamLibraryEntry.externalId`. */
  externalId: string;
  name: string;
  /**
   * Gli SteamID64 dei membri che **possiedono** l'app, quello dell'utente
   * compreso se ce l'ha. È ciò che separa le copie sue da quelle della famiglia:
   * con `include_own=false` la risposta toglie l'utente dall'elenco senza
   * togliere l'app: 70 delle 343 app che rendeva erano anche sue.
   */
  ownerSteamIds: string[];
  /** Perché Steam la considera non condivisibile; null se non lo dice. */
  excludeReason: number | null;
  /** Minuti, e dell'utente: `rt_playtime` coincide con `playtime_forever`. */
  playtimeMinutes: number;
  lastPlayedAt: Date | null;
  /**
   * Quando la copia è entrata in libreria. Di **una** copia — la stessa app ha
   * date diverse a seconda di chi la possiede — quindi sulle app solo della
   * famiglia è la data del proprietario, non quella in cui sono diventate
   * giocabili per l'utente.
   */
  acquiredAt: Date | null;
};

export type SteamFamilyLibrary = {
  /** Falso se l'utente non sta in nessun gruppo famiglia. */
  inGroup: boolean;
  /**
   * Quando l'utente è entrato nella famiglia (`latest_time_joined`, l'ultima volta
   * se è uscito e rientrato). Nulla fuori da un gruppo.
   *
   * Serve a stimare da quando una copia della famiglia è giocabile per lui: non
   * prima che sia entrato, e non prima che il proprietario l'abbia presa.
   */
  joinedAt: Date | null;
  apps: SteamSharedApp[];
};

type FamilyGroupResponse = {
  response?: {
    family_groupid?: string;
    is_not_member_of_any_group?: boolean;
    latest_time_joined?: number;
  };
};

type SharedLibraryResponse = {
  response?: {
    apps?: {
      appid: number;
      name?: string;
      owner_steamids?: string[];
      exclude_reason?: number;
      rt_time_acquired?: number;
      rt_last_played?: number;
      rt_playtime?: number;
    }[];
  };
};

/**
 * Una GET alle API della famiglia, con il token.
 *
 * Un 401 non è mai un JSON: Steam risponde con una pagina HTML («Access is
 * denied»), e leggerla come JSON darebbe un errore di parsing che non dice cosa
 * è andato storto. Per questo lo stato si guarda **prima** di leggere il corpo.
 */
async function familyGet<T>(
  what: string,
  base: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(base);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  const response = await fetch(url);
  if (response.status === 401 || response.status === 403) {
    throw new SteamUnauthorizedError(what, response.status);
  }
  if (!response.ok) {
    // Il corpo si tronca: può essere una pagina intera.
    throw new Error(
      `Steam ${what}: ${response.status} ${(await response.text()).slice(0, 200)}`,
    );
  }
  return (await response.json()) as T;
}

/**
 * Le app della famiglia dell'utente, **comprese le sue**.
 *
 * `include_own=true` e non `false`, ed è misurato: `false` non toglie le app che
 * l'utente possiede anche lui (70 su 343), le rende solo senza il suo SteamID
 * fra i proprietari. Con `true` basta guardare `ownerSteamIds` per separare le
 * sue dalle altre, in una chiamata sola.
 *
 * Senza i flag che aprono esclusi, gratuiti e non-giochi: Steam li toglie già
 * lei, e nella chiamata base `exclude_reason` compare solo su `include_own`.
 *
 * L'utente fuori da ogni gruppo, e un gruppo senza altri membri (`apps` assente),
 * sono la famiglia **vuota** e non un errore: chi ne esce deve poter portare via
 * le sue copie al reimport.
 */
export async function fetchSteamFamilyLibrary(
  accessToken: string,
  steamId: string,
): Promise<SteamFamilyLibrary> {
  const group = await familyGet<FamilyGroupResponse>(
    'GetFamilyGroupForUser',
    FAMILY_GROUP_URL,
    { access_token: accessToken, steamid: steamId },
  );

  const groupId = group.response?.family_groupid;
  if (group.response?.is_not_member_of_any_group || !groupId) {
    return { inGroup: false, joinedAt: null, apps: [] };
  }

  const shared = await familyGet<SharedLibraryResponse>(
    'GetSharedLibraryApps',
    SHARED_LIBRARY_URL,
    {
      access_token: accessToken,
      steamid: steamId,
      family_groupid: groupId,
      include_own: 'true',
      // Gli stessi nomi di `GetOwnedGames`, che sono in inglese: servono a
      // risolvere per nome, e due lingue sulla stessa libreria non combaciano.
      language: 'english',
    },
  );

  return {
    inGroup: true,
    joinedAt: steamDate(group.response?.latest_time_joined),
    apps: (shared.response?.apps ?? []).map((app) => ({
      externalId: String(app.appid),
      name: app.name?.trim() || `App ${app.appid}`,
      ownerSteamIds: app.owner_steamids ?? [],
      excludeReason: app.exclude_reason ? app.exclude_reason : null,
      playtimeMinutes: app.rt_playtime ?? 0,
      lastPlayedAt: steamDate(app.rt_last_played, true),
      acquiredAt: steamDate(app.rt_time_acquired),
    })),
  };
}

/**
 * Da secondi di epoch a `Date`, con lo zero come «nessuna data».
 *
 * Per le ultime partite si scarta anche tutto ciò che è prima del 2004: Playnite
 * ha visto Steam rendere `1970-01-02` per i giochi giocati prima che registrasse
 * le date. **Non è una misura nostra**: l'abbiamo copiata dal suo sorgente, e se
 * sulla nostra libreria non succede mai la guardia è innocua.
 */
function steamDate(seconds: number | undefined, lastPlayed = false) {
  if (!seconds) return null;
  const date = new Date(seconds * 1000);
  return lastPlayed && date.getUTCFullYear() < 2004 ? null : date;
}

const RESOLVE_VANITY_URL =
  'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/';

// Uno SteamID64 è sempre 17 cifre e comincia per 7656119.
const STEAM_ID_64 = /^\d{17}$/;
// Le due forme di URL di profilo: /profiles/<steamid64> e /id/<nome scelto>.
const PROFILE_URL = /steamcommunity\.com\/(profiles|id)\/([^/?#]+)/i;

export class SteamProfileNotFoundError extends Error {
  constructor(input: string) {
    super(`Nessun profilo Steam per "${input}"`);
    this.name = 'SteamProfileNotFoundError';
  }
}

async function resolveVanity(vanity: string) {
  const url = new URL(RESOLVE_VANITY_URL);
  url.searchParams.set('key', apiKey());
  url.searchParams.set('vanityurl', vanity);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Steam ResolveVanityURL: ${response.status} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    response?: { success?: number; steamid?: string };
  };
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
    if (kind === 'profiles') {
      if (!STEAM_ID_64.test(value!))
        throw new SteamProfileNotFoundError(trimmed);
      return value!;
    }
    return resolveVanity(value!);
  }

  // Né URL né id: l'ultima possibilità sensata è che sia il nome scelto.
  return resolveVanity(trimmed);
}

// --- Store: lo slug Metacritic dichiarato dalla scheda del negozio ---
//
// Un endpoint diverso da quello sopra: `store.steampowered.com/api/appdetails`
// non è la Web API, non vuole chiave, e il ritmo che tollera è più stretto
// (circa 200 richieste ogni cinque minuti per indirizzo). Sta qui lo stesso
// perché è Steam, e chi lo chiama è l'enrichment Metacritic dello step 8.
//
// Serve a una cosa sola: la scheda del negozio, per i giochi che ce l'hanno,
// dichiara il link alla pagina Metacritic. Quel link porta lo slug, ed è un
// aggancio per identità che costa una richiesta e non una ricerca per nome.
//
// **È un indizio, non una prova**, e va verificato da chi lo usa: su 17 giochi
// veri due mentivano — BioShock Remastered punta a `bioshock-the-collection`,
// che è la raccolta, e Kingdom: Classic a `kingdom`, che è un altro gioco.

const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';

type AppDetailsResponse = Record<
  string,
  {
    success?: boolean;
    data?: { metacritic?: { url?: string; score?: number } };
  }
>;

/**
 * Lo slug Metacritic dichiarato dalla scheda Steam di un gioco, se c'è.
 *
 * Steam scrive l'URL nella forma vecchia con la piattaforma dentro
 * (`/game/pc/hollow-knight`), mentre le pagine di oggi stanno su `/game/{slug}`:
 * lo slug è l'ultimo pezzo del percorso, e si prende quello.
 *
 * Null quando il gioco non ha un punteggio collegato — succede spesso, circa
 * quattro giochi su dieci — o quando Steam non risponde per quell'appid.
 * Nessuno dei due casi è un errore: sono i casi in cui si cerca per nome.
 */
export async function fetchSteamMetacriticSlug(
  appId: string,
): Promise<string | null> {
  const url = new URL(APP_DETAILS_URL);
  url.searchParams.set('appids', appId);
  // Il filtro riduce la risposta da qualche decina di kB a poche righe. Un solo
  // appid per richiesta: con più di uno e un filtro, Steam risponde `null`.
  url.searchParams.set('filters', 'metacritic');

  const response = await fetch(url, { headers: { 'User-Agent': 'Ludex/0.1' } });
  if (!response.ok) return null;

  const body = (await response.json()) as AppDetailsResponse | null;
  const entry = body?.[appId];
  if (!entry?.success) return null;

  const link = entry.data?.metacritic?.url;
  if (!link) return null;

  const path = link.split('?')[0]?.replace(/\/+$/, '') ?? '';
  const slug = path.split('/').pop();
  return slug || null;
}
