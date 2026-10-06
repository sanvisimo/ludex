import type { HiddenKind, UnresolvedImport } from '@repo/contracts';
import { hiddenKindValues } from '@repo/contracts';
import { EmptyState, Skeleton, Tabs, TabsTab, Text, YStack } from '@repo/ui';
import { EyeOff } from '@repo/ui/icons';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';

import {
  AccountFilters,
  readAccountFilter,
  type AccountFilter,
} from '@/components/account-filters';
import { HiddenList, useHiddenItems } from '@/components/hidden-list';
import { ResolveImportDialog } from '@/components/resolve-import-dialog';

const isHiddenKind = (value: unknown): value is HiddenKind =>
  (hiddenKindValues as readonly unknown[]).includes(value);

export const Route = createFileRoute('/_app/account/nascosti')({
  // Il tab sta nell'indirizzo, come i filtri del backlog: «indietro» torna al
  // tab di prima e un link riapre quello giusto. Un valore che non è un tipo
  // si ignora.
  validateSearch: (
    search: Record<string, unknown>,
  ): { tipo?: HiddenKind } & AccountFilter => ({
    ...readAccountFilter(search),
    tipo: isHiddenKind(search.tipo) ? search.tipo : undefined,
  }),
  component: HiddenSection,
});

/**
 * Ciò che hai tolto dalla vista, a tab per tipo: app, DLC, contenuto extra,
 * versione di prova e «non interessato».
 *
 * Senza un tab nell'indirizzo si apre il primo che ha qualcosa dentro: arrivare
 * su un elenco vuoto, con quattro tab con un numero accanto, sarebbe un giro a
 * vuoto.
 */
function HiddenSection() {
  const t = useTranslations('account.hiddenTab');
  const tUnresolved = useTranslations('account.unresolved');
  const tEmpty = useTranslations('account.hiddenEmpty');
  const tEntries = useTranslations('account.hiddenEntries');
  const tFilters = useTranslations('account.filters');
  const { tipo, q, negozio } = Route.useSearch();
  const navigate = Route.useNavigate();
  const filter = useMemo(() => ({ q, negozio }), [q, negozio]);
  const filtered = q !== undefined || negozio !== undefined;
  const [resolving, setResolving] = useState<UnresolvedImport | null>(null);

  const { isPending, counts, byKind, gamesTotal, gamesShown } =
    useHiddenItems(filter);

  const total = hiddenKindValues.reduce(
    (sum, kind) => sum + (counts[kind] ?? 0),
    0,
  );
  const active: HiddenKind =
    tipo ?? hiddenKindValues.find((kind) => (counts[kind] ?? 0) > 0) ?? 'app';

  return (
    <>
      {isPending ? (
        <YStack gap={12}>
          <Skeleton height={32} width="100%" rounded={8} />
          <Skeleton height={96} width="100%" rounded={12} />
        </YStack>
      ) : total === 0 && !filtered ? (
        <EmptyState
          icon={<EyeOff size={24} color="$color11" />}
          title={tEmpty('title')}
          description={tEmpty('description')}
        />
      ) : (
        <YStack gap={16}>
          <AccountFilters
            filter={filter}
            onChange={(next) =>
              void navigate({
                search: (prev) => ({ ...prev, ...next }),
                replace: true,
              })
            }
          />
          {total === 0 ? <EmptyState title={tFilters('noMatch')} /> : null}
          {/* Scorre in orizzontale sul telefono, dove cinque tab col numero non
              stanno: senza barra, e il tab acceso si porta da sé in vista. */}
          <Tabs
            label={t('label')}
            value={active}
            onValueChange={(value) =>
              void navigate({
                // Cambiare tab tiene i filtri.
                search: (prev) => ({ ...prev, tipo: value as HiddenKind }),
              })
            }
          >
            {hiddenKindValues.map((kind) => (
              <TabsTab key={kind} value={kind} count={counts[kind]}>
                {t(`tabs.${kind}`)}
              </TabsTab>
            ))}
          </Tabs>

          <Text fontSize={14} lineHeight={20} color="$color11">
            {active === 'unwanted'
              ? `${tEntries('description')} ${t('unwantedHint')}`
              : tUnresolved('hiddenHint')}
          </Text>

          <HiddenList
            items={byKind(active)}
            gamesTotal={gamesTotal}
            gamesShown={gamesShown}
            showGamesLink={active === 'unwanted'}
            onResolve={setResolving}
          />
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
