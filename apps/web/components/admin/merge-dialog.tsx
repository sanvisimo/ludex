import type { MergeGame } from '@repo/contracts';
import {
  Alert,
  AlertDescription,
  Button,
  ClearableInput,
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
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { GameCover } from '@/components/game-cover';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import { useStatusLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

type Picked = Pick<MergeGame, 'id' | 'name'> & {
  coverImageId?: string | null;
  year?: number | null;
};

/**
 * La fusione di due giochi (11b): un dialogo solo, in due tempi come «Non è
 * questo gioco». Prima si sceglie l'altro gioco dal catalogo — o ci si arriva
 * già scelto, da «Collega a IGDB» con un id già preso —, poi si vede cosa
 * succede utente per utente, e solo allora si conferma. L'anteprima non scrive
 * niente; la fusione non si disfa.
 */
export function MergeDialog({
  open,
  game,
  other,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  /** Il gioco da cui si parte. */
  game: { id: string; name: string };
  /** L'altro, se già scelto. Altrimenti lo si cerca nel catalogo. */
  other?: Picked | null;
  onOpenChange: (open: boolean) => void;
  /** Il gioco che resta, a fusione fatta: chi chiama aggiorna e naviga. */
  onDone: (survivor: MergeGame) => Promise<unknown> | void;
}) {
  const t = useTranslations('admin.merge');
  const statusLabels = useStatusLabels();
  const errorMessage = useApiErrorMessage();
  const [target, setTarget] = useState<Picked | null>(other ?? null);

  useEffect(() => setTarget(other ?? null), [open, other]);

  const preview = useQuery({
    ...api.admin.games.mergePreview.queryOptions({
      input: { gameId: game.id, otherId: target?.id ?? '' },
    }),
    enabled: open && target !== null,
    retry: false,
  });

  const merge = useMutation({
    mutationFn: () =>
      client.admin.games.merge({ gameId: game.id, otherId: target!.id }),
    onSuccess: async (result) => {
      toast.success(
        t('done', { users: result.movedUsers + result.mergedUsers }),
      );
      onOpenChange(false);
      await onDone(result.survivor);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  const rating = (value: number | null) => (value === null ? '—' : value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { name: game.name })}
          </DialogDescription>
        </DialogHeader>

        {target === null ? (
          <GamePicker excludeId={game.id} onPick={setTarget} />
        ) : (
          <YStack gap={12}>
            <Text fontSize={14} fontWeight="600">
              {t('preview')}
            </Text>
            {preview.isPending ? (
              <Skeleton height={140} width="100%" rounded={8} />
            ) : preview.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {hasErrorCode(preview.error, 'CONFLICT')
                    ? errorMessage(preview.error, {
                        fallback: t('previewFailed'),
                      })
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
                <Text fontSize={13} fontWeight="500">
                  ·{' '}
                  {t('survives', {
                    name: preview.data.survivor.name,
                    igdb: preview.data.survivor.igdbId
                      ? `IGDB ${preview.data.survivor.igdbId}`
                      : t('noIgdb'),
                  })}
                </Text>
                <Text fontSize={13}>
                  ·{' '}
                  {t('absorbed', {
                    name: preview.data.absorbed.name,
                    slug: preview.data.absorbed.slug,
                  })}
                </Text>
                <Text fontSize={13} color="$color11">
                  ·{' '}
                  {t('counts', {
                    moved: preview.data.moved,
                    both: preview.data.both.length,
                    only: preview.data.onlySurvivor,
                  })}
                </Text>
                {preview.data.both.map((user, index) => (
                  <YStack key={index} gap={2} pl={10}>
                    <Text fontSize={13} fontWeight="500">
                      {user.userName}
                    </Text>
                    <Text fontSize={12} color="$color11">
                      {t('bothStatus', {
                        a: statusLabels[user.statuses[0]],
                        b: statusLabels[user.statuses[1]],
                        result: statusLabels[user.status],
                      })}
                      {user.ratings[0] !== null || user.ratings[1] !== null
                        ? ` · ${t('bothRating', {
                            a: rating(user.ratings[0]),
                            b: rating(user.ratings[1]),
                            result: rating(user.rating),
                          })}`
                        : ''}
                    </Text>
                  </YStack>
                ))}
                {preview.data.both.length > 0 ? (
                  <Text fontSize={12} color="$color11">
                    {t('bothRest')}
                  </Text>
                ) : null}
                <Text fontSize={13} color="$color11">
                  ·{' '}
                  {t('rest', {
                    ids: preview.data.externalIds,
                    wishlist: preview.data.wishlistItems,
                  })}
                </Text>
              </YStack>
            )}
            <Alert variant="destructive">
              <AlertDescription>{t('irreversible')}</AlertDescription>
            </Alert>
          </YStack>
        )}

        {target !== null ? (
          <DialogFooter>
            {other ? null : (
              <Button
                variant="outline"
                onPress={() => setTarget(null)}
                disabled={merge.isPending}
              >
                {t('back')}
              </Button>
            )}
            <Button
              variant="outline"
              onPress={() => onOpenChange(false)}
              disabled={merge.isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              onPress={() => merge.mutate()}
              disabled={!preview.data || merge.isPending}
            >
              {t('confirm')}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** La ricerca nel catalogo, per scegliere l'altro gioco. Non porta da nessuna parte. */
function GamePicker({
  excludeId,
  onPick,
}: {
  excludeId: string;
  onPick: (game: Picked) => void;
}) {
  const t = useTranslations('admin.merge');
  const tSearch = useTranslations('search');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const found = useQuery({
    ...api.games.find.queryOptions({ input: { q, limit: 10 } }),
    enabled: q.length >= 2,
  });
  const games = found.data?.games.filter((game) => game.id !== excludeId);

  return (
    <YStack gap={8}>
      <ClearableInput
        value={text}
        onChangeText={setText}
        placeholder={t('find')}
        aria-label={t('find')}
        clearLabel={tSearch('clear')}
        autoFocus
      />
      {games?.length === 0 ? (
        <Text fontSize={13} color="$color11">
          {t('findEmpty')}
        </Text>
      ) : null}
      {games?.map((game) => (
        <XStack
          key={game.id}
          render="button"
          items="center"
          gap={8}
          px={8}
          py={4}
          rounded={6}
          bg="transparent"
          borderWidth={0}
          cursor="pointer"
          hoverStyle={{ bg: '$color3' }}
          onPress={() =>
            onPick({
              id: game.id,
              name: game.name,
              coverImageId: game.coverImageId,
              year: game.firstReleaseDate?.getFullYear() ?? null,
            })
          }
        >
          <GameCover imageId={game.coverImageId} name={game.name} width={24} />
          <Text fontSize={13} numberOfLines={1} flex={1} minW={0}>
            {game.name}
            {game.firstReleaseDate
              ? ` (${game.firstReleaseDate.getFullYear()})`
              : ''}
          </Text>
        </XStack>
      ))}
    </YStack>
  );
}
