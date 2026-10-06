import { authClient } from '@repo/auth/client';
import {
  Button,
  Card,
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
import { useRouter } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { CardHeaderRow } from '@/components/card-header-row';
import { useAuthErrorMessage } from '@/lib/auth-error';
import { client } from '@/lib/orpc';

/**
 * Esportare e cancellare i propri dati (step 16, GDPR artt. 20 e 17).
 *
 * L'esportazione è un file JSON preparato dal server (`accountData.export`) e
 * scaricato dal browser. La cancellazione passa da Better Auth e **vuole la
 * password**: il server la rifiuta senza, vedi l'hook in `packages/auth`.
 */
export function AccountData() {
  const t = useTranslations('account.data');
  const [deleting, setDeleting] = useState(false);

  const exportData = useMutation({
    mutationFn: async () => {
      const data = await client.accountData.export();
      // Il file lo compone il browser: il JSON è lo stesso che ha reso il
      // server, con le date in ISO.
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ludex-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error(t('exportFailed')),
  });

  return (
    <>
      <Card>
        <CardHeaderRow
          title={t('exportTitle')}
          description={t('exportDescription')}
          action={
            <Button
              variant="outline"
              onClick={() => exportData.mutate()}
              disabled={exportData.isPending}
            >
              {t('export')}
            </Button>
          }
        />
      </Card>

      {/* La zona rossa: è l'unica cosa della pagina che non si può disfare. */}
      <Card borderColor="$red7">
        <CardHeaderRow
          title={t('deleteTitle')}
          description={t('deleteDescription')}
          action={
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              {t('delete')}
            </Button>
          }
        />
      </Card>

      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} />
    </>
  );
}

/**
 * Per cancellare si scrive la password: un gesto che un clic distratto, o un
 * computer lasciato aperto, non fa.
 */
function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('account.data');
  const authErrorMessage = useAuthErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword('');
    setError(null);
  };

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.deleteUser({ password });
      if (error) throw error;
    },
    onSuccess: async () => {
      // Come l'uscita: prima via dalla pagina, che senza sessione rimbalzerebbe
      // su `/login`, poi si butta ciò che la cache sapeva di chi c'era.
      await router.navigate({ to: '/' });
      queryClient.clear();
      await router.invalidate();
    },
    onError: (e) =>
      setError(authErrorMessage(e as { code?: string }, t('deleteFailed'))),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent maxW={448}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            if (password.length > 0) remove.mutate();
          }}
        >
          <YStack gap={16}>
            <DialogHeader>
              <DialogTitle>{t('dialogTitle')}</DialogTitle>
              <DialogDescription>{t('dialogDescription')}</DialogDescription>
            </DialogHeader>

            <YStack gap={8}>
              <Label htmlFor={passwordId}>{t('passwordLabel')}</Label>
              <Input
                id={passwordId}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </YStack>

            {error && (
              <Text role="alert" fontSize={14} lineHeight={20} color="$red11">
                {error}
              </Text>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={remove.isPending}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={password.length === 0 || remove.isPending}
              >
                {t('confirm')}
              </Button>
            </DialogFooter>
          </YStack>
        </form>
      </DialogContent>
    </Dialog>
  );
}
