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
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';

import { useCaptcha } from '@/components/captcha';
import { useAuthErrorMessage } from '@/lib/auth-error';

export const Route = createFileRoute('/_guest/forgot-password')({
  component: ForgotPasswordPage,
});

/**
 * «Password dimenticata» (rilascio). Dopo l'invio la risposta è la stessa che
 * l'indirizzo sia registrato o no: Better Auth spedisce solo a chi c'è, e la
 * pagina non deve dire chi è iscritto.
 */
function ForgotPasswordPage() {
  const t = useTranslations('forgotPassword');
  const authErrorMessage = useAuthErrorMessage();
  const captcha = useCaptcha();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await authClient.requestPasswordReset(
      {
        email: String(form.get('email')),
        // Il link dell'email passa dall'API, che controlla il token e rimanda
        // qui con `?token=…`, o con `?error=INVALID_TOKEN`.
        redirectTo: `${window.location.origin}/reset-password`,
      },
      { headers: captcha.headers },
    );

    setPending(false);
    captcha.reset();
    if (error) {
      setError(authErrorMessage(error, t('failed')));
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card width="100%" maxW={384}>
        <CardHeader>
          <CardTitle fontSize={18} lineHeight={28}>
            {t('title')}
          </CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="grid gap-4">
              <Alert>
                <AlertDescription>{t('sent')}</AlertDescription>
              </Alert>
              <BackToLogin />
            </div>
          ) : (
            // `post` come all'accesso: un invio prima dell'idratazione non
            // deve mettere l'indirizzo nell'URL.
            <form method="post" onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {captcha.widget}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={pending || !captcha.ready}>
                {pending ? t('pending') : t('submit')}
              </Button>

              <BackToLogin />
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function BackToLogin() {
  const t = useTranslations('forgotPassword');

  return (
    <p className="text-center text-muted-foreground">
      <Link
        to="/login"
        className="text-foreground underline underline-offset-4"
      >
        {t('back')}
      </Link>
    </p>
  );
}
