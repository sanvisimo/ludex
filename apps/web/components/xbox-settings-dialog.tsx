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

import {
  NO_XBOX_CHOICES,
  XboxChoices,
  type XboxChoicesValue,
} from '@/components/xbox-choices';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * «Cambia piattaforme» di un account Xbox (9e): le scelte di adesso già
 * spuntate, e «Salva e aggiorna», che le riscrive e rilancia l'import.
 *
 * **Senza codice** (decisione del 20/10/2026): spuntare una casella è una
 * scelta nostra, non un login su Microsoft. E il dialogo dice prima ciò che non
 * fa: togliere una piattaforma non toglie le copie già importate, e il Game Pass
 * vale solo per i giochi che arrivano dopo.
 */
export function XboxSettingsDialog({
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
        {/* Rimontato a ogni apertura: le scelte ripartono da quelle salvate. */}
        {account && (
          <XboxSettingsForm
            account={account}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function XboxSettingsForm({
  account,
  onDone,
}: {
  account: StoreAccount;
  onDone: () => void;
}) {
  const t = useTranslations('account.xbox');
  const tStore = useTranslations('account.store');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [choices, setChoices] = useState<XboxChoicesValue>(
    account.xbox ?? NO_XBOX_CHOICES,
  );

  const save = useMutation({
    mutationFn: () =>
      client.accounts.xboxSettings({
        accountId: account.id,
        platforms: choices.platforms,
        gamePassActive: choices.gamePassActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
      toast.success(t('saved'));
      onDone();
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, {
          fallback: t('saveFailed'),
          CONFLICT: tStore('alreadySyncing'),
          FORBIDDEN: tStore('needsReauth'),
        }),
      ),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('settingsTitle')}</DialogTitle>
        <DialogDescription>{t('settingsDescription')}</DialogDescription>
      </DialogHeader>
      <YStack gap={16}>
        <XboxChoices value={choices} onChange={setChoices} />
        <Alert>
          <AlertDescription>{t('settingsWarning')}</AlertDescription>
        </Alert>
        <XStack justify="flex-end">
          <Button
            onClick={() => save.mutate()}
            disabled={choices.platforms.length === 0 || save.isPending}
          >
            {t('save')}
          </Button>
        </XStack>
      </YStack>
    </>
  );
}
