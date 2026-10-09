import { EventPublisher } from '@orpc/server';
import type { LiveEvent } from '@repo/contracts';
import Redis from 'ioredis';

import { logErrorsQuietly, redisPublish, redisUrl } from './redis';

/**
 * Gli aggiornamenti in push, dal worker al browser.
 *
 * Chi cambia i dati è il worker, e il browser parla solo col server HTTP: sono
 * due processi, e fra loro c'è Redis. Il worker pubblica su un canale, il
 * server tiene **una** sottoscrizione a quel canale e smista in memoria alle
 * connessioni aperte, ciascuna col suo filtro per utente.
 *
 * Pub/sub e non uno stream: un evento perso non va recuperato. Il browser che
 * si riconnette rilegge tutto, ed è più semplice e più vero di uno storico.
 */

const CHANNEL = 'ludex:events';

/**
 * Ciò che viaggia su Redis: l'evento, più a chi è destinato. Il destinatario si
 * toglie prima di spedirlo al browser (vedi `eventForUser`).
 */
export type RelayedEvent =
  | {
      type: 'import';
      phase: 'started' | 'finished';
      storeAccountId: string;
      userId: string;
    }
  | { type: 'games'; gameIds: string[] }
  | { type: 'sources' };

/**
 * Cosa di un evento può vedere un utente, o `null` se non lo riguarda.
 *
 * Gli import sono del proprietario dell'account. I giochi sono di tutti:
 * `games` è condivisa, un id non dice niente di nessuno, e filtrarli per
 * backlog vorrebbe dire una query per evento e per connessione. `sources` non
 * porta niente: dice solo che qualcosa è cambiato, e chi non ha aperto l'admin
 * non rilegge nulla.
 */
export function eventForUser(
  event: RelayedEvent,
  userId: string,
): LiveEvent | null {
  if (event.type === 'games' || event.type === 'sources') return event;
  if (event.userId !== userId) return null;
  return {
    type: 'import',
    phase: event.phase,
    storeAccountId: event.storeAccountId,
  };
}

// --- lato worker -------------------------------------------------------------

export function publishEvent(event: RelayedEvent) {
  return redisPublish(CHANNEL, JSON.stringify(event));
}

/**
 * Ogni quanto, al massimo, parte un evento `games`. Un import da mille giochi
 * produce migliaia di enrichment in pochi minuti: uno per gioco vorrebbe dire
 * rileggere la lista a ogni gioco, cinque secondi la rilegge a blocchi.
 */
const GAMES_FLUSH_MS = 5_000;

const pendingGames = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** L'enrichment ha scritto questo gioco: parte col prossimo blocco. */
export function notifyGameChanged(gameId: string) {
  pendingGames.add(gameId);
  flushTimer ??= setTimeout(() => void flushGameChanges(), GAMES_FLUSH_MS);
}

/** Spedisce subito il blocco in attesa. Il worker la chiama anche chiudendo. */
export async function flushGameChanges() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (pendingGames.size === 0) return;

  const gameIds = [...pendingGames];
  pendingGames.clear();
  await publishEvent({ type: 'games', gameIds });
}

/**
 * Ogni quanto, al massimo, parte un evento `sources`. Una spazzata accoda cento
 * giochi per fonte: un evento per job rileggerebbe la tabella dell'admin cento
 * volte, due secondi la rileggono a blocchi e la riga sparisce comunque in tempo
 * per chi sta guardando.
 */
const SOURCES_FLUSH_MS = 2_000;

let sourcesTimer: ReturnType<typeof setTimeout> | null = null;

/** Un enrichment è finito, con qualunque esito: parte col prossimo blocco. */
export function notifySourcesChanged() {
  sourcesTimer ??= setTimeout(
    () => void flushSourcesChanged(),
    SOURCES_FLUSH_MS,
  );
}

/** Spedisce subito l'evento in attesa. Il worker la chiama anche chiudendo. */
export async function flushSourcesChanged() {
  if (!sourcesTimer) return;
  clearTimeout(sourcesTimer);
  sourcesTimer = null;
  await publishEvent({ type: 'sources' });
}

// --- lato server -------------------------------------------------------------

/** Lo smistamento in memoria: un abbonato per connessione aperta. */
export const liveEvents = new EventPublisher<{ event: RelayedEvent }>();

/**
 * Apre la sottoscrizione al canale. Una sola per processo, all'avvio del
 * server: ioredis la rinnova da sé a ogni riconnessione.
 *
 * Una connessione a parte e non quella della cache: in modalità sottoscrizione
 * Redis accetta solo comandi di sottoscrizione.
 */
export function startEventRelay() {
  const subscriber = new Redis(redisUrl());
  logErrorsQuietly(subscriber, 'sottoscrizione eventi');

  subscriber.on('message', (_channel: string, message: string) => {
    try {
      liveEvents.publish('event', JSON.parse(message) as RelayedEvent);
    } catch (error) {
      console.log(`eventi: messaggio illeggibile: ${String(error)}`);
    }
  });

  subscriber.subscribe(CHANNEL).catch((error: unknown) => {
    console.log(`eventi: sottoscrizione fallita: ${String(error)}`);
  });
}
