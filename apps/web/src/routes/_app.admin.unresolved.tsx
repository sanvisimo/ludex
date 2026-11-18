import type {
  GlobalHiddenImport,
  IgdbSearchHit,
  UnresolvedGroup,
} from '@repo/contracts';
import {
  storeValues,
  type HiddenKind,
  type Store,
} from '@repo/contracts/vocabulary';
import {
  Button,
  ClearableInput,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsTab,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { ChevronDown, Eye, EyeOff, Link2 } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import {
  globalKinds,
  UnresolvedDetailDialog,
  useHiddenSummary,
  type GlobalKind,
} from '@/components/admin/unresolved-detail-dialog';
import { UnresolvedCover } from '@/components/unresolved-row';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';
import { takeLinkClick } from '@/src/link-click';

const PAGE_SIZE = 20;

type Search = {
  view?: 'hidden';
  store?: Store;
  q?: string;
  page?: number;
};

export const Route = createFileRoute('/_app/admin/unresolved')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    view: search.view === 'hidden' ? 'hidden' : undefined,
    store: (storeValues as readonly unknown[]).includes(search.store)
      ? (search.store as Store)
      : undefined,
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    page:
      typeof search.page === 'number' && search.page > 1
        ? Math.floor(search.page)
        : undefined,
  }),
  component: UnresolvedSection,
});

function UnresolvedSection() {
  const t = useTranslations('admin.unresolved');
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const openCount = useQuery(
    api.admin.unresolved.list.queryOptions({ input: { limit: 1 } }),
  );
  const hiddenRules = useQuery(
    api.admin.unresolved.globalHidden.queryOptions(),
  );

  return (
    <YStack gap={16}>
      <Text
        render="h2"
        fontSize={22}
        lineHeight="28px"
        fontFamily="heading"
        fontWeight="600"
      >
        {t('title')}
      </Text>

      <Tabs
        label={t('title')}
        value={search.view ?? 'open'}
        onValueChange={(value) =>
          void navigate({
            search: { view: value === 'hidden' ? 'hidden' : undefined },
          })
        }
      >
        <TabsTab value="open" count={openCount.data?.total}>
          {t('open')}
        </TabsTab>
        <TabsTab value="hidden" count={hiddenRules.data?.length}>
          {t('globalHidden')}
        </TabsTab>
      </Tabs>

      {search.view === 'hidden' ? (
        <GlobalHiddenList rules={hiddenRules} />
      ) : (
        <OpenList store={search.store} q={search.q} page={search.page ?? 1} />
      )}
    </YStack>
  );
}

function useRefreshUnresolved() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.admin.unresolved.key() }),
      queryClient.invalidateQueries({ queryKey: api.admin.missing.key() }),
    ]);
}

