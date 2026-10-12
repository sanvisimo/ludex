import { toast } from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * Importa (o aggiorna) la wishlist del negozio di un account (15e). Una sola
 * mutazione per la scheda dell'account e per la lista aperta, così gli errori
 * dicono le stesse cose: l'import gira nel worker e qui si accoda soltanto.
 *
 * Rilegge gli account, che portano `wishlistSyncing`, e le liste: a dire quando è
 * finito sono poi gli eventi del guscio.
 */
export function useSyncWishlist(accountId: string) {
  const t = useTranslations('wishlist.store');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.accounts.syncWishlist({ accountId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: api.accounts.list.key() }),
        queryClient.invalidateQueries({ queryKey: api.wishlists.key() }),
      ]);
      toast.success(t('started'));
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, {
          fallback: t('failed'),
          CONFLICT: t('alreadySyncing'),
          FORBIDDEN: t('needsReauth'),
        }),
      ),
  });
}
