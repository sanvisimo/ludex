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

import { pageSizeValues, type PageSize } from '@/lib/backlog-filter';

/** Quanti giochi per pagina: una tendina stretta, accanto alla paginazione. */
export function PageSizeSelect({
  value,
  onChange,
}: {
  value: PageSize;
  onChange: (size: PageSize) => void;
}) {
  const t = useTranslations('backlog');
  const id = useId();
  const items = Object.fromEntries(
    pageSizeValues.map((size) => [String(size), String(size)]),
  );
  return (
    <XStack items="center" gap={8}>
      <Label htmlFor={id} color="$color11" fontWeight="400">
        {t('pageSize')}
      </Label>
      <Select
        items={items}
        value={String(value)}
        onValueChange={(next) => onChange(Number(next) as PageSize)}
      >
        <SelectTrigger id={id} width={80}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pageSizeValues.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {String(size)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </XStack>
  );
}
