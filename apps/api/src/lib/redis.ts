import Redis from 'ioredis';

// Un client Redis per le cose che **non sono code**. BullMQ le sue connessioni
// se le crea da sé partendo dalle opzioni di `queue/connection.ts`, e quelle
// opzioni non vanno bene qui: `maxRetriesPerRequest: null` serve ai comandi
// bloccanti del worker, mentre una cache che non risponde è una cache da
// saltare, non un lavoro da mettere in attesa.
//
// Due scelte che contano:
//
// - **si crea alla prima chiamata, non all'import.** Chi importa un modulo che
//   di passaggio usa questa cache non deve aprire una connessione per il solo
//   fatto di averlo importato: i test puri fanno esattamente questo, e
//   finirebbero per pretendere Redis acceso.
// - **fallisce in fretta.** `commandTimeout` è il freno vero: senza, un comando
//   mandato a un Redis spento resta in coda ad aspettare che torni, e con lui
//   il job che lo aspetta.

/** Al massimo una riga al minuto sulla connessione: vedi l'ascoltatore sotto. */
const ERROR_LOG_INTERVAL_MS = 60 * 1000;

let client: Redis | null = null;

export const redisUrl = () => process.env.REDIS_URL ?? 'redis://localhost:6380';

/**
 * Senza un ascoltatore, ioredis stampa «Unhandled error event» a **ogni**
 * tentativo di riconnessione: con Redis giù sono decine di righe al minuto che
 * seppelliscono tutto il resto. Il guasto lo racconta già chi chiede davvero
 * qualcosa; qui serve solo che la riconnessione resti accesa e in silenzio.
 */
export function logErrorsQuietly(connection: Redis, name: string) {
  let lastErrorLoggedAt = 0;
  connection.on('error', (error: unknown) => {
    const now = Date.now();
    if (now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;

    lastErrorLoggedAt = now;
    console.log(`redis: ${name} in errore: ${String(error)}`);
  });
}

/**
 * Il client, per chi ha bisogno di più di una chiave: i contatori delle
 * chiamate (`api-calls.ts`). Chi lo usa gestisce da sé il Redis giù.
 */
export function redis() {
  if (client) return client;

  client = new Redis(redisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
  });
  logErrorsQuietly(client, 'connessione');

  return client;
}

/**
 * Il valore di una chiave, e **null anche quando Redis è giù**.
 *
 * Assenza e guasto si confondono di proposito: chi chiama ha lo stesso rimedio
 * per entrambi — ricalcolare ciò che la cache avrebbe dato — e distinguerli
 * vorrebbe dire chiedergli di gestire un caso che non sa gestire meglio.
 */
export async function cacheGet(key: string): Promise<string | null> {
  try {
    return await redis().get(key);
  } catch (error) {
    console.log(`redis: lettura di ${key} fallita: ${String(error)}`);
    return null;
  }
}

/** Scrive con una scadenza. Una cache senza TTL è una configurazione che nessuno ha deciso. */
export async function cacheSet(key: string, value: string, ttlSeconds: number) {
  try {
    await redis().set(key, value, 'EX', ttlSeconds);
  } catch (error) {
    console.log(`redis: scrittura di ${key} fallita: ${String(error)}`);
  }
}

/**
 * Prende la chiave se è libera, con una scadenza: `true` a chi arriva primo,
 * `false` a chi la trova già presa finché non scade.
 *
 * Con Redis giù risponde `false`: chi la usa per non ripetere un lavoro troppo
 * spesso salta il giro, e il lavoro che voleva accodare finirebbe comunque in
 * una coda che sta su quello stesso Redis.
 */
export async function claimOnce(key: string, ttlSeconds: number) {
  try {
    return (await redis().set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
  } catch (error) {
    console.log(`redis: presa di ${key} fallita: ${String(error)}`);
    return false;
  }
}

// Il turno condiviso di una fonte con un limite al secondo (oggi IGDB): la
// chiave tiene l'istante, in ms, da cui il prossimo può partire. Lo script è
// atomico, quindi due processi che prenotano insieme prendono due turni
// diversi, e l'ora la dà Redis: gli orologi dei processi non contano.
//
// ARGV[1] è quanto il turno occupa, ARGV[2] il ritardo minimo da adesso: 0
// per prenotare, la pausa dopo un 429 per spostare avanti tutti. La chiave
// scade poco dopo l'ultimo turno, così non resta in giro quando nessuno chiama.
const RESERVE_SLOT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local start = math.max(now + tonumber(ARGV[2]), tonumber(redis.call('GET', KEYS[1]) or '0'))
local after = start + tonumber(ARGV[1])
redis.call('SET', KEYS[1], after, 'PX', after - now + 1000)
return start - now
`;

/**
 * Prenota il prossimo turno libero su `key`, lungo `intervalMs`, non prima di
 * `notBeforeMs` da adesso, e risponde fra quanti ms parte. **Null con Redis
 * giù**: chi chiama distanzia da sé, dentro il suo processo.
 */
export async function reserveSlot(
  key: string,
  intervalMs: number,
  notBeforeMs = 0,
): Promise<number | null> {
  try {
    return Number(
      await redis().eval(RESERVE_SLOT, 1, key, intervalMs, notBeforeMs),
    );
  } catch (error) {
    console.log(`redis: turno su ${key} non prenotato: ${String(error)}`);
    return null;
  }
}

/**
 * Pubblica su un canale. Come la cache, un Redis giù non ferma chi pubblica:
 * un evento perso costa una pagina che si aggiorna al prossimo, non un job
 * fallito.
 */
export async function redisPublish(channel: string, message: string) {
  try {
    await redis().publish(channel, message);
  } catch (error) {
    console.log(`redis: pubblicazione su ${channel} fallita: ${String(error)}`);
  }
}