function OpenList({
  store,
  q,
  page,
}: {
  store?: Store;
  q?: string;
  page: number;
}) {
  const t = useTranslations('admin.unresolved');
  const tSearch = useTranslations('search');
  const tStore = useTranslations('store');
  const tKind = useTranslations('account.hiddenTab.tabs');
  const tBacklog = useTranslations('backlog');
  const format = useFormatter();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const errorMessage = useApiErrorMessage();
  const refresh = useRefreshUnresolved();
  const platforms = useQuery(api.platforms.list.queryOptions());
  const platformName = (slug: string | null) =>
    slug ? (platforms.data?.find((p) => p.slug === slug)?.name ?? slug) : null;
  const [detail, setDetail] = useState<{
    row: UnresolvedGroup;
    searching: boolean;
  } | null>(null);
  const hiddenSummary = useHiddenSummary();

  const [text, setText] = useState(q ?? '');
  useEffect(() => setText(q ?? ''), [q]);
  useEffect(() => {
    const value = text.trim() || undefined;
    if (value === q) return;
    const timer = setTimeout(
      () =>
        void navigate({
          search: (prev) => ({ ...prev, q: value, page: undefined }),
          replace: true,
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [text, q, navigate]);

  const list = useQuery(
    api.admin.unresolved.list.queryOptions({
      input: {
        store,
        q,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      },
    }),
  );

  const link = useMutation({
    mutationFn: ({ row, hit }: { row: UnresolvedGroup; hit: IgdbSearchHit }) =>
      client.admin.unresolved.resolve({
        store: row.store,
        externalId: row.externalId,
        igdbId: hit.igdbId,
      }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(t('linked', { count: result.resolved }));
      setDetail(null);
    },
    onError: (error) =>
      toast.error(
        hasErrorCode(error, 'CONFLICT')
          ? t('linkedElsewhere')
          : errorMessage(error, { fallback: t('linkFailed') }),
      ),
  });

  const hide = useMutation({
    mutationFn: ({ row, kind }: { row: UnresolvedGroup; kind: GlobalKind }) =>
      client.admin.unresolved.hide({
        store: row.store,
        externalId: row.externalId,
        kind,
      }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(t('hidden', { count: result.hidden }));
      setDetail(null);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('hideFailed') })),
  });

  const columns: AdminColumn<UnresolvedGroup>[] = [
    {
      key: 'name',
      header: t('name'),
      flex: 2,
      minWidth: 200,
      render: (row) => (
        <XStack
          render="button"
          flex={1}
          minW={0}
          items="center"
          gap={6}
          cursor="pointer"
          bg="transparent"
          borderWidth={0}
          p={0}
          opacity="hover:0.8"
          outlineColor="focus-visible:outline-color"
          outlineStyle="focus-visible:solid"
          outlineWidth="focus-visible:2px"
          outlineOffset="focus-visible:-2px"
          rounded={4}
          style={{ textAlign: 'left' }}
          aria-label={t('details', { name: row.name })}
          onPress={() => setDetail({ row, searching: false })}
        >
          <UnresolvedCover
            key={`${row.store}-${row.externalId}`}
            entry={row}
            width={24}
            height={32}
          />
          <YStack flex={1} minW={0}>
            <Text
              fontSize={13}
              lineHeight="18px"
              color="color12"
              textDecorationLine="underline"
              style={{ overflowWrap: 'anywhere', textUnderlineOffset: 2 }}
            >
              {row.name}
            </Text>
            <CellText muted>
              {[tStore(row.store), platformName(row.platformSlug)]
                .filter(Boolean)
                .join(' · ')}
            </CellText>
          </YStack>
        </XStack>
      ),
    },
    {
      key: 'libraries',
      header: t('libraries'),
      width: 72,
      align: 'end',
      render: (row) => <CellText>{format.number(row.libraries)}</CellText>,
    },
    {
      key: 'hidden',
      header: t('hiddenBy'),
      flex: 1,
      minWidth: 140,
      render: (row) => <CellText muted>{hiddenSummary(row) || '—'}</CellText>,
    },
    {
      key: 'actions',
      header: t('actions'),
      width: 320,
      align: 'end',
      render: (row) => (
        <>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => setDetail({ row, searching: true })}
          >
            <Link2 size={14} />
            {t('link')}
          </Button>
          <DropdownMenu align="end">
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline" disabled={hide.isPending}>
                  <EyeOff size={14} />
                  {t('hide')}
                  <ChevronDown size={14} />
                </Button>
              }
            />
            <DropdownMenuContent>
              {globalKinds.map((kind) => (
                <DropdownMenuItem
                  key={kind}
                  onClick={() => hide.mutate({ row, kind })}
                >
                  {t('hideAs', { kind: tKind(kind) })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ),
    },
  ];

  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const goToPage = (target: number) =>
    void navigate({
      search: (prev) => ({ ...prev, page: target > 1 ? target : undefined }),
    });

  return (
    <YStack gap={12}>
      <XStack
        role="group"
        aria-label={t('filters')}
        gap={8}
        px={12}
        py={10}
        items="center"
        flexWrap="wrap"
        bg="color2"
        rounded={12}
        borderWidth={1}
        borderColor="border-color"
      >
        <Select
          items={Object.fromEntries([
            ['all', t('allStores')],
            ...storeValues.map((value) => [value, tStore(value)]),
          ])}
          value={store ?? 'all'}
          onValueChange={(next) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                store: next === 'all' ? undefined : (next as Store),
                page: undefined,
              }),
            })
          }
        >
          <SelectTrigger width="220px max-sm:100%" aria-label={t('store')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStores')}</SelectItem>
            {storeValues.map((value) => (
              <SelectItem key={value} value={value}>
                {tStore(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <YStack width="260px max-sm:100%" minW={0}>
          <ClearableInput
            value={text}
            onChangeText={setText}
            placeholder={t('search')}
            aria-label={t('search')}
            clearLabel={tSearch('clear')}
          />
        </YStack>
      </XStack>

      {list.data && (store || q) ? (
        <Text fontSize={12} color="color11" role="status">
          {t('results', { count: total })}
        </Text>
      ) : null}

      {list.isPending ? (
        <Skeleton height={200} width="100%" rounded={12} />
      ) : list.isError ? (
        <EmptyState title={t('failed')} />
      ) : list.data.rows.length === 0 ? (
        <EmptyState title={t(store || q ? 'emptyFiltered' : 'empty')} />
      ) : (
        <AdminTable
          label={t('open')}
          columns={columns}
          rows={list.data.rows}
          rowKey={(row) => `${row.store}-${row.externalId}`}
        />
      )}

      {pageCount > 1 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          href={(target) =>
            router.buildLocation({
              from: Route.fullPath,
              to: Route.fullPath,
              search: (prev) => ({
                ...prev,
                page: target > 1 ? target : undefined,
              }),
            }).href
          }
          onNavigate={(target, event) => {
            if (takeLinkClick(event)) goToPage(target);
          }}
          label={tBacklog('pages')}
          previousLabel={tBacklog('previousPage')}
          nextLabel={tBacklog('nextPage')}
          goToLabel={tBacklog('goToPage')}
          onGoTo={goToPage}
        />
      ) : null}

      <UnresolvedDetailDialog
        row={detail?.row ?? null}
        searching={detail?.searching ?? false}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        linkPending={link.isPending}
        hidePending={hide.isPending}
        onLink={(row, hit) => link.mutate({ row, hit })}
        onHide={(row, kind) => hide.mutate({ row, kind })}
      />
    </YStack>
  );
}

function GlobalHiddenList({
  rules,
}: {
  rules: ReturnType<typeof useQuery<GlobalHiddenImport[]>>;
}) {
  const t = useTranslations('admin.unresolved');
  const tStore = useTranslations('store');
  const tKind = useTranslations('account.hiddenTab.tabs');
  const format = useFormatter();
  const errorMessage = useApiErrorMessage();
  const refresh = useRefreshUnresolved();

  const unhide = useMutation({
    mutationFn: (rule: GlobalHiddenImport) =>
      client.admin.unresolved.unhide({
        store: rule.store,
        externalId: rule.externalId,
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('unhidden'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('unhideFailed') })),
  });

  const columns: AdminColumn<GlobalHiddenImport>[] = [
    {
      key: 'store',
      header: t('store'),
      width: 100,
      render: (rule) => <CellText>{tStore(rule.store)}</CellText>,
    },
    {
      key: 'name',
      header: t('name'),
      flex: 2,
      minWidth: 200,
      render: (rule) => (
        <YStack flex={1} minW={0}>
          <CellText>{rule.name}</CellText>
          <details>
            <summary className="w-fit cursor-pointer rounded-sm py-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
              {t('externalId')}
            </summary>
            <CellText muted>{rule.externalId}</CellText>
          </details>
        </YStack>
      ),
    },
    {
      key: 'kind',
      header: t('kind'),
      width: 120,
      render: (rule) => (
        <CellText>{tKind(rule.hiddenKind as HiddenKind)}</CellText>
      ),
    },
    {
      key: 'libraries',
      header: t('libraries'),
      width: 72,
      align: 'end',
      render: (rule) => <CellText>{format.number(rule.libraries)}</CellText>,
    },
    {
      key: 'decided',
      header: t('decidedBy'),
      flex: 1,
      minWidth: 160,
      render: (rule) => (
        <CellText muted>
          {[
            rule.decidedBy,
            format.dateTime(rule.createdAt, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </CellText>
      ),
    },
    {
      key: 'actions',
      header: t('actions'),
      width: 136,
      align: 'end',
      render: (rule) => (
        <Button
          size="sm"
          variant="outline"
          disabled={unhide.isPending}
          onPress={() => unhide.mutate(rule)}
        >
          <Eye size={14} />
          {t('unhide')}
        </Button>
      ),
    },
  ];

  if (rules.isPending)
    return <Skeleton height={160} width="100%" rounded={12} />;
  if (rules.isError) return <EmptyState title={t('failed')} />;
  if (rules.data.length === 0) return <EmptyState title={t('emptyHidden')} />;
  return (
    <YStack gap={12}>
      <Text fontSize={13} lineHeight="18px" color="color11">
        {t('unhideHint')}
      </Text>
      <AdminTable
        label={t('globalHidden')}
        columns={columns}
        rows={rules.data}
        rowKey={(rule) => `${rule.store}-${rule.externalId}`}
      />
    </YStack>
  );
}
