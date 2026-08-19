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

const BASE_URL = "https://howlongtobeat.com";

/**
 * HLTB ruota il path dell'endpoint di ricerca ogni tanto (era `/api/find`, oggi
 * è `/api/bleed`). Quando succede tutte le richieste rispondono 404: si cambia
 * questa variabile senza toccare il codice, e nel frattempo `game_sources` porta
 * scritto perché i job falliscono.
 */
function searchUrl() {
  return `${BASE_URL}${process.env.HLTB_API_PATH ?? "/api/bleed"}`;
}

// Dichiararsi è la cosa corretta da fare e funziona: la sessione la si ottiene
// lo stesso, non serve fingersi un browser.
const USER_AGENT = "Ludex/0.1";

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
  return { Referer: BASE_URL, "User-Agent": USER_AGENT };
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
    return (
      `l'endpoint di ricerca non esiste più (${process.env.HLTB_API_PATH ?? "/api/bleed"}): ` +
      "HLTB lo ha ruotato, va rimesso il path nuovo in HLTB_API_PATH"
    );
  }
  if (status === 403) {
    return "sessione rifiutata: è scaduta, o è cambiato l'IP pubblico del server a cui era legata";
  }
  if (status === 429) return "troppe richieste: HLTB sta limitando";
  return `risposta inattesa da /init (${status})`;
}

async function fetchSession(): Promise<Session> {
  // Anche `/init` è traffico verso HLTB, e va contato: passa dallo stesso
  // ritmatore delle ricerche, o un rinnovo si infilerebbe fra due richieste
  // distanziate.
  await acquire();
  const response = await fetch(`${searchUrl()}/init?t=${Date.now()}`, {
    headers: baseHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HLTB: ${sessionFailure(response.status)}`);
  }

  const body = (await response.json()) as Partial<{
    token: string;
    hpKey: string;
    hpVal: string;
  }>;

  if (!body.token || !body.hpKey || !body.hpVal) {
    throw new Error("HLTB: risposta di /init senza token");
  }

  session = { token: body.token, hpKey: body.hpKey, hpVal: body.hpVal };
  return session;
}

function getSession() {
  return session ? Promise.resolve(session) : fetchSession();
}

function send(payload: Record<string, unknown>, current: Session) {
  return fetch(searchUrl(), {
    method: "POST",
    headers: {
      ...baseHeaders(),
      "Content-Type": "application/json",
      "x-auth-token": current.token,
      "x-hp-key": current.hpKey,
      "x-hp-val": current.hpVal,
    },
    // La coppia va anche nel corpo, non solo negli header. Si ricompone a ogni
    // invio invece di accumularla nel payload: la chiave cambia col rinnovo.
    body: JSON.stringify({ ...payload, [current.hpKey]: current.hpVal }),
  });
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const current = await getSession();
  await acquire();
  let response = await send(payload, current);

  // La sessione scade, e scade anche se cambia l'IP pubblico del server. Si
  // butta e si riprova una volta sola, come il 401 di IGDB.
  if (response.status === 403) {
    session = null;
    const rinnovata = await fetchSession();
    await acquire();
    response = await send(payload, rinnovata);
  }

  if (!response.ok) {
    throw new Error(`HLTB ricerca: ${response.status} ${await response.text()}`);
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

export async function searchHltbGames(term: string, size = 20): Promise<HltbSearchHit[]> {
  const body = await post<{ data?: HltbSearchRow[] }>({
    searchType: "games",
    // HLTB vuole i termini già spezzati, non la stringa intera.
    searchTerms: term.split(" ").filter(Boolean),
    searchPage: 1,
    size,
    searchOptions: {
      games: {
        userId: 0,
        // Nessun filtro per piattaforma, al contrario di quel che fa RomM.
        // `games` è condivisa fra tutti gli utenti: filtrare sulla piattaforma
        // di *uno* sarebbe sbagliato per tutti gli altri, e comunque una voce
        // HLTB copre già tutte le piattaforme su cui il gioco esiste.
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: null, max: null },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { min: "", max: "" },
        modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  });

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

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s;

/**
 * I dati di un gioco preciso, letti dalla sua pagina.
 *
 * È una GET senza sessione: il payload che il sito idrata da solo sta nel
 * `__NEXT_DATA__` della pagina, e contiene più campi di quanti la ricerca ne
 * restituisca. Restituisce null se la pagina non esiste più — capita, HLTB
 * fonde le voci doppie.
 */
export async function fetchHltbGameDetail(hltbId: number): Promise<HltbGameDetail | null> {
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
