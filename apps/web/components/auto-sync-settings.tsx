import { AUTO_SYNC_EVERY_DAYS, type UserSettings } from '@repo/contracts';
import {
  Button,
  Label,
  Switch,
  Text,
  Tooltip,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { CircleHelp } from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * La riga sopra le schede: l'interruttore generale «Aggiornamento automatico»
 * e, a destra, ciò che gli sta accanto — «Aggiungi libreria».
 *
 * L'interruttore vale per tutti gli account; ogni scheda ha poi il suo, e
 * servono tutti e due accesi. Acceso di default, ed è giusto che si veda: su
 * PSN non è una comodità, è ciò che tiene vivo il collegamento, e un utente che
 * lo spegne deve saperlo **prima**, non dieci giorni dopo.
 *
 * Il «?» spiega cosa vuol dire, in due modi insieme: al passaggio e al focus un
 * suggerimento, e al clic lo stesso testo **sotto la riga**. Il suggerimento
 * non compare su un telefono, dove il mouse non c'è, e la spiegazione serve
 * soprattutto lì.
 */
export function AutoSyncSettings({
  settings,
  hasPsn,
  children,
}: {
  settings: UserSettings;
  /** C'è un account PSN collegato: è l'unico caso in cui spegnere costa. */
  hasPsn: boolean;
  /** I gesti a destra della riga. */
  children?: ReactNode;
}) {
  const t = useTranslations('account.autoSync');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const switchId = useId();
  const [explained, setExplained] = useState(false);

  const update = useMutation({
    mutationFn: (autoSyncLibrary: boolean) =>
      client.settings.update({ autoSyncLibrary }),
    onSuccess: (saved) =>
      queryClient.setQueryData(api.settings.get.queryKey(), saved),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  // Mentre la richiesta è in volo l'interruttore mostra già la scelta nuova:
  // tornare indietro per un istante farebbe credere che il clic non sia
  // arrivato.
  const checked = update.isPending
    ? (update.variables ?? settings.autoSyncLibrary)
    : settings.autoSyncLibrary;

  const description = t('description', {
    psnDays: AUTO_SYNC_EVERY_DAYS.psn,
    otherDays: AUTO_SYNC_EVERY_DAYS.steam,
  });

  return (
    <YStack gap={8}>
      <XStack
        items="center"
        justify="space-between"
        gap={12}
        flexWrap="wrap"
        px={16}
        py={8}
        rounded={12}
        borderWidth={1}
        borderColor="$borderColor"
      >
        <XStack items="center" gap={12}>
          <Switch
            id={switchId}
            checked={checked}
            onCheckedChange={(value) => update.mutate(value)}
            disabled={update.isPending}
          />
          <Label htmlFor={switchId}>{t('title')}</Label>
          <Tooltip content={description} placement="bottom">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('whatIsIt')}
              aria-expanded={explained}
              onClick={() => setExplained((value) => !value)}
            >
              <CircleHelp size={16} color="$color11" />
            </Button>
          </Tooltip>
        </XStack>
        {children}
      </XStack>

      {explained && (
        <Text fontSize={13} lineHeight={18} color="$color11" px={4}>
          {description}
        </Text>
      )}
      {!checked && hasPsn && (
        <Text fontSize={13} lineHeight={18} color="$red11" px={4}>
          {t('psnWarning')}
        </Text>
      )}
    </YStack>
  );
}
