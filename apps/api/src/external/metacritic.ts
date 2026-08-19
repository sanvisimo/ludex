// Client Metacritic. Come hltb.ts, è l'endpoint che usa il loro sito: Metacritic
// non ha un'API pubblica e non ne vuole una. Valgono le stesse regole — ci si
// identifica, si sta molto sotto il ritmo che reggerebbe, e **il risultato
// finisce sempre in DB**, mai una richiesta per una richiesta utente.
//
// La chiave è una costante che il loro sito porta nel proprio JavaScript: non è
// un segreto e non identifica nessuno, ma possono ruotarla. Quando succede le
// risposte diventano 401 e si rimette la nuova in METACRITIC_API_KEY, senza
// toccare il codice — stessa via d'uscita di HLTB_API_PATH.
//
// Due endpoint, due forme diverse:
//
// - **finder**: la ricerca. Restituisce titolo, slug e **anno**, che è la
//   differenza che rende il match qui più sicuro che su OpenCritic.
// - **composer**: la scheda. Porta il voto complessivo e — la ragione per cui
//   questa fonte esiste nello step 8 — **i voti per singola piattaforma**.

const BASE_URL = 'https://backend.metacritic.com';

const DEFAULT_API_KEY = '1MOZgmNFxvmljaQR1b9LoEIYFMbFOEnE';

// `mcoTypeId=13` sono i giochi: senza, la ricerca restituisce anche film e
// serie, e "Indie Game: The Movie" comparirebbe fra i candidati.
const GAME_TYPE_ID = 13;

// Nessun limite pubblicato, quindi si sceglie prudente: tre richieste al
// secondo, come per HLTB. Il lavoro qui non ha fretta.
const MIN_INTERVAL_MS = 334;

const USER_AGENT = 'Ludex/0.1';

let lastRequestAt = 0;
let gate: Promise<void> = Promise.resolve();

function apiKey() {
  return process.env.METACRITIC_API_KEY || DEFAULT_API_KEY;
}

/** Distanzia le partenze, come il client HLTB. */
function acquire(): Promise<void> {
  const mine = gate.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  });
  gate = mine.catch(() => undefined);
  return mine;
}

async function get<T>(path: string): Promise<T | null> {
  await acquire();
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(
    `${BASE_URL}${path}${separator}apiKey=${apiKey()}`,
    { headers: { 'User-Agent': USER_AGENT } },
  );

  if (response.status === 404) return null;

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      'Metacritic: chiave rifiutata, probabilmente ruotata: va rimessa la nuova in METACRITIC_API_KEY',
    );
  }

  if (!response.ok) {
    throw new Error(`Metacritic ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

// --- Ricerca ---

type FinderRow = {
  slug?: string;
  title?: string;
  premiereYear?: number;
  typeId?: number;
};

export type MetacriticSearchHit = {
  slug: string;
  name: string;
  releaseYear: number | null;
};

export async function searchMetacriticGames(
  term: string,
  limit = 10,
): Promise<MetacriticSearchHit[]> {
  const body = await get<{ data?: { items?: FinderRow[] } }>(
    `/finder/metacritic/search/${encodeURIComponent(term)}/web?offset=0&limit=${limit}&mcoTypeId=${GAME_TYPE_ID}`,
  );

  return (body?.data?.items ?? [])
    .filter((row): row is FinderRow & { slug: string; title: string } =>
      Boolean(row.slug && row.title),
    )
    .map((row) => ({
      slug: row.slug,
      name: row.title,
      releaseYear: row.premiereYear ?? null,
    }));
}

// --- Scheda ---

type ScoreSummaryRow = {
  score?: number | null;
  reviewCount?: number | null;
  positiveCount?: number | null;
  neutralCount?: number | null;
  negativeCount?: number | null;
  sentiment?: string | null;
};

type PlatformRow = {
  slug?: string;
  name?: string;
  criticScoreSummary?: ScoreSummaryRow;
};

type ItemRow = {
  slug?: string;
  title?: string;
  premiereYear?: number;
  criticScoreSummary?: ScoreSummaryRow;
  platforms?: PlatformRow[];
};

export type MetacriticScore = {
  score: number;
  reviewCount: number | null;
  positiveCount: number | null;
  neutralCount: number | null;
  negativeCount: number | null;
  sentiment: string | null;
};

export type MetacriticGame = {
  slug: string;
  name: string;
  releaseYear: number | null;
  /**
   * Il voto che Metacritic pubblica come voto del gioco.
   *
   * **Non è una media fra le piattaforme**: è il voto della piattaforma
   * capofila, quella con più recensioni. Su Mafia significa 66, che è il port
   * Xbox, mentre il PC — la versione che uno ha in libreria — vale 88. È la
   * ragione per cui i voti per piattaforma qui sotto esistono, e per cui non
   * ci si poteva accontentare di una colonna su `games`.
   */
  overall: MetacriticScore | null;
  /** Solo le piattaforme che un voto ce l'hanno davvero. */
  platforms: { slug: string; name: string; score: MetacriticScore }[];
};

/**
 * Un voto, o null.
 *
 * Metacritic elenca fra le piattaforme anche quelle uscite senza recensioni —
 * Hollow Knight ha PS4, PS5 e Wii U con `score: null` — e quelle non sono un
 * voto zero: sono l'assenza di un voto.
 */
function toScore(summary: ScoreSummaryRow | undefined): MetacriticScore | null {
  if (!summary || summary.score === null || summary.score === undefined) {
    return null;
  }
  return {
    score: summary.score,
    reviewCount: summary.reviewCount ?? null,
    positiveCount: summary.positiveCount ?? null,
    neutralCount: summary.neutralCount ?? null,
    negativeCount: summary.negativeCount ?? null,
    sentiment: summary.sentiment ?? null,
  };
}

export async function fetchMetacriticGame(
  slug: string,
): Promise<MetacriticGame | null> {
  const body = await get<{
    components?: { data?: { item?: ItemRow } }[];
  }>(`/composer/metacritic/pages/games/${encodeURIComponent(slug)}/web`);

  // Il primo componente della pagina è il prodotto. Se non c'è, la pagina
  // esiste ma non è la scheda di un gioco: capita sugli slug sbagliati, che
  // rispondono 200 con una pagina di altro genere.
  const item = body?.components?.[0]?.data?.item;
  if (!item?.slug || !item.title) return null;

  const platforms = (item.platforms ?? []).flatMap((platform) => {
    const score = toScore(platform.criticScoreSummary);
    if (!platform.slug || !platform.name || !score) return [];
    return [{ slug: platform.slug, name: platform.name, score }];
  });

  return {
    slug: item.slug,
    name: item.title,
    releaseYear: item.premiereYear ?? null,
    overall: toScore(item.criticScoreSummary),
    platforms,
  };
}
