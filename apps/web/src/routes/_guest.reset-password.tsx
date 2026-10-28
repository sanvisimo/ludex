import { authClient } from '@repo/auth/client';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@repo/ui';
import { useTranslations } from 'use-intl';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useAuthErrorMessage } from '@/lib/auth-error';

// Il minimo di Better Auth, come alla registrazione e al cambio password.
const MIN_LENGTH = 8;

export const Route = createFileRoute('/_guest/reset-password')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { token?: string; error?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: ResetPasswordPage,
});

/**
 * «Nuova password», dal link dell'email (rilascio). Il token arriva nell'URL,
 * già controllato una volta dall'API; scaduto o usato, l'API rimanda qui con
 * `?error=INVALID_TOKEN`, e la pagina offre di chiederne un altro.
 *
 * Salvarla chiude **tutte** le sessioni (`revokeSessionsOnPasswordReset`):
 * chi la reimposta perché qualcuno la conosce vuole buttarlo fuori. Poi si
 * entra dall'accesso, con la password nuova.
 */
function ResetPasswordPage() {
  const t = useTranslations('resetPassword');
  const authErrorMessage = useAuthErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, error: linkError } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await authClient.resetPassword({
      newPassword: String(form.get('password')),
      token,
    });

    setPending(false);
    if (error) {
      setError(authErrorMessage(error, t('failed')));
      return;
    }
    // La sessione di questo browser, se c'era, non c'è più.
    queryClient.clear();
    await router.navigate({ to: '/login', search: { reset: true } });
  }

  const invalid = Boolean(linkError) || !token;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card width="100%" maxW={384}>
        <CardHeader>
          <CardTitle fontSize={18} lineHeight={28}>
            {t('title')}
          </CardTitle>
          {!invalid && <CardDescription>{t('subtitle')}</CardDescription>}
        </CardHeader>
        <CardContent>
          {invalid ? (
            <div className="grid gap-4">
              <Alert variant="destructive">
                <AlertDescription>{t('invalid')}</AlertDescription>
              </Alert>
              <p className="text-center text-muted-foreground">
                <Link
                  to="/forgot-password"
                  className="text-foreground underline underline-offset-4"
                >
                  {t('again')}
                </Link>
              </p>
            </div>
          ) : (
            <form method="post" onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="password">{t('password')}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  autoFocus
                />
                <p className="text-muted-foreground">
                  {t('hint', { min: MIN_LENGTH })}
                </p>
              </div>

              <p className="text-muted-foreground">{t('signOutNote')}</p>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={pending}>
                {pending ? t('pending') : t('submit')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
