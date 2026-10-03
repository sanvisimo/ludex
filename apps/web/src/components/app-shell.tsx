import { Text, Wordmark, XStack, YStack } from '@repo/ui';
import { Link, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { ThemeToggle } from '@/components/theme-toggle';
import { BackToTop } from '@/src/components/back-to-top';
import { ButtonLink } from '@/src/components/button-link';
import { LocaleSwitcher } from '@/src/components/locale-switcher';
import { takeLinkClick } from '@/src/link-click';
import { GuestSheet, UserMenu } from '@/src/components/user-menu';
import { useSession } from '@/src/use-session';

/** L'altezza della barra: sul telefono la pagina le lascia questo spazio sotto. */
const BAR_HEIGHT = 56;

/**
 * Il guscio: la cornice di tutte le pagine tranne accesso e registrazione.
 *
 * Una barra sola, a ogni larghezza: il nome a sinistra, che porta al
 * catalogo, e a destra chi è collegato, col menu che porta a backlog e
 * account. Sul desktop sta in alto, sul telefono in basso, dove arriva il
 * pollice e da dove si aprono i menu. Resta sempre visibile: ha lo stesso
 * fondo della pagina, senza bordo, e il contenuto ci passa sotto.
 *
 * Le due posizioni le sceglie **il CSS**, non JavaScript: leggere la
 * larghezza darebbe un primo render sbagliato da correggere all'idratazione.
 *
 * Sono le finestre strette del **web**: l'app mobile avrà le sue bottom tab.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <YStack minH="100vh" bg="$background" $max-md={{ pb: BAR_HEIGHT }}>
      <XStack
        render="header"
        position="sticky"
        t={0}
        z={10}
        height={BAR_HEIGHT}
        items="center"
        justify="space-between"
        gap={8}
        px={12}
        bg="$background"
        $max-md={{ position: 'fixed', t: 'auto', b: 0, l: 0, r: 0 }}
      >
        <HomeLink />
        <Account />
      </XStack>
      {/* `grow`, non `flex`: con base 0 il contenuto uscirebbe dalla colonna
          e il footer gli finirebbe sopra. */}
      <YStack grow={1}>{children}</YStack>
      <Footer />
      <BackToTop bottomOffset={BAR_HEIGHT} />
    </YStack>
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
 * A destra nella barra: l'avatar di chi è collegato, o accesso e
 * registrazione. Tema e lingua da anonimo stanno qui; da collegato sono nel
 * menu dell'avatar. Sotto `$md` da anonimo tutto questo in barra non ci sta,
 * e va in un foglio come quello dell'avatar.
 */
function Account() {
  const t = useTranslations('nav');
  const { data: session, isPending } = useSession();

  // `isPending` evita che i bottoni da anonimo lampeggino al primo render.
  if (isPending) return null;
  if (session) return <UserMenu name={session.user.name} />;

  return (
    <>
      <XStack items="center" gap={4} $max-md={{ display: 'none' }}>
        <ThemeToggle />
        <LocaleSwitcher />
        <ButtonLink href="/login" variant="ghost">
          {t('signIn')}
        </ButtonLink>
        <ButtonLink href="/register">{t('signUp')}</ButtonLink>
      </XStack>
      <XStack display="none" $max-md={{ display: 'flex' }}>
        <GuestSheet />
      </XStack>
    </>
  );
}

/**
 * In fondo a tutto, per chiunque: la firma, crediti, privacy e condizioni.
 * Non sono voci della barra perché sono pagine di servizio e non cose che si
 * fanno nell'app.
 */
function Footer() {
  const t = useTranslations('nav');

  return (
    <YStack render="footer" items="center" gap={4} px={24} py={16}>
      <XStack flexWrap="wrap" justify="center" columnGap={12}>
        <FooterText>© {new Date().getFullYear()} sanvisimo</FooterText>
        <FooterText>{t('madeWith')}</FooterText>
      </XStack>
      <XStack flexWrap="wrap" justify="center" columnGap={12}>
        <FooterLink to="/credits">{t('credits')}</FooterLink>
        <FooterLink to="/privacy">{t('privacy')}</FooterLink>
        <FooterLink to="/terms">{t('terms')}</FooterLink>
      </XStack>
    </YStack>
  );
}

function FooterText({ children }: { children: ReactNode }) {
  return (
    <Text fontSize={12} lineHeight={16} color="$color10">
      {children}
    </Text>
  );
}

function FooterLink({
  to,
  children,
}: {
  to: '/credits' | '/privacy' | '/terms';
  children: string;
}) {
  const router = useRouter();

  return (
    <Text
      render="a"
      // Come in `NavItem`: gli attributi del link arrivano all'`<a>`, ma i
      // tipi del testo non li conoscono.
      {...({
        href: to,
        onClick: (event: unknown) => {
          if (!takeLinkClick(event)) return;
          void router.navigate({ to });
        },
      } as object)}
      fontSize={12}
      lineHeight={16}
      color="$color11"
      textDecorationLine="underline"
      cursor="pointer"
      hoverStyle={{ color: '$color12' }}
    >
      {children}
    </Text>
  );
}
