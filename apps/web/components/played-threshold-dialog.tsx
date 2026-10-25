import type { StoreAccount } from '@repo/contracts';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { PlayedThreshold } from '@/components/played-threshold';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * «Impostazioni dell'import» di un account Steam, PSN o Nintendo: la soglia
 * «conta come giocato» (plans/soglia-giocato.md). Xbox ha le sue, con le
 * piattaforme (`xbox-settings-dialog.tsx`).
 *
 * «Salva» non rilancia l'import: la soglia vale subito su ciò che c'è, ed è il
 * server a dire quanti giochi sono passati a «giocato».
 */
export function PlayedThresholdDialog({
  account,
  onOpenChange,
}: {
  /** Aperto quando c'è un account. */
  account: StoreAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Rimontato a ogni apertura: la soglia riparte da quella salvata. */}
        {account && (
          <PlayedThresholdForm
            account={account}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlayedThresholdForm({
  account,
  onDone,
}: {
  account: StoreAccount;
  onDone: () => void;
}) {
  const t = useTranslations('account.played');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [played, setPlayed] = useState(account.playedMinMinutes);

  const save = useMutation({
    mutationFn: () =>
      client.accounts.playedThreshold({
        accountId: account.id,
        minMinutes: played,
      }),
    onSuccess: async ({ promoted }) => {
      // Gli account per la soglia, il backlog per gli stati appena cambiati.
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
      if (promoted > 0)
        await queryClient.invalidateQueries({
          queryKey: api.backlog.list.key(),
        });
      toast.success(t('saved', { count: promoted }));
      onDone();
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('saveFailed') })),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('settingsTitle')}</DialogTitle>
        <DialogDescription>{t('settingsDescription')}</DialogDescription>
      </DialogHeader>
      <YStack gap={16}>
        <PlayedThreshold value={played} onChange={setPlayed} />
        <Alert>
          <AlertDescription>{t('settingsWarning')}</AlertDescription>
        </Alert>
        <XStack justify="flex-end">
          <Button
            onClick={() => save.mutate()}
            disabled={played === account.playedMinMinutes || save.isPending}
          >
            {t('save')}
          </Button>
        </XStack>
      </YStack>
    </>
  );
}
