import type { AdminUsage } from '@repo/contracts';
import { EmptyState, Skeleton, Text, XStack, YStack } from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { DayBars } from '@/components/admin/day-bars';
import { api } from '@/lib/orpc';

export const Route = createFileRoute('/_app/admin/usage')({
  component: UsageSection,
});

type Library = AdminUsage['libraries'][number];
type TopGame = AdminUsage['games']['top'][number];
type QueueRow = NonNullable<AdminUsage['queues']>[number];
type ApiRow = NonNullable<AdminUsage['apis']>[number];
type Outcome = AdminUsage['outcomes'][number];

/**
 * Uso (plans/admin-uso.md): chi usa Ludex, cosa entra nel catalogo, e come
 * stanno code e fonti esterne. Solo letture, dal database e da Redis; le
 * visite di chi non ha un account stanno su Cloudflare, non qui.
 */
function UsageSection() {
  const t = useTranslations('admin.usage');
  const usage = useQuery(api.admin.usage.get.queryOptions());

  return (
    <YStack gap={32}>
      <YStack gap={4}>
        <Text render="h2" fontSize={18} lineHeight={24} fontWeight="600">
          {t('title')}
        </Text>
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('intro')}
        </Text>
      </YStack>

      {usage.isPending ? (
        <Skeleton height={400} width="100%" rounded={12} />
      ) : usage.isError ? (
        <EmptyState title={t('loadFailed')} />
      ) : (
        <>
          <UsersBlock usage={usage.data} />
          <GamesBlock usage={usage.data} />
          <ApisBlock usage={usage.data} />
        </>
      )}
    </YStack>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack render="section" gap={16}>
      <Text render="h3" fontSize={16} lineHeight={22} fontWeight="600">
        {title}
      </Text>
      {children}
    </YStack>
  );
}

/** I numeri in testa a un blocco: quattro riquadri che vanno a capo. */
function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <XStack gap={12} flexWrap="wrap">
      {items.map((item) => (
        <YStack
          key={item.label}
          grow={1}
          minW={160}
          flexBasis={160}
          gap={4}
          p={16}
          rounded={12}
          borderWidth={1}
          borderColor="$borderColor"
        >
          <Text fontSize={12} lineHeight={16} color="$color11">
            {item.label}
          </Text>
          <Text fontSize={26} lineHeight={32} fontWeight="600">
            {item.value}
          </Text>
        </YStack>
      ))}
    </XStack>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <Text fontSize={12} lineHeight={16} color="$color11">
      {children}
    </Text>
  );
}

function UsersBlock({ usage }: { usage: AdminUsage }) {
  const t = useTranslations('admin.usage');
  const tStore = useTranslations('store');
  const format = useFormatter();
  const n = (value: number) => format.number(value);
  const { users } = usage;

  const columns: AdminColumn<Library>[] = [
    {
      key: 'store',
      header: t('store'),
      flex: 1,
      minWidth: 120,
      render: (row) => <CellText>{tStore(row.store)}</CellText>,
    },
    {
      key: 'accounts',
      header: t('accounts'),
      width: 80,
      render: (row) => <CellText>{n(row.accounts)}</CellText>,
    },
    {
      key: 'imported',
      header: t('imported'),
      width: 170,
      render: (row) => <CellText>{n(row.imported)}</CellText>,
    },
    {
      key: 'synced7',
      header: t('synced7'),
      width: 150,
      render: (row) => <CellText>{n(row.synced7)}</CellText>,
    },
    {
      key: 'needsReauth',
      header: t('needsReauth'),
      width: 120,
      render: (row) => <CellText>{n(row.needsReauth)}</CellText>,
    },
  ];

  return (
    <Block title={t('users')}>
      <Stats
        items={[
          { label: t('registered'), value: n(users.total) },
          { label: t('new7'), value: n(users.new7) },
          { label: t('active7'), value: n(users.active7) },
          { label: t('active30'), value: n(users.active30) },
        ]}
      />
      <Note>{t('activeHint')}</Note>
      <DayBars
        title={t('signups')}
        data={users.signups}
        valueLabel={(count) => t('signupsCount', { count })}
      />
      <Text fontSize={14} lineHeight={20} fontWeight="600">
        {t('libraries')}
      </Text>
      {usage.libraries.length === 0 ? (
        <Note>{t('noLibraries')}</Note>
      ) : (
        <AdminTable
          label={t('libraries')}
          columns={columns}
          rows={usage.libraries}
          rowKey={(row) => row.store}
        />
      )}
    </Block>
  );
}

