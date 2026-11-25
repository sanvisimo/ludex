import type { RatingStarsLabels } from '@repo/ui';
import { useTranslations } from 'use-intl';

/**
 * I testi di `RatingStars` di `@repo/ui`. Si calcolano fuori dai fogli: dentro,
 * su native, il contesto di use-intl non arriva.
 */
export function useRatingLabels(): RatingStarsLabels {
  const t = useTranslations('rating');
  return {
    value: (value) => t('value', { value }),
    none: t('none'),
    of: (value) => t('of', { value }),
    clear: t('clear'),
  };
}
