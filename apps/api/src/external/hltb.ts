// Client HowLongToBeat. Come igdb.ts e steam.ts sta fuori da `services/`: è
// l'accesso a un servizio esterno, non logica di dominio.
//
// HLTB non ha un'API pubblica e non ne vuole una. Quello che c'è è l'endpoint
// che usa il loro sito, e va trattato di conseguenza: ci si identifica per
// quello che si è, si sta molto sotto il ritmo che reggerebbe, e **il risultato
// finisce sempre in DB** — mai una richiesta a HLTB per una richiesta utente.
//
// Due cose che questo client fa e quello di IGDB non deve fare:
//
// - **la sessione**. `/init` restituisce un token più una coppia chiave/valore
//   che vanno rimandati sia negli header sia nel corpo. Il token è legato
//   all'indirizzo IP e allo User-Agent di chi l'ha chiesto: l'UA dev'essere lo
//   stesso fra `/init` e la ricerca, o si prende un 403. Per lo stesso motivo
//   **il token non va mai loggato**: decodificato contiene l'IP pubblico del
//   server, che finirebbe in qualunque log condiviso.
// - **la pagina del gioco**. È una GET normale, senza sessione, e il suo
//   `__NEXT_DATA__` porta più roba della ricerca: i tempi con i conteggi, i
//   flag su che modalità il gioco abbia, e l'appid Steam — che è ciò che
//   permette di *verificare* un match invece di sperarci.
// - **il path che cambia**. HLTB ruota l'endpoint di ricerca ogni tanto e senza
//   dirlo: era `/api/find`, poi `/api/bleed`, oggi `/api/search/site`. Quando
//   succede tutto risponde 404 e il client se lo ritrova da solo — vedi la
//   sezione in fondo.

const BASE_URL = 'https://howlongtobeat.com';

/**
 * Il path al momento in cui questa riga è stata scritta. Non è la verità, è il
 * punto di partenza: quando HLTB lo ruota, `discoverSearchPath` trova quello
 * nuovo e questo resta lì a invecchiare senza fare danni.
 */
const DEFAULT_API_PATH = '/api/search/site';

/** Ciò che la scoperta ha trovato: in memoria, e per questo processo soltanto. */
let discoveredPath: string | null = null;

/**
 * `HLTB_API_PATH` non sparisce e **vince su tutto**: è la scappatoia per il
 * giorno in cui la scoperta si sbaglia o non trova niente. Va lasciata vuota se
 * non serve, perché scritta spegne la scoperta — l'ultima parola ce l'ha chi
 * l'ha messa lì, non un'euristica.
 */
function pinnedPath() {
  const pinned = process.env.HLTB_API_PATH?.trim();
  return pinned ? pinned : null;
}

/** Il path che il client sta usando adesso. */
export function hltbApiPath() {
  return pinnedPath() ?? discoveredPath ?? DEFAULT_API_PATH;
}

function searchUrl() {
  return `${BASE_URL}${hltbApiPath()}`;
}

// Dichiararsi è la cosa corretta da fare e funziona: la sessione la si ottiene
// lo stesso, non serve fingersi un browser.
const USER_AGENT = 'Ludex/0.1';

// HLTB non pubblica un limite. Tre richieste al secondo è la stima prudente che
// usa anche RomM, e sopra non ci si va: il lavoro qui non ha fretta.
const MIN_INTERVAL_MS = 334;

type Session = { token: string; hpKey: string; hpVal: string };

let session: Session | null = null;
let lastRequestAt = 0;
let gate: Promise<void> = Promise.resolve();

/**
 * Aspetta il proprio turno prima di partire, distanziando le partenze.
 *
 * Diverso da `schedule` in igdb.ts, che avvolge l'intera chiamata in una coda:
 * lì una richiesta non ne contiene mai un'altra, qui sì — una ricerca che si
 * becca un 403 deve rinnovare la sessione, che è a sua volta una richiesta. Con
 * una coda di *lavori* quel rinnovo si metterebbe in fila dietro il lavoro che
 * lo sta aspettando, e resterebbero lì per sempre. Mettendo in fila solo
 * l'**attesa**, il turno si libera appena scatta il ritardo e non quando la
 * risposta arriva.
 */
function acquire(): Promise<void> {
  const mine = gate.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  });
  gate = mine.catch(() => undefined);
  return mine;
}

function baseHeaders() {
  return { Referer: BASE_URL, 'User-Agent': USER_AGENT };
}

