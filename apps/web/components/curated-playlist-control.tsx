import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
  XStack,
} from '@repo/ui';
import { Check, ListOrdered, Plus } from '@repo/ui/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { CuratedNameDialog } from '@/components/curated-playlist-menu';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * «Aggiungi a playlist» nella scheda di un gioco (15f): in quali playlist scelte
 * a mano sta, e il modo di metterlo o toglierlo. C'è per i giochi tuoi e per gli
 * altri: una playlist aperta tiene anche quelli che hai. Come il menu della
 * wishlist: una spunta per playlist, e «Nuova playlist…» la crea col gioco dentro.
 */
export function CuratedPlaylistControl({ game }: { game: { id: string } }) {
  const t = useTranslations('curated.control');
  const errorMessage = useApiErrorMessage();
  const [creating, setCreating] = useState(false);
  const lists = useQuery(
    api.curatedPlaylists.forGame.queryOptions({ input: { gameId: game.id } }),
  );
  const inside = lists.data?.filter((list) => list.has).length ?? 0;

  // Le playlist si rileggono da sole, dalla `MutationCache`.
  const toggle = useMutation({
    mutationFn: async ({ id, has }: { id: string; has: boolean }) => {
      if (has)
        await client.curatedPlaylists.removeGame({
          listId: id,
          gameId: game.id,
        });
      else await client.curatedPlaylists.add({ listId: id, gameId: game.id });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

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
