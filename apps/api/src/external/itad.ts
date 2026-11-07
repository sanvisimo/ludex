// Client IsThereAnyDeal. Come gli altri sta fuori da `services/`: è l'accesso a
// un servizio esterno, non logica di dominio. Forma delle risposte e misure in
// `plans/itad-prezzo.md`, e `itad:probe` le rifà contro il servizio vero.
//
// Al contrario di HLTB e Metacritic qui si chiama **su richiesta dell'utente**:
// è una API ufficiale, e il prezzo non si salva perché cambia ogni giorno. Per
// questo c'è un timeout stretto, e soprattutto la pausa dopo un 429: la pagina
// del gioco è pubblica, ITAD concede 1000 richieste ogni 5 minuti e bandisce chi
// insiste sul limite.
//
// La pausa sta in Redis perché la vedano tutti i processi. Con Redis giù non c'è
// pausa: si perde la prudenza, non il prezzo.

import { cacheGet, cacheSet } from '../lib/redis';
import { countedFetch } from '../lib/api-calls';

const BASE_URL = 'https://api.isthereanydeal.com';

const TIMEOUT_MS = 5000;

const COOLDOWN_KEY = 'itad:cooldown';

// Se ITAD non dice quanto aspettare, la sua finestra intera.
const DEFAULT_COOLDOWN_SECONDS = 5 * 60;

// Fisso, come la regione di PSN: vedi il piano.
const COUNTRY = 'IT';

// Gli id dei negozi su ITAD, da `GET /service/shops/v1`. Epic non c'è: i nostri
// id non gli dicono niente (0 su 678).
const SHOP_IDS = { steam: 61, gog: 35 } as const;

export type ItadStore = keyof typeof SHOP_IDS;

export type ItadInfo = { id: string; title: string; type: string | null };

type ItadPrice = { amount: number; amountInt: number; currency: string };

export type ItadOverview = {
  id: string;
  current: {
    shop: { id: number; name: string };
    price: ItadPrice;
    regular: ItadPrice;
    cut: number;
    // `H` minimo storico, `N` nuovo minimo, `S` minimo del negozio.
    flag: 'H' | 'N' | 'S' | null;
  };
  // Nullo sui giochi senza uno storico, per esempio i gratuiti.
  lowest: { shop: { id: number; name: string }; price: ItadPrice } | null;
  urls: { game: string };
};

/** Senza chiave l'overview risponde 403: si evita di chiamare e basta. */
export function itadEnabled() {
  return Boolean(process.env.ITAD_API_KEY);
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const key = process.env.ITAD_API_KEY;
  if (!key) throw new Error('ITAD: manca ITAD_API_KEY');

  if (await cacheGet(COOLDOWN_KEY)) {
    throw new Error('ITAD: in pausa dopo un 429');
  }

  // La chiave nell'header e non in `?key=`, così non finisce nei log.
  const response = await countedFetch('itad', `${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(body === undefined
      ? { headers: { 'ITAD-API-Key': key } }
      : {
          method: 'POST',
          headers: {
            'ITAD-API-Key': key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    await cacheSet(
      COOLDOWN_KEY,
      '1',
      retryAfter > 0 ? Math.ceil(retryAfter) : DEFAULT_COOLDOWN_SECONDS,
    );
    throw new Error('ITAD: 429, troppe richieste');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('ITAD: chiave rifiutata, controlla ITAD_API_KEY');
  }

  if (!response.ok) throw new Error(`ITAD ${path}: ${response.status}`);

  return (await response.json()) as T;
}

/**
 * Dagli id di un negozio agli UUID di ITAD, per id **nostro**: Steam vuole
 * `app/<appid>`, GOG l'id nudo, e chi chiama non deve saperlo. `null` se ITAD
 * non lo conosce.
 */
export async function lookupItadIds(
  store: ItadStore,
  ids: string[],
): Promise<Map<string, string | null>> {
  const toItad = (id: string) => (store === 'steam' ? `app/${id}` : id);

  const found = await request<Record<string, string | null>>(
    `/lookup/id/shop/${SHOP_IDS[store]}/v1`,
    ids.map(toItad),
  );
  return new Map(ids.map((id) => [id, found[toItad(id)] ?? null]));
}

export function fetchItadInfo(uuid: string): Promise<ItadInfo> {
  return request<ItadInfo>(`/games/info/v2?id=${encodeURIComponent(uuid)}`);
}

/**
 * Il prezzo di adesso e il minimo storico. `null` se ITAD non restituisce il
 * gioco: succede coi titoli ritirati, che si legge come «nessuna offerta».
 *
 * `vouchers=false` perché la riga non ha posto per il codice sconto: il prezzo
 * è quello che si paga senza.
 */
export async function fetchItadOverview(
  uuid: string,
): Promise<ItadOverview | null> {
  const { prices } = await request<{ prices: ItadOverview[] }>(
    `/games/overview/v2?country=${COUNTRY}&vouchers=false`,
    [uuid],
  );
  return prices.find((price) => price.id === uuid) ?? null;
}
