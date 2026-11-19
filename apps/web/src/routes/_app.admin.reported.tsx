import {
  adminReportsDefaultSort,
  AdminReportsSortSchema,
  type AdminReportsSort,
  type ReportGroup,
} from '@repo/contracts';
import { Button, EmptyState, Text, toast, YStack } from '@repo/ui';
import { Archive, ArrowUpRight } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useFormatter, useTranslations } from 'use-intl';

import {
  ADMIN_PAGE_SIZE,
  AdminPagination,
  adminPageParam,
} from '@/components/admin/admin-pagination';
import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';
import { ButtonLink } from '@/src/components/button-link';

type Search = { page?: number } & Partial<AdminReportsSort>;

export const Route = createFileRoute('/_app/admin/reported')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...AdminReportsSortSchema.safeParse(search).data,
    page: adminPageParam(search.page),
  }),
  component: ReportedSection,
});

function ReportedSection() {
  const {
    page = 1,
    sort = adminReportsDefaultSort.sort,
    direction = adminReportsDefaultSort.direction,
  } = Route.useSearch();
  const sorting = { sort, direction };
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const pageSearch = (target: number) => (prev: Search) => ({
    ...prev,
    page: adminPageParam(target),
  });

  const query = useQuery(
    api.admin.reports.list.queryOptions({
      input: {
        sorting,
        limit: ADMIN_PAGE_SIZE,
        offset: (page - 1) * ADMIN_PAGE_SIZE,
      },
    }),
  );
  const t = useTranslations('admin');
  const tReported = useTranslations('admin.reported');
  const format = useFormatter();
  const tStore = useTranslations('store');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const archive = useMutation({
    mutationFn: (report: ReportGroup) =>
      client.admin.reports.archive({
        gameId: report.gameId,
        target: report.store
          ? { store: report.store }
          : { source: report.source! },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: api.admin.key() });
      toast.success(t('games.archived'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('games.archiveFailed') })),
  });

  const target = (report: ReportGroup) =>
    report.store
      ? t('games.copyOf', { store: tStore(report.store) })
      : tReported('sourceData', { source: t(`source.${report.source!}`) });

  const columns: AdminColumn<ReportGroup>[] = [
    {
      key: 'report',
      header: tReported('report'),
      flex: 2,
      minWidth: 200,
      render: (report) => (
        <YStack flex={1} minW={0} gap={4}>
          <Text
            fontSize={14}
            lineHeight="20px"
            fontWeight="600"
            color="color12"
            style={{ overflowWrap: 'anywhere' }}
          >
            {report.name}
          </Text>
          <CellText muted>{target(report)}</CellText>
        </YStack>
      ),
    },
    {
      key: 'users',
      header: t('games.users'),
      width: 72,
      align: 'end',
      render: (report) => <CellText>{format.number(report.users)}</CellText>,
    },
    {
      key: 'suggested',
      header: tReported('suggestedFix'),
      flex: 2,
      minWidth: 210,
      render: (report) => {
        const suggestions = report.suggestions
          .map((suggestion) =>
            [
              suggestion.name,
              suggestion.igdbId ? `IGDB ${suggestion.igdbId}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          )
          .filter(Boolean);

        return (
          <YStack flex={1} minW={0} gap={4}>
            {suggestions.length > 0 ? (
              <CellText>{suggestions.join('; ')}</CellText>
            ) : (
              <CellText muted>{tReported('noSuggestion')}</CellText>
            )}
            {report.notes.length > 0 ? (
              <details>
                <summary className="w-fit cursor-pointer rounded-sm py-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                  {tReported('notes', { count: report.notes.length })}
                </summary>
                <YStack gap={4}>
                  {report.notes.map((note, index) => (
                    <CellText key={index} muted>
                      «{note}»
                    </CellText>
                  ))}
                </YStack>
              </details>
            ) : null}
          </YStack>
        );
      },
    },
    {
      key: 'actions',
      header: t('actions'),
      width: 172,
      align: 'end',
      render: (report) => (
        <>
          <ButtonLink
            href={`/admin/games/${report.slug}#reports`}
            role="link"
            size="sm"
            aria-label={tReported('openReport', {
              name: report.name,
              target: target(report),
            })}
          >
            <ArrowUpRight size={14} />
            {t('games.open')}
          </ButtonLink>
          <Button
            size="sm"
            variant="ghost"
            aria-label={tReported('archiveReport', {
              name: report.name,
              target: target(report),
            })}
            disabled={archive.isPending}
            onPress={() => archive.mutate(report)}
          >
            <Archive size={14} />
            {t('games.archive')}
          </Button>
        </>
      ),
    },
  ];

  return (
    <YStack gap={16}>
      <Text
        render="h2"
        fontSize={22}
        lineHeight="28px"
        fontFamily="heading"
        fontWeight="600"
      >
        {tReported('title')}
      </Text>
      {query.isError ? (
        <EmptyState title={tReported('failed')} />
      ) : page === 1 && query.data?.rows.length === 0 ? (
        <EmptyState title={t('games.emptyReports')} />
      ) : (
        <AdminTable
          label={t('games.reports')}
          columns={columns}
          rows={query.data?.rows.length ? query.data.rows : undefined}
          rowKey={(report) =>
            `${report.gameId}-${report.store ?? ''}-${report.source ?? ''}`
          }
          serverSort={{
            value: sorting,
            keys: AdminReportsSortSchema.shape.sort.options,
            onChange: (next) =>
              void navigate({
                search: (prev) => ({ ...prev, ...next, page: undefined }),
              }),
          }}
        />
      )}
      <AdminPagination
        page={page}
        total={query.isSuccess ? query.data.total : undefined}
        href={(target) =>
          router.buildLocation({
            from: Route.fullPath,
            to: Route.fullPath,
            search: pageSearch(target),
          }).href
        }
        onPageChange={(target, replace) =>
          void navigate({ search: pageSearch(target), replace })
        }
      />
    </YStack>
  );
}
