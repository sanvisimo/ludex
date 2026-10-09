import type { ReportGroup } from '@repo/contracts';
import { Button, EmptyState, Skeleton, Text, toast, YStack } from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

export const Route = createFileRoute('/_app/admin/reported')({
  component: ReportedSection,
});

/**
 * Le segnalazioni degli utenti (11a): una riga per gioco e cosa segnalata.
 * «Apri» porta alla scheda admin del gioco, dove si corregge; «Archivia»
 * chiude senza correggere.
 */
function ReportedSection() {
  const t = useTranslations('admin.reported');
  return (
    <YStack gap={16}>
      <Text render="h2" fontSize={18} lineHeight={24} fontWeight="600">
        {t('title')}
      </Text>
      <ReportList />
    </YStack>
  );
}

function ReportList() {
  const query = useQuery(
    api.admin.reports.list.queryOptions({ input: { limit: 100 } }),
  );
  const t = useTranslations('admin');
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

  const columns: AdminColumn<ReportGroup>[] = [
    {
      key: 'game',
      header: t('games.game'),
      flex: 2,
      render: (report) => (
        <YStack flex={1} minW={0}>
          <Link to="/admin/games/$slug" params={{ slug: report.slug }}>
            <CellText>{report.name}</CellText>
          </Link>
        </YStack>
      ),
    },
    {
      key: 'what',
      header: t('games.what'),
      width: 150,
      render: (report) => (
        <CellText>
          {report.store
            ? t('games.copyOf', { store: tStore(report.store) })
            : t(`source.${report.source!}`)}
        </CellText>
      ),
    },
    {
      key: 'users',
      header: t('games.users'),
      width: 56,
      render: (report) => <CellText>{report.users}</CellText>,
    },
    {
      key: 'suggested',
      header: t('games.suggested'),
      flex: 2,
      render: (report) => (
        <YStack flex={1} minW={0}>
          <CellText muted>
            {report.suggestions
              .map((s) =>
                [s.name, s.igdbId ? `IGDB ${s.igdbId}` : null]
                  .filter(Boolean)
                  .join(' · '),
              )
              .join('; ') || '—'}
          </CellText>
          {report.notes[0] ? (
            <CellText muted>«{report.notes[0]}»</CellText>
          ) : null}
        </YStack>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 170,
      render: (report) => (
        <>
          <Link to="/admin/games/$slug" params={{ slug: report.slug }}>
            <Text fontSize={13} textDecorationLine="underline">
              {t('games.open')}
            </Text>
          </Link>
          <Button
            size="sm"
            variant="outline"
            disabled={archive.isPending}
            onPress={() => archive.mutate(report)}
          >
            {t('games.archive')}
          </Button>
        </>
      ),
    },
  ];

  if (query.isPending)
    return <Skeleton height={160} width="100%" rounded={12} />;
  if (query.isError) return <EmptyState title={t('games.failed')} />;
  if (query.data.rows.length === 0)
    return <EmptyState title={t('games.emptyReports')} />;
  return (
    <AdminTable
      label={t('games.reports')}
      columns={columns}
      rows={query.data.rows}
      rowKey={(report) =>
        `${report.gameId}-${report.store ?? ''}-${report.source ?? ''}`
      }
    />
  );
}
