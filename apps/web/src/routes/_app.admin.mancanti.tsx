import type { MissingRow, MissingSummary } from '@repo/contracts';
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
  Button,
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
  Tooltip,
  XStack,
  YStack,
} from '@repo/ui';
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
import { UnlinkedGames } from '@/components/admin/unlinked-games';
import { GameCover } from '@/components/game-cover';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';
import { takeLinkClick } from '@/src/link-click';

const PAGE_SIZE = 20;

type Search = {
  fonte?: EnrichmentSource;
  gruppo?: MissingBucket;
  motivo?: SourceReason;
  q?: string;
  page?: number;
};

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): T | undefined =>
    (values as readonly unknown[]).includes(value) ? (value as T) : undefined;

export const Route = createFileRoute('/_app/admin/mancanti')({
  // Fonte, stato, motivo, ricerca e pagina stanno nell'indirizzo, come i
  // filtri del backlog: «indietro» torna dov'eri.
  validateSearch: (search: Record<string, unknown>): Search => ({
    fonte: oneOf(enrichmentSourceValues)(search.fonte),
    gruppo: oneOf(missingBucketValues)(search.gruppo),
    motivo: oneOf(sourceReasonValues)(search.motivo),
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    page:
      typeof search.page === 'number' && search.page > 1
        ? Math.floor(search.page)
        : undefined,
  }),
  component: MissingSection,
});

/** IGDB «trovato ma vuoto» non esiste: lì il gioco è il dato. */
const bucketsOf = (source: EnrichmentSource) =>
  missingBucketValues.filter(
    (bucket) => !(source === 'igdb' && bucket === 'empty'),
  );

/** Da sistemare, per fonte: su IGDB contano anche i giochi senza id. */
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

/**
 * «Dati mancanti» (11a, frame 1 del wireframe rivisto): il riepilogo fonte
 * per stato in cima, e sotto una tab per fonte, col filtro per stato e la
 * lista già aperta. Una tab per fonte e non per stato, perché i gesti cambiano
 * con la fonte — su IGDB si collega il gioco, sulle altre si scrive l'id — e
 * si lavora una fonte alla volta.
 */
function MissingSection() {
  const t = useTranslations('admin');
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const summary = useQuery(api.admin.missing.summary.queryOptions());

  if (summary.isPending)
    return <Skeleton height={320} width="100%" rounded={12} />;
  if (summary.isError) return <EmptyState title={t('missing.failed')} />;

  // Senza una fonte nell'indirizzo si apre la prima che ha qualcosa da
  // sistemare: arrivare su una lista vuota sarebbe un giro a vuoto.
  const source =
    search.fonte ??
    enrichmentSourceValues.find(
      (value) => fixableOf(summary.data, value) > 0,
    ) ??
    'hltb';
  const bucket = search.gruppo ?? 'fixable';

  return (
    <YStack gap={24}>
      <YStack gap={4}>
        <Text render="h2" fontSize={18} lineHeight={24} fontWeight="600">
          {t('missing.title')}
        </Text>
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('missing.description')}
        </Text>
      </YStack>

      <SummaryTable summary={summary.data} />

      <YStack gap={12}>
        <Tabs
          label={t('missing.source')}
          value={source}
          onValueChange={(value) =>
            void navigate({ search: { fonte: value as EnrichmentSource } })
          }
        >
          {enrichmentSourceValues.map((value) => (
            <TabsTab
              key={value}
              value={value}
              count={fixableOf(summary.data, value)}
            >
              {t(`source.${value}`)}
            </TabsTab>
          ))}
        </Tabs>

        <XStack gap={6} flexWrap="wrap">
          {bucketsOf(source).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={value === bucket ? 'secondary' : 'outline'}
              aria-pressed={value === bucket}
              onPress={() =>
                void navigate({ search: { fonte: source, gruppo: value } })
              }
            >
              {`${t(`bucket.${value}`)} ${countOf(summary.data, source, value)}`}
            </Button>
          ))}
        </XStack>

        {source === 'igdb' &&
        bucket === 'fixable' &&
        summary.data.gamesWithoutIgdb > 0 ? (
          <YStack gap={8}>
            <Text render="h3" fontSize={15} fontWeight="600">
              {t('missing.withoutIgdb')} · {summary.data.gamesWithoutIgdb}
            </Text>
            <UnlinkedGames q={search.q} />
          </YStack>
        ) : null}

        <MissingList
          source={source}
          bucket={bucket}
          reason={search.motivo}
          q={search.q}
          page={search.page ?? 1}
          title={
            source === 'igdb' && bucket === 'fixable'
              ? t('missing.notFoundIgdb')
              : undefined
          }
        />
      </YStack>
    </YStack>
  );
}

/**
 * Il riepilogo: ogni numero diverso da zero è un link che apre la tab e lo
 * stato giusti. Non è più l'unico modo di arrivarci — le tab stanno sotto —
 * ma chi guarda la tabella e vede «113» ci vuole cliccare.
 */
