import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Input,
  Label,
  Text,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { SteamQrPanel } from '@/components/steam-qr-panel';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * Collegare Steam, in uno dei due modi: il login col QR, o il solo profilo.
 *
 * **Sono due modi della stessa riga**, non due account: la chiave è lo SteamID64,
 * quindi fare l'uno dopo l'altro aggiorna l'account invece di aggiungerne uno.
 * Per questo il nome facoltativo sta sotto tutti e due e vale per entrambi.
 *
 * Il login sta **sopra**: è il modo che porta più cose — la famiglia, il profilo
 * anche privato, la data d'acquisto — e il profilo resta come era per chi lo
 * preferisce.
 *
 * `loginOnly` per ricollegare un login scaduto o aggiungerlo a un account che
 * aveva solo il profilo: lì si va dritti al QR, e col profilo non c'è niente da
 * fare. `accountId` dice di quale account si tratta, e il server rifiuta un login
 * fatto con un altro.
 */
export function SteamLink({
  accountId,
  loginOnly,
  onLinked,
}: {
  accountId?: string;
  loginOnly?: boolean;
  /** Collegato, in uno dei due modi: chi sta in un dialogo lo chiude da qui. */
  onLinked: () => void;
}) {
  const t = useTranslations('account.steamLogin');
  const tStore = useTranslations('account.store');
  const tSteam = useTranslations('account.stores.steam');
  const tAdd = useTranslations('account.add');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const [qr, setQr] = useState(loginOnly ?? false);
  const [profile, setProfile] = useState('');
  const [label, setLabel] = useState('');
  // Il profilo è privato: la libreria non si può leggere, e il messaggio sta nel
  // dialogo accanto al bottone che porta fuori dal problema, non in un toast.
  const [privateProfile, setPrivateProfile] = useState(false);

  const link = useMutation({
    mutationFn: () =>
      client.accounts.link({
        store: 'steam',
        value: profile.trim(),
        label: label.trim() || null,
        state: null,
        accountId: accountId ?? null,
      }),
    onSuccess: async () => {
      setPrivateProfile(false);
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
      toast.success(tStore('linked'));
      onLinked();
    },
    onError: (error) => {
      if (hasErrorCode(error, 'PRECONDITION_FAILED')) {
        setPrivateProfile(true);
        return;
      }
      setPrivateProfile(false);
      toast.error(
        errorMessage(error, {
          fallback: tStore('linkFailed'),
          CONFLICT: tStore('wrongAccount'),
        }),
      );
    },
  });

  if (qr) {
    return (
      <YStack gap={12}>
        {!loginOnly && (
          <Button
            variant="ghost"
            size="sm"
            self="flex-start"
            onClick={() => setQr(false)}
          >
            ← {t('back')}
          </Button>
        )}
        <SteamQrPanel label={label} accountId={accountId} onDone={onLinked} />
      </YStack>
    );
  }

  return (
    <YStack gap={16}>
      {privateProfile && (
        <Alert variant="destructive">
          <AlertDescription>{t('privateProfile')}</AlertDescription>
        </Alert>
      )}

      <YStack
        gap={12}
        p={16}
        rounded={12}
        borderWidth={1}
        borderColor="$borderColor"
        bg="$color2"
      >
        <Badge variant="success" self="flex-start">
          {t('recommended')}
        </Badge>
        <Button self="flex-start" onClick={() => setQr(true)}>
          {t('button')}
        </Button>
        <YStack gap={2}>
          <Text fontSize={14}>✓ {t('benefitFamily')}</Text>
          <Text fontSize={14}>✓ {t('benefitPrivate')}</Text>
          <Text fontSize={14}>✓ {t('benefitDate')}</Text>
        </YStack>
        <Text fontSize={12} color="$color11">
          {t('phoneHint')}
        </Text>
      </YStack>

      <Text fontSize={13} color="$color11" text="center">
        — {t('or')} —
      </Text>

      <YStack gap={8}>
        <Label htmlFor="collega-steam">{t('profileTitle')}</Label>
        <XStack flexWrap="wrap" gap={8}>
          <Input
            id="collega-steam"
            minW={256}
            flex={1}
            value={profile}
            onChange={(event) => setProfile(event.target.value)}
            placeholder={tSteam('placeholder')}
          />
          <Button
            variant="outline"
            onClick={() => link.mutate()}
            disabled={profile.trim().length === 0 || link.isPending}
          >
            {tAdd('submit')}
          </Button>
        </XStack>
        <Text fontSize={12} color="$color11">
          {tSteam('hint')}
        </Text>
      </YStack>

      <YStack gap={8}>
        <Label htmlFor="etichetta-steam">{tStore('labelField')}</Label>
        <Input
          id="etichetta-steam"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={tStore('labelPlaceholder')}
          maxLength={60}
        />
        {/* Facoltativa, e detto: con un account solo non serve a niente. */}
        <Text fontSize={12} color="$color11">
          {tStore('labelHint')}
        </Text>
      </YStack>
    </YStack>
  );
}
