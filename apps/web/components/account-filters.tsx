import { storeValues, type Store } from '@repo/contracts/vocabulary';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  XStack,
} from '@repo/ui';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useStoreLabels } from '@/lib/labels';

/** I filtri delle pagine «Da sistemare» e «Nascosti» (11a): nell'indirizzo. */
export type AccountFilter = { q?: string; negozio?: Store };

/** Lettura dei filtri dall'indirizzo: un valore che non è un negozio si ignora. */
export function readAccountFilter(
  search: Record<string, unknown>,
): AccountFilter {
  return {
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    negozio: (storeValues as readonly unknown[]).includes(search.negozio)
      ? (search.negozio as Store)
      : undefined,
  };
}

/** Una voce d'import passa i filtri? Il nome si confronta senza maiuscole. */
export function matchesAccountFilter(
  entry: { name: string; store: Store },
  filter: AccountFilter,
) {
  if (filter.negozio && entry.store !== filter.negozio) return false;
  if (filter.q && !entry.name.toLowerCase().includes(filter.q.toLowerCase()))
    return false;
  return true;
}

/**
 * Ricerca per nome e negozio, gli stessi filtri degli scarti dell'admin. La
 * ricerca aspetta che si smetta di scrivere: chi la usa la scrive
 * nell'indirizzo, e un passo per lettera riempirebbe la cronologia.
 */
export function AccountFilters({
  filter,
  onChange,
}: {
  filter: AccountFilter;
  onChange: (next: AccountFilter) => void;
}) {
  const t = useTranslations('account.filters');
  const storeLabels = useStoreLabels();
  const [text, setText] = useState(filter.q ?? '');

  useEffect(() => setText(filter.q ?? ''), [filter.q]);
  useEffect(() => {
    const value = text.trim() || undefined;
    if (value === filter.q) return;
    const timer = setTimeout(() => onChange({ ...filter, q: value }), 300);
    return () => clearTimeout(timer);
  }, [text, filter, onChange]);

  return (
    <XStack gap={12} items="center" flexWrap="wrap">
      <Select
        items={Object.fromEntries([
          ['all', t('allStores')],
          ...storeValues.map((value) => [value, storeLabels[value]]),
        ])}
        value={filter.negozio ?? 'all'}
        onValueChange={(next) =>
          onChange({
            ...filter,
            negozio: next === 'all' ? undefined : (next as Store),
          })
        }
      >
        <SelectTrigger width={180}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStores')}</SelectItem>
          {storeValues.map((value) => (
            <SelectItem key={value} value={value}>
              {storeLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        width={240}
        value={text}
        onChangeText={setText}
        placeholder={t('search')}
        aria-label={t('search')}
      />
    </XStack>
  );
}
