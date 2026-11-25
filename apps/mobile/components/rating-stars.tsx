import { Text, XStack, useTheme } from '@repo/ui';
import { Star, X } from '@repo/ui/icons';
import { useTranslations } from 'use-intl';

const POSITIONS = [1, 2, 3, 4, 5];
const SIZE = 32;

export function useRatingLabels() {
  const t = useTranslations('rating');
  return {
    value: (value: number) => t('value', { value }),
    none: t('none'),
    clear: t('clear'),
  };
}

export type RatingLabels = ReturnType<typeof useRatingLabels>;

/**
 * Il voto da mezza stella a cinque, come `RatingStars` del web: ogni stella è
 * due bersagli, la metà sinistra vale `n - 0.5`. Senza il passaggio del mouse,
 * il voto si toglie con la × o ritoccando lo stesso valore.
 * Le etichette arrivano da fuori, come per `StatusSelect`.
 */
export function RatingStars({
  value,
  onChange,
  labels,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  labels: RatingLabels;
}) {
  const shown = value ?? 0;
  // Su native `currentColor` non arriva al riempimento dell'SVG.
  const accent = useTheme().accent9?.val;

  return (
    <XStack items="center" gap={10}>
      <XStack>
        {POSITIONS.map((position) => (
          <XStack key={position} position="relative" width={SIZE} height={SIZE}>
            <Star size={SIZE} color="color8" />
            <XStack
              position="absolute"
              t={0}
              l={0}
              b={0}
              width={`${Math.min(Math.max(shown - position + 1, 0), 1) * 100}%`}
              overflow="hidden"
              pointerEvents="none"
            >
              <XStack width={SIZE} height={SIZE}>
                <Star size={SIZE} color="accent9" fill={accent} />
              </XStack>
            </XStack>
            {[position - 0.5, position].map((candidate) => (
              <XStack
                key={candidate}
                role="button"
                aria-label={labels.value(candidate)}
                onPress={() => onChange(value === candidate ? null : candidate)}
                position="absolute"
                t={0}
                b={0}
                {...(candidate === position ? { r: 0 } : { l: 0 })}
                width="50%"
              />
            ))}
          </XStack>
        ))}
      </XStack>
      {value === null ? (
        <Text color="color11">{labels.none}</Text>
      ) : (
        <XStack
          role="button"
          aria-label={labels.clear}
          onPress={() => onChange(null)}
          items="center"
          gap={4}
          hitSlop={8}
        >
          <Text color="color11">{value}</Text>
          <X size={16} color="color11" />
        </XStack>
      )}
    </XStack>
  );
}
