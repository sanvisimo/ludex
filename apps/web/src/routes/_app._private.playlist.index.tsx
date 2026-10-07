import type { Playlist } from '@repo/contracts';
import { EmptyState, Skeleton, Text, XStack, YStack } from '@repo/ui';
import { ListFilter, Share2 } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { CARD_WIDTH, HomeCard } from '@/components/home-band';
import { PlaylistMenu } from '@/components/playlist-menu';
import { ScrollRow } from '@/components/scroll-row';
import { api } from '@/lib/orpc';
import { ButtonLink } from '@/src/components/button-link';
import { Page } from '@/src/components/page';

export const Route = createFileRoute('/_app/_private/playlist/')({
  component: PlaylistsPage,
});

/** Quante card per fascia: il resto sta nella playlist aperta. */
const BAND_SIZE = 20;

/**
 * L'elenco delle playlist (step 15a): come la home, una fascia per playlist
 * che scorre di lato. Le fasce servono a sfogliare; la lista intera, le viste e
 * la gestione stanno in `/playlist/$id`, a cui porta il nome.
 *
 * Le playlist **non si creano qui** ma in `/backlog`, coi filtri già impostati.
 */
function PlaylistsPage() {
  const t = useTranslations('playlists');
  const playlists = useQuery(api.playlists.list.queryOptions());
  const rows = playlists.data ?? [];

  return (
    // Larga come la home: le fasce vivono di card.
    <Page
      maxW={1280}
      title={t('title')}
      subtitle={playlists.data ? t('count', { count: rows.length }) : ' '}
    >
      {playlists.error ? (
        <Text fontSize={14} color="$red11">
          {t('error')}
        </Text>
      ) : playlists.isPending ? (
        <BandSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ListFilter size={24} color="$color11" />}
          title={t('emptyListTitle')}
          description={t('emptyListHint')}
          action={<ButtonLink href="/backlog">{t('goToBacklog')}</ButtonLink>}
        />
      ) : (
        <YStack gap={24}>
          {rows.map((playlist, index) => (
            <PlaylistBand
              key={playlist.id}
              playlist={playlist}
              position={{ index, count: rows.length }}
            />
          ))}
        </YStack>
      )}
    </Page>
  );
}

/**
 * Una playlist: nome (il link alla playlist aperta), quanti giochi, il menu, e
 * le prime card. L'ordine è quello che l'utente ha scelto, dal menu.
 *
 * Una playlist vuota resta in elenco, con la sua riga: senza, non si potrebbe
 * né rinominare né eliminare. Una query per fascia, in parallelo: con le
 * playlist di una persona sono poche.
 */
function PlaylistBand({
  playlist,
  position,
}: {
  playlist: Playlist;
  position: { index: number; count: number };
}) {
  const t = useTranslations('playlists');
  const tBacklog = useTranslations('backlog');
  const band = useQuery(
    api.playlists.get.queryOptions({
      input: { id: playlist.id, limit: BAND_SIZE, offset: 0 },
    }),
  );
  const entries = band.data?.entries ?? [];

  return (
    <ScrollRow
      title={
        <XStack items="center" gap={8} shrink={1} minW={0}>
          <Link
            to="/playlist/$id"
            params={{ id: playlist.id }}
            style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}
          >
            <Text
              render="h2"
              fontFamily="$heading"
              fontSize={18}
              lineHeight={24}
              fontWeight="600"
              color="$color12"
              numberOfLines={1}
              m={0}
            >
              {playlist.name}
            </Text>
          </Link>
          {band.data && (
            <Text fontSize={14} lineHeight={20} color="$color11">
              {tBacklog('count', { count: band.data.total })}
            </Text>
          )}
          {/* Chi ha il link la vede: dirlo a colpo d'occhio, senza aprire il menu. */}
          {playlist.shareToken && (
            <XStack role="img" aria-label={t('sharedBadge')}>
              <Share2 size={14} color="$color11" />
            </XStack>
          )}
          <PlaylistMenu
            playlist={playlist}
            query={playlist.query}
            position={position}
          />
        </XStack>
      }
      itemCount={entries.length}
      arrowsFromMd
    >
      {band.error ? (
        <Text fontSize={14} color="$red11">
          {t('loadFailed')}
        </Text>
      ) : band.isPending ? (
        <CardSkeletons />
      ) : entries.length === 0 ? (
        <Text fontSize={14} lineHeight={20} color="$color11">
          {t('emptyTitle')}
        </Text>
      ) : (
        entries.map((entry) => (
          // Una riga di backlog è un gioco con il suo stato: è la forma
          // della card della home.
          <HomeCard
            key={entry.id}
            game={{ ...entry.game, status: entry.status, wishlisted: false }}
          />
        ))
      )}
    </ScrollRow>
  );
}

function CardSkeletons() {
  return Array.from({ length: 8 }).map((_, card) => (
    <Skeleton
      key={card}
      width={CARD_WIDTH}
      height={(CARD_WIDTH * 374) / 264}
      rounded={6}
    />
  ));
}

function BandSkeleton() {
  return (
    <YStack gap={24}>
      {Array.from({ length: 3 }).map((_, band) => (
        <YStack key={band} gap={8}>
          <Skeleton height={24} width={160} rounded={6} />
          <XStack gap={12} overflow="hidden">
            <CardSkeletons />
          </XStack>
        </YStack>
      ))}
    </YStack>
  );
}
