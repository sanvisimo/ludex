import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, isLocale, localeCookie, type Locale } from './config';

/**
 * Preferenze del browser, in ordine di qualità dichiarata. Si confronta solo il
 * sottotag primario: `en-GB` e `en-US` sono entrambi `en`, non abbiamo varianti
 * regionali da distinguere.
 */
function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const quality = params.find((param) => param.startsWith('q='));
      return {
        tag: tag?.toLowerCase().split('-')[0],
        quality: quality ? Number(quality.slice(2)) : 1,
      };
    })
    .filter((entry) => Number.isFinite(entry.quality))
    .sort((a, b) => b.quality - a.quality);

  return (
    (ranked.find((entry) => isLocale(entry.tag))?.tag as Locale | undefined) ??
    null
  );
}

/**
 * Nessun prefisso di lingua negli URL: la lingua sta in un cookie, e in sua
 * assenza si segue il browser. Gli URL restano `/backlog`, `/login`, e il
 * `proxy` non deve sapere nulla delle lingue.
 *
 * Conseguenza da tenere presente: leggere cookie e header qui rende dinamico il
 * render di ogni pagina. Non è una perdita, perché i dati arrivano comunque via
 * react-query lato client, ma va ricordato se un domani si vorrà prerenderizzare
 * qualcosa di statico.
 */
export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const chosen = cookieStore.get(localeCookie)?.value;
  const locale = isLocale(chosen)
    ? chosen
    : (fromAcceptLanguage(headerStore.get('accept-language')) ?? defaultLocale);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
