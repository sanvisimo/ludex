import type {
  BacklogEntry,
  GameDetail,
  GameScore,
  Ownership,
} from '@repo/contracts';
import {
  Badge,
  Button,
  CopyTile,
  CriticScoreRow,
  DetailPanel,
  DetailPanelTitle,
  DurationTiles,
  Text,
  XStack,
  YStack,
  useTheme,
} from '@repo/ui';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, ScrollView } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useFormatter, useTranslations } from 'use-intl';

import { formatDuration, igdbImageUrl } from '../lib/game-format';
import { api, client } from '../lib/orpc';
import { Cover } from './backlog-card';

export function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DetailPanel>
      <XStack items="center" justify="space-between" gap={8}>
        <DetailPanelTitle>{title}</DetailPanelTitle>
        {aside}
      </XStack>
      {children}
    </DetailPanel>
  );
}

/** L'immagine del gioco che sfuma nel fondo, con la copertina sovrapposta. */
export function GameHero({ game }: { game: GameDetail }) {
  const theme = useTheme();
  const background = theme.background?.val ?? '#000';
  const artwork = game.artworkImageIds?.[0] ?? game.screenshotImageIds?.[0];
  const year = game.firstReleaseDate?.getFullYear();

  return (
    <YStack>
      <YStack height={240} bg="color3">
        {artwork ? (
          <Image
            source={{ uri: igdbImageUrl(artwork, 'screenshot_big') }}
            style={{ width: '100%', height: 240 }}
          />
        ) : null}
        <Svg
          width="100%"
          height={240}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.35" stopColor={background} stopOpacity={0} />
              <Stop offset="1" stopColor={background} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#fade)" />
        </Svg>
      </YStack>
      <XStack px={20} mt={-72} gap={16} items="flex-end">
        <YStack
          rounded={10}
          overflow="hidden"
          borderWidth={2}
          borderColor="background"
        >
          <Cover imageId={game.coverImageId} width={104} height={140} />
        </YStack>
        <YStack flex={1} gap={4} pb={4}>
          <Text
            fontFamily="heading"
            fontSize={24}
            lineHeight="30px"
            fontWeight="700"
            color="color12"
          >
            {game.name}
          </Text>
          {year ? <Text color="color11">{year}</Text> : null}
        </YStack>
      </XStack>
    </YStack>
  );
}

export function HltbTimes({ game }: { game: GameDetail }) {
  const t = useTranslations('hltb');
  if (game.igdbId === null) return null;
  const times = (
    [
      ['main', game.hltbMainMinutes],
      ['plus', game.hltbPlusMinutes],
      ['completionist', game.hltbCompletionistMinutes],
    ] as const
  ).filter(([, minutes]) => minutes !== null);

  return (
    <Panel title={t('title')}>
      {times.length === 0 ? (
        <Text fontSize={14} color="color11">
          {game.hltbSyncedAt === null ? t('notFetched') : t('noTimes')}
        </Text>
      ) : (
        <DurationTiles
          tiles={times.map(([key, minutes]) => ({
            key,
            label: t(key),
            value: formatDuration(minutes!),
            main: key === 'main',
          }))}
        />
      )}
    </Panel>
  );
}

// Come `metacriticFor` del web: il voto della piattaforma su cui ce l'hai, se
// Metacritic lo dà, altrimenti il complessivo.
function metacriticFor(scores: GameScore[], platformSlugs: string[]) {
  return (
    scores.find(
      (score) =>
        score.source === 'metacritic' &&
        score.platformSlug !== null &&
        platformSlugs.includes(score.platformSlug),
    ) ??
    scores.find(
      (score) => score.source === 'metacritic' && score.platformSlug === null,
    )
  );
}

/**
 * Una riga per fonte, col nome che apre la sua pagina: OpenCritic vuole il
 * link col nome vicino al voto (vedi `apps/api/CLAUDE.md`).
 */
