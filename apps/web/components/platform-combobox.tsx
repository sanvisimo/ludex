import type { Platform } from '@repo/contracts';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@repo/ui';
import { useTranslations } from 'use-intl';
import { useMemo } from 'react';

// Le piattaforme sono 96: una tendina semplice sarebbe inusabile, serve un campo
// che filtri mentre scrivi. Gli item sono gli slug, non oggetti, così il valore
// selezionato è già quello che l'API si aspetta; `itemToStringLabel` fa da
// traduttore per ciò che si vede a schermo.
export function PlatformCombobox({
  platforms,
  value,
  onValueChange,
  id,
  'aria-label': ariaLabel,
  placeholder,
  clearLabel,
}: {
  platforms: Platform[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  id?: string;
  /** Al posto di una `<Label>`, dove il campo sta in riga con altri. */
  'aria-label'?: string;
  placeholder?: string;
  /** Con un'etichetta compare la x che svuota la scelta: per i filtri, dove
   *  «nessuna piattaforma» è un valore. */
  clearLabel?: string;
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
      <ComboboxInput
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder ?? t('placeholder')}
        showClear={clearLabel !== undefined}
        clearLabel={clearLabel}
        width="100%"
      />
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
