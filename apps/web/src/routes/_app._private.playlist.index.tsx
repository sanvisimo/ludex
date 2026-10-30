import type { CuratedPlaylist, Playlist } from '@repo/contracts';
import { Button, EmptyState, Skeleton, Text, XStack, YStack } from '@repo/ui';
import { ListFilter, Plus, Share2 } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import {
  CuratedNameDialog,
  CuratedPlaylistMenu,
} from '@/components/curated-playlist-menu';
import { CARD_WIDTH, HomeCard } from '@/components/home-band';
import { PlaylistMenu } from '@/components/playlist-menu';
import { ScrollRow } from '@/components/scroll-row';
import { type BandDrag, SortableBands } from '@/components/sortable-bands';
import { api, client } from '@/lib/orpc';
import { ButtonLink } from '@/src/components/button-link';
import { Page } from '@/src/components/page';

export const Route = createFileRoute('/_app/_private/playlist/')({
  component: PlaylistsPage,
});

/** Quante card per fascia: il resto sta nella playlist aperta. */
const BAND_SIZE = 20;

/**
 * L'elenco delle playlist: come la home, una fascia per playlist che scorre di
 * lato, e le fasce si riordinano trascinando l'intestazione, dentro la sezione. Le fasce servono a sfogliare; la lista intera, le viste e la gestione
 * stanno nella playlist aperta, a cui porta il nome.
 *
 * Due sezioni (15f): prima le **scelte a mano**, che nascono qui con «Nuova
 * playlist», poi i **filtri salvati** (15a), che si creano solo in `/backlog`,
 * coi filtri già impostati. Una sezione vuota tiene il titolo e una riga col suo
 * bottone; senza niente del tutto c'è lo stato vuoto, coi due bottoni.
 */
function PlaylistsPage() {
  const t = useTranslations('playlists');
  const tCurated = useTranslations('curated');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const filters = useQuery(api.playlists.list.queryOptions());
  const curated = useQuery(api.curatedPlaylists.list.queryOptions());
  const filterRows = filters.data ?? [];
  const curatedRows = curated.data ?? [];
  const loaded = filters.data !== undefined && curated.data !== undefined;
  const total = filterRows.length + curatedRows.length;

  // Come «Nuova lista» in `/wishlist`.
  const newButton = (size?: 'sm') => (
    <Button variant="outline" size={size} onClick={() => setCreating(true)}>
      <Plus size={16} color="$color12" />
      {tCurated('new')}
    </Button>
  );

  return (
    // Larga come la home: le fasce vivono di card.
    <Page
      maxW={1280}
      title={t('title')}
      subtitle={loaded ? t('count', { count: total }) : ' '}
      actions={loaded && total > 0 ? newButton() : undefined}
    >
      {filters.error || curated.error ? (
        <Text fontSize={14} color="$red11">
          {t('error')}
        </Text>
      ) : !loaded ? (
        <BandSkeleton />
      ) : total === 0 ? (
        <EmptyState
          icon={<ListFilter size={24} color="$color11" />}
          title={tCurated('emptyAllTitle')}
          description={tCurated('emptyAllHint')}
          action={
            <XStack gap={8} flexWrap="wrap" justify="center">
              {newButton()}
              <ButtonLink variant="outline" href="/backlog">
                {t('goToBacklog')}
              </ButtonLink>
            </XStack>
          }
        />
      ) : (
        <YStack gap={40}>
          <Section title={tCurated('section')}>
            {curatedRows.length === 0 ? (
              <EmptyRow text={tCurated('emptySection')}>
                {newButton('sm')}
              </EmptyRow>
            ) : (
              <SortableBands
                items={curatedRows}
                queryKey={api.curatedPlaylists.list.queryKey()}
                move={(id, position) =>
                  client.curatedPlaylists.move({ id, position })
                }
              >
                {(playlist, index, drag) => (
                  <CuratedBand
                    playlist={playlist}
                    position={{ index, count: curatedRows.length }}
                    drag={drag}
                  />
                )}
              </SortableBands>
            )}
          </Section>
          <Section title={tCurated('filtersSection')}>
            {filterRows.length === 0 ? (
              <EmptyRow text={tCurated('filtersEmpty')}>
                <ButtonLink size="sm" variant="outline" href="/backlog">
                  {t('goToBacklog')}
                </ButtonLink>
              </EmptyRow>
            ) : (
              <SortableBands
                items={filterRows}
                queryKey={api.playlists.list.queryKey()}
                move={(id, position) => client.playlists.move({ id, position })}
              >
                {(playlist, index, drag) => (
                  <PlaylistBand
                    playlist={playlist}
                    position={{ index, count: filterRows.length }}
                    drag={drag}
                  />
                )}
              </SortableBands>
            )}
          </Section>
        </YStack>
      )}

      <CuratedNameDialog
        open={creating}
        onOpenChange={setCreating}
        // Appena creata è vuota: si apre, dove c'è «Aggiungi giochi».
        onCreated={(playlist) =>
          void navigate({
            to: '/playlist/curated/$id',
            params: { id: playlist.id },
          })
        }
      />
    </Page>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack render="section" gap={24}>
      <Text
        render="h2"
        fontFamily="$heading"
        fontSize={22}
        lineHeight={28}
        fontWeight="600"
        color="$color12"
        m={0}
      >
        {title}
      </Text>
      {children}
    </YStack>
  );
}

