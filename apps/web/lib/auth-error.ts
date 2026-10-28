import { useTranslations } from 'use-intl';

// Better Auth risponde con un messaggio in inglese e un codice stabile. Il
// messaggio non si può mostrare in un'interfaccia tradotta, il codice sì: è la
// stessa divisione che vale per gli errori oRPC in `lib/api-error.ts`.
//
// Sono elencati solo i codici raggiungibili dai flussi email/password, gli unici
// attivi. Aggiungendo un provider social, qui va aggiunta la riga
// corrispondente: quello che manca ricade sul messaggio generico della pagina.
const codes = [
  'INVALID_EMAIL_OR_PASSWORD',
  // Il cambio password: quella attuale scritta male.
  'INVALID_PASSWORD',
  'INVALID_EMAIL',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'USER_NOT_FOUND',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'EMAIL_NOT_VERIFIED',
  'FAILED_TO_CREATE_USER',
  // L'account sospeso da un admin (11a): Better Auth lo rifiuta all'accesso.
  'BANNED_USER',
  // La cancellazione dell'account (step 16): l'ultimo admin non si cancella, e
  // il server pretende la password.
  'LAST_ADMIN',
  'PASSWORD_REQUIRED',
  // Il recupero della password (rilascio): il link scaduto o già usato.
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  // Il CAPTCHA (rilascio): il plugin `captcha` di Better Auth.
  'MISSING_RESPONSE',
  'VERIFICATION_FAILED',
  // I limiti di frequenza: Better Auth risponde 429 senza codice, e qui gli
  // si dà un nome (`message` qui sotto).
  'TOO_MANY_REQUESTS',
] as const;

type AuthErrorCode = (typeof codes)[number];

function isKnown(code: string | undefined): code is AuthErrorCode {
  return code !== undefined && (codes as readonly string[]).includes(code);
}

export function useAuthErrorMessage() {
  const t = useTranslations('authErrors');

  return function message(
    error: { code?: string; status?: number } | null | undefined,
    fallback: string,
  ): string {
    if (error?.status === 429) return t('TOO_MANY_REQUESTS');
    return isKnown(error?.code) ? t(error.code as AuthErrorCode) : fallback;
  };
}
