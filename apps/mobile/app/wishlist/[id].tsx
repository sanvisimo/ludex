import type { HomeGame, WishlistSort } from '@repo/contracts';
import { wishlistSortValues } from '@repo/contracts';
import {
  Button,
  ClearableInput,
  EmptyState,
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
  Heart,
} from '@repo/ui/icons';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { Alert, FlatList, useWindowDimensions } from 'react-native';
import { useTranslations } from 'use-intl';

import type { SheetAction } from '../../components/actions-sheet';
import { ActionsSheet } from '../../components/actions-sheet';
import { GameCard } from '../../components/game-card';
import { NameSheet } from '../../components/name-sheet';
import { OwnItSheet } from '../../components/own-it-sheet';
import { api, client } from '../../lib/orpc';
import { useCloseOnBlur } from '../../lib/use-close-on-blur';
import { openOnWeb } from '../../lib/web-links';

const PAGE = 50;
const COLUMNS = 2;
const GAP = 12;

/**
 * Una lista dei desideri aperta. Quelle a mano hanno «Ce l'ho» e «Togli»;
 * quelle di un negozio si allineano al negozio, quindi niente «Togli» e
 * «Aggiorna wishlist» al suo posto. Le voci da sistemare restano sul sito.
 */
export default function WishlistPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations('wishlists');
  const tSort = useTranslations('sort');
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const [sort, setSort] = useState<WishlistSort>('addedAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [owning, setOwning] = useState<HomeGame | null>(null);
  useCloseOnBlur(() => {
    setMenu(false);
    setOwning(null);
  });

  const list = useInfiniteQuery(
    api.wishlists.get.infiniteOptions({
      input: (offset: number) => ({
        id,
        q: search.trim() || undefined,
        sort,
        direction,
        limit: PAGE,
        offset,
      }),
      initialPageParam: 0,
      getNextPageParam: (last, pages) => {
        const loaded = pages.reduce((sum, page) => sum + page.games.length, 0);
        return loaded < last.total ? loaded : undefined;
      },
    }),
  );
  const lists = useQuery(api.wishlists.list.queryOptions());
  const first = list.data?.pages[0];
  const meta = lists.data?.find((item) => item.id === id);
  const games = list.data?.pages.flatMap((page) => page.games) ?? [];
  const fromStore = Boolean(first?.store);
  const cardWidth = Math.floor((width - 32 - GAP * (COLUMNS - 1)) / COLUMNS);
  const sortItems = Object.fromEntries(
    wishlistSortValues.map((key) => [key, tSort(key)]),
  ) as Record<WishlistSort, string>;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.wishlists.get.key() }),
      queryClient.invalidateQueries({ queryKey: api.wishlists.list.key() }),
    ]);
  const removeGame = useMutation({
    mutationFn: (gameId: string) =>
      client.wishlists.removeGame({ listId: id, gameId }),
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: (name: string) => client.wishlists.rename({ id, name }),
    onSuccess: async () => {
      setRenaming(false);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => client.wishlists.remove({ id }),
    onSuccess: async () => {
      await refresh();
      router.back();
    },
  });
  const sync = useMutation({
    mutationFn: (accountId: string) =>
      client.accounts.syncWishlist({ accountId }),
    onSuccess: () => Alert.alert(t('syncStarted'), t('syncStartedText')),
  });

  const actions: SheetAction[] = fromStore
    ? [
        ...(first?.storeAccountId
          ? [
              {
                key: 'sync',
                label: t('sync'),
                onPress: () => sync.mutate(first.storeAccountId!),
              },
            ]
          : []),
        ...(meta?.unresolved
          ? [
              {
                key: 'unresolved',
                label: t('fixOnWeb', { count: meta.unresolved }),
                onPress: () => openOnWeb(`/wishlist/${id}`),
              },
            ]
          : []),
      ]
    : [
        { key: 'rename', label: t('rename'), onPress: () => setRenaming(true) },
        {
          key: 'remove',
          label: t('remove'),
          destructive: true,
          onPress: () =>
            Alert.alert(
              t('removeTitle', { name: first?.name ?? '' }),
              t('removeText'),
              [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('remove'),
                  style: 'destructive',
                  onPress: () => remove.mutate(),
                },
              ],
            ),
        },
      ];

  return (
    <YStack flex={1} bg="background">
      <Stack.Screen
        options={{
          title: first?.name ?? '',
          headerRight: () =>
            actions.length > 0 ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('menu')}
                onPress={() => setMenu(true)}
              >
                <EllipsisVertical size={20} />
              </Button>
            ) : null,
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
              onValueChange={(next: string) => setSort(next as WishlistSort)}
            >
              <SelectTrigger width="100%" self="stretch" height={44} minH={44}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {wishlistSortValues.map((key) => (
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
            onPress={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
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
        <YStack px={16}>
          <Skeleton height={260} width={cardWidth} rounded={12} />
        </YStack>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(game) => game.id}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 24,
            gap: GAP,
          }}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage)
              void list.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon={<Heart size={24} color="color11" />}
              title={search ? t('noResults') : t('emptyList')}
            />
          }
          ListFooterComponent={
            list.isFetchingNextPage ? (
              <XStack justify="center" py={12}>
                <Spinner />
              </XStack>
            ) : undefined
          }
          renderItem={({ item }) => (
            <GameCard
              game={item}
              width={cardWidth}
              footer={
                // Un gioco di una lista di negozio che hai già porta il suo stato.
                item.status ? null : (
                  <XStack gap={8} flexWrap="wrap">
                    <Button size="sm" onPress={() => setOwning(item)}>
                      {t('ownIt')}
                    </Button>
                    {!fromStore ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={removeGame.isPending}
                        onPress={() => removeGame.mutate(item.id)}
                      >
                        {t('removeGame')}
                      </Button>
                    ) : null}
                  </XStack>
                )
              }
            />
          )}
        />
      )}

      <ActionsSheet
        open={menu}
        title={first?.name ?? ''}
        onClose={() => setMenu(false)}
        actions={actions}
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
      <OwnItSheet game={owning} onClose={() => setOwning(null)} />
    </YStack>
  );
}
