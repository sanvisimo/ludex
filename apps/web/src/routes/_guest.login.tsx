import { signIn } from '@repo/auth/client';
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

import { useCaptcha } from '@/components/captcha';
import { useAuthErrorMessage } from '@/lib/auth-error';

/**
 * `next` arriva dall'URL, quindi è input non fidato: si accettano solo percorsi
 * interni. Senza questo controllo `?next=https://sito-cattivo` o `?next=//host`
 * (protocol-relative) trasformerebbero il login in un redirect aperto.
 */
function safeNext(value: string | undefined) {
  if (!value) return '/backlog';
  if (!value.startsWith('/') || value.startsWith('//')) return '/backlog';
  return value;
}

function LoginForm() {
  const t = useTranslations('login');
  const authErrorMessage = useAuthErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { next, verified, error: linkError, reset } = Route.useSearch();
  const captcha = useCaptcha();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Gli avvisi che arrivano dall'URL: il link di conferma dell'email andato
  // male (Better Auth rimanda qui con `?verified=1&error=…`; andato bene, la
  // sessione c'è già e `_guest` porta al backlog), e la password appena
  // reimpostata. Spariscono al primo invio.
  const notice =
    error === null && !pending
      ? verified && linkError
        ? t('verifyFailed')
        : reset
          ? t('passwordReset')
          : null
      : null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await signIn.email(
      {
        email: String(form.get('email')),
        password: String(form.get('password')),
        // Se l'email non è verificata Better Auth rispedisce il link, e il
        // link riporta qui.
        callbackURL: `${window.location.origin}/login?verified=1`,
      },
      { headers: captcha.headers },
    );

    setPending(false);
    // Il token del CAPTCHA vale una volta, riuscito o no.
    captcha.reset();
    if (error) {
      setError(authErrorMessage(error, t('failed')));
      return;
    }

    // La cache può avere ancora i dati di chi c'era prima, se la sua sessione è
    // finita senza passare da «Esci» (scaduta, chiusa da un'altra scheda).
    queryClient.clear();
    // Il rimbalzo da una pagina privata scrive ?next=/percorso: si torna lì
    // invece che sul backlog.
    await router.navigate({ href: safeNext(next) });
  }

  // `post` perché un invio fatto prima che React abbia idratato la pagina
  // (JavaScript spento, rete lenta, un clic veloce) lo fa il browser da solo:
  // in GET email e password finirebbero nell'URL, e da lì nella cronologia e
  // nei log.
  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="password">{t('password')}</Label>
          <Link
            to="/forgot-password"
            className="text-muted-foreground underline underline-offset-4"
          >
            {t('forgot')}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      {captcha.widget}

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending || !captcha.ready}>
        {pending ? t('pending') : t('submit')}
      </Button>

      <p className="text-center text-muted-foreground">
        {t.rich('noAccount', {
          link: (chunks) => (
            <Link
              to="/register"
              className="text-foreground underline underline-offset-4"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </form>
  );
}

export const Route = createFileRoute('/_guest/login')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { next?: string; verified?: true; error?: string; reset?: true } => ({
    next: typeof search.next === 'string' ? search.next : undefined,
    verified: search.verified ? true : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
    reset: search.reset ? true : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const t = useTranslations('login');

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
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
