import type { Store } from '@repo/contracts/vocabulary';

import { notifyAdmin } from '../lib/notify';
import { claimOnce } from '../lib/redis';

/**
 * Un codice ancora sconosciuto dopo questo tempo avvisa di nuovo: il primo
 * messaggio può essersi perso fra gli altri.
 */
const REMIND_AFTER_SECONDS = 30 * 24 * 60 * 60;

/**
 * Avvisa l'admin dei codici di piattaforma che la mappa del negozio non conosce,
 * **una volta per codice**.
 *
 * Le voci con un codice così si saltano e non arrivano nemmeno fra gli scarti:
 * senza avviso l'unica traccia è il log del worker, che ruota. È successo con
 * `BEE` (la Switch 2), scoperto solo perché un utente non trovava un gioco.
 *
 * Con Redis giù `claimOnce` dà `false` e l'avviso salta: resta il log.
 */
export async function warnUnknownPlatforms(
  store: Store,
  sconosciuti: Map<string, string>,
): Promise<void> {
  for (const [codice, esempio] of sconosciuti) {
    const key = `unknown-platform:${store}:${codice}`;
    if (!(await claimOnce(key, REMIND_AFTER_SECONDS))) continue;
    await notifyAdmin(
      `Ludex · ${store}: codice di piattaforma sconosciuto ${codice} (es. «${esempio}»). Le voci si saltano finché non lo si aggiunge.`,
    );
  }
}
