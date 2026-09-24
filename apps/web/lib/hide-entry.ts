'use client';

import type { HiddenKind } from '@repo/contracts';
import { hiddenKindValues } from '@repo/contracts';
import { toast } from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * Nasconde un gioco dalla lista, o lo rimette, con «Annulla» nel toast.
 *
 * Un hook solo per la lista e per la scheda del gioco: sono lo stesso gesto, e
 * un gioco nascosto per sbaglio deve potersi riprendere subito, prima ancora di
 * andarlo a cercare fra i nascosti. È la metà del gesto che CLAUDE.md chiede di
 * non dimenticare.
 */
export function useSetEntryHidden() {
  const t = useTranslations('hidden');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: { id: string; hidden: boolean }) =>
      client.backlog.setHidden(input),
    onSuccess: async (_entry, input) => {
      // La lista, il conteggio dei nascosti, il pannello dei filtri e la scheda
      // del gioco guardano tutti la stessa colonna.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
        queryClient.invalidateQueries({
          queryKey: api.backlog.filterOptions.key(),
        }),
        queryClient.invalidateQueries({ queryKey: api.games.byId.key() }),
      ]);
      toast.success(input.hidden ? t('hiddenToast') : t('unhiddenToast'), {
        action: {
          label: t('undo'),
          onClick: () => mutation.mutate({ ...input, hidden: !input.hidden }),
        },
      });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  return mutation;
}

/** I nomi dei tipi di uno scarto nascosto, nell'ordine del vocabolario. */
export function useHiddenKindLabels(): Record<HiddenKind, string> {
  const t = useTranslations('hidden.kinds');
  return Object.fromEntries(
    hiddenKindValues.map((kind) => [kind, t(kind)]),
  ) as Record<HiddenKind, string>;
}
