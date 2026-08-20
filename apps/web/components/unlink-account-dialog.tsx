'use client';

import type { StoreAccount } from '@repo/contracts';
import { storeAccountName } from '@repo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

/**
 * Scollegare è una domanda, non un bottone.
 *
 * Le due strade non sono la stessa cosa con un'etichetta diversa: **tenere** i
 * giochi li lascia nel backlog come se fossero stati inseriti a mano — la riga
 * dell'account sopravvive senza credenziali, ed è l'unica cosa che ricordi da
 * quale dei due account Amazon veniva un gioco. **Cancellare** porta via i
 * possessi e con loro i giochi che restano senza nessuno, voto e tag compresi.
 *
 * I numeri si chiedono prima di mostrare la scelta perché da fuori non si
 * vedono: «84 giochi» non dice quanti spariscono davvero, visto che quelli che
 * stanno anche su GOG restano dove sono.
 */
export function UnlinkAccountDialog({
  account,
  onOpenChange,
}: {
  account: StoreAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('account.unlinkDialog');
  const tStore = useTranslations('account.store');
  const errorMessage = useApiErrorMessage();
  const storeLabels = useStoreLabels();
  const queryClient = useQueryClient();

  const impact = useQuery({
    ...api.accounts.unlinkImpact.queryOptions({
      input: { accountId: account?.id ?? '' },
    }),
    enabled: account !== null,
    // Sono conteggi su dati che cambiano sotto: riaprire il dialogo deve
    // ricontarli, non mostrare quelli di dieci minuti fa.
    staleTime: 0,
  });

  const unlink = useMutation({
    mutationFn: (ownerships: 'keep' | 'purge') =>
      client.accounts.unlink({ accountId: account!.id, ownerships }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: api.accounts.list.key() }),
        queryClient.invalidateQueries({
          queryKey: api.imports.unresolved.key(),
        }),
        // Con `purge` il backlog è cambiato sotto i piedi.
        queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
      ]);
      toast.success(tStore('unlinked'));
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: tStore('unlinkFailed') })),
  });

  const name = account ? storeAccountName(account) : '';

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('title', {
              store: account ? storeLabels[account.store] : '',
            })}
          </DialogTitle>
          <DialogDescription>{t('description', { name })}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {impact.isPending ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : impact.data ? (
            <div className="grid gap-1 rounded-lg bg-muted/50 px-3 py-2">
              <p>{t('summary', { count: impact.data.ownerships })}</p>
              <p>{t('removed', { count: impact.data.removedEntries })}</p>
              {impact.data.withPersonalData > 0 && (
                <p className="text-destructive">
                  {t('personal', { count: impact.data.withPersonalData })}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter showCloseButton={false}>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={unlink.isPending}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="outline"
            onClick={() => unlink.mutate('keep')}
            disabled={unlink.isPending}
          >
            {t('keep')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => unlink.mutate('purge')}
            disabled={unlink.isPending}
          >
            {t('purge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
