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
import { Check, Heart, Plus } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import { useTranslations } from 'use-intl';

import { NewListDialog } from '@/components/wishlist-menu';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * «Wishlist» nella scheda di un gioco che non hai nel backlog (step 15b): in
 * quali liste sta, e il modo di metterlo o toglierlo.
 *
 * Senza liste, «Aggiungi alla wishlist» ne crea una che si chiama «Wishlist» e ci
 * mette il gioco: chi vuole solo tenerlo d'occhio non deve inventare un nome.
 * Con delle liste, ognuna è una voce spuntabile, e «Nuova lista…» la crea già col
 * gioco dentro. Il «ce l'ho» è «Aggiungi al backlog», che sta accanto e che toglie
 * il gioco da tutte le liste.
 */
export function WishlistControl({
  game,
  trigger,
  open,
  onOpenChange,
}: {
  game: { id: string; name: string };
  /** Un altro bottone che lo apre (il cuore di una card), al posto del solito. */
  trigger?: ReactElement;
  /**
   * Controllato da fuori, se il chiamante decide *quando* aprirlo: il cuore pieno
   * apre il menu solo se il gioco sta in più liste. Un'apertura dal bottone si
   * ignora, e vale solo quella che il chiamante chiede.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations('wishlist.control');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const lists = useQuery(
    api.wishlists.forGame.queryOptions({ input: { gameId: game.id } }),
  );
  const inAny = lists.data?.some((list) => list.has) ?? false;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: api.wishlists.key() });

  const toggle = useMutation({
    // Un `async` che rende `void` nei due rami: toglie una voce o ne aggiunge una.
    mutationFn: async ({ id, has }: { id: string; has: boolean }) => {
      if (has)
        await client.wishlists.removeGame({ listId: id, gameId: game.id });
      else await client.wishlists.add({ gameId: game.id, listId: id });
    },
    onSuccess: refresh,
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  const addDefault = useMutation({
    mutationFn: () => client.wishlists.add({ gameId: game.id }),
    onSuccess: async (list) => {
      await refresh();
      toast.success(t('added', { name: list.name }));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  return (
    <XStack>
      <DropdownMenu
        align="start"
        {...(open !== undefined && {
          open,
          // Il bottone prova ad aprirlo a ogni clic; qui si ascolta solo la
          // chiusura. L'apertura la chiede chi lo controlla.
          onOpenChange: (next: boolean) => {
            if (!next) onOpenChange?.(false);
          },
        })}
      >
        <DropdownMenuTrigger
          render={
            trigger ?? (
              <Button variant="outline" disabled={lists.isPending}>
                <Heart
                  size={16}
                  color="$color12"
                  {...(inAny && { fill: 'currentColor' })}
                />
                {inAny ? t('inList') : t('button')}
              </Button>
            )
          }
        />
        <DropdownMenuContent width={224}>
          {lists.data?.length === 0 && (
            <DropdownMenuItem
              icon={<Heart size={16} />}
              disabled={addDefault.isPending}
              onClick={() => addDefault.mutate()}
            >
              {t('addDefault')}
            </DropdownMenuItem>
          )}
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            icon={<Plus size={16} />}
            onClick={() => setCreating(true)}
          >
            {t('newList')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewListDialog
        open={creating}
        onOpenChange={setCreating}
        gameId={game.id}
      />
    </XStack>
  );
}
