import type { GameDetail } from '@repo/contracts';
import {
  Button,
  Gallery,
  RatingStars,
  ScrollView,
  Skeleton,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import type { GalleryItem } from '@repo/ui';
import { ChevronLeft, Eye, EyeOff, Pencil, Trash2 } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import {
  Attributes,
  CopyCard,
  CriticScores,
  CuratedPlaylistsPanel,
  Description,
  GameHero,
  HltbTimes,
  Panel,
  RelatedRow,
  WishlistPanel,
} from '../../../components/game-sections';
import { useRatingLabels } from '../../../components/rating-stars';
import { StatusSelect, useStatusLabels } from '../../../components/status';
import { useEntryMutations } from '../../../lib/entry-mutations';
import { igdbImageUrl } from '../../../lib/game-format';
import { api, client } from '../../../lib/orpc';

function galleryItems(game: GameDetail, alt: (index: number) => string) {
  return [
    ...(game.videos ?? []).map((video): GalleryItem => ({
      kind: 'video',
      videoId: video.videoId,
      title: video.name ?? 'Trailer',
    })),
    ...(game.screenshotImageIds ?? []).map((imageId, index): GalleryItem => ({
      kind: 'image',
      src: igdbImageUrl(imageId, 'screenshot_big'),
      thumb: igdbImageUrl(imageId, 'screenshot_med', false),
      full: igdbImageUrl(imageId, '1080p', false),
      alt: alt(index + 1),
    })),
  ];
}

export default function GamePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTranslations('game');
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const page = useQuery(api.games.bySlug.queryOptions({ input: { slug } }));
  const platforms = useQuery(api.platforms.list.queryOptions());
  const { setStatus, setRating } = useEntryMutations();
  const statusLabels = useStatusLabels();
  const ratingLabels = useRatingLabels();

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
      queryClient.invalidateQueries({ queryKey: api.games.bySlug.key() }),
    ]);
  const setHidden = useMutation({
    mutationFn: (input: { id: string; hidden: boolean }) =>
      client.backlog.setHidden(input),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.backlog.remove({ id }),
    onSuccess: async () => {
      await refresh();
      router.back();
    },
  });
  const openVersion = useMutation({
    mutationFn: async (version: GameDetail['related'][number]) =>
      version.slug ??
      (await client.games.fromIgdb({ igdbId: version.igdbId })).slug,
    onSuccess: (next) =>
      router.push({ pathname: '/games/[slug]', params: { slug: next } }),
  });

  const back = (
    <XStack
      role="button"
      aria-label={t('back')}
      onPress={() => router.back()}
      position="absolute"
      t={insets.top + 8}
      l={12}
      width={40}
      height={40}
      rounded={20}
      bg="background"
      opacity={0.85}
      items="center"
      justify="center"
    >
      <ChevronLeft size={24} color="color12" />
    </XStack>
  );

  if (page.isPending)
    return (
      <YStack flex={1} bg="background" gap={16}>
        <Skeleton height={240} width="100%" />
        <YStack px={20} gap={16}>
          <Skeleton height={28} width="70%" />
          <Skeleton height={120} width="100%" rounded={16} />
        </YStack>
        {back}
      </YStack>
    );
  if (page.isError)
    return (
      <YStack flex={1} bg="background" p={20} pt={insets.top + 64}>
        <Text color="red11">{t('loadFailed')}</Text>
        {back}
      </YStack>
    );

  const { game, entry } = page.data;
  const platformName = (platformSlug: string) =>
    platforms.data?.find((platform) => platform.slug === platformSlug)?.name ??
    platformSlug;
  const status =
    entry && setStatus.isPending ? setStatus.variables.status : entry?.status;
  const rating =
    entry && setRating.isPending
      ? setRating.variables.rating
      : (entry?.rating ?? null);
  const gallery = galleryItems(game, (index) =>
    t('screenshotAlt', { index, name: game.name }),
  );

  return (
    <YStack flex={1} bg="background">
      <ScrollView flex={1} contentContainerStyle={{ paddingBottom: 32 }}>
        <GameHero game={game} />
        <YStack px={16} pt={20} gap={16}>
          {entry && status ? (
            <XStack
              bg="selectionBackground"
              borderWidth={1}
              borderColor="selectionBorder"
              rounded={16}
              p={16}
              gap={16}
              flexWrap="wrap"
            >
              <YStack gap={6}>
                <Text fontSize={12} color="color11">
                  {t('inBacklog')}
                </Text>
                <StatusSelect
                  value={status}
                  labels={statusLabels}
                  width={180}
                  onChange={(next) =>
                    setStatus.mutate({ id: entry.id, status: next })
                  }
                />
              </YStack>
              <YStack gap={6}>
                <Text fontSize={12} color="color11">
                  {t('yourRating')}
                </Text>
                <RatingStars
                  size="sm"
                  value={rating}
                  labels={ratingLabels}
                  onChange={(next) =>
                    setRating.mutate({ id: entry.id, rating: next })
                  }
                />
              </YStack>
            </XStack>
          ) : (
            <Text color="color11">{t('notInBacklog')}</Text>
          )}

          <HltbTimes game={game} />
          <CriticScores game={game} entry={entry} />

          {entry ? (
            <Panel
              title={t('copies')}
              aside={
                <Text
                  fontSize={12}
                  color="color11"
                  bg="color4"
                  px={8}
                  py={2}
                  rounded={10}
                >
                  {entry.ownerships.length}
                </Text>
              }
            >
              {entry.ownerships.map((copy) => (
                <CopyCard
                  key={copy.id}
                  copy={copy}
                  platformName={platformName(copy.platformSlug)}
                />
              ))}
              <XStack
                gap={8}
                pt={12}
                borderTopWidth={1}
                borderColor="borderColor"
                flexWrap="wrap"
              >
                <Button
                  variant="outline"
                  onPress={() =>
                    router.push({
                      pathname: '/games/[slug]/edit',
                      params: { slug: game.slug },
                    })
                  }
                >
                  <Pencil size={16} />
                  {t('edit')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={setHidden.isPending}
                  onPress={() =>
                    setHidden.mutate({
                      id: entry.id,
                      hidden: entry.hiddenAt === null,
                    })
                  }
                >
                  {entry.hiddenAt === null ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                  {entry.hiddenAt === null ? t('hide') : t('unhide')}
                </Button>
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onPress={() =>
                    Alert.alert(t('removeTitle'), t('removeText'), [
                      { text: t('cancel'), style: 'cancel' },
                      {
                        text: t('remove'),
                        style: 'destructive',
                        onPress: () => remove.mutate(entry.id),
                      },
                    ])
                  }
                >
                  <Trash2 size={16} />
                  {t('remove')}
                </Button>
              </XStack>
            </Panel>
          ) : null}

          <CuratedPlaylistsPanel gameId={game.id} />
          {entry ? null : <WishlistPanel gameId={game.id} />}

          <Attributes game={game} />

          {gallery.length > 0 ? (
            <Panel title={t('images')}>
              <Gallery
                items={gallery}
                labels={{
                  previous: t('galleryPrevious'),
                  next: t('galleryNext'),
                  play: t('galleryPlay'),
                  enlarge: t('galleryEnlarge'),
                  close: t('galleryClose'),
                  item: (index, total) => t('galleryItem', { index, total }),
                }}
              />
            </Panel>
          ) : null}

          {game.summary ? <Description text={game.summary} /> : null}

          <RelatedRow
            related={game.related.filter(
              (version) => version.kind !== 'similar',
            )}
            onOpen={(version) => openVersion.mutate(version)}
          />
        </YStack>
      </ScrollView>
      {back}
    </YStack>
  );
}
