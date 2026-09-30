import type { Store } from './vocabulary';

/**
 * L'URL della pagina del gioco su un negozio, per una copia.
 *
 * `storePage` è ciò che l'import ha salvato su `ownerships.store_page`: il
 * pezzo di indirizzo che il negozio dà, non l'URL intero. Si compone qui, al
 * momento di mostrarlo, come le copertine IGDB: web e mobile chiamano la stessa
 * funzione, e un negozio che cambia la forma dei suoi indirizzi si corregge in
 * un punto solo, senza riscrivere le righe.
 *
 * Le regole vengono dal probe del 30/09/2026, in `docs/negozi.md` («Il link
 * alla pagina del gioco»):
 *
 * - **Steam**: `app/{appid}`.
 * - **GOG**: l'`url` del prodotto (`/en/game/…`), **non** lo `slug`, che a
 *   volte porta sull'elenco dei giochi. Un prodotto senza `url` porta alla
 *   libreria dell'utente, dove il gioco c'è di sicuro.
 * - **PSN**: `product/{productId}` per gli acquisti, `concept/{conceptId}` per
 *   i dischi. Nella regione italiana, l'unica provata.
 * - **Epic**: lo slug della pagina non sta nei nostri dati. Niente link.
 * - **Amazon**: non ha una pagina pubblica per gioco. Niente link.
 *
 * Nullo = l'icona del negozio senza link.
 */
export function storePageUrl(
  store: Store | null,
  storePage: string | null,
): string | null {
  switch (store) {
    case 'steam':
      return storePage ? `https://store.steampowered.com/${storePage}` : null;
    case 'gog':
      return storePage
        ? `https://www.gog.com${storePage}`
        : 'https://www.gog.com/en/account';
    case 'psn':
      return storePage
        ? `https://store.playstation.com/it-it/${storePage}`
        : null;
    default:
      return null;
  }
}