function SummaryTable({ summary }: { summary: MissingSummary }) {
  const t = useTranslations('admin');
  const format = useFormatter();
  type Row = MissingSummary['sources'][number];

  // L'ordine delle fonti è quello del vocabolario, non quello della query.
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
      <Link
        from={Route.fullPath}
        search={{ fonte: row.source, gruppo: bucket }}
      >
        <Text
          fontSize={13}
          lineHeight={18}
          color="$color12"
          textDecorationLine="underline"
          numberOfLines={1}
        >
          {note ? `${n} · ${note}` : String(n)}
        </Text>
      </Link>
    );
  };

  const columns: AdminColumn<Row>[] = [
    {
      key: 'source',
      header: t('missing.source'),
      width: 130,
      render: (row) => <CellText>{t(`source.${row.source}`)}</CellText>,
    },
    ...missingBucketValues.map(
      (bucket): AdminColumn<Row> => ({
        key: bucket,
        header: t(`bucket.${bucket}`),
        flex: bucket === 'pending' || bucket === 'empty' ? 1.4 : 1,
        render: (row) => cell(row, bucket),
      }),
    ),
  ];

  return (
    <YStack gap={8}>
      <AdminTable
        label={t('missing.title')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.source}
      />
      <Link to="/admin/scarti">
        <Text fontSize={13} color="$color11" textDecorationLine="underline">
          {t('missing.openUnresolved', { count: summary.unresolvedImports })}
        </Text>
      </Link>
    </YStack>
  );
}

/** Le fonti dove l'id si scrive a mano: IGDB no, lì si collega il gioco. */
const isManualRow = (
  row: MissingRow,
): row is MissingRow & { source: ManualSource } => row.source !== 'igdb';

function MissingList({
  source,
  bucket,
  reason,
  q,
  page,
  title,
}: {
  source: EnrichmentSource;
  bucket: MissingBucket;
  reason?: SourceReason;
  q?: string;
  page: number;
  title?: string;
}) {
  const t = useTranslations('admin');
  const tBacklog = useTranslations('backlog');
  const navigate = useNavigate({ from: Route.fullPath });
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [setting, setSetting] = useState<SourceToSet | null>(null);

  // La ricerca aspetta che si smetta di scrivere, poi va nell'indirizzo.
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

  // Il motivo si sceglie solo dove ha senso: fra i non trovati.
  const reasons =
    bucket === 'fixable'
      ? sourceReasonValues.filter((value) => value !== 'too_old')
      : [];

  const columns: AdminColumn<MissingRow>[] = [
    {
      key: 'game',
      header: t('missing.game'),
      flex: 2,
      render: (row) => (
        <>
          <GameCover imageId={row.coverImageId} name={row.name} width={24} />
          <YStack flex={1} minW={0}>
            <Link to="/admin/giochi/$slug" params={{ slug: row.slug }}>
              <CellText>{row.name}</CellText>
            </Link>
          </YStack>
        </>
      ),
    },
    {
      key: 'reason',
      header: t('missing.reasonColumn'),
      flex: 3,
      render: (row) => (
        <YStack flex={1} minW={0}>
          <CellText>
            {row.reason ? t(`reason.${row.reason}`) : t(`status.${row.status}`)}
            {row.manual ? ` · ${t('missing.manual')}` : ''}
          </CellText>
          {row.error ? <CellText muted>{row.error}</CellText> : null}
        </YStack>
      ),
    },
    {
      key: 'users',
      header: t('missing.users'),
      width: 56,
      render: (row) => <CellText>{row.users}</CellText>,
    },
    {
      key: 'actions',
      header: '',
      width: 196,
      render: (row) => (
        <>
          <Tooltip content={t('missing.retryHint')}>
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onPress={() => retry.mutate(row)}
            >
              {t('missing.retry')}
            </Button>
          </Tooltip>
          {isManualRow(row) ? (
            <Button
              size="sm"
              variant="outline"
              onPress={() => setSetting({ ...row, source: row.source })}
            >
              {t('missing.setId')}
            </Button>
          ) : null}
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
      {title ? (
        <Text render="h3" fontSize={15} fontWeight="600">
          {title}
          {list.data ? ` · ${total}` : ''}
        </Text>
      ) : null}
      <XStack gap={12} items="center" flexWrap="wrap">
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
                  motivo: next === 'all' ? undefined : (next as SourceReason),
                  page: undefined,
                }),
              })
            }
          >
            <SelectTrigger width={220}>
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
        <Input
          width={240}
          value={text}
          onChangeText={setText}
          placeholder={t('missing.search')}
          aria-label={t('missing.search')}
        />
      </XStack>

      {list.isPending ? (
        <Skeleton height={200} width="100%" rounded={12} />
      ) : list.isError ? (
        <EmptyState title={t('missing.failed')} />
      ) : list.data.rows.length === 0 ? (
        <EmptyState title={t('missing.empty')} />
      ) : (
        <AdminTable
          label={t('missing.listTitle', {
            source: t(`source.${source}`),
            bucket: t(`bucket.${bucket}`),
          })}
          columns={columns}
          rows={list.data.rows}
          rowKey={(row) => `${row.gameId}-${row.source}`}
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