export function CriticScores({
  game,
  entry,
}: {
  game: GameDetail;
  entry: BacklogEntry | null;
}) {
  const t = useTranslations('critic');
  const platforms = (entry?.ownerships ?? []).map((copy) => copy.platformSlug);
  const rows = [
    {
      source: 'opencritic' as const,
      score: game.scores.find(
        (s) => s.source === 'opencritic' && s.platformSlug === null,
      ),
      link: game.links.opencritic,
    },
    {
      source: 'metacritic' as const,
      score: metacriticFor(game.scores, platforms),
      link: game.links.metacritic,
    },
    {
      source: 'igdb' as const,
      score: game.scores.find(
        (s) => s.source === 'igdb' && s.platformSlug === null,
      ),
      link: game.links.igdb,
    },
  ].filter((row) => row.score !== undefined || row.link !== null);

  return (
    <Panel title={t('title')}>
      {rows.length === 0 ? (
        <Text color="color11">{t('none')}</Text>
      ) : (
        rows.map(({ source, score, link }) => (
          <CriticScoreRow
            key={source}
            brand={source}
            name={t(source)}
            tier={score?.tier}
            score={score?.score ?? null}
            noScoreLabel={t('noScore')}
            title={t(source)}
            onOpen={
              link ? () => void WebBrowser.openBrowserAsync(link) : undefined
            }
          />
        ))
      )}
    </Panel>
  );
}

export function CopyCard({
  copy,
  platformName,
}: {
  copy: Ownership;
  platformName: string;
}) {
  const t = useTranslations('copies');
  const tStore = useTranslations('store');
  const tSubscription = useTranslations('subscription');
  const tMedium = useTranslations('medium');
  const format = useFormatter();
  const account = copy.storeAccount?.label ?? copy.storeAccount?.displayName;
  const details = [
    account,
    copy.medium ? tMedium(copy.medium) : null,
    copy.subscription ? tSubscription(copy.subscription) : null,
  ].filter(Boolean);
  const page = copy.storePage;

  return (
    <CopyTile
      brand={copy.store ?? undefined}
      storeName={copy.store ? tStore(copy.store) : null}
      platformName={platformName}
      details={details.join(' · ')}
      played={
        copy.playtimeMinutes
          ? t('played', { time: formatDuration(copy.playtimeMinutes) })
          : null
      }
      dates={
        copy.lastPlayedAt
          ? t('lastPlayed', {
              date: format.dateTime(copy.lastPlayedAt, { dateStyle: 'medium' }),
            })
          : undefined
      }
      title={copy.store ? tStore(copy.store) : platformName}
      onOpen={page ? () => void WebBrowser.openBrowserAsync(page) : undefined}
    />
  );
}

export function Attributes({ game }: { game: GameDetail }) {
  const t = useTranslations('game');
  const attributes = game.attributes.filter(
    (attribute) => attribute.kind === 'genre' || attribute.kind === 'theme',
  );
  if (attributes.length === 0) return null;
  return (
    <Panel title={t('genresAndThemes')}>
      <XStack flexWrap="wrap" gap={8}>
        {attributes.map((attribute) => (
          <Badge key={attribute.id} variant="secondary">
            {attribute.name}
          </Badge>
        ))}
      </XStack>
    </Panel>
  );
}

export function Description({ text }: { text: string }) {
  const t = useTranslations('game');
  const [open, setOpen] = useState(false);
  return (
    <Panel title={t('description')}>
      <Text
        color="color12"
        lineHeight="22px"
        numberOfLines={open ? undefined : 4}
      >
        {text}
      </Text>
      <Text
        role="button"
        color="accent11"
        fontWeight="600"
        onPress={() => setOpen(!open)}
      >
        {open ? t('showLess') : t('showMore')}
      </Text>
    </Panel>
  );
}

