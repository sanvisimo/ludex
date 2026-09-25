import { signOut } from '@repo/auth/client';
import { Button } from '@repo/ui';
import { useTranslations } from 'use-intl';
import { Link, useRouter } from '@tanstack/react-router';

import { ThemeToggle } from '@/components/theme-toggle';
import { ButtonLink } from '@/src/components/button-link';
import { LocaleSwitcher } from '@/src/components/locale-switcher';
import { useSession } from '@/src/use-session';

export function SiteNav() {
  const t = useTranslations('nav');
  const router = useRouter();
  const { data: session, isPending } = useSession();

  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-3">
        <Link to="/" className="font-semibold tracking-tight">
          Ludex
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {/* Tema e lingua restano raggiungibili anche da anonimo: sono
              preferenze del browser, non dell'account. */}
          <ThemeToggle />
          <LocaleSwitcher />

          {/* isPending evita che i bottoni da anonimo lampeggino al primo render. */}
          {isPending ? null : session ? (
            <>
              <ButtonLink variant="ghost" href="/backlog">
                {t('backlog')}
              </ButtonLink>
              <ButtonLink variant="ghost" href="/account">
                {t('account')}
              </ButtonLink>
              <Button
                variant="outline"
                onClick={async () => {
                  // Prima via dalla pagina, poi fuori dalla sessione. Al
                  // contrario una pagina privata come `/account` vede la
                  // sessione sparire e rimbalza su `/login` per conto suo,
                  // e le due navigazioni si pestano.
                  await router.navigate({ to: '/' });
                  await signOut();
                  // Chi guarda è cambiato: i loader rileggono da capo.
                  await router.invalidate();
                }}
              >
                {t('signOut')}
              </Button>
            </>
          ) : (
            <>
              <ButtonLink variant="ghost" href="/login">
                {t('signIn')}
              </ButtonLink>
              <ButtonLink href="/register">{t('signUp')}</ButtonLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
