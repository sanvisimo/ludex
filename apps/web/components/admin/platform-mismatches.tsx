import type { PlatformMismatch } from '@repo/contracts';
import { Button, EmptyState, Skeleton, Text, toast, YStack } from '@repo/ui';
import { ArrowUpRight, Check, Undo2 } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { GameCover } from '@/components/game-cover';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';
import { ButtonLink } from '@/src/components/button-link';

/**
 * Le copie su una piattaforma dove IGDB dice che il gioco non è uscito (9b),
 * la sezione `/admin/platforms`: l'ultima spiaggia dopo la regola dell'import.
 * Copertina, titolo e «Apri» portano alla scheda admin del gioco, dove si
 * corregge con «Non è questo gioco»; «Va bene così» quando è IGDB a non avere
 * la piattaforma. I segnati si rivedono sotto, per annullarli.
 */
export function PlatformMismatches() {
  const t = useTranslations('admin.mismatches');
  const [showDismissed, setShowDismissed] = useState(false);

  return (
    <YStack gap={16}>
      <MismatchTable dismissed={false} />
      <YStack items="flex-start">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => setShowDismissed((open) => !open)}
        >
          {t('dismissed')}
        </Button>
      </YStack>
      {showDismissed ? <MismatchTable dismissed /> : null}
    </YStack>
  );
}

function MismatchTable({ dismissed }: { dismissed: boolean }) {
  const t = useTranslations('admin.mismatches');
  const tGames = useTranslations('admin.games');
  const tStore = useTranslations('store');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const query = useQuery(
    api.admin.platformMismatches.list.queryOptions({
      input: { dismissed, limit: 100 },
    }),
  );

  const toggle = useMutation({
    mutationFn: (row: PlatformMismatch) => {
      const input = {
        gameId: row.gameId,
        platformSlugs: [...new Set(row.copies.map((c) => c.platformSlug))],
      };
      return dismissed
        ? client.admin.platformMismatches.restore(input)
        : client.admin.platformMismatches.dismiss(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: api.admin.platformMismatches.key(),
      });
      toast.success(dismissed ? t('restored') : t('okDone'));
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, {
          fallback: dismissed ? t('restoreFailed') : t('okFailed'),
        }),
      ),
  });

  const columns: AdminColumn<PlatformMismatch>[] = [
    {
      key: 'game',
      header: tGames('game'),
      flex: 2,
      render: (row) => (
        <Link
          to="/admin/games/$slug"
          params={{ slug: row.slug }}
          style={{
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <GameCover imageId={row.coverImageId} name={row.name} width={24} />
          <YStack flex={1} minW={0}>
            <CellText>
              {row.releaseYear ? `${row.name} · ${row.releaseYear}` : row.name}
            </CellText>
          </YStack>
        </Link>
      ),
    },
    {
      key: 'copies',
      header: t('copies'),
      flex: 2,
      render: (row) => (
        <YStack flex={1} minW={0}>
          {copiesByStore(row).map(([store, platforms]) => (
            <CellText key={store}>
              {`${tStore(store)} · ${platforms.join(', ')}`}
            </CellText>
          ))}
        </YStack>
      ),
    },
    {
      key: 'igdb',
      header: t('igdb'),
      flex: 2,
      render: (row) => (
        <CellText muted>{row.igdbPlatforms.join(', ')}</CellText>
      ),
    },
    {
      key: 'users',
      header: tGames('users'),
      width: 56,
      render: (row) => <CellText>{row.users}</CellText>,
    },
    {
      key: 'actions',
      header: '',
      width: 230,
      render: (row) => (
        <>
          <ButtonLink href={`/admin/games/${row.slug}`} size="sm">
            <ArrowUpRight size={14} />
            {tGames('open')}
          </ButtonLink>
          <Button
            size="sm"
            variant="outline"
            disabled={toggle.isPending}
            onPress={() => toggle.mutate(row)}
          >
            {dismissed ? <Undo2 size={14} /> : <Check size={14} />}
            {dismissed ? t('restore') : t('ok')}
          </Button>
        </>
      ),
    },
  ];

  if (query.isPending)
    return <Skeleton height={160} width="100%" rounded={12} />;
  if (query.isError) return <EmptyState title={tGames('failed')} />;

  return (
    <YStack gap={12}>
      {dismissed ? null : (
        <Text render="h2" fontSize={18} lineHeight={24} fontWeight="600">
          {t('title', { count: query.data.total })}
        </Text>
      )}
      {query.data.rows.length === 0 ? (
        <EmptyState title={dismissed ? t('emptyDismissed') : t('empty')} />
      ) : (
        <AdminTable
          label={
            dismissed ? t('dismissed') : t('title', { count: query.data.total })
          }
          columns={columns}
          rows={query.data.rows}
          rowKey={(row) => row.gameId}
        />
      )}
    </YStack>
  );
}

/** Le copie per negozio: «PSN · PS4, PS5». */
function copiesByStore(row: PlatformMismatch) {
  const byStore = new Map<
    PlatformMismatch['copies'][number]['store'],
    string[]
  >();
  for (const copia of row.copies) {
    byStore.set(copia.store, [
      ...(byStore.get(copia.store) ?? []),
      copia.platformName,
    ]);
  }
  return [...byStore];
}