function GamesBlock({ usage }: { usage: AdminUsage }) {
  const t = useTranslations('admin.usage');
  const format = useFormatter();
  const n = (value: number) => format.number(value);
  const { games } = usage;
  const resolved =
    games.total === 0
      ? '—'
      : format.number(games.resolved / games.total, {
          style: 'percent',
          maximumFractionDigits: 0,
        });

  const columns: AdminColumn<TopGame>[] = [
    {
      key: 'rank',
      header: '#',
      width: 32,
      render: (row) => <CellText muted>{games.top.indexOf(row) + 1}</CellText>,
    },
    {
      key: 'name',
      header: t('game'),
      flex: 1,
      minWidth: 200,
      render: (row) => (
        <Link to="/admin/games/$slug" params={{ slug: row.slug }}>
          <CellText>{row.name}</CellText>
        </Link>
      ),
    },
    {
      key: 'users',
      header: t('gameUsers'),
      width: 80,
      render: (row) => <CellText>{n(row.users)}</CellText>,
    },
  ];

  return (
    <Block title={t('games')}>
      <Stats
        items={[
          { label: t('catalog'), value: n(games.total) },
          { label: t('new7'), value: n(games.new7) },
          { label: t('resolved'), value: resolved },
          { label: t('inLibraries'), value: n(games.inLibraries) },
        ]}
      />
      <DayBars
        title={t('added')}
        data={games.added}
        valueLabel={(count) => t('addedCount', { count })}
      />
      <Text fontSize={14} lineHeight={20} fontWeight="600">
        {t('top')}
      </Text>
      {games.top.length === 0 ? (
        <Note>{t('noGames')}</Note>
      ) : (
        <AdminTable
          label={t('top')}
          columns={columns}
          rows={games.top}
          rowKey={(row) => row.id}
        />
      )}
      <Note>
        {t.rich('missingLink', {
          link: (chunks) => (
            <Link
              to="/admin/missing"
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              {chunks}
            </Link>
          ),
        })}
      </Note>
    </Block>
  );
}

function ApisBlock({ usage }: { usage: AdminUsage }) {
  const t = useTranslations('admin.usage');
  const tSource = useTranslations('admin.source');
  const format = useFormatter();
  const n = (value: number) => format.number(value);

  const queueColumns: AdminColumn<QueueRow>[] = [
    {
      key: 'name',
      header: t('queue'),
      flex: 1,
      minWidth: 120,
      render: (row) => <CellText>{row.name}</CellText>,
    },
    ...(['waiting', 'active', 'delayed', 'failed', 'completed'] as const).map(
      (key): AdminColumn<QueueRow> => ({
        key,
        header: t(key),
        width: 96,
        render: (row) => <CellText>{n(row[key])}</CellText>,
      }),
    ),
  ];

  const apiColumns: AdminColumn<ApiRow>[] = [
    {
      key: 'source',
      header: t('source'),
      width: 130,
      render: (row) => <CellText>{t(`apiName.${row.source}`)}</CellText>,
    },
    {
      key: 'limit',
      header: t('limit'),
      flex: 1,
      minWidth: 200,
      render: (row) => <CellText muted>{t(`limits.${row.source}`)}</CellText>,
    },
    {
      key: 'today',
      header: t('today'),
      width: 72,
      render: (row) => <CellText>{n(row.today)}</CellText>,
    },
    {
      key: 'calls7',
      header: t('calls7'),
      width: 96,
      render: (row) => <CellText>{n(row.calls7)}</CellText>,
    },
    {
      key: 'rejected7',
      header: t('rejected7'),
      width: 72,
      render: (row) => <CellText>{n(row.rejected7)}</CellText>,
    },
  ];

  const outcomeColumns: AdminColumn<Outcome>[] = [
    {
      key: 'source',
      header: t('source'),
      flex: 1,
      minWidth: 130,
      render: (row) => <CellText>{tSource(row.source)}</CellText>,
    },
    {
      key: 'ok',
      header: t('ok'),
      width: 96,
      render: (row) => <CellText>{n(row.ok)}</CellText>,
    },
    {
      key: 'failed',
      header: t('failed'),
      width: 96,
      render: (row) => <CellText>{n(row.failed)}</CellText>,
    },
    {
      key: 'notFound',
      header: t('notFound'),
      width: 96,
      render: (row) => <CellText>{n(row.notFound)}</CellText>,
    },
  ];

  return (
    <Block title={t('apis')}>
      <Text fontSize={14} lineHeight={20} fontWeight="600">
        {t('queues')}
      </Text>
      {usage.queues ? (
        <AdminTable
          label={t('queues')}
          columns={queueColumns}
          rows={usage.queues}
          rowKey={(row) => row.name}
        />
      ) : (
        <Note>{t('redisDown')}</Note>
      )}

      <Text fontSize={14} lineHeight={20} fontWeight="600">
        {t('calls')}
      </Text>
      {usage.apis ? (
        <>
          <AdminTable
            label={t('calls')}
            columns={apiColumns}
            rows={usage.apis}
            rowKey={(row) => row.source}
          />
          <Note>{t('callsNote')}</Note>
        </>
      ) : (
        <Note>{t('redisDown')}</Note>
      )}

      <Text fontSize={14} lineHeight={20} fontWeight="600">
        {t('outcomes')}
      </Text>
      <AdminTable
        label={t('outcomes')}
        columns={outcomeColumns}
        rows={usage.outcomes}
        rowKey={(row) => row.source}
      />
      <Note>{t('outcomesNote')}</Note>
    </Block>
  );
}
