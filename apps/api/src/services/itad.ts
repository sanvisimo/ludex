import type { GamePrice } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, inArray } from '@repo/db/orm';

import {
  fetchItadInfo,
  fetchItadOverviews,
  itadEnabled,
  lookupItadIds,
  type ItadOverview,
  type ItadStore,
} from '../external/itad';
import { cacheGet, cacheSet } from '../lib/redis';

// Quale voce di IsThereAnyDeal è un nostro gioco.
//
// L'id **non si salva in database**: è solo l'indirizzo per chiedere un prezzo,
// e ITAD unisce le edizioni, così due nostri giochi possono avere lo stesso id
// (Control e Control: Ultimate Edition). Sta in Redis, per id di negozio: un
// appid nuovo è una chiave nuova, e non serve nessun evento per riaprire niente.
// Se Redis si svuota, si richiede. Vedi `plans/itad-prezzo.md`.

const STORES: ItadStore[] = ['steam', 'gog'];

const DEFAULT_ID_TTL_DAYS = 30;
const DEFAULT_NOT_FOUND_TTL_DAYS = 7;

const PRICE_TTL_SECONDS = 3 * 60 * 60;

// Il massimo di UUID che l'overview accetta in una richiesta.
const OVERVIEW_BATCH = 200;

// Una chiave che non c'è e un id che ITAD non conosce vanno distinti, o ogni
// apertura della pagina di un gioco solo console rifarebbe il lookup.
const NONE = 'none';

function ttlSeconds(name: string, fallbackDays: number) {
  const days = Number(process.env[name]);
  return Math.ceil((days > 0 ? days : fallbackDays) * 24 * 60 * 60);
}

const idTtl = () => ttlSeconds('ITAD_ID_TTL_DAYS', DEFAULT_ID_TTL_DAYS);
const notFoundTtl = () =>
  ttlSeconds('ITAD_NOT_FOUND_TTL_DAYS', DEFAULT_NOT_FOUND_TTL_DAYS);

/**
 * Gli UUID di questi id, dalla cache dove ci sono e da ITAD per gli altri. Se
 * ITAD non risponde restano quelli in cache, e gli altri mancano dalla mappa:
 * un ITAD giù non è un «non lo conosco», e non si scrive niente.
 */
async function lookupCached(store: ItadStore, ids: string[]) {
  const key = (id: string) => `itad:id:${store}:${id}`;
  const uuids = new Map<string, string | null>();
  const missing: string[] = [];

  for (const id of ids) {
    const cached = await cacheGet(key(id));
    if (cached === null) missing.push(id);
    else uuids.set(id, cached === NONE ? null : cached);
  }
  if (!missing.length) return { uuids, error: null };

  let found: Map<string, string | null>;
  try {
    found = await lookupItadIds(store, missing);
  } catch (error) {
    return { uuids, error };
  }
  for (const id of missing) {
    const uuid = found.get(id) ?? null;
    uuids.set(id, uuid);
    if (uuid) await cacheSet(key(id), uuid, idTtl());
    else await cacheSet(key(id), NONE, notFoundTtl());
  }
  return { uuids, error: null };
}

async function isGame(uuid: string) {
  const key = `itad:type:${uuid}`;
  const cached = await cacheGet(key);
  if (cached !== null) return cached === 'game';

  const { type } = await fetchItadInfo(uuid);
  await cacheSet(key, type ?? NONE, idTtl());
  return type === 'game';
}

async function pickUuid(candidates: string[]) {
  if (candidates.length < 2) return candidates[0] ?? null;

  for (const uuid of candidates) {
    if (await isGame(uuid)) return uuid;
  }
  return candidates[0] ?? null;
}

/**
 * Gli UUID ITAD di più giochi insieme: un lookup per negozio per tutti, così
 * una fascia di card costa quanto una pagina di gioco. Un gioco senza UUID ha
 * `null`; uno che non si riesce a risolvere perché ITAD non risponde manca
 * dalla mappa, ed `error` dice perché.
 *
 * Solo dagli id di negozio, mai dal titolo: l'identità non si indovina dal
 * nome. Un gioco può averne più d'uno, 120 su 2328 sul catalogo di sviluppo: un
 * Playtest o una Demo agganciati allo stesso gioco, o edizioni diverse fra Steam
 * e GOG. Allora contano prima le voci che ITAD dà come `game`, poi Steam su GOG,
 * poi l'id più basso. Se nessuna è un `game`, valgono le altre due regole.
 */
