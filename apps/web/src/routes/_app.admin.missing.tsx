import {
  adminMissingDefaultSort,
  AdminMissingSortSchema,
  type AdminMissingSort,
  type MissingRow,
  type MissingSummary,
} from '@repo/contracts';
import {
  enrichmentSourceValues,
  missingBucketValues,
  sourceReasonValues,
  type EnrichmentSource,
  type ManualSource,
  type MissingBucket,
  type SourceReason,
} from '@repo/contracts/vocabulary';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  ClearableInput,
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
  Tooltip,
  XStack,
  YStack,
} from '@repo/ui';
import { Hash, RotateCw } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
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
  SetSourceIdDialog,
  type SourceToSet,
} from '@/components/admin/set-source-id-dialog';
import { StatusBadge } from '@/components/admin/status-badge';
import { UnlinkedGames } from '@/components/admin/unlinked-games';
import { GameCover } from '@/components/game-cover';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';
import { takeLinkClick } from '@/src/link-click';

const PAGE_SIZE = 20;

type Search = {
  source?: EnrichmentSource;
  bucket?: MissingBucket;
  reason?: SourceReason;
  q?: string;
  page?: number;
} & Partial<AdminMissingSort>;

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): T | undefined =>
    (values as readonly unknown[]).includes(value) ? (value as T) : undefined;

export const Route = createFileRoute('/_app/admin/missing')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...AdminMissingSortSchema.safeParse(search).data,
    source: oneOf(enrichmentSourceValues)(search.source),
    bucket: oneOf(missingBucketValues)(search.bucket),
    reason: oneOf(sourceReasonValues)(search.reason),
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    page:
      typeof search.page === 'number' && search.page > 1
        ? Math.floor(search.page)
        : undefined,
  }),
  component: MissingSection,
});

const bucketsOf = (source: EnrichmentSource) =>
  missingBucketValues.filter(
    (bucket) => !(source === 'igdb' && bucket === 'empty'),
  );

function fixableOf(summary: MissingSummary, source: EnrichmentSource) {
  const fixable =
    summary.sources.find((row) => row.source === source)?.fixable ?? 0;
  return source === 'igdb' ? fixable + summary.gamesWithoutIgdb : fixable;
}

function countOf(
  summary: MissingSummary,
  source: EnrichmentSource,
  bucket: MissingBucket,
) {
  if (bucket === 'fixable') return fixableOf(summary, source);
  return summary.sources.find((row) => row.source === source)?.[bucket] ?? 0;
}

function MissingSection() {
  const t = useTranslations('admin');
  const search = Route.useSearch();
  const summary = useQuery(api.admin.missing.summary.queryOptions());

  if (summary.isPending)
    return <Skeleton height={320} width="100%" rounded={12} />;
  if (summary.isError) return <EmptyState title={t('missing.failed')} />;

  const source =
    search.source ??
    enrichmentSourceValues.find(
      (value) => fixableOf(summary.data, value) > 0,
    ) ??
    'hltb';
  const bucket =
    search.bucket && bucketsOf(source).includes(search.bucket)
      ? search.bucket
      : 'fixable';

  return (
    <YStack gap={16}>
      <Text
        render="h2"
        fontSize={22}
        lineHeight="28px"
        fontFamily="heading"
        fontWeight="600"
      >
        {t('missing.title')}
      </Text>

      <Accordion>
        <AccordionItem value="summary">
          <AccordionTrigger>{t('missing.summary')}</AccordionTrigger>
          <AccordionContent>
            <SummaryTable summary={summary.data} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <MissingList
        summary={summary.data}
        source={source}
        bucket={bucket}
        reason={bucket === 'fixable' ? search.reason : undefined}
        q={search.q}
        page={search.page ?? 1}
      />
    </YStack>
  );
}

