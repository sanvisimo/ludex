import type { UnresolvedImport } from '@repo/contracts';
import { EmptyState } from '@repo/ui';
import { CheckCheck } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { ResolveImportDialog } from '@/components/resolve-import-dialog';
import { UnresolvedImports } from '@/components/unresolved-imports';
import { api } from '@/lib/orpc';

export const Route = createFileRoute('/_app/account/da-sistemare')({
  component: ToFixSection,
});

function ToFixSection() {
  const t = useTranslations('account.toFixEmpty');
  const [resolving, setResolving] = useState<UnresolvedImport | null>(null);
  const unresolved = useQuery(api.imports.unresolved.queryOptions());

  const entries = unresolved.data ?? [];
  const isEmpty =
    unresolved.data !== undefined &&
    entries.every((entry) => entry.hiddenKind !== null);

  return (
    <>
      {isEmpty && (
        <EmptyState
          icon={<CheckCheck size={24} color="$color11" />}
          title={t('title')}
          description={t('description')}
        />
      )}

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
