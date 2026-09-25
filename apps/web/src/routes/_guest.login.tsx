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
import { useState } from 'react';

import { useAuthErrorMessage } from '@/lib/auth-error';

/**
 * `next` arriva dall'URL, quindi è input non fidato: si accettano solo percorsi
 * interni. Senza questo controllo `?next=https://sito-cattivo` o `?next=//host`
 * (protocol-relative) trasformerebbero il login in un redirect aperto.
 */
function safeNext(value: string | undefined) {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function LoginForm() {
  const t = useTranslations('login');
  const authErrorMessage = useAuthErrorMessage();
  const router = useRouter();
  const { next } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });

    setPending(false);
    if (error) {
      setError(authErrorMessage(error, t('failed')));
      return;
    }

    // Il rimbalzo da una pagina privata scrive ?next=/percorso: si torna lì
    // invece che sulla home.
    await router.navigate({ href: safeNext(next) });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
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
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending}>
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
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === 'string' ? search.next : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const t = useTranslations('login');

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
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
