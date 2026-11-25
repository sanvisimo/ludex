import type { BacklogEntry, BacklogSort } from '@repo/contracts';
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
  ArrowDown,
  ArrowUp,
  Gamepad2,
  Library,
  SearchX,
  SlidersHorizontal,
} from '@repo/ui/icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { useTranslations } from 'use-intl';

import { BacklogCard } from '../../components/backlog-card';
import { FilterSheet } from '../../components/filter-sheet';
import { QuickEditSheet } from '../../components/quick-edit-sheet';
import {
  activeCount,
  emptyFilter,
  sortKeys,
  toQuery,
  useBacklogView,
} from '../../lib/backlog-filter';
import { api } from '../../lib/orpc';
import { openOnWeb } from '../../lib/web-links';

const PAGE = 50;

export default function Backlog() {
  const t = useTranslations('backlog');
  const tSort = useTranslations('sort');
  const { filter, setFilter, q, setQ, sort, direction, setSort } =
    useBacklogView();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<BacklogEntry | null>(null);
  const search = useDeferredValue(q);

  const query = toQuery(filter, search, sort, direction);
  const list = useInfiniteQuery(
    api.backlog.list.infiniteOptions({
      input: (offset: number) => ({ ...query, limit: PAGE, offset }),
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
    () =>
      new Map(
        (options.data?.platforms ?? []).map((platform) => [
          platform.slug,
          platform.name,
        ]),
      ),
    [options.data],
  );
  const entries = list.data?.pages.flatMap((page) => page.entries) ?? [];
  const total = list.data?.pages[0]?.total;
  const filtered = activeCount(filter) > 0 || q.trim() !== '';
  const sortItems = Object.fromEntries(
    sortKeys.map((key) => [key, tSort(key)]),
  ) as Record<BacklogSort, string>;

  return (
    <YStack flex={1} bg="background">
      <YStack px={16} pt={8} pb={12} gap={12}>
        {total !== undefined ? (
          <Text color="color11">
            {total === 1 ? t('countOne') : t('countOther', { count: total })}
          </Text>
        ) : null}
        <ClearableInput
          value={q}
          onChangeText={setQ}
          placeholder={t('search')}
          clearLabel={t('clearSearch')}
        />
        <XStack gap={8}>
          <Button
            flex={1}
            variant={activeCount(filter) > 0 ? 'selection' : 'outline'}
            onPress={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal size={16} />
            {activeCount(filter) > 0
              ? t('filtersCount', { count: activeCount(filter) })
              : t('filters')}
          </Button>
          <YStack flex={1}>
            <Select
              items={sortItems}
              value={sort}
              onValueChange={(next: string) =>
                setSort(next as BacklogSort, direction)
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
            onPress={() => setSort(sort, direction === 'asc' ? 'desc' : 'asc')}
          >
            {direction === 'asc' ? (
              <ArrowUp size={16} />
            ) : (
              <ArrowDown size={16} />
            )}
          </Button>
        </XStack>
      </YStack>

      {list.isPending ? (
        <YStack px={16} gap={12}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} height={112} width="100%" rounded={12} />
          ))}
        </YStack>
      ) : list.isError ? (
        <YStack px={16}>
          <Text color="red11">{t('loadFailed')}</Text>
        </YStack>
      ) : entries.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<SearchX size={24} color="color11" />}
            title={t('noResults')}
            action={
              <Button
                variant="outline"
                onPress={() => {
                  setFilter(emptyFilter);
                  setQ('');
                }}
              >
                {t('resetFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Gamepad2 size={24} color="color11" />}
            title={t('empty')}
            description={t('emptyHint')}
            action={
              <Button
                variant="outline"
                onPress={() => openOnWeb('/account/libraries')}
              >
                <Library size={16} />
                {t('linkLibraries')}
              </Button>
            }
          />
        )
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
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={() => void list.refetch()}
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

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filter={filter}
        onChange={setFilter}
        options={options.data}
        total={total}
        fetching={list.isFetching && !list.isFetchingNextPage}
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
