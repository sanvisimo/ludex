import type { UnresolvedImport } from '@repo/contracts';
import { EmptyState, Tabs, TabsTab, Text, YStack } from '@repo/ui';
import { CheckCheck, CircleHelp, Copy } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import {
  AccountFilters,
  matchesAccountFilter,
  readAccountFilter,
  type AccountFilter,
} from '@/components/account-filters';
import { PossibleDuplicates } from '@/components/possible-duplicates';
import { ResolveImportDialog } from '@/components/resolve-import-dialog';
import { UnresolvedImports } from '@/components/unresolved-imports';
import { api } from '@/lib/orpc';

type ToFixTab = 'unrecognised' | 'duplicates';

export const Route = createFileRoute('/_app/account/needs-attention')({
  // Nome, negozio e tab stanno nell'indirizzo, come i filtri del backlog. Un
  // tab che non esiste si ignora.
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: ToFixTab } & AccountFilter => ({
    ...readAccountFilter(search),
    tab:
      search.tab === 'unrecognised' || search.tab === 'duplicates'
        ? search.tab
        : undefined,
  }),
  component: ToFixSection,
});

/**
 * Da sistemare, in due tab: le voci **non riconosciute**, e i **possibili
 * doppioni** (9a), le voci che Epic mette nello stesso prodotto di un gioco già
 * importato. I tab ci sono solo se ci sono doppioni: senza, la sezione è quella
 * di prima.
 *
 * Senza un tab nell'indirizzo si apre il primo che ha qualcosa dentro, come in
 * Nascosti.
 */
function ToFixSection() {
  const t = useTranslations('account.toFixEmpty');
  const tUnresolved = useTranslations('account.unresolved');
  const tFilters = useTranslations('account.filters');
  const { tab: pickedTab, q, store } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [resolving, setResolving] = useState<UnresolvedImport | null>(null);
  const unresolved = useQuery(api.imports.unresolved.queryOptions());

  const all = unresolved.data ?? [];
  // Le voci arrivano tutte insieme — sono decine, non migliaia —, quindi i
  // filtri si applicano qui.
  const pending = all
    .filter((entry) => entry.hiddenKind === null)
    .filter((entry) => matchesAccountFilter(entry, { q, store }));
  const unrecognised = pending.filter((entry) => entry.sameProduct === null);
  const duplicates = pending.filter((entry) => entry.sameProduct !== null);

  const isEmpty =
    unresolved.data !== undefined &&
    all.every((entry) => entry.hiddenKind !== null);
  const noMatch = !isEmpty && pending.length === 0;
  const withTabs = duplicates.length > 0;
  const active: ToFixTab =
    pickedTab === 'duplicates' && duplicates.length > 0
      ? 'duplicates'
      : pickedTab === 'unrecognised' && unrecognised.length > 0
        ? 'unrecognised'
        : unrecognised.length > 0
          ? 'unrecognised'
          : 'duplicates';

  return (
    <>
      {isEmpty && (
        <EmptyState
          icon={<CheckCheck size={24} color="$color11" />}
          title={t('title')}
          description={t('description')}
        />
      )}

      {!isEmpty && (
        <AccountFilters
          filter={{ q, store }}
          onChange={(next) =>
            void navigate({
              search: (prev) => ({ ...prev, ...next }),
              replace: true,
            })
          }
        />
      )}
      {noMatch && <EmptyState title={tFilters('noMatch')} />}

      {pending.length > 0 && (
        <YStack gap={12}>
          <Text
            render="h2"
            fontFamily="$heading"
            fontSize={18}
            lineHeight={24}
            fontWeight="600"
            color="$color12"
          >
            {tUnresolved('title', { count: pending.length })}
          </Text>

          {withTabs && (
            <Tabs
              label={tUnresolved('tabsLabel')}
              value={active}
              onValueChange={(value) =>
                void navigate({
                  // Cambiare tab tiene i filtri.
                  search: (prev) => ({ ...prev, tab: value as ToFixTab }),
                })
              }
            >
              <TabsTab
                value="unrecognised"
                count={unrecognised.length}
                icon={CircleHelp}
              >
                {tUnresolved('tabs.unrecognised')}
              </TabsTab>
              <TabsTab value="duplicates" count={duplicates.length} icon={Copy}>
                {tUnresolved('tabs.duplicates')}
              </TabsTab>
            </Tabs>
          )}

          {active === 'unrecognised' ? (
            <UnresolvedImports
              entries={unrecognised}
              onResolve={setResolving}
            />
          ) : (
            <PossibleDuplicates entries={duplicates} onResolve={setResolving} />
          )}
        </YStack>
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
