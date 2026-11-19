import {
  AdminUnlinkedSortSchema,
  type AdminUnlinkedSort,
  type IgdbSearchHit,
  type MergeGame,
} from '@repo/contracts';
import { Button, EmptyState, toast, YStack } from '@repo/ui';
import { Link2 } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import {
  ADMIN_PAGE_SIZE,
  AdminPagination,
  type AdminPageNavigation,
} from '@/components/admin/admin-pagination';
import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { IgdbPickDialog } from '@/components/admin/igdb-pick-dialog';
import { MergeDialog } from '@/components/admin/merge-dialog';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

type Unlinked = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  users: number;
};

export function UnlinkedGames({
  q,
  sorting,
  onSortChange,
  paging,
}: {
  q?: string;
  sorting: AdminUnlinkedSort;
  onSortChange: (sort: AdminUnlinkedSort) => void;
  paging: AdminPageNavigation;
}) {
  const query = useQuery(
    api.admin.games.unlinked.queryOptions({
      input: {
        q,
        sorting,
        limit: ADMIN_PAGE_SIZE,
        offset: (paging.page - 1) * ADMIN_PAGE_SIZE,
      },
    }),
  );
  const t = useTranslations('admin.games');
  const format = useFormatter();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState<Unlinked | null>(null);
  const [merging, setMerging] = useState<{
    game: Unlinked;
    other: MergeGame;
  } | null>(null);

  const link = useMutation({
    mutationFn: ({ game, hit }: { game: Unlinked; hit: IgdbSearchHit }) =>
      client.admin.games.linkIgdb({ gameId: game.id, igdbId: hit.igdbId }),
    onSuccess: async (result, { game }) => {
      if (result.status === 'taken') {
        setLinking(null);
        setMerging({ game, other: result.game });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: api.admin.key() });
      toast.success(t('linked'));
      setLinking(null);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('linkFailed') })),
  });

  const columns: AdminColumn<Unlinked>[] = [
    {
      key: 'game',
      header: t('game'),
      flex: 2,
      render: (game) => (
        <YStack flex={1} minW={0}>
          <Link to="/admin/games/$slug" params={{ slug: game.slug }}>
            <CellText>{game.name}</CellText>
          </Link>
        </YStack>
      ),
    },
    {
      key: 'users',
      header: t('users'),
      width: 56,
      render: (game) => <CellText>{game.users}</CellText>,
    },
    {
      key: 'added',
      header: t('added'),
      width: 110,
      render: (game) => (
        <CellText muted>
          {format.dateTime(game.createdAt, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </CellText>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 140,
      render: (game) => (
        <Button size="sm" variant="outline" onPress={() => setLinking(game)}>
          <Link2 size={14} />
          {t('linkIgdb')}
        </Button>
      ),
    },
  ];

  if (query.isError) return <EmptyState title={t('failed')} />;
  return (
    <>
      {paging.page === 1 && query.data?.rows.length === 0 ? (
        <EmptyState title={t('emptyUnlinked')} />
      ) : (
        <AdminTable
          label={t('unlinked')}
          columns={columns}
          rows={query.data?.rows.length ? query.data.rows : undefined}
          rowKey={(game) => game.id}
          serverSort={{
            value: sorting,
            keys: AdminUnlinkedSortSchema.shape.sort.options,
            onChange: onSortChange,
          }}
        />
      )}
      <AdminPagination {...paging} total={query.data?.total} />
      <IgdbPickDialog
        open={linking !== null}
        onOpenChange={(open) => {
          if (!open) setLinking(null);
        }}
        title={linking ? t('linkIgdbTitle', { name: linking.name }) : ''}
        initialQuery={linking?.name ?? ''}
        pending={link.isPending}
        onPick={(hit) => linking && link.mutate({ game: linking, hit })}
      />
      {merging ? (
        <MergeDialog
          open
          game={merging.game}
          other={merging.other}
          onOpenChange={(open) => {
            if (!open) setMerging(null);
          }}
          onDone={() =>
            queryClient.invalidateQueries({ queryKey: api.admin.key() })
          }
        />
      ) : null}
    </>
  );
}
