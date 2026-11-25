import type { HomeGame } from '@repo/contracts';
import {
  CornerLabel,
  CoverCard,
  CriticScoreBadge,
  RankLabel,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { Gamepad2 } from '@repo/ui/icons';
import { router } from 'expo-router';
import { Image } from 'react-native';
import { useTranslations } from 'use-intl';

import { formatDuration, igdbImageUrl } from '../lib/game-format';
import { statusIcons } from './status';

export const GAME_CARD_WIDTH = 160;
const COVER_RATIO = 4 / 3;

/** La card delle fasce e delle playlist scelte a mano: la `CoverCard` del sito. */
export function GameCard({
  game,
  rank,
  width = GAME_CARD_WIDTH,
  onLongPress,
}: {
  game: HomeGame;
  rank?: number;
  width?: number;
  onLongPress?: () => void;
}) {
  const tStatus = useTranslations('status');
  const tCurated = useTranslations('curated');
  const open = () =>
    router.push({ pathname: '/games/[slug]', params: { slug: game.slug } });
  const height = Math.round(width * COVER_RATIO);
  const StatusIcon = game.status ? statusIcons[game.status] : null;

  return (
    <CoverCard
      width={width}
      cover={
        <YStack
          role="button"
          onPress={open}
          onLongPress={onLongPress}
          width={width}
          height={height}
          bg="color4"
          items="center"
          justify="center"
        >
          {game.coverImageId ? (
            <Image
              source={{ uri: igdbImageUrl(game.coverImageId, 'cover_big') }}
              style={{ width, height, position: 'absolute' }}
            />
          ) : (
            <Gamepad2 size={24} color="color9" />
          )}
          {game.status && StatusIcon ? (
            <CornerLabel floating icon={StatusIcon} maxW={width - 16}>
              {tStatus(game.status)}
            </CornerLabel>
          ) : null}
        </YStack>
      }
      overlay={
        rank !== undefined ? (
          <RankLabel rank={rank} label={tCurated('rank', { position: rank })} />
        ) : null
      }
      title={
        <Text
          role="link"
          onPress={open}
          onLongPress={onLongPress}
          fontSize={14}
          lineHeight="20px"
          fontWeight="600"
          color="color12"
          numberOfLines={2}
        >
          {game.name}
        </Text>
      }
      meta={
        <>
          <XStack flexWrap="wrap" items="center" gap={8} flex={1} minW={0}>
            {game.firstReleaseDate ? (
              <Text fontSize={12} lineHeight="20px" color="color11">
                {game.firstReleaseDate.getFullYear()}
              </Text>
            ) : null}
            {game.hltbMainMinutes ? (
              <Text fontSize={12} lineHeight="20px" color="color11">
                {formatDuration(game.hltbMainMinutes)}
              </Text>
            ) : null}
          </XStack>
          {game.criticScore !== null ? (
            <CriticScoreBadge score={game.criticScore} compact />
          ) : null}
        </>
      }
    />
  );
}