function SummaryTable({ summary }: { summary: MissingSummary }) {
  const t = useTranslations('admin');
  const format = useFormatter();
  type Row = MissingSummary['sources'][number];

  const rows = enrichmentSourceValues
    .map((source) => summary.sources.find((row) => row.source === source))
    .filter((row): row is Row => row !== undefined);

  const cell = (row: Row, bucket: MissingBucket) => {
    if (bucket === 'empty' && row.source === 'igdb')
      return <CellText muted>—</CellText>;
    const n = countOf(summary, row.source, bucket);
    if (n === 0) return <CellText muted>0</CellText>;
    const note =
      bucket === 'pending' && row.pendingSince
        ? t('missing.pendingSince', {
            date: format.dateTime(row.pendingSince, {
              day: '2-digit',
              month: '2-digit',
            }),
          })
        : bucket === 'empty'
          ? row.source === 'hltb'
            ? t('missing.emptyHltb')
            : t('missing.emptyScore')
          : null;
    return (
      <Link from={Route.fullPath} search={{ source: row.source, bucket }}>
        <Text
          fontSize={13}
          lineHeight="18px"
          color="color12"
          textDecorationLine="underline"
        >
          {note ? `${format.number(n)} · ${note}` : format.number(n)}
        </Text>
      </Link>
    );
  };

  const columns: AdminColumn<Row>[] = [
    {
      key: 'source',
      sortValue: (row) => t(`source.${row.source}`),
      header: t('missing.source'),
      width: 130,
      render: (row) => <CellText>{t(`source.${row.source}`)}</CellText>,
    },
    ...missingBucketValues.map((bucket): AdminColumn<Row> => {
      const wide = bucket === 'pending' || bucket === 'empty';
      return {
        key: bucket,
        sortValue: (row) => countOf(summary, row.source, bucket),
        header: t(`bucket.${bucket}`),
        flex: wide ? 1.4 : 1,
        minWidth: wide ? 120 : 70,
        render: (row) => cell(row, bucket),
      };
    }),
  ];

  return (
    <YStack gap={8}>
      <AdminTable
        label={t('missing.summary')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.source}
      />
      <Link to="/admin/unresolved">
        <Text fontSize={13} color="color11" textDecorationLine="underline">
          {t('missing.openUnresolved', { count: summary.unresolvedImports })}
        </Text>
      </Link>
    </YStack>
  );
}

const isManualRow = (
  row: MissingRow,
): row is MissingRow & { source: ManualSource } => row.source !== 'igdb';

