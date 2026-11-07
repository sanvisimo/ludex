import {
  apiCallSourceValues,
  type ApiCallSource,
} from '@repo/contracts/vocabulary';

import { redis } from './redis';

// Quante chiamate facciamo alle fonti esterne, e quanti 429 riceviamo: la
// tabella «Fonti esterne» della sezione Uso dell'admin (plans/admin-uso.md).
//
// Un contatore per giorno, in Redis e non in Postgres: server e worker
// chiamano le stesse fonti da due processi, e un contatore in memoria ne
// vedrebbe metà. Una chiave hash per giorno, un campo per fonte, e una
// scadenza: oltre i 30 giorni non lo guarda nessuno.
//
// Il giorno è quello UTC, come le chiavi: «oggi» nell'admin comincia
// all'una o alle due di notte italiane.

const TTL_SECONDS = 31 * 24 * 60 * 60;

const day = (date: Date) => date.toISOString().slice(0, 10);
const callsKey = (date: Date) => `apicalls:${day(date)}`;
const rejectedKey = (date: Date) => `apicalls429:${day(date)}`;

/**
 * Conta una chiamata, e il 429 se lo è. Non si aspetta e non fallisce mai:
 * un contatore perso costa un numero un po' più basso nell'admin, mentre un
 * Redis giù che fermasse le chiamate fermerebbe l'enrichment.
 */
function count(key: string, source: ApiCallSource) {
  // I test stubbano le fonti, ma il Redis è quello dello sviluppo: senza,
  // ogni giro dei test gonfierebbe i contatori che l'admin legge in locale.
  if (process.env.NODE_ENV === 'test') return;

  redis()
    .multi()
    .hincrby(key, source, 1)
    .expire(key, TTL_SECONDS)
    .exec()
    .catch(() => undefined);
}

/**
 * `fetch`, contato. La chiamata si conta quando parte, anche se poi cade la
 * rete: è una richiesta che la fonte può aver visto.
 */
export async function countedFetch(
  source: ApiCallSource,
  input: string | URL,
  init?: RequestInit,
) {
  const now = new Date();
  count(callsKey(now), source);

  const response = await fetch(input, init);
  if (response.status === 429) count(rejectedKey(now), source);

  return response;
}

export type ApiCallDay = {
  calls: Partial<Record<ApiCallSource, number>>;
  rejected: Partial<Record<ApiCallSource, number>>;
};

/**
 * I contatori degli ultimi `days` giorni, oggi per primo. Con Redis giù
 * risponde `null`: «non lo sappiamo» non è «zero chiamate».
 */
export async function readApiCalls(
  days: number,
  now = new Date(),
): Promise<ApiCallDay[] | null> {
  const dates = Array.from(
    { length: days },
    (_, i) => new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
  );

  const pipeline = redis().pipeline();
  for (const date of dates) {
    pipeline.hgetall(callsKey(date));
    pipeline.hgetall(rejectedKey(date));
  }

  try {
    const results = (await pipeline.exec()) ?? [];
    return dates.map((_, i) => ({
      calls: toCounts(results[i * 2]?.[1]),
      rejected: toCounts(results[i * 2 + 1]?.[1]),
    }));
  } catch (error) {
    console.log(`redis: lettura dei contatori fallita: ${String(error)}`);
    return null;
  }
}

function toCounts(raw: unknown): Partial<Record<ApiCallSource, number>> {
  const counts: Partial<Record<ApiCallSource, number>> = {};
  if (!raw || typeof raw !== 'object') return counts;

  for (const source of apiCallSourceValues) {
    const value = Number((raw as Record<string, string>)[source]);
    if (value > 0) counts[source] = value;
  }
  return counts;
}
