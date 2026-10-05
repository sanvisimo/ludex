import type { LinkableStore, Store } from './vocabulary';

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

/**
 * La copertina di una voce che non è un gioco: uno scarto d'import.
 *
 * Una voce non risolta non ha `games` né IGDB, e quindi nessuna copertina sua:
 * l'unica immagine è quella che il negozio manda, salvata dall'import in
 * `unresolved_imports.image_url`. **Steam fa eccezione**: la sua CDN è
 * pubblica e si compone dall'appid (`library_600x900`, la verticale), senza
 * che l'import salvi niente e senza una chiamata in più. Provata aperta su due
 * appid il 02/10/2026.
 *
 * Nullo = niente copertina, e la riga mostra l'icona del negozio. Un'immagine
 * che non si carica (un gioco ritirato da Steam dà 404) la gestisce chi la
 * mostra, con lo stesso ripiego.
 */
export function storeCoverUrl(
  store: Store,
  externalId: string,
  imageUrl: string | null,
): string | null {
  if (store === 'steam') {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${externalId}/library_600x900.jpg`;
  }
  return imageUrl;
}

/**
 * Un negozio che si collega con un login nel browser e un copia-incolla: tutti
 * i collegabili tranne Steam, che ha il suo modo (il QR o il profilo).
 */
export type GuidedStore = Exclude<LinkableStore, 'steam'>;

/** `ok`: sembra quello giusto. `wrong`: non sembra. Nullo: il campo è vuoto. */
export type PastedLoginCheck = 'ok' | 'wrong' | null;

/**
 * Quello che l'utente ha incollato **sembra** quello che ci serve?
 *
 * Un suggerimento per chi sta incollando, mentre incolla: non decide niente e non
 * blocca il pulsante. Il server resta quello che accetta o rifiuta, con i suoi
 * parser (`parseGogAuthCode` & co. in `apps/api`), e nessuna richiesta parte da
 * qui. Per questo **non deve essere più severa del server**: un indirizzo che il
 * server accetterebbe e che qui risulta «sbagliato» manderebbe l'utente a
 * riprovare per niente. Le regole sono le stesse, scritte con espressioni
 * regolari e non con `URL` — su React Native `searchParams` non è implementato —
 * e `apps/api/src/external/paste-check.test.ts` le confronta con i parser veri.
 *
 * Il caso per cui esiste è Nintendo, dove il pulsante finale **non si clicca**
 * (punta a `npf…://`, che il browser non apre) e si copia il suo indirizzo: chi
 * incolla l'indirizzo della pagina invece di quello del link lo vede subito.
 */
export function checkPastedLogin(
  store: GuidedStore,
  input: string,
): PastedLoginCheck {
  const text = input.trim();
  if (!text) return null;

  const param = (name: string) =>
    new RegExp(`[?&#]${name.replace(/\./g, '\\.')}=[^&\\s#]+`).test(text);
  const isUrl = /^https?:\/\//i.test(text);
  const unquoted = text.replace(/^"|"$/g, '');

  const jsonField = (field: string): boolean => {
    if (!text.startsWith('{')) return false;
    try {
      const value = (JSON.parse(text) as Record<string, unknown>)[field];
      return typeof value === 'string' && value.length > 0;
    } catch {
      return false;
    }
  };

  let ok: boolean;
  switch (store) {
    case 'nintendo':
      ok =
        /session_token_code=[^&\s]+/.test(text) &&
        /[#&?]state=[^&\s]+/.test(text);
      break;
    case 'gog':
      ok = isUrl ? param('code') : /^[\w-]{20,}$/.test(text);
      break;
    case 'epic':
      ok = text.startsWith('{')
        ? jsonField('authorizationCode')
        : /^[0-9a-f]{32}$/i.test(unquoted);
      break;
    case 'amazon':
      ok = isUrl
        ? param('openid.oa2.authorization_code')
        : /^[A-Za-z0-9._-]{10,}$/.test(text);
      break;
    case 'psn':
      ok = text.startsWith('{')
        ? jsonField('npsso')
        : /^[\w-]{40,}$/.test(unquoted);
      break;
  }
  return ok ? 'ok' : 'wrong';
}
