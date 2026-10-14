import { storePageUrl } from '@repo/contracts';
import type { UnresolvedImport } from '@repo/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'use-intl';

import { IgdbPicker } from '@/components/admin/igdb-pick-dialog';
import { UnresolvedCover } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { ExternalLink } from '@/src/components/external-link';

/**
 * Sistema a mano una voce che l'import non ha saputo risolvere.
 *
 * In testa tutto ciò che sappiamo della voce — negozio e account, id, ore, date,
 * il link alla sua pagina — con la copertina del negozio della stessa misura di
 * quelle dei risultati: si sceglie confrontando. Sotto, `IgdbPicker`: la ricerca
 * parte dal nome che dava il negozio, che è quasi sempre sbagliato in modo utile
 * ("Starbound - Unstable" → "Starbound"), e si può correggere prima di cercare.
 */
export function ResolveImportDialog({
  entry,
  onOpenChange,
}: {
  entry: UnresolvedImport | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('account.unresolved');
  const format = useFormatter();
  const storeLabels = useStoreLabels();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const resolve = useMutation({
    mutationFn: (igdbId: number) =>
      client.imports.resolve({ id: entry!.id, igdbId }),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: api.imports.unresolved.key(),
        }),
        queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
      ]);
      toast.success(t('resolved', { name: created.game.name }));
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('resolveFailed') })),
  });

  // Una data e non «3 giorni fa»: il tempo relativo dipende dall'ora di chi lo
  // calcola, e server e browser scriverebbero due testi diversi.
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium' });
  const pageUrl = entry ? storePageUrl(entry.store, entry.storePage) : null;
  const facts = entry
    ? [
        entry.playtimeMinutes
          ? t('hours', { hours: Math.round(entry.playtimeMinutes / 60) })
          : null,
        entry.lastPlayedAt
          ? t('lastPlayedOn', { date: date(entry.lastPlayedAt) })
          : null,
        entry.hiddenAt
          ? t('hiddenOn', { date: date(entry.hiddenAt) })
          : t('addedOn', { date: date(entry.createdAt) }),
      ].filter(Boolean)
    : [];

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('resolveTitle')}</DialogTitle>
        </DialogHeader>

        {entry ? (
          <YStack gap={16}>
            <XStack gap={16} items="flex-start">
              <UnresolvedCover
                key={entry.id}
                entry={entry}
                width={90}
                height={128}
              />
              <YStack flex={1} minW={0} gap={6}>
                <Text fontSize={14} fontWeight="500" color="$color12">
                  {entry.name}
                </Text>
                <Text fontSize={13} color="$color11">
                  {[storeLabels[entry.store], entry.storeName]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <YStack>
                  <Text fontSize={12} color="$color11">
                    {t('externalId')}
                  </Text>
                  {/* Intero, e selezionabile: è ciò che si copia per cercarlo. */}
                  <Text
                    fontSize={13}
                    color="$color12"
                    {...({
                      style: { wordBreak: 'break-all', userSelect: 'text' },
                    } as object)}
                  >
                    {entry.externalId}
                  </Text>
                </YStack>
                <Text fontSize={13} color="$color11">
                  {facts.join(' · ')}
                </Text>
                {pageUrl ? (
                  <Text fontSize={13}>
                    <ExternalLink href={pageUrl}>
                      {t('openOn', { store: storeLabels[entry.store] })} ↗
                    </ExternalLink>
                  </Text>
                ) : null}
              </YStack>
            </XStack>

            {/* Rimontato a ogni voce: riparte dal suo nome, e lo cerca. */}
            <IgdbPicker
              key={entry.id}
              initialQuery={entry.name}
              pending={resolve.isPending}
              onPick={(hit) => resolve.mutate(hit.igdbId)}
            />
          </YStack>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
