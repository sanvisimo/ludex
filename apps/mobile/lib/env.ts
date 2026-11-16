import Constants from 'expo-constants';

// In sviluppo il telefono e l'emulatore raggiungono la macchina dall'indirizzo
// con cui hanno trovato Metro, non da `localhost`, che per loro è il telefono.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

export const apiUrl =
  process.env.EXPO_PUBLIC_API_URL || `http://${devHost}:3005`;

export const webUrl =
  process.env.EXPO_PUBLIC_WEB_URL || `http://${devHost}:8085`;

export const turnstileSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
