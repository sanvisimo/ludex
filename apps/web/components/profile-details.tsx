import { authClient } from '@repo/auth/client';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useAuthErrorMessage } from '@/lib/auth-error';
import { useSession } from '@/src/use-session';

/**
 * Nome ed email. Il nome si cambia qui, sul posto; l'email da un dialogo,
 * perché cambia solo dopo due link (rilascio): il primo all'indirizzo di
 * adesso, che conferma, il secondo a quello nuovo, che si verifica. Tutti e due
 * portano a `/email-link`, che dice a che punto si è.
 */
export function ProfileDetails() {
  const t = useTranslations('account.profile');
  const authErrorMessage = useAuthErrorMessage();
  const nameId = useId();
  // La sessione l'ha già verificata la cornice: qui c'è sempre.
  const { data: session } = useSession();

  // `null` = non si sta modificando.
  const [name, setName] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  // Il cambio chiesto: l'avviso dice dove guardare.
  const [emailRequested, setEmailRequested] = useState(false);

  const save = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await authClient.updateUser({ name: value });
      if (error) throw error;
    },
    onSuccess: () => {
      setName(null);
      toast.success(t('nameSaved'));
    },
    onError: (error) =>
      toast.error(
        authErrorMessage(error as { code?: string }, t('nameFailed')),
      ),
  });

  if (!session) return null;

  const trimmed = name?.trim() ?? '';
  // Salvare lo stesso nome o un nome vuoto non ha senso: il bottone resta
  // spento invece di dare un errore.
  const canSave = trimmed.length > 0 && trimmed !== session.user.name;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent gap={16}>
        {name === null ? (
          <XStack items="center" justify="space-between" gap={12}>
            <YStack gap={2} shrink={1}>
              <Text fontSize={13} lineHeight={18} color="$color11">
                {t('name')}
              </Text>
              <Text fontWeight="500" color="$color12">
                {session.user.name}
              </Text>
            </YStack>
            <Button
              variant="outline"
              onClick={() => setName(session.user.name)}
            >
              {t('edit')}
            </Button>
          </XStack>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave) save.mutate(trimmed);
            }}
          >
            <YStack gap={8}>
              <Label htmlFor={nameId}>{t('name')}</Label>
              <XStack gap={8} flexWrap="wrap">
                <Input
                  id={nameId}
                  minW={192}
                  flex={1}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  autoFocus
                />
                <Button type="submit" disabled={!canSave || save.isPending}>
                  {t('save')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setName(null)}
                >
                  {t('cancel')}
                </Button>
              </XStack>
            </YStack>
          </form>
        )}

        <XStack items="center" justify="space-between" gap={12}>
          <YStack gap={2} shrink={1}>
            <Text fontSize={13} lineHeight={18} color="$color11">
              {t('email')}
            </Text>
            <Text color="$color12">{session.user.email}</Text>
          </YStack>
          <Button variant="outline" onClick={() => setEmailOpen(true)}>
            {t('changeEmail')}
          </Button>
        </XStack>

        {/* Vale anche quando il nuovo indirizzo è già di un altro account:
            all'indirizzo di adesso parte l'avviso al posto della conferma,
            così la pagina non dice chi è iscritto. */}
        {emailRequested && (
          <Alert>
            <AlertDescription>
              {t('emailSent', { email: session.user.email })}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <ChangeEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        current={session.user.email}
        onRequested={() => setEmailRequested(true)}
      />
    </Card>
  );
}

/**
 * Chiedere il cambio non cambia niente: parte l'email di conferma
 * all'indirizzo di adesso. Un indirizzo già usato da un altro account risponde
 * come gli altri, così il dialogo non dice chi è iscritto.
 */
function ChangeEmailDialog({
  open,
  onOpenChange,
  current,
  onRequested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string;
  onRequested: () => void;
}) {
  const t = useTranslations('account.profile');
  const authErrorMessage = useAuthErrorMessage();
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setError(null);
  };

  const trimmed = email.trim().toLowerCase();
  const same = trimmed === current.toLowerCase();

  const request = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.changeEmail({
        newEmail: trimmed,
        // Tutti e due i link tornano alla pagina dei link: il primo con
        // questo passo, il secondo con `change-done`, che scrive il server
        // (`packages/auth/src/email-links.ts`).
        callbackURL: `${window.location.origin}/email-link?step=change-confirmed`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      onRequested();
      reset();
      onOpenChange(false);
    },
    onError: (e) =>
      setError(
        authErrorMessage(
          e as { code?: string; status?: number },
          t('emailFailed'),
        ),
      ),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            if (trimmed && !same) request.mutate();
          }}
        >
          <YStack gap={16}>
            <DialogHeader>
              <DialogTitle>{t('emailDialogTitle')}</DialogTitle>
              <DialogDescription>
                {t('emailDialogDescription')}
              </DialogDescription>
            </DialogHeader>

            <YStack gap={8}>
              <Label htmlFor={emailId}>{t('newEmail')}</Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus
                aria-invalid={same}
              />
              {same && (
                <Text fontSize={13} lineHeight={18} color="$red11">
                  {t('emailSame')}
                </Text>
              )}
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
                disabled={request.isPending}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={!trimmed || same || request.isPending}
              >
                {t('send')}
              </Button>
            </DialogFooter>
          </YStack>
        </form>
      </DialogContent>
    </Dialog>
  );
}
