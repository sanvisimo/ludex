import type { BacklogEntry } from '@repo/contracts';
import { Text, XStack, YStack, useTheme } from '@repo/ui';
import { Gamepad2, Hourglass, Star } from '@repo/ui/icons';
import { Image } from 'react-native';
import { useTranslations } from 'use-intl';

import { formatDuration, igdbImageUrl } from '../lib/game-format';
import { statusIcons } from './status';

export const COVER_WIDTH = 64;
const COVER_HEIGHT = 86;

export function Cover({
  imageId,
  width,
  height,
}: {
  imageId: string | null;
  width: number;
  height: number;
}) {
  return imageId ? (
    <Image
      source={{ uri: igdbImageUrl(imageId, 'cover_small') }}
      style={{ width, height, borderRadius: 6 }}
    />
  ) : (
    <YStack
      width={width}
      height={height}
      rounded={6}
      bg="color4"
      items="center"
      justify="center"
    >
      <Gamepad2 size={20} color="color9" />
    </YStack>
  );
}

/** I nomi delle piattaforme le passa la lista, che le ha da `filterOptions`. */
export function BacklogCard({
  entry,
  platformName,
  onPress,
  onLongPress,
}: {
  entry: BacklogEntry;
  platformName: (slug: string) => string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const tStatus = useTranslations('status');
  const tStore = useTranslations('store');
  const StatusIcon = statusIcons[entry.status];
  // Su native `currentColor` non arriva al riempimento dell'SVG.
  const accent = useTheme().accent9?.val;

  const copies = [
    ...new Set(
      entry.ownerships.map((copy) =>
        copy.store
          ? `${platformName(copy.platformSlug)} · ${tStore(copy.store)}`
          : platformName(copy.platformSlug),
      ),
    ),
  ].join(', ');

  return (
    <XStack
      role="button"
      onPress={onPress}
      onLongPress={onLongPress}
      bg="surface press:color3"
      borderWidth={1}
      borderColor="borderColor"
      rounded={12}
      p={12}
      gap={12}
    >
      <Cover
        imageId={entry.game.coverImageId}
        width={COVER_WIDTH}
        height={COVER_HEIGHT}
      />
      <YStack flex={1} gap={4}>
        <Text fontSize={16} fontWeight="600" color="color12" numberOfLines={2}>
          {entry.game.name}
        </Text>
        {copies ? (
          <Text fontSize={13} color="color11" numberOfLines={1}>
            {copies}
          </Text>
        ) : null}
        <XStack items="center" gap={12} mt="auto" flexWrap="wrap">
          <XStack
            items="center"
            gap={4}
            bg="selectionBackground"
            px={8}
            height={24}
            rounded={6}
          >
            <StatusIcon size={12} color="selectionColor" />
            <Text fontSize={12} color="selectionColor">
              {tStatus(entry.status)}
            </Text>
          </XStack>
          {entry.game.hltbMainMinutes ? (
            <XStack items="center" gap={4}>
              <Hourglass size={12} color="color11" />
              <Text fontSize={12} color="color11">
                {formatDuration(entry.game.hltbMainMinutes)}
              </Text>
            </XStack>
          ) : null}
          {entry.rating !== null ? (
            <XStack items="center" gap={4}>
              <Star size={12} color="accent9" fill={accent} />
              <Text fontSize={12} color="color11">
                {entry.rating}
              </Text>
            </XStack>
          ) : null}
        </XStack>
      </YStack>
    </XStack>
  );
}
