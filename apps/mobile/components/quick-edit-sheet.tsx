import type { BacklogEntry } from '@repo/contracts';
import { RatingStars, Sheet, Text, XStack, YStack } from '@repo/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { useEntryMutations } from '../lib/entry-mutations';
import { useBackToClose } from '../lib/use-back-to-close';
import { useRatingLabels } from './rating-stars';
import { StatusSelect, useStatusLabels } from './status';

/** Stato e voto di una voce, senza entrare nella pagina del gioco. */
export function QuickEditSheet({
  entry,
  onClose,
}: {
  entry: BacklogEntry | null;
  onClose: () => void;
}) {
  const t = useTranslations('quickEdit');
  const { setStatus, setRating } = useEntryMutations();
  const statusLabels = useStatusLabels();
  const ratingLabels = useRatingLabels();
  const insets = useSafeAreaInsets();
  useBackToClose(entry !== null, onClose);

  const status =
    entry && setStatus.isPending && setStatus.variables.id === entry.id
      ? setStatus.variables.status
      : entry?.status;
  const rating =
    entry && setRating.isPending && setRating.variables.id === entry.id
      ? setRating.variables.rating
      : (entry?.rating ?? null);

  return (
    <Sheet
      open={entry !== null}
      onOpenChange={(open) => !open && onClose()}
      label={entry?.game.name ?? t('title')}
    >
      {entry && status ? (
        <YStack gap={16} pb={16 + insets.bottom}>
          <Text
            fontSize={18}
            fontWeight="700"
            color="color12"
            numberOfLines={2}
          >
            {entry.game.name}
          </Text>
          <XStack items="center" justify="space-between" gap={12}>
            <Text color="color12">{t('status')}</Text>
            <StatusSelect
              value={status}
              labels={statusLabels}
              onChange={(next) =>
                setStatus.mutate({ id: entry.id, status: next })
              }
            />
          </XStack>
          <YStack gap={8}>
            <Text color="color12">{t('rating')}</Text>
            <RatingStars
              value={rating}
              labels={ratingLabels}
              onChange={(next) =>
                setRating.mutate({ id: entry.id, rating: next })
              }
            />
          </YStack>
        </YStack>
      ) : null}
    </Sheet>
  );
}
