import { authClient } from '@repo/auth/client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
 * Nome ed email. Il nome si cambia qui, sul posto; l'email no, e il perché non
 * è una dimenticanza: cambiarla vuol dire verificare il nuovo indirizzo, e
 * senza un sender di email la verifica non c'è.
 */
export function ProfileDetails() {
  const t = useTranslations('account.profile');
  const authErrorMessage = useAuthErrorMessage();
  const nameId = useId();
  // La sessione l'ha già verificata la cornice: qui c'è sempre.
  const { data: session } = useSession();

  // `null` = non si sta modificando.
  const [name, setName] = useState<string | null>(null);

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

        <YStack gap={2}>
          <Text fontSize={13} lineHeight={18} color="$color11">
            {t('email')}
          </Text>
          <Text color="$color12">{session.user.email}</Text>
        </YStack>
      </CardContent>
    </Card>
  );
}
