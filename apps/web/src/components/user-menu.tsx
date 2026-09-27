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
  Text,
} from '@repo/ui';
import { useRouter } from '@tanstack/react-router';
import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'use-intl';

import { locales } from '@/i18n/config';
import { useChangeLocale } from '@/src/components/locale-switcher';

/**
 * Chi è collegato, in fondo alla barra, e le tre cose che sono sue e non di
 * una pagina: tema, lingua, uscita.
 *
 * Il nome visibile è anche il nome del bottone: niente `aria-label`, che lo
 * coprirebbe con un testo diverso da quello che si legge.
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
    <DropdownMenu align="start">
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            width="100%"
            height={44}
            justify="flex-start"
            gap={10}
            px={8}
          >
            <Avatar name={name} size={28} />
            <Text fontSize={14} color="$color12" numberOfLines={1} shrink={1}>
              {name}
            </Text>
          </Button>
        }
      />
      <DropdownMenuContent width={224}>
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
