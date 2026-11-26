import type { HomeGame } from '@repo/contracts';
import {
  Button,
  ClearableInput,
  EmptyState,
  Skeleton,
  Text,
  YStack,
} from '@repo/ui';
import { EllipsisVertical, ListMusic, Plus } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { useTranslations } from 'use-intl';

import { ActionsSheet } from '../../../../components/actions-sheet';
import { GameCard } from '../../../../components/game-card';
import { NameSheet } from '../../../../components/name-sheet';
import { useCloseOnBlur } from '../../../../lib/use-close-on-blur';
import { api, client } from '../../../../lib/orpc';
import { usePlaylistActions } from '../../../../lib/playlist-actions';

type Positioned = HomeGame & { position: number };
const COLUMNS = 2;
const GAP = 12;

/** Una playlist scelta a mano: i giochi nell'ordine voluto, col numero. */
export default function CuratedPlaylist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations('playlists');
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [selected, setSelected] = useState<Positioned | null>(null);
  useCloseOnBlur(() => {
    setMenu(false);
    setSelected(null);
  });

  const playlist = useQuery(
    api.curatedPlaylists.get.queryOptions({
      input: { id, q: search.trim() || undefined, limit: 200 },
    }),
  );
  const lists = useQuery(api.curatedPlaylists.list.queryOptions());
  const size = lists.data?.find((list) => list.id === id)?.count ?? 0;
  const name = playlist.data?.name ?? '';
  const cardWidth = Math.floor((width - 32 - GAP * (COLUMNS - 1)) / COLUMNS);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: api.curatedPlaylists.get.key(),
      }),
      queryClient.invalidateQueries({
        queryKey: api.curatedPlaylists.list.key(),
      }),
    ]);
  const actions = usePlaylistActions({
    name,
    share: () => client.curatedPlaylists.share({ id }),
    remove: () => client.curatedPlaylists.remove({ id }),
  });
  const rename = useMutation({
    mutationFn: (next: string) =>
      client.curatedPlaylists.rename({ id, name: next }),
    onSuccess: async () => {
      setRenaming(false);
      await refresh();
    },
  });
  const move = useMutation({
    mutationFn: (input: { gameId: string; position: number }) =>
      client.curatedPlaylists.moveGame({ listId: id, ...input }),
    onSuccess: refresh,
  });
  const removeGame = useMutation({
    mutationFn: (gameId: string) =>
      client.curatedPlaylists.removeGame({ listId: id, gameId }),
    onSuccess: refresh,
  });

  return (
    <YStack flex={1} bg="background">
      <Stack.Screen
        options={{
          title: name,
          headerRight: () => (
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('menu')}
              onPress={() => setMenu(true)}
            >
              <EllipsisVertical size={20} />
            </Button>
          ),
        }}
      />
      <YStack px={16} pt={8} pb={12} gap={12}>
        <Text color="color11">
          {size === 1 ? t('countOne') : t('countOther', { count: size })}
        </Text>
        <ClearableInput
          value={q}
          onChangeText={setQ}
          placeholder={t('search')}
          clearLabel={t('clearSearch')}
        />
        <Button
          variant="outline"
          onPress={() =>
            router.push({
              pathname: '/playlist/curated/[id]/add',
              params: { id },
            })
          }
        >
          <Plus size={16} />
          {t('addGames')}
        </Button>
      </YStack>

      {playlist.isPending ? (
        <YStack px={16}>
          <Skeleton height={260} width={cardWidth} rounded={12} />
        </YStack>
      ) : (
        <FlatList
          data={playlist.data?.games ?? []}
          keyExtractor={(game) => game.id}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 24,
            gap: GAP,
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<ListMusic size={24} color="color11" />}
              title={search ? t('noResults') : t('emptyList')}
            />
          }
          renderItem={({ item }) => (
            <GameCard
              game={item}
              rank={item.position + 1}
              width={cardWidth}
              onLongPress={() => setSelected(item)}
            />
          )}
        />
      )}

      <ActionsSheet
        open={selected !== null}
        title={selected?.name ?? ''}
        onClose={() => setSelected(null)}
        actions={
          selected
            ? [
                ...(selected.position > 0
                  ? [
                      {
                        key: 'up',
                        label: t('moveUp'),
                        onPress: () =>
                          move.mutate({
                            gameId: selected.id,
                            position: selected.position - 1,
                          }),
                      },
                    ]
                  : []),
                ...(selected.position < size - 1
                  ? [
                      {
                        key: 'down',
                        label: t('moveDown'),
                        onPress: () =>
                          move.mutate({
                            gameId: selected.id,
                            position: selected.position + 1,
                          }),
                      },
                    ]
                  : []),
                {
                  key: 'remove',
                  label: t('removeGame'),
                  destructive: true,
                  onPress: () => removeGame.mutate(selected.id),
                },
              ]
            : []
        }
      />
      <ActionsSheet
        open={menu}
        title={name}
        onClose={() => setMenu(false)}
        actions={[
          {
            key: 'rename',
            label: t('rename'),
            onPress: () => setRenaming(true),
          },
          { key: 'share', label: t('share'), onPress: actions.share },
          {
            key: 'remove',
            label: t('remove'),
            destructive: true,
            onPress: actions.remove,
          },
        ]}
      />
      <NameSheet
        open={renaming}
        initial={name}
        labels={{
          title: t('rename'),
          placeholder: t('namePlaceholder'),
          save: t('save'),
          cancel: t('cancel'),
        }}
        pending={rename.isPending}
        error={rename.isError ? t('saveFailed') : null}
        onSave={(next) => rename.mutate(next)}
        onClose={() => setRenaming(false)}
      />
    </YStack>
  );
}
