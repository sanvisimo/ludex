import { createServerFn } from '@tanstack/react-start';
import {
  getCookie,
  getRequestHeader,
  setCookie,
} from '@tanstack/react-start/server';

import {
  defaultLocale,
  fromAcceptLanguage,
  isLocale,
  localeCookie,
} from '@/i18n/config';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Lingua, messaggi e fuso di chi chiede, decisi sul server.
 *
 * Nessun prefisso di lingua negli URL: la lingua sta in un cookie, e in sua
 * assenza si segue il browser. Gli URL restano `/backlog`, `/login`.
 *
 * Il fuso è quello del server, come faceva next-intl: dichiararlo evita che
 * server e browser formattino la stessa data in due modi diversi.
 */
export const getI18n = createServerFn({ method: 'GET' }).handler(async () => {
  const chosen = getCookie(localeCookie);
  const locale = isLocale(chosen)
    ? chosen
    : (fromAcceptLanguage(getRequestHeader('accept-language')) ??
      defaultLocale);

  const messages = (await import(`../messages/${locale}.json`))
    .default as typeof import('../messages/it.json');

  return {
    locale,
    messages,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
});

/**
 * Le server function sono endpoint pubblici a tutti gli effetti: l'argomento
 * arriva dal client e va validato qui, non ci si può fidare del tipo.
 */
export const setLocale = createServerFn({ method: 'POST' })
  .inputValidator((value: unknown) => {
    if (typeof value !== 'string' || !isLocale(value)) {
      throw new Error('Lingua non supportata');
    }
    return value;
  })
  .handler(({ data }) => {
    setCookie(localeCookie, data, {
      path: '/',
      maxAge: ONE_YEAR,
      sameSite: 'lax',
    });
  });
