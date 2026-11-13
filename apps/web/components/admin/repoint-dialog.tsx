import type { GameAdminDetail, IgdbSearchHit } from '@repo/contracts';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
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
import { StoreEntryCard } from '@/components/store-entry-card';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

type Link = GameAdminDetail['links'][number];
type Suggestion = GameAdminDetail['reports'][number]['suggestions'][number];

export function RepointDialog({
  link,
  gameName,
  gameIgdbId,
  suggestions,
  onOpenChange,
  onDone,
}: {
  link: Link | null;
  gameName: string;
  gameIgdbId: number | null;
  suggestions: Suggestion[];
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<unknown>;
}) {
  const t = useTranslations('admin.repoint');
  const tMatch = useTranslations('gameMatch');
  const tStore = useTranslations('store');
  const tMedium = useTranslations('medium');
  const errorMessage = useApiErrorMessage();
  const platforms = useQuery(api.platforms.list.queryOptions());
  const platformName = (slug: string) =>
    platforms.data?.find((p) => p.slug === slug)?.name ?? slug;
  const [target, setTarget] = useState<IgdbSearchHit | null>(null);

  useEffect(() => setTarget(null), [link]);

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
      <DialogContent
        size="wide"
        $lg={{ maxW: 960 }}
        closeLabel={tMatch('close')}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        {link ? (
          <YStack className="game-match-layout">
            <YStack className="game-match-source" gap={16}>
              <StoreEntryCard
                key={link.id}
                reference
                store={link.source}
                externalIds={[link.externalId]}
                imageUrl={link.storeImageUrl}
                title={link.storeTitle}
                subtitle={[store, ...link.platforms].join(' · ')}
                facts={[]}
                pageUrl={link.url}
              />
              <YStack
                gap={6}
                p={12}
                rounded={8}
                bg="$blue2"
                borderWidth={1}
                borderColor="$blue8"
              >
                <Text fontSize={12} color="$blue11">
                  {t('currentlyLinked')}
                </Text>
                <Text
                  fontSize={14}
                  lineHeight={20}
                  fontWeight="600"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {gameName}
                </Text>
                {gameIgdbId !== null ? (
                  <Text fontSize={12} color="$color11">
                    IGDB {gameIgdbId}
                  </Text>
                ) : null}
              </YStack>
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
            </YStack>
            <YStack gap={20} minW={0}>
              <IgdbPicker
                key={link.id}
                initialQuery={initialQuery}
                selected={target}
                currentIgdbId={gameIgdbId}
                onSelect={setTarget}
                pending={repoint.isPending}
              />
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
            </YStack>
          </YStack>
        ) : null}

        <DialogFooter flexWrap="wrap">
          <Text
            flex={1}
            $max-sm={{ grow: 0, shrink: 0, flexBasis: 'auto' }}
            minW={0}
            fontSize={13}
            fontWeight="600"
            style={{ overflowWrap: 'anywhere' }}
          >
            {target
              ? `${target.name}${target.releaseYear ? ` (${target.releaseYear})` : ''}`
              : tMatch('selectHint')}
          </Text>
          <Button
            variant="outline"
            onPress={() => setTarget(null)}
            disabled={repoint.isPending || !target}
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
            disabled={
              !target ||
              !preview.data ||
              preview.isFetching ||
              preview.isError ||
              repoint.isPending
            }
          >
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