function MissingList({
  summary,
  source,
  bucket,
  reason,
  q,
  page,
}: {
  summary: MissingSummary;
  source: EnrichmentSource;
  bucket: MissingBucket;
  reason?: SourceReason;
  q?: string;
  page: number;
}) {
  const t = useTranslations('admin');
  const format = useFormatter();
  const tSearch = useTranslations('search');
  const tBacklog = useTranslations('backlog');
  const navigate = useNavigate({ from: Route.fullPath });
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const {
    sort = adminMissingDefaultSort.sort,
    direction = adminMissingDefaultSort.direction,
  } = Route.useSearch();
  const sorting = { sort, direction };
  const [setting, setSetting] = useState<SourceToSet | null>(null);

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
    api.admin.missing.list.queryOptions({
      input: {
        source,
        bucket,
        reason,
        q,
        sorting,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      },
    }),
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: api.admin.key() });

  const retry = useMutation({
    mutationFn: (row: MissingRow) =>
      client.admin.sources.retry({ gameId: row.gameId, source: row.source }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('missing.retried'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('missing.retryFailed') })),
  });

  const reasons =
    bucket === 'fixable'
      ? sourceReasonValues.filter((value) => value !== 'too_old')
      : [];

  const columns: AdminColumn<MissingRow>[] = [
    {
      key: 'game',
      header: t('missing.game'),
      flex: 3,
      minWidth: 200,
      render: (row) => (
        <>
          <GameCover imageId={row.coverImageId} name={row.name} width={24} />
          <YStack flex={1} minW={0}>
            <Link to="/admin/games/$slug" params={{ slug: row.slug }}>
              <CellText>{row.name}</CellText>
            </Link>
          </YStack>
        </>
      ),
    },
    {
      key: 'reason',
      header: t('missing.reasonColumn'),
      flex: 2,
      minWidth: 148,
      render: (row) => (
        <YStack flex={1} minW={0} gap={2}>
          <XStack items="center" gap={8} flexWrap="wrap">
            {row.reason ? (
              <Text
                fontSize={13}
                lineHeight="18px"
                fontWeight="600"
                color="color12"
              >
                {t(`reason.${row.reason}`)}
              </Text>
            ) : (
              <StatusBadge status={row.status} />
            )}
            {row.manual ? (
              <CellText muted>{t('missing.manual')}</CellText>
            ) : null}
          </XStack>
          {row.error ? (
            <details>
              <summary className="w-fit cursor-pointer rounded-sm py-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                {t('missing.details')}
              </summary>
              <CellText muted>{row.error}</CellText>
            </details>
          ) : null}
        </YStack>
      ),
    },
    {
      key: 'users',
      header: t('missing.users'),
      width: 56,
      align: 'end',
      render: (row) => <CellText>{format.number(row.users)}</CellText>,
    },
    ...(bucket === 'empty' || bucket === 'fine'
      ? []
      : [
          {
            key: 'actions',
            header: t('missing.actions'),
            width: source === 'igdb' ? 100 : 230,
            align: 'end',
            render: (row: MissingRow) => (
              <>
                <Tooltip content={t('missing.retryHint')}>
                  <Button
                    size="sm"
                    variant={isManualRow(row) ? 'ghost' : 'secondary'}
                    disabled={retry.isPending}
                    onPress={() => retry.mutate(row)}
                  >
                    <RotateCw size={14} />
                    {t('missing.retry')}
                  </Button>
                </Tooltip>
                {isManualRow(row) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => setSetting({ ...row, source: row.source })}
                  >
                    <Hash size={14} />
                    {t('missing.setId')}
                  </Button>
                ) : null}
              </>
            ),
          } satisfies AdminColumn<MissingRow>,
        ]),
  ];

  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const goToPage = (target: number) =>
    void navigate({
      search: (prev) => ({ ...prev, page: target > 1 ? target : undefined }),
    });

  return (
    <YStack gap={12}>
      <YStack
        role="group"
        aria-label={t('missing.filters')}
        minW={0}
        px={12}
        py={10}
        gap={12}
        bg="color2"
        rounded={12}
        borderWidth={1}
        borderColor="border-color"
      >
        <Tabs
          label={t('missing.source')}
          value={source}
          onValueChange={(value) =>
            void navigate({ search: { source: value as EnrichmentSource } })
          }
        >
          {enrichmentSourceValues.map((value) => (
            <TabsTab
              key={value}
              value={value}
              count={fixableOf(summary, value)}
            >
              {t(`source.${value}`)}
            </TabsTab>
          ))}
        </Tabs>

        <XStack
          role="group"
          aria-label={t('missing.state')}
          gap={6}
          flexWrap="wrap"
        >
          <Text
            self="center"
            fontSize={12}
            fontWeight="600"
            color="color11"
            mr={4}
          >
            {t('missing.state')}
          </Text>
          {bucketsOf(source).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={value === bucket ? 'selection' : 'outline'}
              aria-pressed={value === bucket}
              onPress={() =>
                void navigate({ search: { source, bucket: value } })
              }
            >
              {`${t(`bucket.${value}`)} · ${format.number(countOf(summary, source, value))}`}
            </Button>
          ))}
        </XStack>

        <XStack gap={8} items="center" flexWrap="wrap">
          {reasons.length > 0 ? (
            <Select
              items={Object.fromEntries([
                ['all', t('missing.reasonAll')],
                ...reasons.map((value) => [value, t(`reason.${value}`)]),
              ])}
              value={reason ?? 'all'}
              onValueChange={(next) =>
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    reason: next === 'all' ? undefined : (next as SourceReason),
                    page: undefined,
                  }),
                })
              }
            >
              <SelectTrigger
                width="220px max-sm:100%"
                aria-label={t('missing.reasonColumn')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('missing.reasonAll')}</SelectItem>
                {reasons.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`reason.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <YStack width="260px max-sm:100%" minW={0}>
            <ClearableInput
              value={text}
              onChangeText={setText}
              placeholder={t('missing.search')}
              aria-label={t('missing.search')}
              clearLabel={tSearch('clear')}
            />
          </YStack>
        </XStack>
      </YStack>

      {source === 'igdb' &&
      bucket === 'fixable' &&
      summary.gamesWithoutIgdb > 0 ? (
        <YStack gap={8}>
          <Text render="h3" fontSize={15} fontWeight="600">
            {t('missing.withoutIgdb')} ·{' '}
            {format.number(summary.gamesWithoutIgdb)}
          </Text>
          <UnlinkedGames q={q} />
        </YStack>
      ) : null}

      <XStack items="baseline" justify="space-between" gap={8} flexWrap="wrap">
        <Text render="h3" fontSize={15} fontWeight="600">
          {source === 'igdb' && bucket === 'fixable'
            ? t('missing.notFoundIgdb')
            : t('missing.listTitle', {
                source: t(`source.${source}`),
                bucket: t(`bucket.${bucket}`),
              })}
        </Text>
        {list.data ? (
          <Text fontSize={12} color="color11" role="status">
            {t('missing.results', { count: total })}
          </Text>
        ) : null}
      </XStack>

      {list.isError ? (
        <EmptyState title={t('missing.failed')} />
      ) : list.data?.rows.length === 0 ? (
        <EmptyState title={t('missing.empty')} />
      ) : (
        <AdminTable
          label={t('missing.listTitle', {
            source: t(`source.${source}`),
            bucket: t(`bucket.${bucket}`),
          })}
          columns={columns}
          rows={list.data?.rows}
          rowKey={(row) => `${row.gameId}-${row.source}`}
          serverSort={{
            value: sorting,
            keys: AdminMissingSortSchema.shape.sort.options,
            onChange: (next) =>
              void navigate({
                search: (prev) => ({ ...prev, ...next, page: undefined }),
              }),
          }}
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

      <SetSourceIdDialog
        row={setting}
        onOpenChange={(open) => {
          if (!open) setSetting(null);
        }}
        onSaved={refresh}
      />
    </YStack>
  );
}
