'use client';

import { toast } from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import type { DisplayedOwnership } from '@/components/ownership-badges';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * Toglie una copia di un gioco, con «Annulla» nel toast.
 *
 * L'annulla non è un ripristino: richiama l'aggiunta a mano, che è anche ciò
 * che cancella il rifiuto scritto lato server. La riga rinasce quindi senza
 * account — a mano non se ne dichiara uno — e il prossimo import se la riprende
 * com'era, perché una riga meno specifica si fa adottare. È il giro lungo, ma
 * è l'unico che non inventa un secondo modo di scrivere un possesso.
 */
export function useRemoveOwnership() {
  const t = useTranslations('editEntry');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (input: { id: string; ownership: DisplayedOwnership }) =>
      client.backlog.removeOwnership({
        id: input.id,
        ownershipId: input.ownership.id!,
      }),
    onSuccess: async (_entry, input) => {
      await invalida();
      toast.success(t('ownershipRemoved'), {
        action: {
          label: t('undo'),
          onClick: () =>
            undo.mutate({
              id: input.id,
              ownership: {
                platformSlug: input.ownership.platformSlug,
                store: input.ownership.store ?? null,
                medium: input.ownership.medium ?? null,
              },
            }),
        },
      });
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, { fallback: t('removeOwnershipFailed') }),
      ),
  });

  const undo = useMutation({
    mutationFn: (input: {
      id: string;
      ownership: {
        platformSlug: string;
        store: DisplayedOwnership['store'];
        medium: DisplayedOwnership['medium'];
      };
    }) => client.backlog.addOwnership(input),
    onSuccess: invalida,
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('saveFailed') })),
  });

  async function invalida() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
      queryClient.invalidateQueries({ queryKey: api.games.byId.key() }),
      // I possessi sono ciò da cui il pannello dei filtri ricava piattaforme e
      // negozi: tolta l'ultima copia GOG, «GOG» non deve restare nell'elenco.
      queryClient.invalidateQueries({
        queryKey: api.backlog.filterOptions.key(),
      }),
    ]);
  }

  return remove;
}
