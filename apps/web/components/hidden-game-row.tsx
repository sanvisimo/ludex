import type { BacklogEntry } from '@repo/contracts';
import { Badge, Button, Text, XStack } from '@repo/ui';
import { Link } from '@tanstack/react-router';
import { useFormatter, useTranslations } from 'use-intl';
import { GameCover } from '@/components/game-cover';
import { GameTypeBadge } from '@/components/game-type-badge';
import { OwnershipBadges } from '@/components/ownership-badges';
import { ROW_COVER_WIDTH, RowFrame } from '@/components/row-frame';
import { useSetEntryHidden } from '@/lib/hide-entry';

export function HiddenGameRow({ entry }: { entry: BacklogEntry }) {
  const t = useTranslations('account.unresolved');
  const tReview = useTranslations('account.review');
  const format = useFormatter();
  const setHidden = useSetEntryHidden();
  return (
    <RowFrame
      cover={
        <GameCover
          imageId={entry.game.coverImageId}
          name={entry.game.name}
          width={ROW_COVER_WIDTH}
        />
      }
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => setHidden.mutate({ id: entry.id, hidden: false })}
          disabled={setHidden.isPending}
        >
          {tReview('restoreGame')}
        </Button>
      }
    >
      <XStack items="center" gap={8} flexWrap="wrap">
        <Link to="/games/$slug" params={{ slug: entry.game.slug }}>
          <Text fontWeight="600" color="$color12">
            {entry.game.name}
          </Text>
        </Link>
        <GameTypeBadge type={entry.game.gameType} />
      </XStack>
      <Badge variant="secondary" self="flex-start">
        {tReview('gameItem')}
      </Badge>
      <OwnershipBadges ownerships={entry.ownerships} compact />
      {entry.hiddenAt && (
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('hiddenOn', {
            date: format.dateTime(entry.hiddenAt, { dateStyle: 'medium' }),
          })}
        </Text>
      )}
    </RowFrame>
  );
}
