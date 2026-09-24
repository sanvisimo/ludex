'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@repo/ui';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu align="end">
      {/* Le due icone si scambiano via CSS, non via `resolvedTheme`: sul server
          il tema non è noto e leggerlo qui darebbe un markup diverso da quello
          idratato. La classe `.t_dark` sull'html invece c'è già al primo paint. */}
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t('label')}>
            <SunIcon className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
            <MoonIcon className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
          </Button>
        }
      />
      <DropdownMenuContent width={144}>
        {/* `theme`, non `resolvedTheme`: qui si sceglie la preferenza, e
            "sistema" deve restare selezionabile come tale. Il popup viene
            montato solo all'apertura, quindi l'undefined del server non arriva
            mai al markup iniziale. */}
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            {t('light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            {t('dark')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            {t('system')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
