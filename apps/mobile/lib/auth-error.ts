import { useTranslations } from 'use-intl';

// I codici di Better Auth che accesso e registrazione possono dare: gli stessi
// di `apps/web/lib/auth-error.ts`, ridotti ai due flussi che l'app ha.
const codes = [
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_EMAIL',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'EMAIL_NOT_VERIFIED',
  'FAILED_TO_CREATE_USER',
  'BANNED_USER',
  'MISSING_RESPONSE',
  'VERIFICATION_FAILED',
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
