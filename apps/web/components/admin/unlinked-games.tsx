import type { IgdbSearchHit } from '@repo/contracts';
import { Button, EmptyState, Skeleton, toast, YStack } from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { IgdbPickDialog } from '@/components/admin/igdb-pick-dialog';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

type Unlinked = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  users: number;
};

/**
 * I giochi senza id IGDB, con «Collega a IGDB» (11a). Stanno nella tab IGDB di
 * «Dati mancanti»: un gioco che IGDB non conosce è un dato mancante come un
 * voto che non arriva.
 */
export function UnlinkedGames({ q }: { q?: string }) {
  const query = useQuery(
    api.admin.games.unlinked.queryOptions({ input: { q, limit: 100 } }),
  );
  const t = useTranslations('admin.games');
  const format = useFormatter();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState<Unlinked | null>(null);

  const link = useMutation({
    mutationFn: ({ game, hit }: { game: Unlinked; hit: IgdbSearchHit }) =>
      client.admin.games.linkIgdb({ gameId: game.id, igdbId: hit.igdbId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: api.admin.key() });
      toast.success(t('linked'));
      setLinking(null);
    },
    onError: (error) =>
      toast.error(
        hasErrorCode(error, 'CONFLICT')
          ? t('taken')
          : errorMessage(error, { fallback: t('linkFailed') }),
      ),
  });

  const columns: AdminColumn<Unlinked>[] = [
    {
      key: 'game',
      header: t('game'),
      flex: 2,
      render: (game) => (
        <YStack flex={1} minW={0}>
          <Link to="/admin/giochi/$slug" params={{ slug: game.slug }}>
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
          {t('linkIgdb')}
        </Button>
      ),
    },
  ];

  if (query.isPending)
    return <Skeleton height={160} width="100%" rounded={12} />;
  if (query.isError) return <EmptyState title={t('failed')} />;
  return (
    <>
      {query.data.rows.length === 0 ? (
        <EmptyState title={t('emptyUnlinked')} />
      ) : (
        <AdminTable
          label={t('unlinked')}
          columns={columns}
          rows={query.data.rows}
          rowKey={(game) => game.id}
        />
      )}
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
    </>
  );
}
