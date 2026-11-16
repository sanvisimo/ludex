import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { apiUrl } from './env';

// Il cookie di sessione sta nel portachiavi del telefono: React Native non ha
// un cookie jar affidabile, e il plugin lo rimanda a mano a ogni richiesta.
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    expoClient({
      scheme: 'pilecue',
      storagePrefix: 'pilecue',
      storage: SecureStore,
    }),
  ],
});

/** Il cookie da mandare alle chiamate fuori da Better Auth (oRPC). */
export const sessionCookie = () => authClient.getCookie();