async function resolveItadIds(gameIds: string[]) {
  const resolved = new Map<string, string | null>();
  if (!itadEnabled() || !gameIds.length) {
    for (const gameId of gameIds) resolved.set(gameId, null);
    return { resolved, error: null as unknown };
  }

  const rows = await db
    .select({
      gameId: schema.externalIds.gameId,
      source: schema.externalIds.source,
      externalId: schema.externalIds.externalId,
    })
    .from(schema.externalIds)
    .where(
      and(
        inArray(schema.externalIds.gameId, gameIds),
        inArray(schema.externalIds.source, STORES),
      ),
    );

  let error: unknown = null;
  const byStore = new Map<ItadStore, Map<string, string | null>>();
  for (const store of STORES) {
    const ids = [
      ...new Set(
        rows.filter((row) => row.source === store).map((row) => row.externalId),
      ),
    ];
    if (!ids.length) continue;
    const lookup = await lookupCached(store, ids);
    byStore.set(store, lookup.uuids);
    error ??= lookup.error;
  }

  for (const gameId of gameIds) {
    const candidates: string[] = [];
    let unknown = false;
    for (const store of STORES) {
      const ids = rows
        .filter((row) => row.gameId === gameId && row.source === store)
        .map((row) => row.externalId)
        .sort((a, b) => Number(a) - Number(b));
      for (const id of ids) {
        const uuids = byStore.get(store);
        if (!uuids?.has(id)) {
          unknown = true;
          continue;
        }
        const uuid = uuids.get(id);
        if (uuid && !candidates.includes(uuid)) candidates.push(uuid);
      }
    }
    if (unknown) continue;

    try {
      resolved.set(gameId, await pickUuid(candidates));
    } catch (pickError) {
      error ??= pickError;
    }
  }
  return { resolved, error };
}

/**
 * L'UUID ITAD di un gioco, `null` se non ne ha uno. Le regole sono quelle di
 * `resolveItadIds`. Risale con un errore se ITAD non risponde.
 */
export async function resolveItadId(gameId: string): Promise<string | null> {
  const { resolved, error } = await resolveItadIds([gameId]);
  if (!resolved.has(gameId)) throw error;
  return resolved.get(gameId) ?? null;
}

const itadUrl = (uuid: string) =>
  `https://isthereanydeal.com/game/id:${uuid}/info/`;

function toPrice(uuid: string, overview: ItadOverview | null): GamePrice {
  return {
    url: itadUrl(uuid),
    current: overview && {
      amount: overview.current.price.amount,
      currency: overview.current.price.currency,
      shop: overview.current.shop.name,
      // ITAD segna `H` anche i giochi sempre gratuiti, dove «minimo storico»
      // non vuol dire niente. Un gioco scontato al 100% invece lo è davvero.
      historicalLow:
        overview.current.regular.amountInt > 0 &&
        (overview.current.flag === 'H' || overview.current.flag === 'N'),
    },
  };
}

/**
 * I prezzi per le righe di IsThereAnyDeal, per gioco: `null` dove la riga non
 * c'è, perché il gioco non ha un id ITAD o non si riesce a saperlo. Con l'id
 * noto e ITAD giù la riga resta, col solo link, e niente finisce in cache. Una
 * overview sola per tutti i prezzi che non sono in cache.
 *
 * Non lancia mai: è un di più della pagina, e un guasto di ITAD non è un errore
 * per chi la guarda.
 */
export async function findGamePrices(
  gameIds: string[],
): Promise<Map<string, GamePrice | null>> {
  const prices = new Map<string, GamePrice | null>(
    gameIds.map((gameId) => [gameId, null]),
  );

  let resolved: Map<string, string | null>;
  try {
    const result = await resolveItadIds(gameIds);
    resolved = result.resolved;
    if (result.error) {
      console.log(`itad: id non risolti: ${String(result.error)}`);
    }
  } catch (error) {
    console.log(`itad: id non risolti: ${String(error)}`);
    return prices;
  }

  const byUuid = new Map<string, GamePrice>();
  const missing: string[] = [];
  for (const uuid of new Set(resolved.values())) {
    if (!uuid) continue;
    const cached = await cacheGet(`itad:price:${uuid}`);
    if (cached) byUuid.set(uuid, JSON.parse(cached) as GamePrice);
    else missing.push(uuid);
  }

  for (let start = 0; start < missing.length; start += OVERVIEW_BATCH) {
    const chunk = missing.slice(start, start + OVERVIEW_BATCH);
    try {
      const overviews = await fetchItadOverviews(chunk);
      for (const uuid of chunk) {
        const price = toPrice(uuid, overviews.get(uuid) ?? null);
        byUuid.set(uuid, price);
        await cacheSet(
          `itad:price:${uuid}`,
          JSON.stringify(price),
          PRICE_TTL_SECONDS,
        );
      }
    } catch (error) {
      console.log(`itad: prezzi non letti: ${String(error)}`);
      for (const uuid of chunk) byUuid.set(uuid, toPrice(uuid, null));
    }
  }

  for (const [gameId, uuid] of resolved) {
    if (uuid) prices.set(gameId, byUuid.get(uuid) ?? null);
  }
  return prices;
}

/** Il prezzo per la riga della pagina del gioco: vedi `findGamePrices`. */
export async function findGamePrice(gameId: string): Promise<GamePrice | null> {
  return (await findGamePrices([gameId])).get(gameId) ?? null;
}
