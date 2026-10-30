import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  Skeleton,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { Check, ListOrdered, Plus } from '@repo/ui/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { CuratedNameDialog } from '@/components/curated-playlist-menu';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * In quali playlist scelte a mano sta il gioco, e il modo di metterlo o
 * toglierlo. Le playlist si rileggono da sole, dalla `MutationCache`.
 */
function useCuratedMembership(gameId: string) {
  const t = useTranslations('curated.control');
  const errorMessage = useApiErrorMessage();
  const lists = useQuery(
    api.curatedPlaylists.forGame.queryOptions({ input: { gameId } }),
  );
  const toggle = useMutation({
    mutationFn: async ({ id, has }: { id: string; has: boolean }) => {
      if (has) await client.curatedPlaylists.removeGame({ listId: id, gameId });
      else await client.curatedPlaylists.add({ listId: id, gameId });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });
  return { lists, toggle };
}

/**
 * «Aggiungi a playlist» nella scheda di un gioco (15f): in quali playlist scelte
 * a mano sta, e il modo di metterlo o toglierlo. C'è per i giochi tuoi e per gli
 * altri: una playlist aperta tiene anche quelli che hai. Come il menu della
 * wishlist: una spunta per playlist, e «Nuova playlist…» la crea col gioco dentro.
 */
export function CuratedPlaylistControl({ game }: { game: { id: string } }) {
  const t = useTranslations('curated.control');
  const [creating, setCreating] = useState(false);
  const { lists, toggle } = useCuratedMembership(game.id);
  const inside = lists.data?.filter((list) => list.has).length ?? 0;

  return (
    <XStack>
      <DropdownMenu align="start">
        <DropdownMenuTrigger
          render={
            <Button variant="outline" disabled={lists.isPending}>
              <ListOrdered size={16} color="$color12" />
              {inside > 0 ? t('inLists', { count: inside }) : t('button')}
            </Button>
          }
        />
        <DropdownMenuContent width={256}>
          {lists.data?.map((list) => (
            <DropdownMenuItem
              key={list.id}
              // Spuntata se il gioco c'è: scegliere la voce lo mette o lo toglie.
              icon={
                list.has ? (
                  <Check size={16} />
                ) : (
                  <XStack width={16} height={16} />
                )
              }
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ id: list.id, has: list.has })}
            >
              {list.name}
            </DropdownMenuItem>
          ))}
          {lists.data && lists.data.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem
            icon={<Plus size={16} />}
            onClick={() => setCreating(true)}
          >
            {t('newPlaylist')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CuratedNameDialog
        open={creating}
        onOpenChange={setCreating}
        gameId={game.id}
      />
    </XStack>
  );
}

/**
 * «Aggiungi a playlist…» dal menu ⋯ di una card (del backlog, o di una playlist
 * scelta a mano): le stesse spunte della scheda del gioco, in un dialogo, perché
 * il menu non ha sottomenu. «Nuova playlist…» chiude questo e apre quello del
 * nome, che la crea col gioco dentro.
 */
export function CuratedPlaylistsDialog({
  game,
  open,
  onOpenChange,
}: {
  game: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          {open && (
            <MembershipForm
              game={game}
              onCreate={() => {
                onOpenChange(false);
                setCreating(true);
              }}
              onDone={() => onOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      <CuratedNameDialog
        open={creating}
        onOpenChange={setCreating}
        gameId={game.id}
      />
    </>
  );
}

function MembershipForm({
  game,
  onCreate,
  onDone,
}: {
  game: { id: string; name: string };
  onCreate: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('curated.control');
  const tCurated = useTranslations('curated');
  const id = useId();
  const { lists, toggle } = useCuratedMembership(game.id);

  return (
    <YStack gap={16}>
      <DialogHeader>
        <DialogTitle>{t('dialogTitle', { name: game.name })}</DialogTitle>
      </DialogHeader>

      {lists.isPending ? (
        <Skeleton height={64} width="100%" rounded={6} />
      ) : lists.data?.length === 0 ? (
        <Text fontSize={14} lineHeight={20} color="$color11">
          {t('none')}
        </Text>
      ) : (
        <YStack gap={10}>
          {lists.data?.map((list) => (
            <XStack key={list.id} items="center" gap={10}>
              <Checkbox
                id={`${id}-${list.id}`}
                checked={list.has}
                disabled={toggle.isPending}
                onCheckedChange={() =>
                  toggle.mutate({ id: list.id, has: list.has })
                }
              />
              <Label htmlFor={`${id}-${list.id}`}>{list.name}</Label>
            </XStack>
          ))}
        </YStack>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCreate}>
          <Plus size={16} color="$color12" />
          {tCurated('new')}
        </Button>
        <Button onClick={onDone}>{t('done')}</Button>
      </DialogFooter>
    </YStack>
  );
}
