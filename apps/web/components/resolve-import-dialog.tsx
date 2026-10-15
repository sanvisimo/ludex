import { storePageUrl } from '@repo/contracts';
import type { UnresolvedImport } from '@repo/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  toast,
  YStack,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'use-intl';

import { IgdbPicker } from '@/components/admin/igdb-pick-dialog';
import { StoreEntryCard } from '@/components/store-entry-card';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

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
      ].filter((fact) => fact !== null)
    : [];

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('resolveTitle')}</DialogTitle>
        </DialogHeader>

        {entry ? (
          <YStack gap={16}>
            <StoreEntryCard
              key={entry.id}
              store={entry.store}
              externalIds={[entry.externalId]}
              imageUrl={entry.imageUrl}
              title={entry.name}
              subtitle={[storeLabels[entry.store], entry.storeName]
                .filter(Boolean)
                .join(' · ')}
              facts={facts}
              pageUrl={pageUrl}
            />

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
