import {
  Badge,
  Button,
  ScrollView,
  Skeleton,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { ExternalLink, Hourglass } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Image } from 'react-native';
import { useTranslations } from 'use-intl';

import { Cover } from '../../components/backlog-card';
import { RatingStars, useRatingLabels } from '../../components/rating-stars';
import { StatusSelect, useStatusLabels } from '../../components/status';
import { useEntryMutations } from '../../lib/entry-mutations';
import { formatDuration, igdbImageUrl } from '../../lib/game-format';
import { api } from '../../lib/orpc';
import { openOnWeb } from '../../lib/web-links';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap={8}>
      <Text fontSize={12} fontWeight="600" color="color11">
        {title.toUpperCase()}
      </Text>
      {children}
    </YStack>
  );
}

export default function GamePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTranslations('game');
  const tStore = useTranslations('store');
  const tSubscription = useTranslations('subscription');
  const page = useQuery(api.games.bySlug.queryOptions({ input: { slug } }));
  const options = useQuery(api.backlog.filterOptions.queryOptions());
  const { setStatus, setRating } = useEntryMutations();
  const statusLabels = useStatusLabels();
  const ratingLabels = useRatingLabels();

  if (page.isPending)
    return (
      <YStack flex={1} bg="background" p={20} gap={16}>
        <Skeleton height={180} width="100%" rounded={12} />
        <Skeleton height={24} width="70%" />
        <Skeleton height={80} width="100%" rounded={12} />
      </YStack>
    );
  if (page.isError)
    return (
      <YStack flex={1} bg="background" p={20}>
        <Text color="red11">{t('loadFailed')}</Text>
      </YStack>
    );

  const { game, entry } = page.data;
  const platformName = (platformSlug: string) =>
    options.data?.platforms.find((platform) => platform.slug === platformSlug)
      ?.name ?? platformSlug;
  const artwork = game.artworkImageIds?.[0] ?? game.screenshotImageIds?.[0];
  const year = game.firstReleaseDate?.getFullYear();
  const status =
    entry && setStatus.isPending ? setStatus.variables.status : entry?.status;
  const rating =
    entry && setRating.isPending
      ? setRating.variables.rating
      : (entry?.rating ?? null);

  return (
    <ScrollView flex={1} bg="background">
      {artwork ? (
        <Image
          source={{ uri: igdbImageUrl(artwork, 'screenshot_big') }}
          style={{ width: '100%', aspectRatio: 16 / 9 }}
        />
      ) : null}
      <YStack p={20} gap={24}>
        <XStack gap={16} items="flex-end">
          <Cover imageId={game.coverImageId} width={72} height={96} />
          <YStack flex={1} gap={4}>
            <Text
              fontFamily="heading"
              fontSize={22}
              fontWeight="700"
              color="color12"
            >
              {game.name}
            </Text>
            <XStack gap={12} flexWrap="wrap">
              {year ? <Text color="color11">{year}</Text> : null}
              {game.hltbMainMinutes ? (
                <XStack items="center" gap={4}>
                  <Hourglass size={14} color="color11" />
                  <Text color="color11">
                    {formatDuration(game.hltbMainMinutes)}
                  </Text>
                </XStack>
              ) : null}
              {game.criticScore !== null ? (
                <Text color="color11">
                  {t('critic', { score: Math.round(game.criticScore) })}
                </Text>
              ) : null}
            </XStack>
          </YStack>
        </XStack>

        {entry && status ? (
          <YStack
            gap={16}
            p={16}
            rounded={12}
            bg="surface"
            borderWidth={1}
            borderColor="borderColor"
          >
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
        ) : (
          <Text color="color11">{t('notInBacklog')}</Text>
        )}

        {entry && entry.ownerships.length > 0 ? (
          <Section title={t('copies')}>
            {entry.ownerships.map((copy) => (
              <Text key={copy.id} color="color12">
                {[
                  platformName(copy.platformSlug),
                  copy.store ? tStore(copy.store) : null,
                  copy.subscription ? tSubscription(copy.subscription) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ))}
          </Section>
        ) : null}

        {entry?.notes ? (
          <Section title={t('notes')}>
            <Text color="color12">{entry.notes}</Text>
          </Section>
        ) : null}

        {entry && entry.tags.length > 0 ? (
          <Section title={t('tags')}>
            <XStack gap={8} flexWrap="wrap">
              {entry.tags.map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </XStack>
          </Section>
        ) : null}

        <Button
          variant="outline"
          justify="space-between"
          onPress={() => openOnWeb(`/games/${game.slug}`)}
        >
          <Text color="color12">{entry ? t('editOnWeb') : t('openOnWeb')}</Text>
          <ExternalLink size={16} />
        </Button>
      </YStack>
    </ScrollView>
  );
}
