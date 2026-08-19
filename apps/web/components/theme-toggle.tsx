'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      {/* Le due icone si scambiano via CSS, non via `resolvedTheme`: sul server
          il tema non è noto e leggerlo qui darebbe un markup diverso da quello
          idratato. La classe `.dark` sull'html invece c'è già al primo paint. */}
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t('label')}>
            <SunIcon className="scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
            <MoonIcon className="absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-36">
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
