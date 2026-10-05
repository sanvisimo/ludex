import type { StoreAccount } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
  YStack,
  toast,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * Togliere il login Steam è una domanda, perché fa uscire delle cose.
 *
 * L'account resta, e con lui il profilo e i giochi propri: cambia solo che la
 * famiglia non si legge più. Le copie della famiglia escono dalla libreria,
 * tranne quelle su cui l'utente ha messo un voto, delle note o dei tag — e il
 * testo lo dice, perché è la parte che fa esitare.
 *
 * **Senza numeri**, a differenza dello scollegamento: contarli vorrebbe dire
 * un'altra procedura, e il testo basta a decidere. Dopo, il toast dice quante
 * sono uscite.
 */
export function RemoveSteamLoginDialog({
  account,
  onOpenChange,
}: {
  account: StoreAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('account.steamLogin');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () =>
      client.accounts.steamLogin.remove({ accountId: account!.id }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
      toast.success(t('removed', result));
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, {
          fallback: t('removeFailed'),
          // Un import in corso riscriverebbe le copie appena tolte.
          CONFLICT: t('removeWhileSyncing'),
        }),
      ),
  });

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent maxW={512}>
        <DialogHeader>
          <DialogTitle>{t('removeTitle')}</DialogTitle>
          <DialogDescription>{t('removeBody')}</DialogDescription>
        </DialogHeader>

        <YStack>
          <Text fontSize={14}>{t('removeFamily')}</Text>
        </YStack>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('removeCancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {t('removeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