function EmptyRow({ text, children }: { text: string; children: ReactNode }) {
  return (
    <XStack items="center" gap={12} flexWrap="wrap">
      <Text fontSize={14} lineHeight={20} color="$color11">
        {text}
      </Text>
      {children}
    </XStack>
  );
}

/**
 * Il link del nome: si restringe lui, e il nome si tronca, così il numero dei
 * giochi resta sulla sua riga anche con un nome lungo sul telefono.
 */
const bandLinkStyle = {
  color: 'inherit',
  textDecoration: 'none',
  minWidth: 0,
  flexShrink: 1,
  overflow: 'hidden',
} as const;

/** Il nome di una fascia: il link alla playlist aperta. */
function BandTitle({ children }: { children: string }) {
  return (
    <Text
      render="h3"
      fontFamily="$heading"
      fontSize={18}
      lineHeight={24}
      fontWeight="600"
      color="$color12"
      numberOfLines={1}
      m={0}
    >
      {children}
    </Text>
  );
}

/**
 * Una playlist scelta a mano (15f): come quella a filtro, con il numero sulle
 * card, che è l'ordine della lista. Lo stato è di chi guarda e il cuore è sui
 * giochi che non ha.
 */
function CuratedBand({
  playlist,
  position,
  drag,
}: {
  playlist: CuratedPlaylist;
  position: { index: number; count: number };
  drag: BandDrag;
}) {
  const t = useTranslations('playlists');
  const tCurated = useTranslations('curated');
  const tBacklog = useTranslations('backlog');
  const band = useQuery(
    api.curatedPlaylists.get.queryOptions({
      input: { id: playlist.id, limit: BAND_SIZE, offset: 0 },
    }),
  );
  const games = band.data?.games ?? [];

  return (
    <ScrollRow
      title={drag.header(
        <XStack items="center" gap={8} shrink={1} minW={0}>
          <Link
            to="/playlist/curated/$id"
            params={{ id: playlist.id }}
            style={bandLinkStyle}
          >
            <BandTitle>{playlist.name}</BandTitle>
          </Link>
          <Text fontSize={14} lineHeight={20} color="$color11" shrink={0}>
            {tBacklog('count', { count: playlist.count })}
          </Text>
          {playlist.shareToken && (
            <XStack role="img" aria-label={t('sharedBadge')}>
              <Share2 size={14} color="$color11" />
            </XStack>
          )}
          <CuratedPlaylistMenu playlist={playlist} position={position} />
        </XStack>,
      )}
      itemCount={games.length}
      arrowsFromMd
    >
      {band.error ? (
        <Text fontSize={14} color="$red11">
          {t('loadFailed')}
        </Text>
      ) : band.isPending ? (
        <CardSkeletons />
      ) : games.length === 0 ? (
        <Text fontSize={14} lineHeight={20} color="$color11">
          {tCurated('bandEmpty')}
        </Text>
      ) : (
        games.map((game) => (
          <HomeCard key={game.id} game={game} rank={game.position + 1} />
        ))
      )}
    </ScrollRow>
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
  drag,
}: {
  playlist: Playlist;
  position: { index: number; count: number };
  drag: BandDrag;
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
      title={drag.header(
        <XStack items="center" gap={8} shrink={1} minW={0}>
          <Link
            to="/playlist/$id"
            params={{ id: playlist.id }}
            style={bandLinkStyle}
          >
            <BandTitle>{playlist.name}</BandTitle>
          </Link>
          {band.data && (
            <Text fontSize={14} lineHeight={20} color="$color11" shrink={0}>
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
        </XStack>,
      )}
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
