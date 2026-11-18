import type { PlatformMismatch } from '@repo/contracts';
import {
  Button,
  EmptyState,
  Skeleton,
  Tabs,
  TabsTab,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { ArrowUpRight, Check, Undo2 } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { GameCover } from '@/components/game-cover';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';
import { ButtonLink } from '@/src/components/button-link';

export function PlatformMismatches({
  dismissed,
  onDismissedChange,
}: {
  dismissed: boolean;
  onDismissedChange: (dismissed: boolean) => void;
}) {
  const t = useTranslations('admin.mismatches');

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
        value={dismissed ? 'accepted' : 'open'}
        onValueChange={(value) => onDismissedChange(value === 'accepted')}
      >
        <TabsTab value="open">{t('open')}</TabsTab>
        <TabsTab value="accepted">{t('dismissed')}</TabsTab>
      </Tabs>

      <MismatchTable dismissed={dismissed} />
    </YStack>
  );
}

function MismatchTable({ dismissed }: { dismissed: boolean }) {
  const t = useTranslations('admin.mismatches');
  const tAdmin = useTranslations('admin');
  const tGames = useTranslations('admin.games');
  const format = useFormatter();
  const tStore = useTranslations('store');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const query = useQuery(
    api.admin.platformMismatches.list.queryOptions({
      input: { dismissed, limit: 100 },
    }),
  );

  const toggle = useMutation({
    mutationFn: ({
      row,
      dismissed,
    }: {
      row: PlatformMismatch;
      dismissed: boolean;
    }) => {
      const input = {
        gameId: row.gameId,
        platformSlugs: [...new Set(row.copies.map((c) => c.platformSlug))],
      };
      return dismissed
        ? client.admin.platformMismatches.restore(input)
        : client.admin.platformMismatches.dismiss(input);
    },
    onSuccess: async (_result, { dismissed }) => {
      await queryClient.invalidateQueries({
        queryKey: api.admin.platformMismatches.key(),
      });
      toast.success(dismissed ? t('restored') : t('okDone'));
    },
    onError: (error, { dismissed }) =>
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
      minWidth: 200,
      render: (row) => (
        <XStack items="center" gap={8} flex={1} minW={0}>
          <GameCover imageId={row.coverImageId} name={row.name} width={24} />
          <YStack flex={1} minW={0}>
            <Text
              fontSize={14}
              lineHeight="20px"
              fontWeight="600"
              color="color12"
              style={{ overflowWrap: 'anywhere' }}
            >
              {row.name}
            </Text>
            {row.releaseYear ? (
              <CellText muted>{row.releaseYear}</CellText>
            ) : null}
          </YStack>
        </XStack>
      ),
    },
    {
      key: 'copies',
      header: t('copies'),
      flex: 2,
      minWidth: 180,
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
      minWidth: 160,
      render: (row) => (
        <CellText muted>
          {row.igdbPlatforms.join(', ') || t('noIgdbPlatforms')}
        </CellText>
      ),
    },
    {
      key: 'users',
      header: tGames('users'),
      width: 72,
      align: 'end',
      render: (row) => <CellText>{format.number(row.users)}</CellText>,
    },
    {
      key: 'actions',
      header: tAdmin('actions'),
      width: 238,
      align: 'end',
      render: (row) => (
        <>
          <ButtonLink
            href={`/admin/games/${row.slug}`}
            role="link"
            size="sm"
            aria-label={t('openGame', { name: row.name })}
          >
            <ArrowUpRight size={14} />
            {tGames('open')}
          </ButtonLink>
          <Button
            size="sm"
            variant={dismissed ? 'secondary' : 'ghost'}
            aria-label={t(dismissed ? 'restoreGame' : 'acceptGame', {
              name: row.name,
            })}
            disabled={toggle.isPending}
            onPress={() => toggle.mutate({ row, dismissed })}
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
  if (query.isError) return <EmptyState title={t('loadFailed')} />;

  if (query.data.rows.length === 0)
    return <EmptyState title={dismissed ? t('emptyDismissed') : t('empty')} />;

  return (
    <YStack gap={12}>
      <XStack items="baseline" justify="space-between" gap={8} flexWrap="wrap">
        {!dismissed ? (
          <Text fontSize={13} lineHeight="18px" color="color11">
            {t('hint')}
          </Text>
        ) : null}
        <Text fontSize={12} color="color11" role="status" ml="auto">
          {t('count', { count: query.data.total })}
        </Text>
      </XStack>
      <AdminTable
        label={dismissed ? t('dismissed') : t('open')}
        columns={columns}
        rows={query.data.rows}
        rowKey={(row) => row.gameId}
      />
    </YStack>
  );
}

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
