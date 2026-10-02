import type { StoreAccount } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  YStack,
  toast,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

/**
 * Dare un nome a un account, o toglierglielo.
 *
 * Serve soprattutto a distinguerne due dello stesso negozio: su Amazon il
 * negozio rende lo stesso nome per entrambi, e l'etichetta è l'unica cosa che
 * li separa nella lista dei possessi. Una stringa vuota è un valore legittimo,
 * l'etichetta cancellata: è un gesto e non un errore.
 */
export function RenameAccountDialog({
  account,
  onOpenChange,
}: {
  account: StoreAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent maxW={448}>
        {/* Il modulo è un figlio che si rimonta per ogni account: il campo
            riparte dall'etichetta di quello aperto, non dell'ultimo. */}
        {account && (
          <RenameForm
            key={account.id}
            account={account}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  account,
  onDone,
}: {
  account: StoreAccount;
  onDone: () => void;
}) {
  const t = useTranslations('account.store');
  const errorMessage = useApiErrorMessage();
  const storeLabels = useStoreLabels();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const [label, setLabel] = useState(account.label ?? '');

  const rename = useMutation({
    mutationFn: () =>
      client.accounts.rename({
        accountId: account.id,
        // Vuoto vuol dire «nessun nome»: lo si scrive come `null`.
        label: label.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
      // Il nome dell'account compare anche sui possessi, nella scheda del gioco.
      await queryClient.invalidateQueries({ queryKey: api.backlog.list.key() });
      onDone();
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('renameFailed') })),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <YStack gap={16}>
        <DialogHeader>
          <DialogTitle>
            {t('renameTitle', { store: storeLabels[account.store] })}
          </DialogTitle>
          <DialogDescription>{t('labelHint')}</DialogDescription>
        </DialogHeader>

        <YStack gap={8}>
          <Label htmlFor={fieldId}>{t('labelField')}</Label>
          <Input
            id={fieldId}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t('labelPlaceholder')}
            maxLength={60}
            autoFocus
          />
          {/* Il nome che dà il negozio, accanto a quello che sta per scrivere:
              serve a ritrovare quale account è. */}
          {account.displayName && (
            <Text fontSize={13} lineHeight={18} color="$color11">
              {t('renameKnownAs', { name: account.displayName })}
            </Text>
          )}
        </YStack>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('renameCancel')}
          </Button>
          <Button type="submit" disabled={rename.isPending}>
            {t('renameSave')}
          </Button>
        </DialogFooter>
      </YStack>
    </form>
  );
}
