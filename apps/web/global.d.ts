import type { Locale } from './i18n/config';
import type messages from './messages/it.json';

// Rende `useTranslations` consapevole delle chiavi che esistono davvero: un
// refuso in `t("bakclog.title")` diventa un errore di compilazione, non una
// stringa mancante scoperta a schermo. L'italiano fa da riferimento perché è la
// lingua in cui si scrivono le stringhe nuove.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
