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
  Text,
  toast,
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
  // La cella aperta, il motivo, la ricerca e la pagina stanno nell'indirizzo,
  // come i filtri del backlog: «indietro» torna dov'eri.
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

/** Le fonti dove l'id si scrive a mano: IGDB no, lì si collega il gioco. */
const isManualRow = (
  row: MissingRow,
): row is MissingRow & { source: ManualSource } => row.source !== 'igdb';

/**
 * «Dati mancanti» (11a, frame 1 del wireframe): la tabellina fonte per stato
 * in cima, e sotto i giochi della cella aperta, con «Ritenta» e «Inserisci id».
 */
function MissingSection() {
  const t = useTranslations('admin');
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const summary = useQuery(api.admin.missing.summary.queryOptions());

  const open = (fonte: EnrichmentSource, gruppo: MissingBucket) =>
    void navigate({ search: { fonte, gruppo } });

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

      {summary.isPending ? (
        <Skeleton height={160} width="100%" rounded={12} />
      ) : summary.isError ? (
        <EmptyState title={t('missing.failed')} />
      ) : (
        <SummaryTable summary={summary.data} active={search} onOpen={open} />
      )}

      {search.fonte && search.gruppo ? (
        <MissingList
          source={search.fonte}
          bucket={search.gruppo}
          reason={search.motivo}
          q={search.q}
          page={search.page ?? 1}
        />
      ) : (
        <Text fontSize={13} color="$color11">
          {t('missing.pick')}
        </Text>
      )}
    </YStack>
  );
}

function SummaryTable({
  summary,
  active,
  onOpen,
}: {
  summary: MissingSummary;
  active: Search;
  onOpen: (fonte: EnrichmentSource, gruppo: MissingBucket) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormatter();
  type Row = (typeof summary.sources)[number];

  // L'ordine delle fonti è quello del vocabolario, non quello della query.
  const rows = enrichmentSourceValues
    .map((source) => summary.sources.find((row) => row.source === source))
    .filter((row): row is Row => row !== undefined);

  const cell = (row: Row, bucket: MissingBucket) => {
    const n = row[bucket];
    const note =
      bucket === 'pending' && row.pendingSince
        ? t('missing.pendingSince', {
            date: format.dateTime(row.pendingSince, {
              day: '2-digit',
              month: '2-digit',
            }),
          })
        : bucket === 'empty' && n > 0
          ? row.source === 'hltb'
            ? t('missing.emptyHltb')
            : t('missing.emptyScore')
          : null;
    const selected = active.fonte === row.source && active.gruppo === bucket;
    // IGDB «trovato ma vuoto» non esiste: lì il gioco è il dato.
    if (bucket === 'empty' && row.source === 'igdb')
      return <CellText muted>—</CellText>;
    return n === 0 ? (
      <CellText muted>0</CellText>
    ) : (
      <Button
        size="sm"
        variant={selected ? 'secondary' : 'ghost'}
        onPress={() => onOpen(row.source, bucket)}
        aria-pressed={selected}
      >
        {note ? `${n} · ${note}` : String(n)}
      </Button>
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
    <YStack gap={12}>
      <AdminTable
        label={t('missing.title')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.source}
      />
      <XStack gap={24} flexWrap="wrap">
        <Text fontSize={13} color="$color11">
          {t('missing.gamesWithoutIgdb')}: {summary.gamesWithoutIgdb}{' '}
          <Link to="/admin/giochi">{t('missing.open')} →</Link>
        </Text>
        <Text fontSize={13} color="$color11">
          {t('missing.unresolved')}: {summary.unresolvedImports}{' '}
          <Link to="/admin/scarti">{t('missing.open')} →</Link>
        </Text>
      </XStack>
    </YStack>
  );
}

function MissingList({
  source,
  bucket,
  reason,
  q,
  page,
}: {
  source: EnrichmentSource;
  bucket: MissingBucket;
  reason?: SourceReason;
  q?: string;
  page: number;
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
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: api.admin.missing.key(),
      }),
    ]);

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
          <Link
            to="/games/$slug"
            params={{ slug: row.slug }}
            style={{ minWidth: 0, overflow: 'hidden' }}
          >
            <CellText>{row.name}</CellText>
          </Link>
        </>
      ),
    },
    {
      key: 'reason',
      header: t('missing.reasonColumn'),
      flex: 3,
      render: (row) => (
        <YStack minW={0}>
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
          <Button
            size="sm"
            variant="outline"
            disabled={retry.isPending}
            onPress={() => retry.mutate(row)}
          >
            {t('missing.retry')}
          </Button>
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
      <XStack gap={12} items="center" flexWrap="wrap">
        <Text render="h3" fontSize={16} lineHeight={22} fontWeight="600">
          {t('missing.listTitle', {
            source: t(`source.${source}`),
            bucket: t(`bucket.${bucket}`),
          })}
          {list.data ? ` · ${total}` : ''}
        </Text>
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
            <SelectTrigger width={200}>
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
