import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import {
  defaultLocale,
  fromAcceptLanguage,
  isLocale,
  localeCookie,
} from './config';

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
