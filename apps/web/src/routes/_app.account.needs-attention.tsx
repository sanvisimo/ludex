import type { UnresolvedImport } from '@repo/contracts';
import { EmptyState } from '@repo/ui';
import { CheckCheck } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import {
  AccountFilters,
  matchesAccountFilter,
  readAccountFilter,
} from '@/components/account-filters';
import { ResolveImportDialog } from '@/components/resolve-import-dialog';
import { UnresolvedImports } from '@/components/unresolved-imports';
import { api } from '@/lib/orpc';

export const Route = createFileRoute('/_app/account/needs-attention')({
  // Nome e negozio stanno nell'indirizzo, come i filtri del backlog.
  validateSearch: readAccountFilter,
  component: ToFixSection,
});

function ToFixSection() {
  const t = useTranslations('account.toFixEmpty');
  const tFilters = useTranslations('account.filters');
  const filter = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [resolving, setResolving] = useState<UnresolvedImport | null>(null);
  const unresolved = useQuery(api.imports.unresolved.queryOptions());

  const all = unresolved.data ?? [];
  // Le voci arrivano tutte insieme — sono decine, non migliaia —, quindi i
  // filtri si applicano qui.
  const entries = all.filter((entry) => matchesAccountFilter(entry, filter));
  const isEmpty =
    unresolved.data !== undefined &&
    all.every((entry) => entry.hiddenKind !== null);
  const noMatch =
    !isEmpty && entries.every((entry) => entry.hiddenKind !== null);

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
          filter={filter}
          onChange={(next) => void navigate({ search: next, replace: true })}
        />
      )}
      {noMatch && <EmptyState title={tFilters('noMatch')} />}

      <UnresolvedImports entries={entries} onResolve={setResolving} />

      <ResolveImportDialog
        entry={resolving}
        onOpenChange={(open) => {
          if (!open) setResolving(null);
        }}
      />
    </>
  );
}
