import { Text, Wordmark, XStack, YStack } from '@repo/ui';
import { Search } from '@repo/ui/icons';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { GameSearchBox } from '@/components/game-search';
import { RandomGameDice } from '@/components/random-game-dice';
import { supportUrl } from '@/lib/credits';
import { BackToTop } from '@/src/components/back-to-top';
import { ButtonLink } from '@/src/components/button-link';
import { takeLinkClick } from '@/src/link-click';
import {
  GuestSheet,
  SettingsDropdown,
  UserMenu,
} from '@/src/components/user-menu';
import { useSession } from '@/src/use-session';

/** L'altezza della barra: sul telefono la pagina le lascia questo spazio sotto. */
const BAR_HEIGHT = 56;

/**
 * Il guscio: la cornice di tutte le pagine tranne accesso e registrazione.
 *
 * Una barra sola, a ogni larghezza: il nome a sinistra, che porta al
 * catalogo, il link Backlog sul desktop, la ricerca in mezzo, Settings e menu
 * account a destra. Sul telefono sta in basso, dove arriva il pollice e da
 * dove si aprono i menu; le preferenze restano nel foglio dell’account.
 *
 * Le due posizioni le sceglie **il CSS**, non JavaScript: leggere la
 * larghezza darebbe un primo render sbagliato da correggere all'idratazione.
 *
 * Sono le finestre strette del **web**: l'app mobile avrà le sue bottom tab.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <YStack minH="100vh" bg="background" pb={`max-md:${BAR_HEIGHT}px`}>
      <XStack
        render="header"
        position="sticky max-md:fixed"
        t="0px max-md:auto"
        z={10}
        height={`72px max-md:${BAR_HEIGHT}px`}
        items="center"
        justify="space-between"
        gap="16px max-md:8px"
        px="24px max-md:12px"
        bg="background"
        borderBottomWidth="1px max-md:0px"
        borderColor="border-color"
        b="max-md:0px"
        l="max-md:0px"
        r="max-md:0px"
        borderTopWidth="max-md:1px"
      >
        <HomeLink />
        <MainNavigation />
        <BarSearch />
        <Account />
      </XStack>
      {/* `grow`, non `flex`: con base 0 il contenuto uscirebbe dalla colonna
          e il footer gli finirebbe sopra. */}
      <YStack grow={1}>{children}</YStack>
      <Footer />
      {/* In basso a destra, e sul telefono sopra la barra: il dado sempre, la
          freccia sopra di lui quando si è scesi, così il dado non si sposta.
          La media query sta sullo `YStack`, non sui bottoni di `@repo/ui`. */}
      <YStack
        position="fixed"
        r={16}
        b={`16px max-md:${BAR_HEIGHT + 16}px`}
        z={9}
        gap={8}
        items="flex-end"
      >
        <BackToTop />
        <RandomGameDice />
      </YStack>
    </YStack>
  );
}

/**
 * Il logo porta sempre al catalogo; il backlog ha il suo link nella barra.
 */
export function HomeLink() {
  const t = useTranslations('nav');

  return (
    <Link to="/" className="no-underline" aria-label={t('home')}>
      <XStack px={8} py={2}>
        <Wordmark />
      </XStack>
    </Link>
  );
}

function MainNavigation() {
  const t = useTranslations('nav');
  const { data: session } = useSession();
  const inBacklog = useRouterState({
    select: (state) => state.location.pathname === '/backlog',
  });
  if (!session) return null;
  return (
    <XStack render="nav" aria-label={t('menu')} display="max-md:none">
      <ButtonLink
        href="/backlog"
        variant={inBacklog ? 'selection' : 'ghost'}
        {...({ 'aria-current': inBacklog ? 'page' : undefined } as object)}
      >
        {t('backlogLink')}
      </ButtonLink>
    </XStack>
  );
}

/**
 * In mezzo alla barra, la ricerca globale (12f): il campo con la tendina da
 * `$md`; sotto, dove in barra non c'è posto, un'icona che porta alla pagina
 * della ricerca. Sulla pagina della ricerca niente dei due: ha il suo campo.
 */
function BarSearch() {
  const t = useTranslations('search');
  const onSearchPage = useRouterState({
    select: (state) => state.location.pathname === '/search',
  });

  if (onSearchPage) return <XStack flex={1} />;

  return (
    <>
      <XStack flex={1} justify="center" display="max-md:none">
        <YStack width="100%" maxW={480}>
          <GameSearchBox />
        </YStack>
      </XStack>
      <XStack flex={1} justify="flex-end" display="none max-md:flex">
        <ButtonLink
          href="/search"
          variant="ghost"
          size="icon"
          width={40}
          height={40}
          rounded={999}
          aria-label={t('open')}
        >
          <Search size={20} />
        </ButtonLink>
      </XStack>
    </>
  );
}

/**
 * A destra nella barra: l'avatar di chi è collegato, o accesso e
 * registrazione. Sul desktop Settings raccoglie tema e lingua per tutti;
 * sotto `$md` sono nel foglio dell’account o in quello degli ospiti.
 */
function Account() {
  const t = useTranslations('nav');
  const { data: session, isPending } = useSession();

  // `isPending` evita che i bottoni da anonimo lampeggino al primo render.
  if (isPending) return null;
  if (session)
    return (
      <XStack items="center" gap={8}>
        <XStack display="max-md:none">
          <SettingsDropdown />
        </XStack>
        <UserMenu
          name={session.user.name}
          isAdmin={session.user.role === 'admin'}
        />
      </XStack>
    );

  return (
    <>
      <XStack items="center" gap={4} display="max-md:none">
        <SettingsDropdown />
        <ButtonLink href="/login" variant="ghost">
          {t('signIn')}
        </ButtonLink>
        <ButtonLink href="/register">{t('signUp')}</ButtonLink>
      </XStack>
      <XStack display="none max-md:flex">
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
        <FooterLink to="/roadmap">{t('roadmap')}</FooterLink>
        <FooterLink to="/credits">{t('credits')}</FooterLink>
        <FooterLink to="/privacy">{t('privacy')}</FooterLink>
        <FooterLink to="/terms">{t('terms')}</FooterLink>
        {supportUrl && (
          <FooterExternalLink href={supportUrl}>
            {t('coffee')}
          </FooterExternalLink>
        )}
      </XStack>
    </YStack>
  );
}

function FooterText({ children }: { children: ReactNode }) {
  return (
    <Text fontSize={12} lineHeight="16px" color="color11">
      {children}
    </Text>
  );
}

/** Come `FooterLink`, ma esce dall'app: nuova scheda, senza `referrer`. */
function FooterExternalLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Text
      render="a"
      {...{ href }}
      target={'_blank'}
      rel={'noopener noreferrer'}
      fontSize={12}
      lineHeight="16px"
      color="color11 hover:color12"
      textDecorationLine="underline"
      cursor="pointer"
    >
      {children}
    </Text>
  );
}

function FooterLink({
  to,
  children,
}: {
  to: '/roadmap' | '/credits' | '/privacy' | '/terms';
  children: string;
}) {
  const router = useRouter();

  return (
    <Text
      render="a"
      href={to}
      onClick={(event: unknown) => {
        if (!takeLinkClick(event)) return;
        void router.navigate({ to });
      }}
      fontSize={12}
      lineHeight="16px"
      color="color11 hover:color12"
      textDecorationLine="underline"
      cursor="pointer"
    >
      {children}
    </Text>
  );
}