/**
 * Perché la sessione è stata rifiutata, detto in modo che si capisca cosa fare.
 *
 * Non è cosmesi: questa frase è l'unica cosa che finisce in `game_sources.error`
 * e quindi l'unica che si vedrà quando si andrà a guardare perché un gioco è
 * rimasto indietro. I tre codici vogliono tre rimedi diversi, e "sessione
 * rifiutata (404)" li fa sembrare lo stesso problema — mandando a cercare una
 * sessione rotta quando invece è cambiato l'indirizzo.
 */
function sessionFailure(status: number) {
  if (status === 404) {
    // Le due frasi vogliono due gesti diversi: se il path è fissato a mano la
    // scoperta non è nemmeno partita, ed è quella variabile ad andare svuotata.
    return pinnedPath()
      ? `l'endpoint di ricerca non esiste più (${hltbApiPath()}): è HLTB_API_PATH ` +
          'a tenercelo fisso, va svuotata e lasciata fare alla scoperta'
      : `l'endpoint di ricerca non esiste più (${hltbApiPath()}): HLTB lo ha ` +
          'ruotato e la scoperta non ne ha trovato uno che funzioni';
  }
  if (status === 403) {
    return "sessione rifiutata: è scaduta, o è cambiato l'IP pubblico del server a cui era legata";
  }
  if (status === 429) return 'troppe richieste: HLTB sta limitando';
  return `risposta inattesa da /init (${status})`;
}

type SessionBody = Partial<{ token: string; hpKey: string; hpVal: string }>;

function parseSession(body: unknown): Session | null {
  const { token, hpKey, hpVal } = (body ?? {}) as SessionBody;
  return token && hpKey && hpVal ? { token, hpKey, hpVal } : null;
}

/**
 * Chiede una sessione al `/init` di un path qualunque.
 *
 * Prende l'url invece di leggerselo perché la scoperta minta sui **candidati**,
 * che non sono ancora il path del client: è lo stesso codice a decidere se un
 * candidato vale e a servire le ricerche vere, o si validerebbe una cosa e se
 * ne userebbe un'altra.
 */
async function mint(url: string) {
  // Anche `/init` è traffico verso HLTB, e va contato: passa dallo stesso
  // ritmatore delle ricerche, o un rinnovo si infilerebbe fra due richieste
  // distanziate.
  await acquire();
  return fetch(`${url}/init?t=${Date.now()}`, { headers: baseHeaders() });
}

async function fetchSession(): Promise<Session> {
  let response = await mint(searchUrl());

  // Un 404 già qui è il caso del processo che parte **dopo** la rotazione: non
  // c'è nessuna sessione da buttare, il path è sbagliato dal primo istante.
  if (response.status === 404 && (await rediscover())) {
    response = await mint(searchUrl());
  }

  if (!response.ok) {
    throw new Error(`HLTB: ${sessionFailure(response.status)}`);
  }

  const minted = parseSession(await response.json());
  if (!minted) {
    throw new Error('HLTB: risposta di /init senza token');
  }

  session = minted;
  return minted;
}

function getSession() {
  return session ? Promise.resolve(session) : fetchSession();
}

function send(
  payload: Record<string, unknown>,
  current: Session,
  url = searchUrl(),
) {
  return fetch(url, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      'Content-Type': 'application/json',
      'x-auth-token': current.token,
      'x-hp-key': current.hpKey,
      'x-hp-val': current.hpVal,
    },
    // La coppia va anche nel corpo, non solo negli header. Si ricompone a ogni
    // invio invece di accumularla nel payload: la chiave cambia col rinnovo.
    body: JSON.stringify({ ...payload, [current.hpKey]: current.hpVal }),
  });
}

