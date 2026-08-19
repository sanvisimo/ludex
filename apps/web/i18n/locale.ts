'use server';

import { cookies } from 'next/headers';

import { isLocale, localeCookie } from './config';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Le server action sono endpoint pubblici a tutti gli effetti: l'argomento
 * arriva dal client e va validato qui, non ci si può fidare del tipo.
 */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;

  (await cookies()).set(localeCookie, locale, {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
  });
}
