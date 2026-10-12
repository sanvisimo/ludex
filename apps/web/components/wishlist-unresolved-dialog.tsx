import type { WishlistUnresolved } from '@repo/contracts';
import { storePageUrl } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { ChevronLeft } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { IgdbPicker } from '@/components/admin/igdb-pick-dialog';
import { UnresolvedCover } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { ExternalLink } from '@/src/components/external-link';

/**
 * Le voci di una wishlist di negozio che l'import non ha saputo legare a un gioco
 * (15e): si collegano a mano a un gioco di IGDB, o si mettono da parte se non sono
 * giochi (un software, un bundle). Quelle messe da parte stanno sotto «Mostra le
 * nascoste», e si rimettono fra quelle da sistemare.
 *
 * Le voci vengono dal negozio e si riscrivono a ogni aggiornamento (nome,
 * copertina); ciò che qui si decide — nascondere — resta.
 */
export function WishlistUnresolvedDialog({
  listId,
  open,
  onOpenChange,
}: {
  listId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('wishlist.store.unresolved');
  const format = useFormatter();
  const storeLabels = useStoreLabels();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState<WishlistUnresolved | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const entries = useQuery({
    ...api.wishlists.unresolved.list.queryOptions({ input: { listId } }),
    enabled: open,
  });
  const rows = entries.data ?? [];
  const pending = rows.filter((row) => !row.hiddenAt);
  const hidden = rows.filter((row) => row.hiddenAt);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: api.wishlists.key() });

  const resolve = useMutation({
    mutationFn: (input: { id: string; igdbId: number }) =>
      client.wishlists.unresolved.resolve(input),
    onSuccess: async () => {
      await refresh();
      toast.success(t('resolved', { name: resolving?.name ?? '' }));
      setResolving(null);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('resolveFailed') })),
  });

  const setHidden = useMutation({
    mutationFn: (input: { id: string; hidden: boolean }) =>
      client.wishlists.unresolved.setHidden(input),
    onSuccess: refresh,
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('hideFailed') })),
  });

  // Una data e non «3 giorni fa»: il tempo relativo dipende dall'ora di chi lo
  // calcola, e server e browser scriverebbero due testi diversi.
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium' });

  const row = (entry: WishlistUnresolved) => {
    const pageUrl = storePageUrl(entry.store, entry.storePage);
    return (
      <XStack key={entry.id} gap={12} items="center" py={8}>
        <UnresolvedCover key={entry.id} entry={entry} width={44} height={64} />
        <YStack flex={1} minW={0} gap={2}>
          <Text
            fontWeight="500"
            color="$color12"
            // Gli attributi dell'elemento non sono nei tipi del testo: l'id del
            // negozio sta nel suggerimento, per riconoscere una voce che si chiama
            // «Production».
            {...({ title: entry.externalId } as object)}
          >
            {entry.name}
          </Text>
          <Text fontSize={13} lineHeight={18} color="$color11">
            {[
              storeLabels[entry.store],
              entry.hiddenAt
                ? t('hiddenOn', { date: date(entry.hiddenAt) })
                : entry.addedAt
                  ? t('addedOn', { date: date(entry.addedAt) })
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {pageUrl ? (
              <>
                {' · '}
                <ExternalLink href={pageUrl}>
                  {t('openOn', { store: storeLabels[entry.store] })} ↗
                </ExternalLink>
              </>
            ) : null}
          </Text>
        </YStack>
        <XStack gap={8} shrink={0} flexWrap="wrap" justify="flex-end">
          {entry.hiddenAt ? (
            <Button
              size="sm"
              variant="outline"
              disabled={setHidden.isPending}
              onClick={() => setHidden.mutate({ id: entry.id, hidden: false })}
            >
              {t('restore')}
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={() => setResolving(entry)}>
                {t('link')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={setHidden.isPending}
                onClick={() => setHidden.mutate({ id: entry.id, hidden: true })}
              >
                {t('hide')}
              </Button>
            </>
          )}
        </XStack>
      </XStack>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Riaprendolo si riparte dall'elenco.
        if (!next) {
          setResolving(null);
          setShowHidden(false);
        }
      }}
    >
      <DialogContent maxW={720}>
        {resolving ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('resolveTitle')}</DialogTitle>
            </DialogHeader>
            <YStack gap={16}>
              <XStack gap={16} items="flex-start">
                <UnresolvedCover
                  key={resolving.id}
                  entry={resolving}
                  width={90}
                  height={128}
                />
                <YStack flex={1} minW={0} gap={6}>
                  <Text fontSize={14} fontWeight="500" color="$color12">
                    {resolving.name}
                  </Text>
                  <Text fontSize={13} color="$color11">
                    {storeLabels[resolving.store]}
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
                      {resolving.externalId}
                    </Text>
                  </YStack>
                </YStack>
              </XStack>
              <Button
                variant="ghost"
                size="sm"
                self="flex-start"
                onClick={() => setResolving(null)}
              >
                <ChevronLeft size={14} color="$color11" />
                {t('back')}
              </Button>
              {/* Rimontato a ogni voce: riparte dal suo nome, e lo cerca. */}
              <IgdbPicker
                key={resolving.id}
                initialQuery={resolving.name}
                pending={resolve.isPending}
                onPick={(hit) =>
                  resolve.mutate({ id: resolving.id, igdbId: hit.igdbId })
                }
              />
            </YStack>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('title')}</DialogTitle>
              <DialogDescription>{t('description')}</DialogDescription>
            </DialogHeader>
            <YStack
              gap={0}
              // Molte voci non devono allungare il dialogo oltre la finestra.
              {...({
                style: { maxHeight: '60vh', overflowY: 'auto' },
              } as object)}
            >
              {entries.isPending ? (
                <Skeleton height={64} rounded={6} />
              ) : entries.error ? (
                <Text fontSize={14} color="$red11">
                  {t('loadFailed')}
                </Text>
              ) : (
                <>
                  {pending.length === 0 ? (
                    <Text fontSize={14} color="$color11" py={8}>
                      {t('none')}
                    </Text>
                  ) : (
                    pending.map(row)
                  )}
                  {hidden.length > 0 && (
                    <YStack gap={0} mt={8}>
                      <Button
                        variant="ghost"
                        size="sm"
                        self="flex-start"
                        px={0}
                        onClick={() => setShowHidden((value) => !value)}
                      >
                        {showHidden
                          ? t('hideHidden')
                          : t('showHidden', { count: hidden.length })}
                      </Button>
                      {showHidden && hidden.map(row)}
                    </YStack>
                  )}
                </>
              )}
            </YStack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
