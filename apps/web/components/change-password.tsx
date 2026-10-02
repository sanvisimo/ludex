import { authClient } from '@repo/auth/client';
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { CardHeaderRow } from '@/components/card-header-row';
import { useAuthErrorMessage } from '@/lib/auth-error';

// Il minimo di Better Auth, che registrazione e server già applicano: qui serve
// solo a non mandare una richiesta che il server rifiuterebbe.
const MIN_LENGTH = 8;

/** La scheda «Password»: il bottone che apre il dialogo per cambiarla. */
export function ChangePassword() {
  const t = useTranslations('account.password');
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeaderRow
        title={t('title')}
        description={t('description')}
        action={
          <Button variant="outline" onClick={() => setOpen(true)}>
            {t('change')}
          </Button>
        }
      />
      <ChangePasswordDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}

/**
 * Cambiare la password chiede quella attuale: un computer lasciato aperto non
 * deve bastare a prendersi l'account.
 *
 * «Esci dagli altri dispositivi» è spuntato di default: chi cambia la password
 * perché pensa che qualcuno la conosca vuole proprio quello. Togliere le altre
 * sessioni lascia questa, quindi non si viene buttati fuori.
 */
function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('account.password');
  const authErrorMessage = useAuthErrorMessage();
  const queryClient = useQueryClient();
  const ids = {
    current: useId(),
    next: useId(),
    confirm: useId(),
    revoke: useId(),
  };

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setRevokeOthers(true);
    setError(null);
  };

  const change = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: revokeOthers,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      // Le altre sessioni, se spuntato, non ci sono più.
      await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      toast.success(t('changed'));
      reset();
      onOpenChange(false);
    },
    onError: (e) =>
      setError(authErrorMessage(e as { code?: string }, t('failed'))),
  });

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    current.length > 0 && next.length >= MIN_LENGTH && next === confirm;

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
            if (canSubmit) change.mutate();
          }}
        >
          <YStack gap={16}>
            <DialogHeader>
              <DialogTitle>{t('dialogTitle')}</DialogTitle>
              <DialogDescription>{t('dialogDescription')}</DialogDescription>
            </DialogHeader>

            <YStack gap={8}>
              <Label htmlFor={ids.current}>{t('current')}</Label>
              <Input
                id={ids.current}
                type="password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </YStack>

            <YStack gap={8}>
              <Label htmlFor={ids.next}>{t('new')}</Label>
              <Input
                id={ids.next}
                type="password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                autoComplete="new-password"
              />
              <Text fontSize={13} lineHeight={18} color="$color11">
                {t('newHint', { min: MIN_LENGTH })}
              </Text>
            </YStack>

            <YStack gap={8}>
              <Label htmlFor={ids.confirm}>{t('confirm')}</Label>
              <Input
                id={ids.confirm}
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                aria-invalid={mismatch}
              />
              {mismatch && (
                <Text fontSize={13} lineHeight={18} color="$red11">
                  {t('mismatch')}
                </Text>
              )}
            </YStack>

            <XStack items="center" gap={8}>
              <Checkbox
                id={ids.revoke}
                checked={revokeOthers}
                onCheckedChange={(value) => setRevokeOthers(value === true)}
              />
              <Label htmlFor={ids.revoke}>{t('revokeOthers')}</Label>
            </XStack>

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
                disabled={change.isPending}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={!canSubmit || change.isPending}>
                {t('submit')}
              </Button>
            </DialogFooter>
          </YStack>
        </form>
      </DialogContent>
    </Dialog>
  );
}