export function RelatedRow({
  related,
  onOpen,
}: {
  related: GameDetail['related'];
  onOpen: (game: GameDetail['related'][number]) => void;
}) {
  const t = useTranslations('game');
  const tStatus = useTranslations('status');
  if (related.length === 0) return null;
  return (
    <Panel title={t('otherVersions')}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap={12}>
          {related.map((version) => (
            <YStack
              key={version.igdbId}
              role="button"
              onPress={() => onOpen(version)}
              width={104}
              gap={6}
              opacity={version.owned ? 1 : 0.7}
            >
              <Cover imageId={version.coverImageId} width={104} height={140} />
              <Badge variant="secondary">{t(`kind.${version.kind}`)}</Badge>
              <Text fontSize={13} color="color12" numberOfLines={2}>
                {version.name}
              </Text>
              {version.status ? (
                <Text fontSize={12} color="accent11">
                  {tStatus(version.status)}
                </Text>
              ) : null}
            </YStack>
          ))}
        </XStack>
      </ScrollView>
    </Panel>
  );
}

/** «Aggiungi a playlist»: le playlist scelte a mano, con la spunta dove c'è. */
export function CuratedPlaylistsPanel({ gameId }: { gameId: string }) {
  const t = useTranslations('playlists');
  const queryClient = useQueryClient();
  const lists = useQuery(
    api.curatedPlaylists.forGame.queryOptions({ input: { gameId } }),
  );
  const toggle = useMutation({
    mutationFn: async ({ listId, has }: { listId: string; has: boolean }) => {
      if (has) await client.curatedPlaylists.removeGame({ listId, gameId });
      else await client.curatedPlaylists.add({ listId, gameId });
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: api.curatedPlaylists.forGame.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: api.curatedPlaylists.list.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: api.curatedPlaylists.get.key(),
        }),
      ]),
  });
  if (!lists.data || lists.data.length === 0) return null;
  return (
    <Panel title={t('addToPlaylist')}>
      <XStack flexWrap="wrap" gap={8}>
        {lists.data.map((list) => (
          <Button
            key={list.id}
            size="sm"
            variant={list.has ? 'selection' : 'outline'}
            aria-pressed={list.has}
            disabled={toggle.isPending}
            onPress={() => toggle.mutate({ listId: list.id, has: list.has })}
          >
            {list.name}
          </Button>
        ))}
      </XStack>
    </Panel>
  );
}

/**
 * Il cuore del sito, per un gioco che non hai: le tue liste con la spunta.
 * Senza liste, il primo «aggiungi» ne crea una che si chiama «Wishlist»,
 * come sul web (`wishlists.add` senza `listId`).
 */
export function WishlistPanel({ gameId }: { gameId: string }) {
  const t = useTranslations('wishlists');
  const queryClient = useQueryClient();
  const lists = useQuery(
    api.wishlists.forGame.queryOptions({ input: { gameId } }),
  );
  const toggle = useMutation({
    mutationFn: async (target: { listId?: string; has: boolean }) => {
      if (target.has && target.listId)
        await client.wishlists.removeGame({ listId: target.listId, gameId });
      else await client.wishlists.add({ gameId, listId: target.listId });
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: api.wishlists.forGame.key(),
        }),
        queryClient.invalidateQueries({ queryKey: api.wishlists.list.key() }),
        queryClient.invalidateQueries({ queryKey: api.wishlists.get.key() }),
      ]),
  });
  if (!lists.data) return null;
  return (
    <Panel title={t('panelTitle')}>
      <XStack flexWrap="wrap" gap={8}>
        {lists.data.length === 0 ? (
          <Button
            size="sm"
            disabled={toggle.isPending}
            onPress={() => toggle.mutate({ has: false })}
          >
            {t('addToWishlist')}
          </Button>
        ) : (
          lists.data.map((list) => (
            <Button
              key={list.id}
              size="sm"
              variant={list.has ? 'selection' : 'outline'}
              aria-pressed={list.has}
              disabled={toggle.isPending}
              onPress={() => toggle.mutate({ listId: list.id, has: list.has })}
            >
              {list.name}
            </Button>
          ))
        )}
      </XStack>
    </Panel>
  );
}
