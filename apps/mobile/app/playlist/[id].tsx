import type { BacklogEntry, BacklogSort } from '@repo/contracts';
import {
  Button,
  ClearableInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  EllipsisVertical,
} from '@repo/ui/icons';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { useTranslations } from 'use-intl';

import { ActionsSheet } from '../../components/actions-sheet';
import { BacklogCard } from '../../components/backlog-card';
import { NameSheet } from '../../components/name-sheet';
import { QuickEditSheet } from '../../components/quick-edit-sheet';
import { fromQuery, sortKeys, useBacklogView } from '../../lib/backlog-filter';
import { useCloseOnBlur } from '../../lib/use-close-on-blur';
import { api, client } from '../../lib/orpc';
import { usePlaylistActions } from '../../lib/playlist-actions';

const PAGE = 50;

/** Una playlist a filtro: i suoi giochi, con ricerca e ordine di chi guarda. */
export default function FilterPlaylist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations('playlists');
  const tSort = useTranslations('sort');
  const queryClient = useQueryClient();
  const view = useBacklogView();
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const [order, setOrder] = useState<{
    sort?: BacklogSort;
    direction?: 'asc' | 'desc';
  }>({});
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editing, setEditing] = useState<BacklogEntry | null>(null);
  useCloseOnBlur(() => {
    setMenu(false);
    setEditing(null);
  });

  const list = useInfiniteQuery(
    api.playlists.get.infiniteOptions({
      input: (offset: number) => ({
        id,
        limit: PAGE,
        offset,
        q: search.trim() || undefined,
        ...order,
      }),
      initialPageParam: 0,
      getNextPageParam: (last, pages) => {
        const loaded = pages.reduce(
          (sum, page) => sum + page.entries.length,
          0,
        );
        return loaded < last.total ? loaded : undefined;
      },
    }),
  );
  const options = useQuery(api.backlog.filterOptions.queryOptions());
  const platformNames = useMemo(
    () => new Map((options.data?.platforms ?? []).map((p) => [p.slug, p.name])),
    [options.data],
  );
  const first = list.data?.pages[0];
  const entries = list.data?.pages.flatMap((page) => page.entries) ?? [];
  const sort = order.sort ?? first?.query.sort ?? 'addedAt';
  const direction = order.direction ?? first?.query.direction ?? 'desc';
  const sortItems = Object.fromEntries(
    sortKeys.map((key) => [key, tSort(key)]),
  ) as Record<BacklogSort, string>;

  const actions = usePlaylistActions({
    name: first?.name ?? '',
    share: () => client.playlists.share({ id }),
    remove: () => client.playlists.remove({ id }),
  });
  const rename = useMutation({
    mutationFn: (name: string) => client.playlists.update({ id, name }),
    onSuccess: async () => {
      setRenaming(false);
      await Promise.all([
        actions.refresh(),
        queryClient.invalidateQueries({ queryKey: api.playlists.get.key() }),
      ]);
    },
  });

  const editFilters = () => {
    if (!first) return;
    const next = fromQuery(first.query);
    view.setFilter(next.filter);
    view.setQ(next.q);
    view.setSort(next.sort, next.direction);
    router.dismissTo('/backlog');
  };

  return (
    <YStack flex={1} bg="background">
      <Stack.Screen
        options={{
          title: first?.name ?? '',
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
        {first ? (
          <Text color="color11">
            {first.total === 1
              ? t('countOne')
              : t('countOther', { count: first.total })}
          </Text>
        ) : null}
        <ClearableInput
          value={q}
          onChangeText={setQ}
          placeholder={t('search')}
          clearLabel={t('clearSearch')}
        />
        <XStack gap={8}>
          <YStack flex={1}>
            <Select
              items={sortItems}
              value={sort}
              onValueChange={(next: string) =>
                setOrder({ sort: next as BacklogSort, direction })
              }
            >
              <SelectTrigger width="100%" self="stretch" height={44} minH={44}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {sortItems[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </YStack>
          <Button
            size="icon"
            variant="outline"
            aria-label={direction === 'asc' ? t('ascending') : t('descending')}
            onPress={() =>
              setOrder({
                sort,
                direction: direction === 'asc' ? 'desc' : 'asc',
              })
            }
          >
            {direction === 'asc' ? (
              <ArrowUpNarrowWide size={16} />
            ) : (
              <ArrowDownWideNarrow size={16} />
            )}
          </Button>
        </XStack>
      </YStack>

      {list.isPending ? (
        <YStack px={16} gap={12}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} height={112} width="100%" rounded={12} />
          ))}
        </YStack>
      ) : list.isError ? (
        <Text px={16} color="red11">
          {t('loadFailed')}
        </Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 24,
            gap: 12,
          }}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage)
              void list.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<Text color="color11">{t('noGames')}</Text>}
          ListFooterComponent={
            list.isFetchingNextPage ? (
              <XStack justify="center" py={12}>
                <Spinner />
              </XStack>
            ) : undefined
          }
          renderItem={({ item }) => (
            <BacklogCard
              entry={item}
              platformName={(slug) => platformNames.get(slug) ?? slug}
              onPress={() =>
                router.push({
                  pathname: '/games/[slug]',
                  params: { slug: item.game.slug },
                })
              }
              onLongPress={() => setEditing(item)}
            />
          )}
        />
      )}

      <ActionsSheet
        open={menu}
        title={first?.name ?? ''}
        onClose={() => setMenu(false)}
        actions={[
          { key: 'filters', label: t('editFilters'), onPress: editFilters },
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
        initial={first?.name ?? ''}
        labels={{
          title: t('rename'),
          placeholder: t('namePlaceholder'),
          save: t('save'),
          cancel: t('cancel'),
        }}
        pending={rename.isPending}
        error={rename.isError ? t('saveFailed') : null}
        onSave={(name) => rename.mutate(name)}
        onClose={() => setRenaming(false)}
      />
      <QuickEditSheet
        entry={
          editing
            ? (entries.find((entry) => entry.id === editing.id) ?? editing)
            : null
        }
        onClose={() => setEditing(null)}
      />
    </YStack>
  );
}
