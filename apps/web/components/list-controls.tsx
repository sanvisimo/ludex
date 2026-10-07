import type { BacklogSort, SortDirection } from '@repo/contracts';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  XStack,
  YStack,
} from '@repo/ui';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from '@repo/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

/**
 * Ricerca e ordinamento di una lista di backlog, senza sapere dove vive il
 * loro stato: prendono il valore e dicono cosa è cambiato. Li usano `/backlog`,
 * che li tiene nell'URL insieme ai filtri, e la pagina di una playlist, che li
 * tiene nell'URL senza salvarli.
 */

/**
 * Il campo di ricerca.
 *
 * Ha uno stato locale perché chi lo usa scrive **in ritardo**: la casella deve
 * rispondere a ogni tasto, la ricerca no. Senza il ritardo partirebbe una
 * richiesta per lettera, e una pagina nella cronologia del router per lettera.
 */
export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  /** Il testo, già passato il ritardo. Vuoto se la casella è vuota. */
  onChange: (value: string) => void;
}) {
  const t = useTranslations('filters');
  const [text, setText] = useState(value);
  // L'ultima `onChange` senza farla entrare fra le dipendenze del ritardo: chi
  // ci passa una funzione scritta nel render ne crea una nuova a ogni render, e
  // il timer ripartirebbe da capo a ogni ridisegno della pagina.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Riallinea quando il valore cambia da fuori: il bottone che azzera tutto, o
  // un URL incollato. Senza, la casella resterebbe con dentro la vecchia parola.
  useEffect(() => setText(value), [value]);

  // Il ritardo è sulla scrittura: ciò che sta sopra — e quindi la query —
  // segue il valore, quindi ritardare l'uno ritarda l'altra. Ogni tasto
  // riparte da capo.
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onChangeRef.current(text), 350);
    return () => clearTimeout(timer);
  }, [text, value]);

  return (
    <Input
      value={text}
      onChange={(event) => setText(event.target.value)}
      placeholder={t('searchPlaceholder')}
      aria-label={t('searchPlaceholder')}
      width="100%"
      maxLength={100}
    />
  );
}

export function sortLabels(t: ReturnType<typeof useTranslations<'filters'>>) {
  return {
    addedAt: t('sortAddedAt'),
    name: t('sortName'),
    released: t('sortReleased'),
    duration: t('sortDuration'),
    rating: t('sortRating'),
    criticRating: t('sortCriticRating'),
    lastPlayed: t('sortLastPlayed'),
  } satisfies Record<BacklogSort, string>;
}

/**
 * Criterio e direzione dell'ordinamento: la tendina e il bottone accanto. Il
 * `id` va sulla tendina, per la `Label` di chi la mette in un pannello.
 */
export function SortSelect({
  id,
  sort,
  direction,
  keys,
  onSortChange,
  onDirectionChange,
}: {
  id?: string;
  /** Solo queste chiavi: una lista non ha il voto personale né l'ultima partita. */
  keys?: readonly BacklogSort[];
  sort: BacklogSort;
  direction: SortDirection;
  onSortChange: (sort: BacklogSort) => void;
  onDirectionChange: (direction: SortDirection) => void;
}) {
  const t = useTranslations('filters');
  const all = sortLabels(t);
  const labels = Object.fromEntries(
    Object.entries(all).filter(
      ([key]) => !keys || keys.includes(key as BacklogSort),
    ),
  );

  return (
    <XStack items="center" gap={8}>
      <YStack flex={1} minW={0}>
        <Select
          items={labels}
          value={sort}
          onValueChange={(value) => onSortChange(value as BacklogSort)}
        >
          <SelectTrigger id={id} width="100%" aria-label={t('sortLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(labels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </YStack>
      <Button
        variant="outline"
        size="icon"
        onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}
        aria-label={t(direction === 'asc' ? 'ascending' : 'descending')}
      >
        {direction === 'asc' ? (
          <ArrowUpNarrowWide size={16} color="$color12" />
        ) : (
          <ArrowDownWideNarrow size={16} color="$color12" />
        )}
      </Button>
    </XStack>
  );
}
