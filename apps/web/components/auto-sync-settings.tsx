import { AUTO_SYNC_EVERY_DAYS, type UserSettings } from '@repo/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Switch,
  XStack,
  toast,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * L'interruttore generale: «Aggiorna automaticamente la libreria».
 *
 * Vale per tutti gli account; ogni scheda ha poi il suo, e servono tutti e due
 * accesi. Acceso di default, ed è giusto che si veda: su PSN non è una
 * comodità, è ciò che tiene vivo il collegamento, e un utente che lo spegne
 * deve saperlo **prima**, non dieci giorni dopo.
 */
export function AutoSyncSettings({
  settings,
  hasPsn,
}: {
  settings: UserSettings;
  /** C'è un account PSN collegato: è l'unico caso in cui spegnere costa. */
  hasPsn: boolean;
}) {
  const t = useTranslations('account.autoSync');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent gap={12}>
        <XStack items="center" gap={12}>
          <Switch
            id="auto-sync-library"
            checked={checked}
            onCheckedChange={(value) => update.mutate(value)}
            disabled={update.isPending}
          />
          <Label htmlFor="auto-sync-library">{t('label')}</Label>
        </XStack>
        <p className="text-muted-foreground">
          {t('description', {
            psnDays: AUTO_SYNC_EVERY_DAYS.psn,
            otherDays: AUTO_SYNC_EVERY_DAYS.steam,
          })}
        </p>
        {!checked && hasPsn && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
            {t('psnWarning')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
