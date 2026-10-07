import { signOut } from '@repo/auth/client';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  NavItem,
  Separator,
  Sheet,
  Text,
  ToggleGroup,
  ToggleGroupItem,
  XStack,
  YStack,
} from '@repo/ui';
import {
  House,
  Library,
  ListFilter,
  LogOut,
  Shield,
  User,
} from '@repo/ui/icons';
import { useMatchRoute, useRouter } from '@tanstack/react-router';
import { useTheme } from 'next-themes';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';

import { locales } from '@/i18n/config';
import { ButtonLink } from '@/src/components/button-link';
import { useChangeLocale } from '@/src/components/locale-switcher';
import { takeLinkClick } from '@/src/link-click';

/**
 * Chi è collegato, a destra nella barra: l'avatar, e nel menu le sue pagine —
 * home, backlog e account — e le tre cose che sono sue e non di una pagina: tema,
 * lingua, uscita.
 *
 * Due forme, scelte dal CSS come la posizione della barra: da `$md` un menu a
 * tendina, sotto un foglio dal basso largo quanto lo schermo, che sul
 * telefono si legge e si tocca meglio.
 */
export function UserMenu({
  name,
  isAdmin = false,
}: {
  name: string;
  // La voce «Admin» c'è solo per chi lo è (11a). È comodità: la sezione la
  // protegge il server.
  isAdmin?: boolean;
}) {
  return (
    <>
      <XStack $max-md={{ display: 'none' }}>
        <UserDropdown name={name} isAdmin={isAdmin} />
      </XStack>
      <XStack display="none" $max-md={{ display: 'flex' }}>
        <UserSheet name={name} isAdmin={isAdmin} />
      </XStack>
    </>
  );
}

/**
 * Il bottone: le iniziali. Il nome non si legge, per questo è il suo
 * `aria-label` e la prima riga del menu.
 *
 * Le altre props vanno al `Button`: il trigger del menu a tendina gli passa
 * le sue (`asChild`), e senza il menu non si apre.
 */
function AvatarButton({
  name,
  ...props
}: { name: string } & ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="icon"
      width={40}
      height={40}
      rounded={999}
      aria-label={name}
      {...props}
    >
      <Avatar name={name} size={32} />
    </Button>
  );
}

/**
 * Prima via dalla pagina, poi fuori dalla sessione. Al contrario una pagina
 * privata come `/account` vede la sessione sparire e rimbalza su `/login` per
 * conto suo, e le due navigazioni si pestano.
 */
function useSignOut() {
  const router = useRouter();
  return async () => {
    await router.navigate({ to: '/' });
    await signOut();
    // Chi guarda è cambiato: i loader rileggono da capo.
    await router.invalidate();
  };
}

