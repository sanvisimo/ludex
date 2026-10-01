import { signOut } from '@repo/auth/client';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui';
import { useRouter } from '@tanstack/react-router';
import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'use-intl';

import { locales } from '@/i18n/config';
import { useChangeLocale } from '@/src/components/locale-switcher';

/**
 * Chi è collegato, a destra nella barra: l'avatar, e nel menu le sue pagine —
 * backlog e account — e le tre cose che sono sue e non di una pagina: tema,
 * lingua, uscita.
 *
 * Il nome non si legge sul bottone, solo le iniziali: per questo è il suo
 * `aria-label`, e la prima riga del menu.
 */
export function UserMenu({ name }: { name: string }) {
  const t = useTranslations('nav');
  const tTheme = useTranslations('theme');
  const tLocale = useTranslations('locale');
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const { change } = useChangeLocale();

  return (
    <DropdownMenu align="end">
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            width={40}
            height={40}
            rounded={999}
            aria-label={name}
          >
            <Avatar name={name} size={32} />
          </Button>
        }
      />
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
          onClick={() => void router.navigate({ to: '/backlog' })}
        >
          {t('backlog')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void router.navigate({ to: '/account' })}
        >
          {t('account')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tTheme('label')}</DropdownMenuLabel>
        {/* `theme`, non `resolvedTheme`: si sceglie la preferenza, e
            «sistema» deve restare selezionabile come tale. */}
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            {tTheme('light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            {tTheme('dark')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            {tTheme('system')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tLocale('label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={change}>
          {locales.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {tLocale(value)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            // Prima via dalla pagina, poi fuori dalla sessione. Al contrario
            // una pagina privata come `/account` vede la sessione sparire e
            // rimbalza su `/login` per conto suo, e le due navigazioni si
            // pestano.
            await router.navigate({ to: '/' });
            await signOut();
            // Chi guarda è cambiato: i loader rileggono da capo.
            await router.invalidate();
          }}
        >
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
