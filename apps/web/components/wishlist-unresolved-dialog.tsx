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

import { IgdbMatch } from '@/components/admin/igdb-pick-dialog';
import { StoreEntryCard } from '@/components/store-entry-card';
import { UnresolvedCover } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { ExternalLink } from '@/src/components/external-link';

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
  const tMatch = useTranslations('gameMatch');
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
        if (!next) {
          setResolving(null);
          setShowHidden(false);
        }
      }}
    >
      <DialogContent
        size={resolving ? 'wide' : 'default'}
        $lg={{ maxW: resolving ? 960 : 560 }}
        closeLabel={tMatch('close')}
      >
        {resolving ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('resolveTitle')}</DialogTitle>
            </DialogHeader>
            <IgdbMatch
              key={resolving.id}
              initialQuery={resolving.name}
              pending={resolve.isPending}
              onConfirm={(hit) =>
                resolve.mutate({ id: resolving.id, igdbId: hit.igdbId })
              }
              onCancel={() => setResolving(null)}
              reference={
                <>
                  <StoreEntryCard
                    reference
                    store={resolving.store}
                    externalIds={[resolving.externalId]}
                    imageUrl={resolving.imageUrl}
                    title={resolving.name}
                    subtitle={storeLabels[resolving.store]}
                    facts={
                      resolving.addedAt
                        ? [t('addedOn', { date: date(resolving.addedAt) })]
                        : []
                    }
                    pageUrl={storePageUrl(resolving.store, resolving.storePage)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    self="flex-start"
                    onPress={() => setResolving(null)}
                    disabled={resolve.isPending}
                  >
                    <ChevronLeft size={14} />
                    {t('back')}
                  </Button>
                </>
              }
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('title')}</DialogTitle>
              <DialogDescription>{t('description')}</DialogDescription>
            </DialogHeader>
            <YStack
              gap={0}
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
