import type { BacklogEntry } from '@repo/contracts';
import { Button, Text, XStack } from '@repo/ui';
import { Link } from '@tanstack/react-router';
import { useFormatter, useTranslations } from 'use-intl';

import { GameCover } from '@/components/game-cover';
import { GameTypeBadge } from '@/components/game-type-badge';
import { OwnershipBadges } from '@/components/ownership-badges';
import { RowFrame } from '@/components/row-frame';
import { useSetEntryHidden } from '@/lib/hide-entry';

/**
 * Un gioco che hai nascosto dal backlog, nella stessa riga degli scarti.
 *
 * Il gioco c'è, è risolto e ha la copertina di IGDB; quello che manca alla
 * lista del backlog è la tua scelta di non vederlo. «Mostra di nuovo» è il
 * gesto contrario, con l'«Annulla» del toast che gli dà `useSetEntryHidden`.
 */
export function HiddenGameRow({ entry }: { entry: BacklogEntry }) {
  const t = useTranslations('account.unresolved');
  const tHidden = useTranslations('hidden');
  const format = useFormatter();
  const setHidden = useSetEntryHidden();

  return (
    <RowFrame
      cover={
        <GameCover
          imageId={entry.game.coverImageId}
          name={entry.game.name}
          width={44}
        />
      }
    >
      <XStack items="center" gap={8} flexWrap="wrap">
        <Link to="/games/$slug" params={{ slug: entry.game.slug }}>
          <Text fontWeight="500" color="$color12">
            {entry.game.name}
          </Text>
        </Link>
        <GameTypeBadge type={entry.game.gameType} />
      </XStack>

      {/* Il possesso è la ragione per cui la riga è ancora qui: nascondere non è
          dire «non ce l'ho». */}
      <OwnershipBadges ownerships={entry.ownerships} />

      {entry.hiddenAt && (
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('hiddenOn', {
            date: format.dateTime(entry.hiddenAt, { dateStyle: 'medium' }),
          })}
        </Text>
      )}

      <XStack gap={8} flexWrap="wrap" items="center">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setHidden.mutate({ id: entry.id, hidden: false })}
          disabled={setHidden.isPending}
        >
          {tHidden('unhide')}
        </Button>
      </XStack>
    </RowFrame>
  );
}
