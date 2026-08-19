'use client';

import { StarIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Il voto in sola lettura, per le liste.
 *
 * Non rende niente quando non c'è: "non votato" non merita una riga vuota che
 * chieda di essere riempita — è uno stato legittimo, non un buco.
 */
export function RatingValue({ value }: { value: number | null }) {
  const t = useTranslations('editEntry');
  if (value === null) return null;

  return (
    <span
      className="flex items-center gap-1 text-muted-foreground"
      aria-label={t('ratingOf', { value })}
    >
      <StarIcon className="size-3.5 fill-primary text-primary" />
      {value}
    </span>
  );
}
