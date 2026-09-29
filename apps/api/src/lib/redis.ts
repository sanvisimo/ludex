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

function redis() {
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
