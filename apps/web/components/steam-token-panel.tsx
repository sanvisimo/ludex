import {
  Alert,
  AlertDescription,
  Button,
  Label,
  Text,
  Textarea,
  YStack,
  toast,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { hasErrorCode } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * La pagina dello store che dà il token web a chi è già dentro Steam nel browser.
 * Rende un JSON con `webapi_token`: lo si incolla tutto, senza ritagliarlo.
 */
const TOKEN_PAGE =
  'https://store.steampowered.com/pointssummary/ajaxgetasyncconfig';

/** Il perché del rifiuto, come lo manda il server in `data.reason`. */
function reasonOf(error: unknown): 'format' | 'wrong_kind' | 'expired' | null {
  const reason = (error as { data?: { reason?: unknown } } | null)?.data
    ?.reason;
  return reason === 'format' || reason === 'wrong_kind' || reason === 'expired'
    ? reason
    : null;
}

/**
 * Collegare Steam col token del browser: **il server non apre nessuna sessione
 * su Steam**, quindi non nasce nessun dispositivo nuovo nell'elenco di Steam
 * Guard. Il prezzo è che il token vale 24 ore e non si rinnova: la famiglia si
 * aggiorna quando se ne incolla uno nuovo, il profilo continua da solo.
 *
 * `accountId` quando si ricollega un account, o si aggiunge il login a uno che
 * aveva solo il profilo: il server controlla che il token sia di quell'account.
 */
export function SteamTokenPanel({
  label,
  accountId,
  onDone,
}: {
  label?: string;
  accountId?: string;
  /** Collegato: l'account è già scritto e l'import accodato. */
  onDone: () => void;
}) {
  const t = useTranslations('account.steamLogin');
  const queryClient = useQueryClient();
  const [pasted, setPasted] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const link = useMutation({
    mutationFn: () =>
      client.accounts.steamLogin.token({
        token: pasted.trim(),
        label: label?.trim() || null,
        accountId: accountId ?? null,
      }),
    onSuccess: async () => {
      setProblem(null);
      setPasted('');
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
      toast.success(t('tokenDone'));
      onDone();
    },
    onError: (error) => {
      if (hasErrorCode(error, 'CONFLICT')) return setProblem(t('wrongAccount'));
      const reason = reasonOf(error);
      setProblem(
        reason === 'format'
          ? t('tokenFormat')
          : reason === 'wrong_kind'
            ? t('tokenWrongKind')
            : reason === 'expired'
              ? t('tokenExpired')
              : t('tokenFailed'),
      );
    },
  });

  return (
    <YStack gap={12}>
      <YStack gap={8}>
        <Text fontSize={14}>{t('tokenStep1')}</Text>
        <Button
          variant="outline"
          self="flex-start"
          onClick={() => window.open(TOKEN_PAGE, '_blank', 'noopener')}
        >
          {t('tokenOpen')}
        </Button>
      </YStack>
      <Text fontSize={14}>{t('tokenStep2')}</Text>
      <YStack gap={8}>
        <Label htmlFor="steam-token">{t('tokenStep3')}</Label>
        <Textarea
          id="steam-token"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          placeholder={t('tokenPlaceholder')}
          rows={4}
          spellCheck={false}
          autoComplete="off"
        />
      </YStack>

      {problem && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}

      <Button
        self="flex-start"
        onClick={() => link.mutate()}
        disabled={pasted.trim().length === 0 || link.isPending}
      >
        {t('tokenSubmit')}
      </Button>

      <YStack gap={4}>
        <Text fontSize={12} color="$color11">
          {t('tokenNoDevice')}
        </Text>
        <Text fontSize={12} color="$color11">
          {t('tokenLimit')}
        </Text>
      </YStack>
    </YStack>
  );
}
