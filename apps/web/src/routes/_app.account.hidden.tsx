import type { HiddenKind, UnresolvedImport } from '@repo/contracts';
import { hiddenKindValues } from '@repo/contracts';
import { EmptyState, Skeleton, Tabs, TabsTab, Text, YStack } from '@repo/ui';
import { EyeOff } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
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
import { HiddenList } from '@/components/hidden-list';
import { ResolveImportDialog } from '@/components/resolve-import-dialog';
import { HIDDEN_KIND_ICON } from '@/lib/hidden-kind-icons';
import { api } from '@/lib/orpc';

export const Route = createFileRoute('/_app/account/hidden')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { kind?: HiddenKind; page?: number; size?: number } & AccountFilter => ({
    ...readAccountFilter(search),
    page: readAccountPage(search.page),
    size: readAccountPageSize(search.size),
    kind: hiddenKindValues.includes(search.kind as HiddenKind)
      ? (search.kind as HiddenKind)
      : undefined,
  }),
  component: HiddenSection,
});
function HiddenSection() {
  const t = useTranslations('account.hiddenTab');
  const tUnresolved = useTranslations('account.unresolved');
  const tEmpty = useTranslations('account.hiddenEmpty');
  const tEntries = useTranslations('account.hiddenEntries');
  const tFilters = useTranslations('account.filters');
  const tReview = useTranslations('account.review');
  const search = Route.useSearch();
  const { kind, q, store, page = 1, size = ACCOUNT_PAGE_SIZE } = search;
  const navigate = Route.useNavigate();
  const [resolving, setResolving] = useState<UnresolvedImport | null>(null);
  const query = useQuery(
    api.imports.hiddenPage.queryOptions({
      input: { kind, q, store, page, limit: size },
      // Su un altro tab le voci di prima non c'entrano.
      placeholderData: (previous) =>
        kind === undefined || previous?.kind === kind ? previous : undefined,
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
  const active = data?.kind ?? kind ?? 'app';
  const count = data
    ? Object.values(data.counts).reduce((sum, n) => sum + n, 0)
    : undefined;
  return (
    <>
      <AccountSectionHeader
        title={tReview('hiddenTitle')}
        description={tReview('hiddenDescription')}
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
        label={t('label')}
        value={active}
        onValueChange={(value) =>
          void navigate({
            search: (prev) => ({
              ...prev,
              kind: value as HiddenKind,
              page: undefined,
            }),
          })
        }
      >
        {hiddenKindValues.map((value) => (
          <TabsTab
            key={value}
            value={value}
            count={data?.counts[value]}
            icon={HIDDEN_KIND_ICON[value]}
          >
            {t(`tabs.${value}`)}
          </TabsTab>
        ))}
      </Tabs>
      {query.isPending ? (
        <Skeleton height={160} width="100%" rounded={12} />
      ) : query.isError ? (
        <AccountListError retry={() => void query.refetch()} />
      ) : (
        data && (
          <YStack gap={20}>
            <Text fontSize={14} lineHeight={21} color="$color11">
              {active === 'unwanted'
                ? `${tEntries('description')} ${t('unwantedHint')}`
                : tUnresolved('hiddenHint')}
            </Text>
            {data.total === 0 ? (
              <EmptyState
                icon={<EyeOff size={24} color="$color11" />}
                title={q || store ? tFilters('noMatch') : tEmpty('title')}
                description={q || store ? undefined : tEmpty('description')}
              />
            ) : (
              <HiddenList items={data.items} onResolve={setResolving} />
            )}
            <AccountListFooter
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
              path="/account/hidden"
              search={search}
              onPage={(next) =>
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    kind: active,
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