function UserDropdown({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const t = useTranslations('nav');
  const tTheme = useTranslations('theme');
  const tLocale = useTranslations('locale');
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const { change } = useChangeLocale();
  const signOutAndLeave = useSignOut();

  return (
    <DropdownMenu align="end">
      <DropdownMenuTrigger render={<AvatarButton name={name} />} />
      <DropdownMenuContent width={224}>
        <DropdownMenuLabel
          fontSize={14}
          lineHeight={20}
          color="$color12"
          numberOfLines={1}
        >
          {name}
        </DropdownMenuLabel>
        <DropdownMenuItem
          icon={<House size={16} />}
          onClick={() => void router.navigate({ to: '/' })}
        >
          {t('home')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<Library size={16} />}
          onClick={() => void router.navigate({ to: '/backlog' })}
        >
          {t('backlog')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<ListFilter size={16} />}
          onClick={() => void router.navigate({ to: '/playlist' })}
        >
          {t('playlists')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<User size={16} />}
          onClick={() => void router.navigate({ to: '/account' })}
        >
          {t('account')}
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem
            icon={<Shield size={16} />}
            onClick={() => void router.navigate({ to: '/admin' })}
          >
            {t('admin')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tTheme('label')}</DropdownMenuLabel>
        {/* `theme`, non `resolvedTheme`: si sceglie la preferenza, e
            «sistema» deve restare selezionabile come tale. */}
        <YStack px={6} py={4}>
          <ToggleGroup
            value={theme ?? 'system'}
            onValueChange={setTheme}
            label={tTheme('label')}
          >
            <ToggleGroupItem value="light">
              <OptionText>{tTheme('light')}</OptionText>
            </ToggleGroupItem>
            <ToggleGroupItem value="dark">
              <OptionText>{tTheme('dark')}</OptionText>
            </ToggleGroupItem>
            <ToggleGroupItem value="system">
              <OptionText>{tTheme('system')}</OptionText>
            </ToggleGroupItem>
          </ToggleGroup>
        </YStack>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tLocale('label')}</DropdownMenuLabel>
        <YStack px={6} py={4}>
          <ToggleGroup
            value={locale}
            onValueChange={change}
            label={tLocale('label')}
          >
            {locales.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                <OptionText>{tLocale(value)}</OptionText>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </YStack>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<LogOut size={16} />}
          onClick={() => void signOutAndLeave()}
        >
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Lo stesso menu nel foglio. Le voci del menu a tendina vivono solo dentro il
 * menu: qui le pagine sono `NavItem`, accese dove si è, e tema e lingua due
 * file di bottoni. Il foglio si chiude dopo ogni voce che porta altrove.
 */
function UserSheet({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const signOutAndLeave = useSignOut();
  const close = () => setOpen(false);

  return (
    <>
      <AvatarButton name={name} onPress={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen} label={name}>
        <XStack items="center" gap={10} px={12} py={4}>
          <Avatar name={name} size={32} />
          <Text
            fontSize={15}
            lineHeight={20}
            fontWeight="500"
            color="$color12"
            numberOfLines={1}
            shrink={1}
          >
            {name}
          </Text>
        </XStack>
        <YStack render="nav" aria-label={name} gap={4}>
          <SheetLink to="/" icon={<House size={16} />} onNavigate={close}>
            {t('home')}
          </SheetLink>
          <SheetLink
            to="/backlog"
            icon={<Library size={16} />}
            onNavigate={close}
          >
            {t('backlog')}
          </SheetLink>
          <SheetLink
            to="/playlist"
            icon={<ListFilter size={16} />}
            onNavigate={close}
          >
            {t('playlists')}
          </SheetLink>
          <SheetLink to="/account" icon={<User size={16} />} onNavigate={close}>
            {t('account')}
          </SheetLink>
          {isAdmin ? (
            <SheetLink
              to="/admin"
              icon={<Shield size={16} />}
              onNavigate={close}
            >
              {t('admin')}
            </SheetLink>
          ) : null}
        </YStack>
        <Separator />
        <SheetSettings />
        <Separator />
        <Button
          variant="ghost"
          justify="flex-start"
          gap={10}
          px={12}
          onPress={() => {
            close();
            void signOutAndLeave();
          }}
        >
          <LogOut size={16} />
          {t('signOut')}
        </Button>
      </Sheet>
    </>
  );
}

/**
 * Il foglio di chi non è collegato, sotto `$md`: in barra accesso e
 * registrazione col tema e la lingua non ci stanno. Lo stesso foglio di
 * `UserSheet`, con accesso e registrazione al posto delle pagine e
 * dell'uscita. Da `$md` i bottoni restano in barra (`AppShell`).
 */
export function GuestSheet() {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        width={40}
        height={40}
        rounded={999}
        aria-label={t('menu')}
        onPress={() => setOpen(true)}
      >
        <User size={20} />
      </Button>
      {/* I due link non chiudono il foglio: portano fuori dal guscio, e il
          foglio se ne va con lui. */}
      <Sheet open={open} onOpenChange={setOpen} label={t('menu')}>
        <YStack gap={8} px={12} py={4}>
          <ButtonLink href="/login" variant="outline">
            {t('signIn')}
          </ButtonLink>
          <ButtonLink href="/register">{t('signUp')}</ButtonLink>
        </YStack>
        <Separator />
        <SheetSettings />
      </Sheet>
    </>
  );
}

/**
 * Tema e lingua nel foglio, due file di bottoni: le stesse da collegato e da
 * anonimo. Il contenuto del foglio si monta solo all'apertura, quindi
 * l'`undefined` di `theme` sul server non arriva mai al markup iniziale.
 */
function SheetSettings() {
  const tTheme = useTranslations('theme');
  const tLocale = useTranslations('locale');
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const { change } = useChangeLocale();

  return (
    <>
      <SheetSetting label={tTheme('label')}>
        {/* `theme`, non `resolvedTheme`: si sceglie la preferenza, e
          «sistema» deve restare selezionabile come tale. */}
        <ToggleGroup
          value={theme ?? 'system'}
          onValueChange={setTheme}
          label={tTheme('label')}
        >
          <ToggleGroupItem value="light">
            <OptionText>{tTheme('light')}</OptionText>
          </ToggleGroupItem>
          <ToggleGroupItem value="dark">
            <OptionText>{tTheme('dark')}</OptionText>
          </ToggleGroupItem>
          <ToggleGroupItem value="system">
            <OptionText>{tTheme('system')}</OptionText>
          </ToggleGroupItem>
        </ToggleGroup>
      </SheetSetting>
      <SheetSetting label={tLocale('label')}>
        <ToggleGroup
          value={locale}
          onValueChange={change}
          label={tLocale('label')}
        >
          {locales.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              <OptionText>{tLocale(value)}</OptionText>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SheetSetting>
    </>
  );
}

function SheetSetting({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <XStack items="center" justify="space-between" gap={12} px={12} py={4}>
      <Text fontSize={14} lineHeight={20} color="$color11">
        {label}
      </Text>
      {children}
    </XStack>
  );
}

/**
 * Una pagina nel foglio, accesa se ci si è, anche sotto di sé. Tasto
 * centrale e modificatori aprono una scheda nuova, come ogni link dell'app.
 */
function SheetLink({
  to,
  icon,
  onNavigate,
  children,
}: {
  to: '/' | '/backlog' | '/playlist' | '/account' | '/admin';
  icon: ReactNode;
  onNavigate: () => void;
  children: string;
}) {
  const router = useRouter();
  const matchRoute = useMatchRoute();

  return (
    <NavItem
      href={to}
      // `/` combacia con ogni percorso: «Home» si accende solo da sé.
      active={matchRoute({ to, fuzzy: to !== '/' }) !== false}
      icon={icon}
      onClick={(event) => {
        if (!takeLinkClick(event)) return;
        void router.navigate({ to });
        onNavigate();
      }}
    >
      {children}
    </NavItem>
  );
}

/** Il testo di un'opzione: dentro un `ToggleGroupItem` va in un `Text`. */
function OptionText({ children }: { children: string }) {
  return (
    <Text fontSize={13} lineHeight={18} color="$color12">
      {children}
    </Text>
  );
}
