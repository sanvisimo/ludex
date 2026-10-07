import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  XStack,
} from '@repo/ui';
import { useId } from 'react';
import { useTranslations } from 'use-intl';

/**
 * Quanti giochi per pagina: una tendina stretta, accanto alla paginazione.
 *
 * Le voci sono multipli delle colonne (`pageSizeOptions`). Il valore in uso può
 * non essere fra loro — un link con un numero che qui non torna, portato al
 * multiplo più vicino — e va comunque mostrato: lo si aggiunge.
 */
export function PageSizeSelect({
  value,
  options,
  onChange,
}: {
  value: number;
  options: number[];
  onChange: (size: number) => void;
}) {
  const t = useTranslations('backlog');
  const id = useId();
  const sizes = [...new Set([...options, value])].sort((a, b) => a - b);
  const items = Object.fromEntries(
    sizes.map((size) => [String(size), String(size)]),
  );

  return (
    <XStack items="center" gap={8}>
      <Label htmlFor={id} color="$color11" fontWeight="400">
        {t('pageSize')}
      </Label>
      <Select
        items={items}
        value={String(value)}
        onValueChange={(next) => onChange(Number(next))}
      >
        <SelectTrigger id={id} width={80}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sizes.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {String(size)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </XStack>
  );
}
