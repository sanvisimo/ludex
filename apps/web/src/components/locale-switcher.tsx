import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@repo/ui';
import { useRouter } from '@tanstack/react-router';
import { LanguagesIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { useTransition } from 'react';

import { locales } from '@/i18n/config';
import { setLocale } from '@/src/i18n';

/**
 * Cambia la lingua: la server function scrive il cookie, poi il router rilegge.
 *
 * Il cookie da solo non ridisegna nulla: lingua e messaggi li ha già letti il
 * loader della radice. `invalidate` lo rifà con la lingua nuova, senza
 * ricaricare la pagina né perdere la cache di react-query. La usano il
 * selettore e il menu utente.
 */
export function useChangeLocale() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      await setLocale({ data: next });
      await router.invalidate();
    });
  }

  return { change, pending };
}

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  const { change, pending } = useChangeLocale();

  return (
    <DropdownMenu align="end">
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('label')}
            disabled={pending}
          >
            <LanguagesIcon size={16} />
          </Button>
        }
      />
      <DropdownMenuContent width={144}>
        <DropdownMenuRadioGroup value={current} onValueChange={change}>
          {locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale}>
              {t(locale)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
