import type { HomeGame } from '@repo/contracts';
import { Button, toast, XStack } from '@repo/ui';
import { Heart } from '@repo/ui/icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { WishlistControl } from '@/components/wishlist-control';
import { useApiErrorMessage } from '@/lib/api-error';
import { client } from '@/lib/orpc';
import { useSession } from '@/src/use-session';

/**
 * Il cuore sulla card di un gioco che non hai nel backlog (step 15b): vuoto lo
 * mette da parte, pieno vuol dire che sta in una lista.
 *
 * - **Vuoto**: lo aggiunge alla prima lista (o ne crea una «Wishlist»), con
 *   «Annulla» nell'avviso.
 * - **Pieno**: se sta in **una** lista sola lo toglie, con «Annulla»; se sta in
 *   più liste apre il menu delle liste, perché qui serve scegliere da quale.
 *
 * Non c'è per chi non è loggato né per un gioco che hai nel backlog: la card
 * mostra già il suo stato. La lettura di `wishlisted` è del server: dopo ogni
 * mutazione le liste di giochi si rileggono dalla `MutationCache`.
 */
export function WishlistHeart({ game }: { game: HomeGame }) {
  const t = useTranslations('wishlist.heart');
  const errorMessage = useApiErrorMessage();
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const undo = useMutation({
    // Un `async` che rende `void` nei due rami: toglie una voce o la rimette.
    mutationFn: async (action: {
      kind: 'added' | 'removed';
      listId: string;
    }) => {
      if (action.kind === 'added')
        await client.wishlists.removeGame({
          listId: action.listId,
          gameId: game.id,
        });
      else
        await client.wishlists.add({ gameId: game.id, listId: action.listId });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  const press = useMutation({
    mutationFn: async () => {
      if (!game.wishlisted) {
        const list = await client.wishlists.add({ gameId: game.id });
        return { kind: 'added', list } as const;
      }
      // Pieno: in quante liste sta? Una sola, e non c'è dubbio da dove toglierlo.
      const lists = (
        await client.wishlists.forGame({ gameId: game.id })
      ).filter((list) => list.has);
      const only = lists.length === 1 ? lists[0] : undefined;
      if (!only) return { kind: 'menu' } as const;
      await client.wishlists.removeGame({ listId: only.id, gameId: game.id });
      return { kind: 'removed', list: only } as const;
    },
    onSuccess: (result) => {
      if (result.kind === 'menu') return setMenuOpen(true);
      const message = result.kind === 'added' ? 'added' : ('removed' as const);
      toast.success(t(message, { name: result.list.name }), {
        action: {
          label: t('undo'),
          onClick: () =>
            undo.mutate({ kind: result.kind, listId: result.list.id }),
        },
      });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  // Solo da loggati, e solo su un gioco che non è già nel backlog.
  if (!session.data || game.status !== null) return null;

  return (
    <XStack position="absolute" b={6} r={6} width={28} height={28}>
      <Button
        size="icon-sm"
        variant="secondary"
        // Il fondo della pagina e non una tinta: su una copertina il cuore deve
        // distinguersi da qualunque immagine, come il voto in alto a destra.
        bg="$background"
        rounded={999}
        aria-label={game.wishlisted ? t('inList') : t('add')}
        aria-pressed={game.wishlisted}
        disabled={press.isPending}
        onClick={() => press.mutate()}
      >
        <Heart
          size={16}
          color={game.wishlisted ? '$red10' : '$color12'}
          {...(game.wishlisted && { fill: 'currentColor' })}
        />
      </Button>

      {/* Il menu delle liste, ancorato al cuore e montato solo quando serve: una
          pagina di card non apre una richiesta e un menu per ognuna. */}
      {menuOpen && (
        <XStack position="absolute" t={0} l={0} pointerEvents="none">
          <WishlistControl
            game={game}
            trigger={<XStack width={28} height={28} aria-hidden />}
            open
            onOpenChange={setMenuOpen}
          />
        </XStack>
      )}
    </XStack>
  );
}
