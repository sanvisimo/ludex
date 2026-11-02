import type { GamePrice } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, eq, inArray } from '@repo/db/orm';

import {
  fetchItadInfo,
  fetchItadOverview,
  itadEnabled,
  lookupItadIds,
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

/** Gli UUID di questi id, dalla cache dove ci sono e da ITAD per gli altri. */
async function lookupCached(store: ItadStore, ids: string[]) {
  const key = (id: string) => `itad:id:${store}:${id}`;
  const uuids = new Map<string, string | null>();
  const missing: string[] = [];

  for (const id of ids) {
    const cached = await cacheGet(key(id));
    if (cached === null) missing.push(id);
    else uuids.set(id, cached === NONE ? null : cached);
  }
  if (!missing.length) return uuids;

  // Un errore qui risale senza scrivere: un ITAD giù non è un «non lo conosco».
  const found = await lookupItadIds(store, missing);
  for (const id of missing) {
    const uuid = found.get(id) ?? null;
    uuids.set(id, uuid);
    if (uuid) await cacheSet(key(id), uuid, idTtl());
    else await cacheSet(key(id), NONE, notFoundTtl());
  }
  return uuids;
}

async function isGame(uuid: string) {
  const key = `itad:type:${uuid}`;
  const cached = await cacheGet(key);
  if (cached !== null) return cached === 'game';

  const { type } = await fetchItadInfo(uuid);
  await cacheSet(key, type ?? NONE, idTtl());
  return type === 'game';
}

/**
 * L'UUID ITAD di un gioco, `null` se non ne ha uno. Solo dagli id di negozio,
 * mai dal titolo: l'identità non si indovina dal nome.
 *
 * Un gioco può averne più d'uno, 120 su 2328 sul catalogo di sviluppo: un
 * Playtest o una Demo agganciati allo stesso gioco, o edizioni diverse fra Steam
 * e GOG. Allora contano prima le voci che ITAD dà come `game`, poi Steam su GOG,
 * poi l'id più basso. Se nessuna è un `game`, valgono le altre due regole.
 *
 * Risale con un errore se ITAD non risponde.
 */
export async function resolveItadId(gameId: string): Promise<string | null> {
  if (!itadEnabled()) return null;

  const rows = await db
    .select({
      source: schema.externalIds.source,
      externalId: schema.externalIds.externalId,
    })
    .from(schema.externalIds)
    .where(
      and(
        eq(schema.externalIds.gameId, gameId),
        inArray(schema.externalIds.source, STORES),
      ),
    );

  const candidates: string[] = [];
  for (const store of STORES) {
    const ids = rows
      .filter((row) => row.source === store)
      .map((row) => row.externalId)
      .sort((a, b) => Number(a) - Number(b));
    if (!ids.length) continue;

    const uuids = await lookupCached(store, ids);
    for (const id of ids) {
      const uuid = uuids.get(id);
      if (uuid && !candidates.includes(uuid)) candidates.push(uuid);
    }
  }

  if (candidates.length < 2) return candidates[0] ?? null;

  for (const uuid of candidates) {
    if (await isGame(uuid)) return uuid;
  }
  return candidates[0] ?? null;
}

/**
 * Il prezzo per la riga della pagina del gioco. `null` se la riga non c'è: il
 * gioco non ha un id ITAD, o non si riesce a saperlo. Con l'id noto e ITAD giù
 * la riga resta, col solo link, e niente finisce in cache.
 *
 * Non lancia mai: è un di più della pagina, e un guasto di ITAD non è un errore
 * per chi la guarda.
 */
export async function findGamePrice(gameId: string): Promise<GamePrice | null> {
  let uuid: string | null;
  try {
    uuid = await resolveItadId(gameId);
  } catch (error) {
    console.log(`itad: id di ${gameId} non risolto: ${String(error)}`);
    return null;
  }
  if (!uuid) return null;

  const key = `itad:price:${uuid}`;
  const cached = await cacheGet(key);
  if (cached) return JSON.parse(cached) as GamePrice;

  const url = `https://isthereanydeal.com/game/id:${uuid}/info/`;
  try {
    const overview = await fetchItadOverview(uuid);
    const price: GamePrice = {
      url,
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
    await cacheSet(key, JSON.stringify(price), PRICE_TTL_SECONDS);
    return price;
  } catch (error) {
    console.log(`itad: prezzo di ${uuid} non letto: ${String(error)}`);
    return { url, current: null };
  }
}
