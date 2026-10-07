import type { Playlist, PlaylistQuery } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  toast,
  YStack,
} from '@repo/ui';
import {
  ArrowDown,
  ArrowUp,
  EllipsisVertical,
  Pencil,
  Share2,
  SlidersHorizontal,
  Trash2,
} from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { ShareForm } from '@/components/share-playlist-dialog';
import { useApiErrorMessage } from '@/lib/api-error';
import { playlistSearch } from '@/lib/backlog-filter';
import { api, client } from '@/lib/orpc';

type PlaylistRef = Pick<Playlist, 'id' | 'name' | 'shareToken'>;

/**
 * Rinomina ed elimina una playlist: il menu «⋯» e i due dialoghi.
 *
 * Lo montano l'elenco, una riga per volta, e la pagina di una playlist. Dopo
 * l'eliminazione `onDeleted` dice alla pagina che la sua playlist non c'è più.
 */
export function PlaylistMenu({
  playlist,
  query,
  position,
  onDeleted,
}: {
  playlist: PlaylistRef;
  /**
   * Il posto nell'elenco: con questo il menu offre «Sposta su» e «Sposta giù»,
   * spenti in cima e in fondo. Dove la playlist non sta in un elenco (la pagina
   * aperta) non si passa.
   */
  position?: { index: number; count: number };
  /**
   * I filtri salvati: con questi il menu offre «Modifica filtri». Dove la
   * pagina ha già un bottone suo per farlo (la playlist aperta) non si passano.
   */
  query?: PlaylistQuery;
  onDeleted?: () => void;
}) {
  const t = useTranslations('playlists');
  const router = useRouter();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const move = useMutation({
    mutationFn: (direction: 'up' | 'down') =>
      client.playlists.move({ id: playlist.id, direction }),
    // Solo l'elenco: le fasce sono per id, e i loro giochi non sono cambiati.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: api.playlists.list.key() }),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('moveFailed') })),
  });

  return (
    <>
      <DropdownMenu align="end">
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('actionsFor', { name: playlist.name })}
            >
              <EllipsisVertical size={16} color="$color11" />
            </Button>
          }
        />
        <DropdownMenuContent width={184}>
          {query && (
            <DropdownMenuItem
              icon={<SlidersHorizontal size={16} />}
              onClick={() =>
                void router.navigate({
                  to: '/backlog',
                  search: playlistSearch(query, playlist.id),
                })
              }
            >
              {t('editFilters')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            icon={<Pencil size={16} />}
            onClick={() => setRenaming(true)}
          >
            {t('rename')}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Share2 size={16} />}
            onClick={() => setSharing(true)}
          >
            {t('share')}
          </DropdownMenuItem>
          {position && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                icon={<ArrowUp size={16} />}
                disabled={position.index === 0 || move.isPending}
                onClick={() => move.mutate('up')}
              >
                {t('moveUp')}
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={<ArrowDown size={16} />}
                disabled={
                  position.index === position.count - 1 || move.isPending
                }
                onClick={() => move.mutate('down')}
              >
                {t('moveDown')}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            icon={<Trash2 size={16} color="$red11" />}
            onClick={() => setDeleting(true)}
          >
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent maxW={448}>
          {renaming && (
            <RenameForm playlist={playlist} onDone={() => setRenaming(false)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={sharing} onOpenChange={setSharing}>
        <DialogContent maxW={512}>
          {sharing && (
            <ShareForm playlist={playlist} onDone={() => setSharing(false)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent maxW={448}>
          {deleting && (
            <DeleteForm
              playlist={playlist}
              onDone={() => setDeleting(false)}
              onDeleted={onDeleted}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RenameForm({
  playlist,
  onDone,
}: {
  playlist: PlaylistRef;
  onDone: () => void;
}) {
  const t = useTranslations('playlists.renameDialog');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const [name, setName] = useState(playlist.name);
  const trimmed = name.trim();

  const rename = useMutation({
    mutationFn: () =>
      client.playlists.update({ id: playlist.id, name: trimmed }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: api.playlists.key() });
      onDone();
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, { fallback: t('failed'), CONFLICT: t('exists') }),
      ),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) rename.mutate();
      }}
    >
      <YStack gap={16}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <YStack gap={8}>
          <Label htmlFor={fieldId}>{t('nameLabel')}</Label>
          <Input
            id={fieldId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoFocus
          />
        </YStack>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={rename.isPending || !trimmed}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </YStack>
    </form>
  );
}

function DeleteForm({
  playlist,
  onDone,
  onDeleted,
}: {
  playlist: PlaylistRef;
  onDone: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations('playlists.deleteDialog');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => client.playlists.remove({ id: playlist.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: api.playlists.key() });
      toast.success(t('deleted'));
      onDone();
      onDeleted?.();
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  return (
    <YStack gap={16}>
      <DialogHeader>
        <DialogTitle>{t('title', { name: playlist.name })}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={remove.isPending}>
          {t('cancel')}
        </Button>
        <Button
          variant="destructive"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
        >
          {t('confirm')}
        </Button>
      </DialogFooter>
    </YStack>
  );
}
