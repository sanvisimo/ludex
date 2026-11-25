import type { RatingStarsLabels } from '@repo/ui';
import { useTranslations } from 'use-intl';

/** I testi di `RatingStars`, che `@repo/ui` non traduce. */
export function useRatingLabels(): RatingStarsLabels {
  const t = useTranslations('editEntry');
  return {
    value: (value) => t('ratingValue', { value }),
    none: t('noRating'),
    of: (value) => t('ratingOf', { value }),
    clear: t('clearRating'),
  };
}
