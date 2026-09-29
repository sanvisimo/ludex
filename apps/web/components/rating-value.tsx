import { Text, XStack } from '@repo/ui';
import { Star } from '@repo/ui/icons';
import { useTranslations } from 'use-intl';

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
    // `role="img"`: un `aria-label` su un `div` senza ruolo axe lo boccia
    // (aria-prohibited-attr), e un lettore di schermo può ignorarlo.
    <XStack
      role="img"
      items="center"
      gap={4}
      aria-label={t('ratingOf', { value })}
    >
      <Star size={14} color="$accent9" fill="currentColor" />
      <Text fontSize={14} lineHeight={20} color="$color11" aria-hidden>
        {value}
      </Text>
    </XStack>
  );
}
