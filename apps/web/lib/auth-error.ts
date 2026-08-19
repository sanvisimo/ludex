'use client';

import { useTranslations } from 'next-intl';

// Better Auth risponde con un messaggio in inglese e un codice stabile. Il
// messaggio non si può mostrare in un'interfaccia tradotta, il codice sì: è la
// stessa divisione che vale per gli errori oRPC in `lib/api-error.ts`.
//
// Sono elencati solo i codici raggiungibili dai flussi email/password, gli unici
// attivi allo step 1. Aggiungendo un provider social, qui va aggiunta la riga
// corrispondente: quello che manca ricade sul messaggio generico della pagina.
const codes = [
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_EMAIL',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'USER_NOT_FOUND',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'EMAIL_NOT_VERIFIED',
  'FAILED_TO_CREATE_USER',
] as const;

type AuthErrorCode = (typeof codes)[number];

function isKnown(code: string | undefined): code is AuthErrorCode {
  return code !== undefined && (codes as readonly string[]).includes(code);
}

export function useAuthErrorMessage() {
  const t = useTranslations('authErrors');

  return function message(
    error: { code?: string } | null | undefined,
    fallback: string,
  ): string {
    return isKnown(error?.code) ? t(error.code as AuthErrorCode) : fallback;
  };
}
