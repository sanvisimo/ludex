import { expoClient, getCookie } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { apiUrl } from './env';

const storagePrefix = 'pilecue';

// Il cookie di sessione sta nel portachiavi del telefono: React Native non ha
// un cookie jar affidabile, e il plugin lo rimanda a mano a ogni richiesta.
//
// Il cast: in 1.6.27 il tipo di `getActions` del plugin Expo non combacia con
// quello che `createAuthClient` si aspetta, anche con le stesse copie di
// better-auth e di better-fetch. A runtime è il plugin documentato; si perde
// solo il tipo di `authClient.getCookie`, che `sessionCookie` sostituisce.
const expo = expoClient({
  scheme: 'pilecue',
  storagePrefix,
  storage: SecureStore,
}) as unknown as { id: 'expo' };

export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [expo],
});

/** Il cookie da mandare alle chiamate fuori da Better Auth (oRPC). */
export function sessionCookie() {
  return getCookie(SecureStore.getItem(`${storagePrefix}_cookie`) || '{}');
}
