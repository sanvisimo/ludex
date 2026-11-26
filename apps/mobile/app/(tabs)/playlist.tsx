import type { CuratedPlaylist, Playlist } from '@repo/contracts';
import { Button, EmptyState, ScrollView, Skeleton, YStack } from '@repo/ui';
import { ListMusic, Plus } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { Band, BandSection as Section } from '../../components/bands';
import { GameCard } from '../../components/game-card';
import { NameSheet } from '../../components/name-sheet';
import { api, client } from '../../lib/orpc';

const BAND_SIZE = 20;

function CuratedBand({ list }: { list: CuratedPlaylist }) {
  const games = useQuery(
    api.curatedPlaylists.get.queryOptions({
      input: { id: list.id, limit: BAND_SIZE },
    }),
  );
  return (
    <Band
      title={list.name}
      count={list.count}
      onOpen={() =>
        router.push({
          pathname: '/playlist/curated/[id]',
          params: { id: list.id },
        })
      }
    >
      {(games.data?.games ?? []).map((game) => (
        <GameCard key={game.id} game={game} rank={game.position + 1} />
      ))}
    </Band>
  );
}

function FilterBand({ playlist }: { playlist: Playlist }) {
  const detail = useQuery(
    api.playlists.get.queryOptions({
      input: { id: playlist.id, limit: BAND_SIZE },
    }),
  );
  return (
    <Band
      title={playlist.name}
      count={detail.data?.total}
      onOpen={() =>
        router.push({ pathname: '/playlist/[id]', params: { id: playlist.id } })
      }
    >
      {(detail.data?.entries ?? []).map((entry) => (
        <GameCard
          key={entry.id}
          game={{ ...entry.game, status: entry.status, wishlisted: false }}
        />
      ))}
    </Band>
  );
}

export default function Playlists() {
  const t = useTranslations('playlists');
  const queryClient = useQueryClient();
  const filters = useQuery(api.playlists.list.queryOptions());
  const curated = useQuery(api.curatedPlaylists.list.queryOptions());
  const [creating, setCreating] = useState(false);
  const create = useMutation({
    mutationFn: (name: string) => client.curatedPlaylists.create({ name }),
    onSuccess: async (list) => {
      await queryClient.invalidateQueries({
        queryKey: api.curatedPlaylists.list.key(),
      });
      setCreating(false);
      router.push({
        pathname: '/playlist/curated/[id]',
        params: { id: list.id },
      });
    },
  });

  const loading = filters.isPending || curated.isPending;
  const empty =
    !loading &&
    (filters.data?.length ?? 0) === 0 &&
    (curated.data?.length ?? 0) === 0;

  return (
    <YStack flex={1} bg="background">
      <ScrollView
        flex={1}
        contentContainerStyle={{ paddingVertical: 12, gap: 28 }}
      >
        <YStack px={16}>
          <Button onPress={() => setCreating(true)}>
            <Plus size={16} />
            {t('new')}
          </Button>
        </YStack>
        {loading ? (
          <YStack px={16} gap={12}>
            <Skeleton height={28} width="60%" />
            <Skeleton height={260} width="100%" rounded={12} />
          </YStack>
        ) : empty ? (
          <EmptyState
            icon={<ListMusic size={24} color="color11" />}
            title={t('empty')}
            description={t('emptyHint')}
          />
        ) : (
          <>
            {(curated.data?.length ?? 0) > 0 ? (
              <Section title={t('curated')}>
                {curated.data!.map((list) => (
                  <CuratedBand key={list.id} list={list} />
                ))}
              </Section>
            ) : null}
            {(filters.data?.length ?? 0) > 0 ? (
              <Section title={t('filters')}>
                {filters.data!.map((playlist) => (
                  <FilterBand key={playlist.id} playlist={playlist} />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
      <NameSheet
        open={creating}
        labels={{
          title: t('new'),
          placeholder: t('namePlaceholder'),
          save: t('create'),
          cancel: t('cancel'),
        }}
        pending={create.isPending}
        error={create.isError ? t('saveFailed') : null}
        onSave={(name) => create.mutate(name)}
        onClose={() => setCreating(false)}
      />
    </YStack>
  );
}
