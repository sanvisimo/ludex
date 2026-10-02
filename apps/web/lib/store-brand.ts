import type { Store } from '@repo/contracts';
import type { Brand } from '@repo/ui';

/**
 * Il marchio di ciascun negozio, per l'icona colorata: la scheda di un account
 * e la riga di uno scarto d'import.
 *
 * Il pezzo di `game-page.tsx` che fa lo stesso non elenca Amazon, perché il
 * `BrandIcon` non lo aveva: ora ce l'ha, e la pagina del gioco potrà prenderlo
 * da qui quando serve. Un negozio senza marchio ha `undefined`, e chi lo
 * mostra ripiega sul nome.
 */
export const STORE_BRAND: Partial<Record<Store, Brand>> = {
  steam: 'steam',
  gog: 'gog',
  epic: 'epic',
  ea: 'ea',
  battlenet: 'battlenet',
  amazon: 'amazon',
  psn: 'psn',
  xbox: 'xbox',
  nintendo: 'nintendo',
};
