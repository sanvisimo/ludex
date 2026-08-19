'use client';

import type { Platform } from '@repo/contracts';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';

// Le piattaforme sono 96: una tendina semplice sarebbe inusabile, serve un campo
// che filtri mentre scrivi. Gli item sono gli slug, non oggetti, così il valore
// selezionato è già quello che l'API si aspetta; `itemToStringLabel` fa da
// traduttore per ciò che si vede a schermo.
export function PlatformCombobox({
  platforms,
  value,
  onValueChange,
}: {
  platforms: Platform[];
  value: string | null;
  onValueChange: (value: string | null) => void;
}) {
  const t = useTranslations('platform');
  const slugs = useMemo(
    () => platforms.map((platform) => platform.slug),
    [platforms],
  );
  const nameBySlug = useMemo(
    () => new Map(platforms.map((platform) => [platform.slug, platform.name])),
    [platforms],
  );

  const label = (slug: string) => nameBySlug.get(slug) ?? slug;

  return (
    <Combobox
      items={slugs}
      value={value}
      onValueChange={onValueChange}
      itemToStringLabel={label}
    >
      {/* ComboboxInput È il campo: contiene già input e chevron. Non va dentro
          il popup, altrimenti il posizionamento perde l'ancora. */}
      <ComboboxInput placeholder={t('placeholder')} className="w-full" />
      <ComboboxContent>
        <ComboboxEmpty>{t('empty')}</ComboboxEmpty>
        <ComboboxList>
          {(slug: string) => (
            <ComboboxItem key={slug} value={slug}>
              {label(slug)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
