// Client OpenCritic. Come igdb.ts e hltb.ts sta fuori da `services/`: è
// l'accesso a un servizio esterno, non logica di dominio.
//
// A differenza degli altri due, qui la risorsa scarsa non è il tempo ma il
// **numero di chiamate**. OpenCritic non ha più un accesso anonimo — l'API
// pubblica risponde "API key is required" — e il piano gratuito su RapidAPI dà
// due budget separati, che si azzerano ogni ventiquattr'ore:
//
//     200 richieste al giorno        25 ricerche al giorno
//
// Una ricerca costa **sia** una ricerca sia una richiesta. Le ricerche sono
// quindi la cosa da non sprecare, ed è per questo che l'identità dei giochi si
// prende da Wikidata (`wikidata.ts`) e non cercando per nome: una volta noto
// l'id, arricchire un gioco costa una richiesta sola.
//
// Il budget non va indovinato: **la risposta lo dichiara**, in ogni chiamata.

const HOST = 'opencritic-api.p.rapidapi.com';
const BASE_URL = `https://${HOST}`;

// Gli header dicono "100-in-1sec", ma qui non c'è nessuna fretta: il collo di
// bottiglia è il budget giornaliero, non il ritmo.
const MIN_INTERVAL_MS = 250;

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

/**
 * L'ultimo budget dichiarato da OpenCritic.
 *
 * In memoria e non in Redis, con cognizione di causa: oggi la spazzata e i job
 * girano nello stesso processo worker, che è l'unico a parlare con OpenCritic.
 * Con più worker ciascuno vedrebbe la sua metà e insieme sforerebbero — a quel
 * punto va in Redis, e il segnale che è ora sarà un 429 invece di uno zero.
 *
 * `null` significa "non lo sappiamo ancora": all'avvio non è ancora arrivata
 * nessuna risposta, e chi decide deve poter distinguere quel caso da "finito".
 */
let quota: OpenCriticQuota = { requests: null, searches: null };

export type OpenCriticQuota = {
  requests: number | null;
  searches: number | null;
};

export function openCriticQuota(): OpenCriticQuota {
  return { ...quota };
}

function apiKey() {
  const key = process.env.OPENCRITIC_API_KEY;
  if (!key) {
    throw new Error(
      'OPENCRITIC_API_KEY non impostata nel .env (la si prende su rapidapi.com)',
    );
  }
  return key;
}

function readQuota(headers: Headers) {
  const numero = (name: string) => {
    const raw = headers.get(name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  const requests = numero('x-ratelimit-requests-remaining');
  const searches = numero('x-ratelimit-searches-remaining');
  // Si aggiorna solo ciò che è arrivato: una risposta d'errore può non portarli
  // entrambi, e sovrascrivere con null farebbe sembrare sconosciuto un budget
  // che invece conosciamo.
  if (requests !== null) quota.requests = requests;
  if (searches !== null) quota.searches = searches;
}

/** Serializza le chiamate e le distanzia, come il client IGDB. */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Sollevata quando il budget del giorno è finito: non è un guasto. */
export class OpenCriticQuotaError extends Error {
  constructor(quale: 'richieste' | 'ricerche') {
    super(`OpenCritic: budget ${quale} esaurito per oggi`);
    this.name = 'OpenCriticQuotaError';
  }
}

async function request<T>(path: string): Promise<T | null> {
  return schedule(async () => {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { 'X-RapidAPI-Key': apiKey(), 'X-RapidAPI-Host': HOST },
    });

    readQuota(response.headers);

    // 404 è una risposta, non un guasto: quell'id su OpenCritic non c'è.
    if (response.status === 404) return null;

    // 429 vuol dire che il budget è finito davvero, comunque la pensasse il
    // nostro contatore. Si distingue perché chi chiama deve poterlo trattare
    // come "riprova domani" e non come "questo gioco non esiste".
    if (response.status === 429) {
      quota = { requests: 0, searches: 0 };
      throw new OpenCriticQuotaError('richieste');
    }

    if (!response.ok) {
      throw new Error(
        `OpenCritic ${path}: ${response.status} ${await response.text()}`,
      );
    }

    return (await response.json()) as T;
  });
}

// --- Ricerca: la strada cara, per i giochi che Wikidata non mappa ---

type OpenCriticSearchRow = { id: number; name: string; dist: number };

/**
 * Un candidato della ricerca. **Non c'è l'anno**, ed è la differenza che conta
 * rispetto a HLTB: qui il matcher può giudicare solo il nome, e l'anno si
 * verifica dopo, sulla scheda — che è una richiesta che si sarebbe fatta
 * comunque.
 *
 * `dist` è la loro distanza fra i due titoli (0 = identico). Non la usiamo per
 * decidere: il giudizio lo dà `title-match`, che è lo stesso per tutte le
 * fonti e che sappiamo come si comporta.
 */
export type OpenCriticSearchHit = { id: number; name: string };

export async function searchOpenCriticGames(
  term: string,
): Promise<OpenCriticSearchHit[]> {
  if (quota.searches !== null && quota.searches <= 0) {
    throw new OpenCriticQuotaError('ricerche');
  }

  const rows = await request<OpenCriticSearchRow[]>(
    `/game/search?criteria=${encodeURIComponent(term)}`,
  );
  return (rows ?? []).map((row) => ({ id: row.id, name: row.name }));
}

// --- Scheda: la strada normale, un id e una richiesta ---

type OpenCriticGameRow = {
  id: number;
  name: string;
  topCriticScore?: number;
  medianScore?: number;
  percentRecommended?: number;
  numReviews?: number;
  numTopCriticReviews?: number;
  tier?: string;
  firstReleaseDate?: string;
};

export type OpenCriticGame = {
  id: number;
  name: string;
  /** Media dei critici di punta. Nullo se il gioco non ha ancora recensioni. */
  topCriticScore: number | null;
  medianScore: number | null;
  percentRecommended: number | null;
  numReviews: number | null;
  tier: string | null;
  releaseYear: number | null;
};

/**
 * OpenCritic usa **-1** per "non c'è", non l'assenza del campo: un gioco senza
 * recensioni ha `topCriticScore: -1`. Scritto così com'è diventerebbe un voto
 * negativo in classifica.
 */
function score(value: number | undefined) {
  return value === undefined || value < 0 ? null : value;
}

export async function fetchOpenCriticGame(
  id: number,
): Promise<OpenCriticGame | null> {
  const row = await request<OpenCriticGameRow>(`/game/${Math.trunc(id)}`);
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    topCriticScore: score(row.topCriticScore),
    medianScore: score(row.medianScore),
    percentRecommended: score(row.percentRecommended),
    numReviews: row.numReviews ?? null,
    tier: row.tier ?? null,
    releaseYear: row.firstReleaseDate
      ? new Date(row.firstReleaseDate).getUTCFullYear()
      : null,
  };
}
