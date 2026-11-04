import type { GameAdminDetail } from '@repo/contracts';
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
  XStack,
  YStack,
} from '@repo/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { UnresolvedCover } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

type Link = GameAdminDetail['links'][number];

/**
 * «Scollega» (9a GOG): è per la voce che IGDB non ha e che il nome ha attaccato
 * a un altro gioco, dove «Non è questo gioco» non ha un gioco giusto da offrire.
 *
 * Cosa fa lo dice il server (`unlinkPreview`). Con un altro id dello stesso
 * negozio sul gioco toglie solo la riga di `external_ids`. Sull'id unico di una
 * demo o di un Prologue le copie tornano fra gli scarti, e il dialogo mostra
 * cosa succede utente per utente. Sull'id unico di una voce qualunque lo spiega
 * e offre di ripuntare, invece di un bottone spento: un tooltip su un bottone
 * disattivato non si apre in modo affidabile.
 */
export function UnlinkLinkDialog({
  link,
  gameName,
  onOpenChange,
  onRepoint,
  onDone,
}: {
  link: Link | null;
  gameName: string;
  onOpenChange: (open: boolean) => void;
  onRepoint: (link: Link) => void;
  onDone: () => Promise<unknown>;
}) {
  const t = useTranslations('admin.unlink');
  const tGame = useTranslations('admin.game');
  const tStore = useTranslations('store');
  const tMedium = useTranslations('medium');
  const errorMessage = useApiErrorMessage();
  const store = link ? tStore(link.source) : '';
  const platforms = useQuery(api.platforms.list.queryOptions());
  const platformName = (slug: string) =>
    platforms.data?.find((p) => p.slug === slug)?.name ?? slug;

  const preview = useQuery({
    ...api.admin.links.unlinkPreview.queryOptions({
      input: { linkId: link?.id ?? '' },
    }),
    enabled: link !== null,
    retry: false,
  });
  const kind = preview.data?.kind;
  const moves = preview.data?.moves ?? [];

  const unlink = useMutation({
    mutationFn: () => client.admin.links.unlink({ linkId: link!.id }),
    onSuccess: async () => {
      await onDone();
      toast.success(t('done'));
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, {
          fallback: t('failed'),
          CONFLICT: t('onlyLink', { store }),
        }),
      ),
  });

  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <XStack gap={12} items="center">
            {link ? (
              <UnresolvedCover
                key={link.id}
                entry={{
                  store: link.source,
                  externalId: link.externalId,
                  imageUrl: link.storeImageUrl,
                }}
                width={60}
                height={86}
              />
            ) : null}
            <YStack flex={1} minW={0}>
              <DialogDescription>
                {link
                  ? link.storeTitle
                    ? t('currentTitled', {
                        store,
                        id: link.externalId,
                        title: link.storeTitle,
                        game: gameName,
                      })
                    : t('current', {
                        store,
                        id: link.externalId,
                        game: gameName,
                      })
                  : ''}
              </DialogDescription>
            </YStack>
          </XStack>
        </DialogHeader>

        {preview.isPending ? (
          <Skeleton height={80} width="100%" rounded={8} />
        ) : null}
        {preview.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t('previewFailed')}</AlertDescription>
          </Alert>
        ) : null}
        {kind === 'refused' ? (
          <Text fontSize={14}>{t('onlyLink', { store })}</Text>
        ) : null}
        {kind === 'link_only' ? (
          <YStack gap={8}>
            <Text fontSize={14}>{t('body')}</Text>
            <Text fontSize={14} color="$color11">
              {t('next', { store })}
            </Text>
          </YStack>
        ) : null}
        {kind === 'to_unresolved' ? (
          <YStack gap={12}>
            <Text fontSize={14}>{t('toUnresolved')}</Text>
            <Text fontSize={14} fontWeight="600">
              {t('preview')}
            </Text>
            <YStack
              gap={8}
              p={12}
              rounded={8}
              borderWidth={1}
              borderColor="$borderColor"
            >
              {moves.length === 0 ? (
                <Text fontSize={13} color="$color11">
                  · {t('nobody', { store })}
                </Text>
              ) : (
                moves.map((move, index) => (
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
                      {move.rowStays ? t('rowStays') : t('rowGone')}
                    </Text>
                  </YStack>
                ))
              )}
              <Text fontSize={13} color="$color11">
                · {t('reportsClose')}
              </Text>
            </YStack>
          </YStack>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {kind === 'refused' ? t('close') : t('cancel')}
          </Button>
          {kind === 'refused' || kind === 'to_unresolved' ? (
            <Button
              variant={kind === 'refused' ? undefined : 'outline'}
              onClick={() => {
                onOpenChange(false);
                onRepoint(link!);
              }}
            >
              {tGame('notThis')}
            </Button>
          ) : null}
          {kind === 'link_only' || kind === 'to_unresolved' ? (
            <Button
              variant="destructive"
              onClick={() => unlink.mutate()}
              disabled={unlink.isPending}
            >
              {t('confirm')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
