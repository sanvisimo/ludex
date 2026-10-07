import {
  Alert,
  AlertDescription,
  Button,
  Spinner,
  Text,
  YStack,
  toast,
} from '@repo/ui';
import { LoaderCircle } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * Ogni quanto si chiede al server a che punto è il login. Due secondi: abbastanza
 * da non far aspettare chi ha appena premuto «conferma», pochi abbastanza da non
 * pesare — la richiesta legge una `Map` in memoria.
 */
const POLL_MS = 2000;

/**
 * Il login Steam col QR: l'immagine, i tre passi da fare nell'app, e lo stato.
 *
 * **Il codice si chiede all'apertura del pannello**, non a un clic: chi ha
 * premuto «Accedi con Steam» ha già detto di volerlo, e un secondo bottone per
 * far comparire il QR sarebbe un gesto di troppo.
 *
 * Il server tiene la sessione e scrive l'account da sé alla conferma, quindi
 * qui basta chiedere lo stato finché non è finito. **Chiudere il pannello smette
 * di chiedere**: la sessione muore da sola dopo cinque minuti, e una nuova
 * (`start`) annulla questa.
 *
 * `accountId` quando si ricollega un account già presente, o quando si aggiunge il
 * login a uno che aveva solo il profilo: il server controlla che l'app Steam sia
 * collegata a **quello** account, e dice `wrong_account` se no.
 */
export function SteamQrPanel({
  label,
  accountId,
  onDone,
}: {
  label?: string;
  accountId?: string;
  /** A login confermato. L'account è già scritto e l'import accodato. */
  onDone: () => void;
}) {
  const t = useTranslations('account.steamLogin');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  // C'è già un login vivo: rifarlo crea un altro dispositivo su Steam, e il
  // server lo dice prima di aprire una sessione. Si va avanti solo dopo che
  // l'utente ha confermato, e da lì in poi ogni nuovo codice è già confermato.
  const [existing, setExisting] = useState(false);
  const [replace, setReplace] = useState(false);

  const start = useMutation({
    mutationFn: (replaceExisting: boolean) =>
      client.accounts.steamLogin.start({
        label: label?.trim() || null,
        accountId: accountId ?? null,
        replace: replaceExisting,
      }),
    onSuccess: () => setExisting(false),
    onError: (error) => {
      if (hasErrorCode(error, 'PRECONDITION_FAILED')) {
        setExisting(true);
        return;
      }
      toast.error(errorMessage(error, { fallback: t('startFailed') }));
    },
  });

  // Una volta, all'apertura. In sviluppo React monta due volte: la seconda
  // `start` annulla la prima sul server (una sessione per utente), e `start.data`
  // è quella dell'ultima chiamata.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => start.mutate(false), []);

  const loginId = start.data?.loginId;
  const status = useQuery({
    ...api.accounts.steamLogin.status.queryOptions({
      input: { loginId: loginId ?? '' },
    }),
    enabled: loginId !== undefined,
    // Si ferma da sé quando il login è finito, comunque sia andato.
    refetchInterval: (query) => {
      const state = query.state.data?.status;
      return state === 'done' || state === 'expired' || state === 'failed'
        ? false
        : POLL_MS;
    },
    staleTime: 0,
  });

  const state = status.data?.status;

  // Una volta sola: `onDone` cambia identità a ogni render di chi lo passa, e
  // senza il guard un secondo render prima che il dialogo si chiuda rifarebbe il
  // toast.
  const finished = useRef(false);
  useEffect(() => {
    if (state !== 'done' || finished.current) return;
    finished.current = true;
    void queryClient.invalidateQueries({ queryKey: api.accounts.list.key() });
    toast.success(t('done'));
    onDone();
  }, [state, queryClient, t, onDone]);

  const newCode = (
    <Button variant="outline" onClick={() => start.mutate(replace)}>
      {t('newCode')}
    </Button>
  );

  if (existing && !start.isPending) {
    return (
      <YStack gap={12}>
        <Alert variant="destructive">
          <AlertDescription>{t('existing')}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          self="flex-start"
          onClick={() => {
            setReplace(true);
            start.mutate(true);
          }}
        >
          {t('existingConfirm')}
        </Button>
      </YStack>
    );
  }

  if (start.isError) {
    return (
      <YStack gap={12} items="center">
        <Alert variant="destructive" width="100%">
          <AlertDescription>{t('startFailed')}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => start.mutate(replace)}>
          {t('retry')}
        </Button>
      </YStack>
    );
  }

  if (start.isPending || !start.data || !state) {
    return (
      <YStack gap={8} items="center" py={48}>
        <Spinner>
          <LoaderCircle size={24} color="$color11" />
        </Spinner>
        <Text fontSize={13} color="$color11">
          {t('preparing')}
        </Text>
      </YStack>
    );
  }

  // Inquadrato: il QR non serve più, manca la conferma nell'app.
  if (state === 'scanned' || state === 'done') {
    return (
      <YStack gap={8} items="center" py={48}>
        <Spinner>
          <LoaderCircle size={24} color="$color11" />
        </Spinner>
        <Text fontWeight="600" color="$color12">
          {t('scanned')}
        </Text>
      </YStack>
    );
  }

  if (state === 'expired') {
    return (
      <YStack gap={12} items="center" py={24}>
        <Text color="$color11">{t('expired')}</Text>
        {newCode}
      </YStack>
    );
  }

  if (state === 'failed') {
    return (
      <YStack gap={12} items="center">
        <Alert variant="destructive" width="100%">
          <AlertDescription>
            {status.data?.reason === 'wrong_account'
              ? t('wrongAccount')
              : t('failed')}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => start.mutate(replace)}>
          {t('retry')}
        </Button>
      </YStack>
    );
  }

  // `waiting`
  return (
    <YStack gap={16} items="center">
      {/* Bianco, sempre: un QR su fondo scuro molti lettori non lo leggono. */}
      <img
        src={start.data.qrImage}
        alt={t('qrAlt')}
        width={200}
        height={200}
        style={{ background: '#fff', borderRadius: 8 }}
      />
      <Text fontSize={13} color="$color11">
        {t('waiting')}
      </Text>
      <YStack gap={4} self="stretch">
        <Text fontSize={14}>{t('step1')}</Text>
        <Text fontSize={14}>{t('step2')}</Text>
        <Text fontSize={14}>{t('step3')}</Text>
      </YStack>
      <Text fontSize={12} color="$color11">
        {t('validFor')}
      </Text>
      {newCode}
    </YStack>
  );
}
