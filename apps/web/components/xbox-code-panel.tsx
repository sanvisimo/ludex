import type { XboxLoginStatus } from '@repo/contracts';
import {
  Alert,
  AlertDescription,
  Button,
  Spinner,
  Text,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { Copy, ExternalLink, LoaderCircle } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNow, useTranslations } from 'use-intl';

import type { XboxChoicesValue } from '@/components/xbox-choices';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/** Come il QR di Steam: due secondi, e la richiesta legge una `Map` in memoria. */
const POLL_MS = 2000;

/**
 * Il login Xbox col device code (9e): il codice da confermare su
 * microsoft.com/link, e lo stato.
 *
 * Ha la forma di `SteamQrPanel`: **il codice si chiede all'apertura**, chi ha
 * premuto «Continua» ha già detto di volerlo; il server interroga Microsoft e
 * scrive l'account da sé alla conferma, qui si chiede solo a che punto è; e
 * **chiudere il pannello smette di chiedere** — un nuovo `start` annulla questo
 * anche sul server.
 *
 * `accountId` su un ricollegamento: il server rifiuta un login di un altro
 * account Xbox, e lo stato dice `wrong_account`.
 */
export function XboxCodePanel({
  choices,
  label,
  accountId,
  onDone,
}: {
  choices: XboxChoicesValue;
  label?: string;
  accountId?: string;
  /** A login confermato. L'account è già scritto e l'import accodato. */
  onDone: () => void;
}) {
  const t = useTranslations('account.xbox');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  // Il conto alla rovescia: ogni secondo, solo finché il pannello è aperto.
  const now = useNow({ updateInterval: 1000 });

  const start = useMutation({
    mutationFn: () =>
      client.accounts.xboxLogin.start({
        platforms: choices.platforms,
        gamePassActive: choices.gamePassActive,
        label: label?.trim() || null,
        accountId: accountId ?? null,
      }),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('startFailed') })),
  });

  // Una volta, all'apertura. In sviluppo React monta due volte: la seconda
  // `start` annulla la prima sul server, e `start.data` è dell'ultima.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => start.mutate(), []);

  const loginId = start.data?.loginId;
  const status = useQuery({
    ...api.accounts.xboxLogin.status.queryOptions({
      input: { loginId: loginId ?? '' },
    }),
    enabled: loginId !== undefined,
    refetchInterval: (query) => {
      const state = query.state.data?.status;
      return state === 'done' || state === 'expired' || state === 'failed'
        ? false
        : POLL_MS;
    },
    staleTime: 0,
  });

  const state = status.data?.status;

  // Una volta sola, come sul QR: `onDone` cambia identità a ogni render.
  const finished = useRef(false);
  useEffect(() => {
    if (state !== 'done' || finished.current) return;
    finished.current = true;
    void queryClient.invalidateQueries({ queryKey: api.accounts.list.key() });
    toast.success(t('done'));
    onDone();
  }, [state, queryClient, t, onDone]);

  const again = (labelKey: 'newCode' | 'retry') => (
    <Button variant="outline" onClick={() => start.mutate()}>
      {t(labelKey)}
    </Button>
  );

  if (start.isError) {
    return (
      <YStack gap={12} items="center">
        <Alert variant="destructive" width="100%">
          <AlertDescription>{t('startFailed')}</AlertDescription>
        </Alert>
        {again('retry')}
      </YStack>
    );
  }

  if (start.isPending || !start.data || !state || state === 'done') {
    return (
      <YStack gap={8} items="center" py={48}>
        <Spinner>
          <LoaderCircle size={24} color="$color11" />
        </Spinner>
        <Text fontSize={13} color="$color11">
          {state === 'done' ? t('waiting') : t('preparing')}
        </Text>
      </YStack>
    );
  }

  if (state === 'expired') {
    return (
      <YStack gap={12} items="center" py={24}>
        <Text color="$color11">{t('expired')}</Text>
        {again('newCode')}
      </YStack>
    );
  }

  if (state === 'failed') {
    return (
      <YStack gap={12} items="center">
        <Alert variant="destructive" width="100%">
          <AlertDescription>{failureText(t, status.data)}</AlertDescription>
        </Alert>
        {again('retry')}
      </YStack>
    );
  }

  // `waiting`
  const { userCode, verificationUri, expiresAt } = start.data;
  const left = Math.max(0, expiresAt.getTime() - now.getTime());
  const time = `${Math.floor(left / 60_000)}:${String(
    Math.floor((left % 60_000) / 1000),
  ).padStart(2, '0')}`;

  return (
    <YStack gap={16}>
      <Text fontWeight="600" color="$color12">
        {t('codeTitle')}
      </Text>

      <XStack
        items="center"
        justify="space-between"
        gap={12}
        p={16}
        rounded={12}
        bg="$color3"
      >
        {/* Grande e spaziato: si ricopia a mano, magari dal telefono. */}
        <Text
          fontSize={32}
          fontWeight="700"
          letterSpacing={4}
          color="$color12"
          selectable
        >
          {userCode}
        </Text>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(userCode)
              .then(() => toast.success(t('copied')))
          }
        >
          <Copy size={14} color="$color12" />
          {t('copy')}
        </Button>
      </XStack>

      {/* Come «Apri il login» degli altri negozi (`store-link-form`): una
          scheda nuova, e il dialogo resta qui ad aspettare. */}
      <Button
        variant="outline"
        onClick={() => window.open(verificationUri, '_blank', 'noopener')}
      >
        {t('open')}
        <ExternalLink size={14} color="$color12" />
      </Button>

      <YStack gap={4}>
        <Text fontSize={14}>{t('step1')}</Text>
        <Text fontSize={14}>{t('step2')}</Text>
        <Text fontSize={14}>{t('step3')}</Text>
      </YStack>

      <XStack items="center" gap={8}>
        <Spinner>
          <LoaderCircle size={16} color="$color11" />
        </Spinner>
        <Text fontSize={13} color="$color11">
          {t('waiting')}
        </Text>
      </XStack>
      <Text fontSize={12} color="$color11">
        {t('validFor', { time })}
        {' · '}
        {t('closeHint')}
      </Text>
    </YStack>
  );
}

function failureText(
  t: ReturnType<typeof useTranslations<'account.xbox'>>,
  status: XboxLoginStatus | undefined,
) {
  switch (status?.reason) {
    case 'declined':
      return t('declined');
    case 'no_profile':
      return t('noProfile');
    case 'country':
      return t('country');
    case 'child':
      return t('child');
    case 'wrong_account':
      return t('wrongAccount');
    default:
      return t('failed');
  }
}
