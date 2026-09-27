import {
  Button,
  Separator,
  Sheet,
  Tooltip,
  Wordmark,
  XStack,
  YStack,
} from '@repo/ui';
import { House, Library, Menu, User } from '@repo/ui/icons';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { ThemeToggle } from '@/components/theme-toggle';
import { ButtonLink } from '@/src/components/button-link';
import { LocaleSwitcher } from '@/src/components/locale-switcher';
import { NavLink } from '@/src/components/nav-link';
import { UserMenu } from '@/src/components/user-menu';
import { useSession } from '@/src/use-session';

/**
 * Il guscio: la cornice di tutte le pagine tranne accesso e registrazione.
 *
 * Due forme della stessa navigazione, scelte **dal CSS** e non da JavaScript:
 * da `$md` in su la barra laterale, sotto una barra in alto col menu che apre
 * lo `Sheet`. Tutte e due stanno nell'HTML del server e le media query
 * decidono quale si vede, così non c'è un primo render sbagliato da
 * correggere all'idratazione, come succederebbe leggendo la larghezza.
 *
 * Sono le finestre strette del **web**: l'app mobile avrà le sue bottom tab.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <XStack minH="100vh" bg="$background">
      <YStack
        render="aside"
        display="none"
        $md={{ display: 'flex' }}
        width={240}
        shrink={0}
        height="100vh"
        position="sticky"
        t={0}
        p={12}
        gap={16}
        borderRightWidth={1}
        borderColor="$borderColor"
      >
        <HomeLink />
        <Navigation fill />
      </YStack>

      <YStack flex={1} minW={0}>
        <XStack
          render="header"
          $md={{ display: 'none' }}
          items="center"
          justify="space-between"
          px={12}
          py={8}
          borderBottomWidth={1}
          borderColor="$borderColor"
        >
          <HomeLink />
          <Tooltip content={t('menu')} placement="bottom">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('menu')}
              onPress={() => setMenuOpen(true)}
            >
              <Menu size={18} />
            </Button>
          </Tooltip>
        </XStack>
        {children}
      </YStack>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} label={t('navigation')}>
        <Navigation onNavigate={() => setMenuOpen(false)} />
      </Sheet>
    </XStack>
  );
}

/** Simbolo e nome, che riportano al catalogo. */
export function HomeLink() {
  return (
    <Link to="/" className="no-underline">
      <XStack px={8} py={2}>
        <Wordmark />
      </XStack>
    </Link>
  );
}

/**
 * Le voci e, in fondo, chi è collegato. La stessa nella barra laterale e nel
 * foglio: sul foglio `onNavigate` lo chiude dopo il clic.
 *
 * `fill` solo nella barra laterale, dove riempie l'altezza e spinge l'utente in
 * fondo. Nel foglio no: il foglio è alto quanto il contenuto, e un `flex` lì
 * dentro schiaccia tutto a zero.
 */
function Navigation({
  fill = false,
  onNavigate,
}: {
  fill?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations('nav');
  const { data: session, isPending } = useSession();

  return (
    <YStack flex={fill ? 1 : undefined} gap={16} justify="space-between">
      <YStack render="nav" aria-label={t('navigation')} gap={4}>
        <NavLink to="/" icon={<House size={16} />} onNavigate={onNavigate}>
          {t('catalog')}
        </NavLink>
        {session && (
          <>
            <NavLink
              to="/backlog"
              icon={<Library size={16} />}
              onNavigate={onNavigate}
            >
              {t('backlog')}
            </NavLink>
            <NavLink
              to="/account"
              icon={<User size={16} />}
              onNavigate={onNavigate}
            >
              {t('account')}
            </NavLink>
          </>
        )}
      </YStack>

      {/* `isPending` evita che il fondo da anonimo lampeggi al primo render. */}
      {isPending ? null : session ? (
        <YStack gap={8}>
          <Separator />
          <UserMenu name={session.user.name} />
        </YStack>
      ) : (
        <YStack gap={8}>
          <Separator />
          <ButtonLink href="/login" variant="outline">
            {t('signIn')}
          </ButtonLink>
          <ButtonLink href="/register">{t('signUp')}</ButtonLink>
          {/* Tema e lingua restano raggiungibili da anonimo: sono preferenze
              del browser, non dell'account. */}
          <XStack gap={4}>
            <ThemeToggle />
            <LocaleSwitcher />
          </XStack>
        </YStack>
      )}
    </YStack>
  );
}
