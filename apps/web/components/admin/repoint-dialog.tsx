import type { GameAdminDetail, IgdbSearchHit } from '@repo/contracts';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Text,
  toast,
  YStack,
} from '@repo/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { IgdbPicker } from '@/components/admin/igdb-pick-dialog';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

type Link = GameAdminDetail['links'][number];
type Suggestion = GameAdminDetail['reports'][number]['suggestions'][number];

/**
 * «Non è questo gioco» (11a, frame 6 del wireframe): un dialogo solo, in due
 * tempi. Prima si sceglie il gioco giusto con la ricerca IGDB — che parte dal
 * suggerimento di chi l'ha segnalato, se c'è —, poi si vede cosa succede utente
 * per utente, e solo allora si conferma. L'anteprima non scrive niente.
 */
export function RepointDialog({
  link,
  gameName,
  suggestions,
  onOpenChange,
  onDone,
}: {
  link: Link | null;
  gameName: string;
  suggestions: Suggestion[];
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<unknown>;
}) {
  const t = useTranslations('admin.repoint');
  const tStore = useTranslations('store');
  const tMedium = useTranslations('medium');
  const errorMessage = useApiErrorMessage();
  const platforms = useQuery(api.platforms.list.queryOptions());
  const platformName = (slug: string) =>
    platforms.data?.find((p) => p.slug === slug)?.name ?? slug;
  const [target, setTarget] = useState<IgdbSearchHit | null>(null);

  useEffect(() => setTarget(null), [link]);

  // Un id IGDB suggerito si cerca per id: la ricerca lo riconosce e lo mette
  // in cima. Altrimenti il nome suggerito, altrimenti quello del gioco.
  const suggested = suggestions.find((s) => s.igdbId !== null);
  const initialQuery = suggested?.igdbId
    ? String(suggested.igdbId)
    : (suggestions.find((s) => s.name)?.name ?? gameName);

  const preview = useQuery({
    ...api.admin.links.repointPreview.queryOptions({
      input: { linkId: link?.id ?? '', igdbId: target?.igdbId ?? 0 },
    }),
    enabled: link !== null && target !== null,
    retry: false,
  });

  const repoint = useMutation({
    mutationFn: () =>
      client.admin.links.repoint({ linkId: link!.id, igdbId: target!.igdbId }),
    onSuccess: async (result) => {
      await onDone();
      toast.success(t('done', { copies: result.copies }));
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  const store = link ? tStore(link.source) : '';

  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent maxW={620}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {link
              ? t('current', { store, id: link.externalId, game: gameName })
              : ''}
          </DialogDescription>
        </DialogHeader>

        {link && target === null ? (
          <YStack gap={12}>
            {suggestions.length > 0 ? (
              <Text fontSize={13} color="$color11">
                {t('suggested', {
                  list: suggestions
                    .map((s) =>
                      [s.name, s.igdbId ? `IGDB ${s.igdbId}` : null]
                        .filter(Boolean)
                        .join(' · '),
                    )
                    .join('; '),
                })}
              </Text>
            ) : null}
            <IgdbPicker
              key={link.id}
              initialQuery={initialQuery}
              onPick={setTarget}
            />
          </YStack>
        ) : null}

        {link && target !== null ? (
          <YStack gap={12}>
            <Text fontSize={14} fontWeight="600">
              {t('preview')}
            </Text>
            {preview.isPending ? (
              <Skeleton height={120} width="100%" rounded={8} />
            ) : preview.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {hasErrorCode(preview.error, 'CONFLICT')
                    ? t('sameGame')
                    : t('previewFailed')}
                </AlertDescription>
              </Alert>
            ) : (
              <YStack
                gap={8}
                p={12}
                rounded={8}
                borderWidth={1}
                borderColor="$borderColor"
              >
                <Text fontSize={13}>
                  ·{' '}
                  {t('linkTo', {
                    store,
                    id: link.externalId,
                    game: `${preview.data.to.name}${target.releaseYear ? ` (${target.releaseYear})` : ''}`,
                  })}{' '}
                  {preview.data.to.inCatalog ? '' : t('notInCatalog')}
                </Text>
                {preview.data.moves.length === 0 ? (
                  <Text fontSize={13} color="$color11">
                    · {t('nobody', { store })}
                  </Text>
                ) : (
                  preview.data.moves.map((move, index) => (
                    <YStack key={index} gap={2}>
                      <Text fontSize={13} fontWeight="500">
                        · {move.userName}:{' '}
                        {move.copies
                          .map((copy) =>
                            [
                              platformName(copy.platformSlug),
                              copy.medium ? tMedium(copy.medium) : null,
                              copy.account,
                            ]
                              .filter(Boolean)
                              .join(' · '),
                          )
                          .join('; ')}
                      </Text>
                      <Text fontSize={12} color="$color11" pl={10}>
                        {move.wholeRow ? t('wholeRow') : t('copiesOnly')}
                      </Text>
                    </YStack>
                  ))
                )}
                <Text fontSize={13} color="$color11">
                  · {t('reportsClose')}
                </Text>
              </YStack>
            )}
            {preview.data && preview.data.otherIdsSameStore.length > 0 ? (
              <Alert>
                <AlertDescription>
                  {t('otherIds', {
                    store,
                    list: preview.data.otherIdsSameStore
                      .map((other) => other.externalId)
                      .join(', '),
                  })}
                </AlertDescription>
              </Alert>
            ) : null}
          </YStack>
        ) : null}

        {target !== null ? (
          <DialogFooter>
            <Button
              variant="outline"
              onPress={() => setTarget(null)}
              disabled={repoint.isPending}
            >
              {t('back')}
            </Button>
            <Button
              variant="outline"
              onPress={() => onOpenChange(false)}
              disabled={repoint.isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              onPress={() => repoint.mutate()}
              disabled={!preview.data || repoint.isPending}
            >
              {t('confirm')}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
