import { signUp } from '@repo/auth/client';
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

export const Route = createFileRoute('/_guest/register')({
  component: RegisterPage,
});

function RegisterPage() {
  const t = useTranslations('register');
  const authErrorMessage = useAuthErrorMessage();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
    });

    setPending(false);
    if (error) setError(authErrorMessage(error, t('failed')));
    else await router.navigate({ to: '/' });
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
          {/* `post` per la stessa ragione dell'accesso: un invio prima
              dell'idratazione non deve mettere la password nell'URL. */}
          <form method="post" onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t('name')}</Label>
              <Input id="name" name="name" required autoComplete="name" />
            </div>
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
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-muted-foreground">{t('passwordHint')}</p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={pending}>
              {pending ? t('pending') : t('submit')}
            </Button>

            {/* Nuova scheda: aprire i testi non deve far perdere il modulo
                compilato. L'avviso informa, non registra un'accettazione. */}
            <p className="text-center text-muted-foreground">
              {t.rich('notice', {
                terms: (chunks) => (
                  <LegalLink href="/terms">{chunks}</LegalLink>
                ),
                privacy: (chunks) => (
                  <LegalLink href="/privacy">{chunks}</LegalLink>
                ),
              })}
            </p>

            <p className="text-center text-muted-foreground">
              {t.rich('hasAccount', {
                link: (chunks) => (
                  <Link
                    to="/login"
                    className="text-foreground underline underline-offset-4"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function LegalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline underline-offset-4"
    >
      {children}
    </a>
  );
}
