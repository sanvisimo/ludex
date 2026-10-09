import type {
  BacklogEntry,
  HiddenKind,
  UnresolvedImport,
} from '@repo/contracts';
import { Button, EmptyState, Text, YStack, toast } from '@repo/ui';
import { EyeOff } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';

import {
  matchesAccountFilter,
  type AccountFilter,
} from '@/components/account-filters';
import { HiddenGameRow } from '@/components/hidden-game-row';
import { UnresolvedRow } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

// Quanti giochi nascosti si portano qui: oltre, si va nella vista del backlog,
// che ha i filtri e la ricerca. Questa è una finestra, non un secondo backlog.
const GAMES_LIMIT = 100;

/** Una riga della lista «non interessato»: una voce d'import o un gioco. */
export type Item =
  | { type: 'import'; at: number; entry: UnresolvedImport }
  | { type: 'game'; at: number; entry: BacklogEntry };

/**
 * Ciò che hai nascosto, in due mucchi che la sezione tiene insieme: le voci
 * d'import (`unresolved_imports.hidden_kind`) e i giochi del backlog
 * (`backlog.hidden_at`).
 *
 * I primi quattro tipi — app, DLC, contenuto extra, versione di prova — sono
 * **solo** voci d'import: un gioco del backlog si nasconde senza tipo, perché lì
 * è una preferenza di vista. «Non interessato» è l'unico che ha entrambi, ed è
 * per questo che il suo tab unisce le due liste.
 */
export function useHiddenItems(filter: AccountFilter = {}) {
  const unresolved = useQuery(api.imports.unresolved.queryOptions());
  // I giochi si filtrano sul server, che ne porta al massimo `GAMES_LIMIT`:
  // nome e negozio sono gli stessi filtri del backlog (`q`, `stores`, cioè
  // almeno una copia di quel negozio).
  const games = useQuery(
    api.backlog.list.queryOptions({
      input: {
        hidden: true,
        limit: GAMES_LIMIT,
        q: filter.q,
        stores: filter.store ? [filter.store] : undefined,
      },
    }),
  );

  return useMemo(() => {
    // Le voci d'import arrivano tutte: i filtri si applicano qui.
    const imports = (unresolved.data ?? []).filter(
      (entry) =>
        entry.hiddenKind !== null && matchesAccountFilter(entry, filter),
    );
    const gameEntries = games.data?.entries ?? [];
    const byKind = (kind: HiddenKind): Item[] => {
      const rows: Item[] = imports
        .filter((entry) => entry.hiddenKind === kind)
        .map((entry) => ({
          type: 'import',
          at: entry.hiddenAt?.getTime() ?? 0,
          entry,
        }));
      if (kind === 'unwanted') {
        for (const entry of gameEntries) {
          rows.push({
            type: 'game',
            at: entry.hiddenAt?.getTime() ?? 0,
            entry,
          });
        }
      }
      // Gli ultimi nascosti per primi: è lì che si cerca un errore appena fatto.
      return rows.sort((a, b) => b.at - a.at);
    };

    const gamesTotal = games.data?.total ?? 0;
    const counts: Record<HiddenKind, number | undefined> = {
      app: undefined,
      dlc: undefined,
      extra: undefined,
      prerelease: undefined,
      unwanted: undefined,
    };
    if (unresolved.data && games.data) {
      for (const kind of Object.keys(counts) as HiddenKind[]) {
        const voci = imports.filter((entry) => entry.hiddenKind === kind);
        // `total` e non quanti ne abbiamo caricati: il numero del tab non deve
        // dipendere da quanti ne portiamo qui.
        counts[kind] = voci.length + (kind === 'unwanted' ? gamesTotal : 0);
      }
    }

    return {
      isPending: unresolved.isPending || games.isPending,
      counts,
      byKind,
      gamesTotal,
      gamesShown: gameEntries.length,
    };
  }, [
    unresolved.data,
    unresolved.isPending,
    games.data,
    games.isPending,
    filter,
  ]);
}

/**
 * Il contenuto di un tab: le righe, o lo stato vuoto del tab.
 *
 * Le voci d'import hanno «Collega» — una voce nascosta per errore può essere un
 * gioco vero — e «Mostra di nuovo», che le rimette fra i «da sistemare». I
 * giochi hanno solo il secondo.
 */
export function HiddenList({
  items,
  gamesTotal,
  gamesShown,
  showGamesLink,
  onResolve,
}: {
  items: Item[];
  gamesTotal: number;
  gamesShown: number;
  /** Il tab è quello che porta i giochi: solo lì il link al backlog ha senso. */
  showGamesLink: boolean;
  onResolve: (entry: UnresolvedImport) => void;
}) {
  const t = useTranslations('account.hiddenTab');
  const tUnresolved = useTranslations('account.unresolved');
  const tHidden = useTranslations('hidden');
  const tEntries = useTranslations('account.hiddenEntries');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const unhide = useMutation({
    mutationFn: (id: string) => client.imports.setHidden({ id, kind: null }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: api.imports.unresolved.key() }),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: tUnresolved('hideFailed') })),
  });

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<EyeOff size={24} color="$color11" />}
        title={t('emptyTitle')}
        description={t('emptyDescription')}
      />
    );
  }

  return (
    <YStack gap={12}>
      <ul style={{ display: 'grid', gap: 8, margin: 0, padding: 0 }}>
        {items.map((item) =>
          item.type === 'import' ? (
            <UnresolvedRow key={item.entry.id} entry={item.entry}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onResolve(item.entry)}
              >
                {tUnresolved('resolve')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unhide.mutate(item.entry.id)}
                disabled={unhide.isPending}
              >
                {tHidden('unhide')}
              </Button>
            </UnresolvedRow>
          ) : (
            <HiddenGameRow key={item.entry.id} entry={item.entry} />
          ),
        )}
      </ul>

      {showGamesLink && gamesTotal > gamesShown && (
        <Link to="/backlog" search={{ hidden: true }}>
          <Text color="$color11" textDecorationLine="underline">
            {tEntries('showAll', { count: gamesTotal })}
          </Text>
        </Link>
      )}
    </YStack>
  );
}
