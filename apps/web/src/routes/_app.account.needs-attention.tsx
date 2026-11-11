import type { UnresolvedImport } from '@repo/contracts';
import { EmptyState, Skeleton, Tabs, TabsTab, YStack } from '@repo/ui';
import { CheckCheck, CircleHelp, Copy } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  AccountFilters,
  readAccountFilter,
  type AccountFilter,
} from '@/components/account-filters';
import {
  AccountListError,
  AccountListFooter,
  AccountSectionHeader,
  ACCOUNT_PAGE_SIZE,
  readAccountPage,
  readAccountPageSize,
} from '@/components/account-section';
import { PossibleDuplicates } from '@/components/possible-duplicates';
import { ResolveImportDialog } from '@/components/resolve-import-dialog';
import { UnresolvedImports } from '@/components/unresolved-imports';
import { api } from '@/lib/orpc';

type ToFixTab = 'unrecognised' | 'duplicates';
export const Route = createFileRoute('/_app/account/needs-attention')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: ToFixTab; page?: number; size?: number } & AccountFilter => ({
    ...readAccountFilter(search),
    page: readAccountPage(search.page),
    size: readAccountPageSize(search.size),
    tab:
      search.tab === 'unrecognised' || search.tab === 'duplicates'
        ? search.tab
        : undefined,
  }),
  component: ToFixSection,
});
function ToFixSection() {
  const t = useTranslations('account.toFixEmpty');
  const tUnresolved = useTranslations('account.unresolved');
  const tFilters = useTranslations('account.filters');
  const tReview = useTranslations('account.review');
  const search = Route.useSearch();
  const { tab, q, store, page = 1, size = ACCOUNT_PAGE_SIZE } = search;
  const navigate = useNavigate({ from: Route.fullPath });
  const [resolving, setResolving] = useState<UnresolvedImport | null>(null);
  const query = useQuery(
    api.imports.reviewPage.queryOptions({
      input: { tab, q, store, page, limit: size },
      // Su un altro tab le voci di prima si disegnerebbero col componente sbagliato.
      placeholderData: (previous) =>
        tab === undefined || previous?.tab === tab ? previous : undefined,
    }),
  );
  const data = query.data;
  useEffect(() => {
    // Con i dati di prima `data.page` è la pagina vecchia: riporterebbe lì l'URL.
    if (data && !query.isPlaceholderData && data.page !== page)
      void navigate({
        search: (prev) => ({
          ...prev,
          page: data.page === 1 ? undefined : data.page,
        }),
        replace: true,
      });
  }, [data, query.isPlaceholderData, page, navigate]);
  const active = data?.tab ?? tab ?? 'unrecognised';
  const count = data
    ? data.counts.unrecognised + data.counts.duplicates
    : undefined;
  return (
    <>
      <AccountSectionHeader
        title={tReview('attentionTitle')}
        description={tReview('attentionDescription')}
        count={count}
      />
      <AccountFilters
        filter={{ q, store }}
        onChange={(next) =>
          void navigate({
            search: (prev) => ({ ...prev, ...next, page: undefined }),
            replace: true,
          })
        }
      />
      <Tabs
        label={tUnresolved('tabsLabel')}
        value={active}
        onValueChange={(value) =>
          void navigate({
            search: (prev) => ({
              ...prev,
              tab: value as ToFixTab,
              page: undefined,
            }),
          })
        }
      >
        <TabsTab
          value="unrecognised"
          count={data?.counts.unrecognised}
          icon={CircleHelp}
        >
          {tUnresolved('tabs.unrecognised')}
        </TabsTab>
        <TabsTab value="duplicates" count={data?.counts.duplicates} icon={Copy}>
          {tUnresolved('tabs.duplicates')}
        </TabsTab>
      </Tabs>
      {query.isPending ? (
        <Skeleton height={160} width="100%" rounded={12} />
      ) : query.isError ? (
        <AccountListError retry={() => void query.refetch()} />
      ) : (
        data && (
          <YStack gap={20}>
            {data.total === 0 ? (
              <EmptyState
                icon={<CheckCheck size={24} color="$color11" />}
                title={q || store ? tFilters('noMatch') : t('title')}
                description={q || store ? undefined : t('description')}
              />
            ) : active === 'unrecognised' ? (
              <UnresolvedImports
                entries={data.entries}
                onResolve={setResolving}
              />
            ) : (
              <PossibleDuplicates
                entries={data.entries}
                onResolve={setResolving}
              />
            )}
            <AccountListFooter
              groups={active === 'duplicates'}
              pageSize={size}
              onPageSizeChange={(next) =>
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    size: next === ACCOUNT_PAGE_SIZE ? undefined : next,
                    page: undefined,
                  }),
                  replace: true,
                })
              }
              page={data.page}
              total={data.total}
              path="/account/needs-attention"
              search={search}
              onPage={(next) =>
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    tab: active,
                    page: next === 1 ? undefined : next,
                  }),
                })
              }
            />
          </YStack>
        )
      )}
      <ResolveImportDialog
        entry={resolving}
        onOpenChange={(open) => {
          if (!open) setResolving(null);
        }}
      />
    </>
  );
}
