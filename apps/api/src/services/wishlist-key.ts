import type { Store } from '@repo/contracts/vocabulary';

import { titleIdFromEntitlement } from '../external/psn';

/**
 * La chiave con cui `external_ids` conosce una voce di wishlist, o `null` se non
 * ne ha una.
 *
 * Su Steam e GOG è l'id del negozio com'è. Su PSN no: l'id della wishlist è un id
 * di **prodotto** (`EP3643-PPSA06465_00-3571249245584917`, lo stesso pezzo finale
 * dell'indirizzo della pagina) e `external_ids` tiene il `titleId`, che ne è il
 * pezzo di mezzo (`PPSA06465_00`). Misurato il 13/10/2026 su 336 copie PSN:
 * in 335 quel pezzo coincide con un id che avevamo già salvato; l'eccezione è un
 * gioco uscito su due console, dove il titleId è **per console**.
 *
 * Maiuscolo: è come lo scrive la libreria.
 */
export function wishlistKey(store: Store, externalId: string): string | null {
  if (store !== 'psn') return externalId;
  return titleIdFromEntitlement(externalId)?.toUpperCase() ?? null;
}
