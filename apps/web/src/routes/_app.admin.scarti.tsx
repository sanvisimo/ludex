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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
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
import { ChevronDown } from '@repo/ui/icons';
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
  vista?: 'nascosti';
  negozio?: Store;
  q?: string;
  page?: number;
};

export const Route = createFileRoute('/_app/admin/scarti')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    vista: search.vista === 'nascosti' ? 'nascosti' : undefined,
    negozio: (storeValues as readonly unknown[]).includes(search.negozio)
      ? (search.negozio as Store)
      : undefined,
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    page:
      typeof search.page === 'number' && search.page > 1
        ? Math.floor(search.page)
        : undefined,
  }),
  component: UnresolvedSection,
});

/**
 * Gli scarti d'import di tutti (11a, frame 3 del wireframe): una riga per
 * negozio e id esterno, perché lo stesso Netflix su PSN è una riga per ogni
 * utente e all'admin interessa una volta. Due viste, nell'indirizzo: quelli da
 * sistemare, e le regole «nascosto per tutti».
 */
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
      <Text render="h2" fontSize={18} lineHeight={24} fontWeight="600">
        {t('title')}
      </Text>

      <Tabs
        label={t('title')}
        value={search.vista ?? 'open'}
        onValueChange={(value) =>
          void navigate({
            search: { vista: value === 'nascosti' ? 'nascosti' : undefined },
          })
        }
      >
        <TabsTab value="open" count={openCount.data?.total}>
          {t('open')}
        </TabsTab>
        <TabsTab value="nascosti" count={hiddenRules.data?.length}>
          {t('globalHidden')}
        </TabsTab>
      </Tabs>

      {search.vista === 'nascosti' ? (
        <GlobalHiddenList rules={hiddenRules} />
      ) : (
        <OpenList store={search.negozio} q={search.q} page={search.page ?? 1} />
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
  const tStore = useTranslations('store');
  const tKind = useTranslations('account.hiddenTab.tabs');
  const tBacklog = useTranslations('backlog');
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const errorMessage = useApiErrorMessage();
  const refresh = useRefreshUnresolved();
  const platforms = useQuery(api.platforms.list.queryOptions());
  const platformName = (slug: string | null) =>
    slug ? (platforms.data?.find((p) => p.slug === slug)?.name ?? slug) : null;
  // Il dettaglio aperto, e se con la ricerca IGDB già aperta: così lo apre
  // «Collega per tutti» dalla riga.
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
      key: 'store',
      header: t('store'),
      width: 120,
      render: (row) => (
        <CellText>
          {[tStore(row.store), platformName(row.platformSlug)]
            .filter(Boolean)
            .join(' · ')}
        </CellText>
      ),
    },
    {
      key: 'name',
      header: t('name'),
      flex: 2,
      // Tutta la voce apre il dettaglio: nella tabella i testi si tagliano.
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
          aria-label={t('details', { name: row.name })}
          onPress={() => setDetail({ row, searching: false })}
          hoverStyle={{ opacity: 0.8 }}
          {...({ style: { textAlign: 'left' } } as object)}
        >
          <UnresolvedCover
            key={`${row.store}-${row.externalId}`}
            entry={row}
            width={24}
            height={32}
          />
          <YStack flex={1} minW={0}>
            <CellText>{row.name}</CellText>
            <CellText muted>{row.externalId}</CellText>
          </YStack>
        </XStack>
      ),
    },
    {
      key: 'libraries',
      header: t('libraries'),
      width: 64,
      render: (row) => <CellText>{row.libraries}</CellText>,
    },
    {
      key: 'hidden',
      header: t('hiddenBy'),
      flex: 1,
      render: (row) => <CellText muted>{hiddenSummary(row) || '—'}</CellText>,
    },
    {
      key: 'actions',
      header: '',
      width: 340,
      render: (row) => (
        <>
          <Button
            size="sm"
            variant="outline"
            onPress={() => setDetail({ row, searching: true })}
          >
            {t('link')}
          </Button>
          <DropdownMenu align="end">
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline" disabled={hide.isPending}>
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
      <XStack gap={12} items="center" flexWrap="wrap">
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
                negozio: next === 'all' ? undefined : (next as Store),
                page: undefined,
              }),
            })
          }
        >
          <SelectTrigger width={180}>
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
        <Input
          width={240}
          value={text}
          onChangeText={setText}
          placeholder={t('search')}
          aria-label={t('search')}
        />
      </XStack>

      {list.isPending ? (
        <Skeleton height={200} width="100%" rounded={12} />
      ) : list.isError ? (
        <EmptyState title={t('failed')} />
      ) : list.data.rows.length === 0 ? (
        <EmptyState title={t('empty')} />
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
      render: (rule) => (
        <YStack flex={1} minW={0}>
          <CellText>{rule.name}</CellText>
          <CellText muted>{rule.externalId}</CellText>
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
      width: 64,
      render: (rule) => <CellText>{rule.libraries}</CellText>,
    },
    {
      key: 'decided',
      header: t('decidedBy'),
      flex: 1,
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
      header: '',
      width: 80,
      render: (rule) => (
        <Button
          size="sm"
          variant="outline"
          disabled={unhide.isPending}
          onPress={() => unhide.mutate(rule)}
        >
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
    <AdminTable
      label={t('globalHidden')}
      columns={columns}
      rows={rules.data}
      rowKey={(rule) => `${rule.store}-${rule.externalId}`}
    />
  );
}