/** Una ricerca con la sessione che c'è, rinnovandola una volta sola se scaduta. */
async function attempt(payload: Record<string, unknown>) {
  const current = await getSession();
  await acquire();
  const response = await send(payload, current);

  // La sessione scade, e scade anche se cambia l'IP pubblico del server. Si
  // butta e si riprova una volta sola, come il 401 di IGDB.
  if (response.status !== 403) return response;

  session = null;
  const rinnovata = await fetchSession();
  await acquire();
  return send(payload, rinnovata);
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  let response = await attempt(payload);

  // 404 con una sessione in mano: la rotazione è avvenuta a lavoro iniziato.
  // La sessione va buttata comunque — è stata mintata su un endpoint che non
  // c'è più, e non si dà per scontato che valga anche sul nuovo.
  if (response.status === 404 && (await rediscover())) {
    session = null;
    response = await attempt(payload);
  }

  if (!response.ok) {
    throw new Error(
      `HLTB ricerca: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

// --- Ricerca: da un titolo a una lista di candidati ---

type HltbSearchRow = {
  game_id: number;
  game_name: string;
  game_alias?: string;
  game_type?: string;
  release_world?: number;
};

/**
 * Un candidato della ricerca. **Non ci sono i tempi**, che pure la ricerca
 * restituirebbe: quelli si prendono sempre dalla pagina del gioco, così il
 * primo aggancio e i riaggiornamenti dei sei mesi dopo leggono lo stesso posto
 * e non possono divergere. Qui c'è solo ciò che serve a scegliere quale voce è
 * la nostra.
 */
export type HltbSearchHit = {
  hltbId: number;
  name: string;
  /** Titolo alternativo ("Hollow Knight: Voidheart Edition"). Va confrontato anche lui. */
  alias: string | null;
  /** "game", "dlc", "multi"… Serve a buttare via i DLC, che sporcano ogni ricerca. */
  type: string | null;
  releaseYear: number | null;
};

/**
 * Il corpo di una ricerca. Estratto perché **la scoperta manda esattamente
 * questo** ai candidati: validare con una richiesta diversa da quella vera
 * vorrebbe dire promuovere un path che poi fallisce al primo job.
 */
function searchPayload(term: string, size: number) {
  return {
    searchType: 'games',
    // HLTB vuole i termini già spezzati, non la stringa intera.
    searchTerms: term.split(' ').filter(Boolean),
    searchPage: 1,
    size,
    searchOptions: {
      games: {
        userId: 0,
        // Nessun filtro per piattaforma, al contrario di quel che fa RomM.
        // `games` è condivisa fra tutti gli utenti: filtrare sulla piattaforma
        // di *uno* sarebbe sbagliato per tutti gli altri, e comunque una voce
        // HLTB copre già tutte le piattaforme su cui il gioco esiste.
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: null, max: null },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        rangeYear: { min: '', max: '' },
        modifier: '',
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
}

export async function searchHltbGames(
  term: string,
  size = 20,
): Promise<HltbSearchHit[]> {
  const body = await post<{ data?: HltbSearchRow[] }>(
    searchPayload(term, size),
  );

  return (body.data ?? []).map((row) => ({
    hltbId: row.game_id,
    name: row.game_name,
    alias: row.game_alias || null,
    type: row.game_type ?? null,
    releaseYear: row.release_world || null,
  }));
}

// --- Dettaglio: da un id ai tempi ---

type HltbDetailRow = {
  game_id: number;
  game_name: string;
  comp_main?: number;
  comp_plus?: number;
  comp_100?: number;
  comp_all?: number;
  comp_main_count?: number;
  comp_plus_count?: number;
  comp_100_count?: number;
  comp_all_count?: number;
  comp_lvl_sp?: number;
  comp_lvl_co?: number;
  comp_lvl_mp?: number;
  profile_steam?: number;
  profile_steam_alt?: number;
};

export type HltbGameDetail = {
  hltbId: number;
  name: string;
  mainMinutes: number | null;
  plusMinutes: number | null;
  completionistMinutes: number | null;
  allStylesMinutes: number | null;
  mainCount: number | null;
  plusCount: number | null;
  completionistCount: number | null;
  allStylesCount: number | null;
  hasSolo: boolean;
  hasCoop: boolean;
  hasVersus: boolean;
  /**
   * Gli appid Steam della voce, come stringhe: è la forma in cui vivono in
   * `external_ids`.
   *
   * Sono **due** perché su Steam lo stesso gioco può avere più schede — BioShock
   * 2 è 8850 in originale e 409720 da remaster — e HLTB le registra entrambe
   * (`profile_steam` e `profile_steam_alt`), mentre IGDB ne mappa una sola. A
   * guardarne una sola si smentirebbero match giusti.
   *
   * Vuoto quando HLTB non ne ha: non dice niente, né in un senso né nell'altro.
   */
  steamAppIds: string[];
};

/** HLTB dà i tempi in secondi; zero vuol dire "non ce n'è", non "zero minuti". */
function minutes(seconds: number | undefined) {
  return seconds ? Math.round(seconds / 60) : null;
}

function count(value: number | undefined) {
  return value ? value : null;
}

const NEXT_DATA =
  /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s;

/**
 * I dati di un gioco preciso, letti dalla sua pagina.
 *
 * È una GET senza sessione: il payload che il sito idrata da solo sta nel
 * `__NEXT_DATA__` della pagina, e contiene più campi di quanti la ricerca ne
 * restituisca. Restituisce null se la pagina non esiste più — capita, HLTB
 * fonde le voci doppie.
 */
export async function fetchHltbGameDetail(
  hltbId: number,
): Promise<HltbGameDetail | null> {
  await acquire();
  const response = await fetch(`${BASE_URL}/game/${Math.trunc(hltbId)}`, {
    headers: baseHeaders(),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`HLTB gioco ${hltbId}: ${response.status}`);
  }

  const match = NEXT_DATA.exec(await response.text());
  if (!match?.[1]) {
    // Pagina servita ma senza il payload: o hanno cambiato il rendering, o è
    // una pagina di errore travestita da 200. In entrambi i casi è un guasto
    // temporaneo dal nostro punto di vista, non un gioco che non esiste.
    throw new Error(`HLTB gioco ${hltbId}: pagina senza __NEXT_DATA__`);
  }

  const parsed = JSON.parse(match[1]) as {
    props?: { pageProps?: { game?: { data?: { game?: HltbDetailRow[] } } } };
  };
  const row = parsed.props?.pageProps?.game?.data?.game?.[0];
  if (!row) return null;

  return {
    hltbId: row.game_id,
    name: row.game_name,
    mainMinutes: minutes(row.comp_main),
    plusMinutes: minutes(row.comp_plus),
    completionistMinutes: minutes(row.comp_100),
    allStylesMinutes: minutes(row.comp_all),
    mainCount: count(row.comp_main_count),
    plusCount: count(row.comp_plus_count),
    completionistCount: count(row.comp_100_count),
    allStylesCount: count(row.comp_all_count),
    hasSolo: row.comp_lvl_sp === 1,
    hasCoop: row.comp_lvl_co === 1,
    hasVersus: row.comp_lvl_mp === 1,
    steamAppIds: [row.profile_steam, row.profile_steam_alt]
      .filter((appId): appId is number => Boolean(appId))
      .map(String),
  };
}

// --- Scoperta dell'endpoint: da un sito che è cambiato al path nuovo ---
//
// Next elenca ogni route che serve, come stringa in chiaro, dentro
// `_buildManifest.js`. Il candidato è la route che ha una sorella `/init`, cioè
// l'accoppiata che questo client dà per scontata: su 90 route `/api/` ne resta
// una sola, e i quasi-omonimi (`/api/forum/search`, `/api/search/users`) cadono
// perché il mint non ce l'hanno.
//
// Ma la lista è solo un indizio: **a decidere è una ricerca vera**. Un path che
// risponde non è ancora un path che cerca giochi, e promuoverlo per un 200
// vorrebbe dire scoprire l'errore un job alla volta, dentro `game_sources`.
//
// È la strada di RomM (`utils/update_hltb_api_url.py`), che però la percorre in
// CI una volta a settimana e ne scrive il risultato in un file servito a tutte
// le installazioni. Quel file non ci serve: non abbiamo una flotta da servire e
// ce l'avremmo comunque stantio — il loro è rimasto tre mesi su `/api/bleed`.
// La stessa funzione gira qui quando un job si becca il 404, e a mano da
// `pnpm --filter api hltb:endpoint`.

/** Il manifest è linkato dalla homepage, con dentro l'id della build. */
const BUILD_MANIFEST =
  /src="([^"]*\/_next\/static\/[^"]+\/_buildManifest\.js)"/;

const API_ROUTE = /["'](\/api\/[^"']*)["']/g;

/** Termine con troppi risultati noti perché uno zero sia colpa sua e non del path. */
const VALIDATION_TERM = 'mario';

/** Dopo un tentativo a vuoto si sta zitti un po': vedi `rediscover`. */
const DISCOVERY_COOLDOWN_MS = 10 * 60 * 1000;

let discovery: Promise<boolean> | null = null;
let discoveryRetryAt = 0;

/**
 * I path che dal manifest sembrano l'endpoint di ricerca, i più promettenti
 * prima.
 *
 * Pura e senza rete, che è il solo modo di provarla: la parte che sceglie è
 * questa, quella che valida ha bisogno di HLTB acceso.
 */
export function hltbSearchCandidates(manifest: string): string[] {
  const routes = new Set<string>();
  for (const match of manifest.matchAll(API_ROUTE)) {
    if (match[1]) routes.add(match[1]);
  }

  return (
    [...routes]
      .filter((route) => routes.has(`${route}/init`))
      // Avere "search" nel nome non basta a sceglierlo — a quello ci pensa la
      // ricerca vera — ma basta a provarlo per primo e risparmiare due giri.
      .sort(
        (a, b) => Number(b.includes('search')) - Number(a.includes('search')),
      )
  );
}

async function fetchBuildManifest(log: (message: string) => void) {
  await acquire();
  const homepage = await fetch(`${BASE_URL}/`, { headers: baseHeaders() });
  if (!homepage.ok) {
    throw new Error(`homepage: ${homepage.status}`);
  }

  const match = BUILD_MANIFEST.exec(await homepage.text());
  if (!match?.[1]) {
    log('la homepage non linka nessun _buildManifest.js');
    return null;
  }

  const url = new URL(match[1], BASE_URL).toString();
  log(`manifest: ${url}`);

  await acquire();
  // Gli header di `baseHeaders` non sono decorazione qui: il manifest risponde
  // **403** a chi non si dichiara, al contrario della homepage che passa.
  const manifest = await fetch(url, { headers: baseHeaders() });
  if (!manifest.ok) {
    throw new Error(`manifest: ${manifest.status}`);
  }

  return manifest.text();
}

/** Il candidato serve davvero la ricerca dei giochi, non solo una risposta. */
async function servesSearch(path: string, log: (message: string) => void) {
  const url = `${BASE_URL}${path}`;

  const minted = await mint(url);
  if (!minted.ok) {
    log(`scartato ${path}: /init risponde ${minted.status}`);
    return false;
  }

  const candidate = parseSession(await minted.json());
  if (!candidate) {
    log(`scartato ${path}: /init non emette una sessione`);
    return false;
  }

  await acquire();
  const response = await send(
    searchPayload(VALIDATION_TERM, 5),
    candidate,
    url,
  );
  if (!response.ok) {
    log(`scartato ${path}: la ricerca risponde ${response.status}`);
    return false;
  }

  // Si guarda **la forma che `searchHltbGames` legge**, non che risponda 200:
  // una route che esiste e restituisce altro passerebbe qualunque controllo più
  // debole di questo, e sarebbe promossa.
  const rows = ((await response.json()) as { data?: unknown }).data;
  if (!Array.isArray(rows) || rows.length === 0) {
    log(`scartato ${path}: la ricerca non trova niente`);
    return false;
  }

  const giochi = rows.every(
    (row) =>
      typeof row === 'object' &&
      row !== null &&
      'game_id' in row &&
      'game_name' in row,
  );
  if (!giochi) {
    log(`scartato ${path}: i risultati non sono giochi`);
    return false;
  }

  return true;
}

/**
 * Il path dell'endpoint di ricerca, ritrovato dal sito. Null se non ce n'è
 * nessuno che regga: è un esito, non un guasto: chi chiama tiene quello che ha.
 */
export async function discoverSearchPath(
  log: (message: string) => void = () => {},
): Promise<string | null> {
  const manifest = await fetchBuildManifest(log);
  if (!manifest) return null;

  const candidates = hltbSearchCandidates(manifest);
  if (candidates.length === 0) {
    log('nessuna route del manifest ha un /init accanto');
    return null;
  }
  log(`candidati: ${candidates.join(', ')}`);

  for (const path of candidates) {
    try {
      if (await servesSearch(path, log)) {
        log(`confermato: ${path}`);
        return path;
      }
    } catch (error) {
      // Un candidato che esplode è un candidato scartato, non una scoperta
      // finita: quello dopo potrebbe essere quello giusto.
      log(`scartato ${path}: ${String(error)}`);
    }
  }

  log('nessun candidato serve la ricerca dei giochi');
  return null;
}

/**
 * Riscopre l'endpoint dopo un 404, e dice se **è cambiato** — solo allora ha
 * senso riprovare la richiesta che ha innescato tutto.
 *
 * Due cautele, entrambe per il caso vero: mille job in coda che falliscono
 * insieme. La scoperta è a **volo singolo**, o ognuno ripagherebbe le sue
 * quattro richieste; e un tentativo che non porta a niente lascia un silenzio,
 * o la coda intera si trasformerebbe in una raffica di scoperte contro un sito
 * che è semplicemente giù.
 */
function rediscover(): Promise<boolean> {
  if (pinnedPath()) return Promise.resolve(false);
  if (discovery) return discovery;
  if (Date.now() < discoveryRetryAt) return Promise.resolve(false);

  const precedente = hltbApiPath();

  discovery = discoverSearchPath((message) => console.log(`HLTB: ${message}`))
    .catch((error) => {
      console.log(`HLTB: scoperta dell'endpoint fallita: ${String(error)}`);
      return null;
    })
    .then((found) => {
      const cambiato = Boolean(found) && found !== precedente;
      if (found) discoveredPath = found;
      if (!cambiato) discoveryRetryAt = Date.now() + DISCOVERY_COOLDOWN_MS;
      return cambiato;
    })
    .finally(() => {
      discovery = null;
    });

  return discovery;
}
