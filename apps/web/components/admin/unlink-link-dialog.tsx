import type { GameAdminDetail } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { UnresolvedCover } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { client } from '@/lib/orpc';

type Link = GameAdminDetail['links'][number];

/**
 * «Scollega» (9a GOG): toglie una riga di `external_ids` e nient'altro. È per
 * la voce che IGDB non ha e che il nome ha attaccato a un altro gioco, il
 * Prologue di _Legend of Keepers_, dove «Non è questo gioco» non ha un gioco
 * giusto da offrire.
 *
 * Regge solo se un altro id dello stesso negozio punta allo stesso gioco: il
 * reimport rimette la voce fra i «Possibili doppioni» accanto a quella. Con
 * l'id unico il dialogo lo spiega e offre di ripuntare, invece di un bottone
 * spento: un tooltip su un bottone disattivato non si apre in modo affidabile.
 */
export function UnlinkLinkDialog({
  link,
  onlyLink,
  gameName,
  onOpenChange,
  onRepoint,
  onDone,
}: {
  link: Link | null;
  /** Nessun altro id dello stesso negozio su questo gioco. */
  onlyLink: boolean;
  gameName: string;
  onOpenChange: (open: boolean) => void;
  onRepoint: (link: Link) => void;
  onDone: () => Promise<unknown>;
}) {
  const t = useTranslations('admin.unlink');
  const tGame = useTranslations('admin.game');
  const tStore = useTranslations('store');
  const errorMessage = useApiErrorMessage();
  const store = link ? tStore(link.source) : '';

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

        {onlyLink ? (
          <Text fontSize={14}>{t('onlyLink', { store })}</Text>
        ) : (
          <YStack gap={8}>
            <Text fontSize={14}>{t('body')}</Text>
            <Text fontSize={14} color="$color11">
              {t('next', { store })}
            </Text>
          </YStack>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {onlyLink ? t('close') : t('cancel')}
          </Button>
          {onlyLink ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                onRepoint(link!);
              }}
            >
              {tGame('notThis')}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => unlink.mutate()}
              disabled={unlink.isPending}
            >
              {t('confirm')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
