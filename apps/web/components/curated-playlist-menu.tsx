import type { CuratedPlaylist } from '@repo/contracts';
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
  Text,
  toast,
  YStack,
} from '@repo/ui';
import {
  ArrowDown,
  ArrowUp,
  EllipsisVertical,
  Pencil,
  Share2,
  Trash2,
} from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { ShareForm } from '@/components/share-playlist-dialog';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

type CuratedRef = Pick<CuratedPlaylist, 'id' | 'name' | 'shareToken'>;

/**
 * Il menu «⋯» di una playlist scelta a mano (15f): rinomina, condividi, sposta,
 * elimina. Come quello delle playlist a filtro, senza «Modifica filtri». Lo
 * montano l'elenco, una fascia per volta, e la playlist aperta; in quest'ultima
 * non c'è `position`, e quindi non c'è lo spostamento.
 */
export function CuratedPlaylistMenu({
  playlist,
  position,
  onDeleted,
}: {
  playlist: CuratedRef;
  position?: { index: number; count: number };
  onDeleted?: () => void;
}) {
  const t = useTranslations('playlists');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const move = useMutation({
    mutationFn: (direction: 'up' | 'down') =>
      client.curatedPlaylists.move({ id: playlist.id, direction }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: api.curatedPlaylists.list.key(),
      }),
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

      <CuratedNameDialog
        open={renaming}
        onOpenChange={setRenaming}
        playlist={playlist}
      />

      <Dialog open={sharing} onOpenChange={setSharing}>
        <DialogContent>
          {sharing && (
            <ShareForm
              playlist={playlist}
              kind="curated"
              onDone={() => setSharing(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
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

/**
 * «Nuova playlist» (o «Rinomina», con `playlist`): solo il nome, i giochi si
 * aggiungono dopo. Con `gameId` nasce già col gioco dentro, dalla scheda del
 * gioco. `onCreated` riceve quella appena creata: l'elenco la apre.
 */
export function CuratedNameDialog({
  open,
  onOpenChange,
  playlist,
  gameId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlist?: CuratedRef;
  gameId?: string;
  onCreated?: (playlist: CuratedPlaylist) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <NameForm
            playlist={playlist}
            gameId={gameId}
            onCreated={onCreated}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  playlist,
  gameId,
  onCreated,
  onDone,
}: {
  playlist?: CuratedRef;
  gameId?: string;
  onCreated?: (playlist: CuratedPlaylist) => void;
  onDone: () => void;
}) {
  const t = useTranslations('curated.nameDialog');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const [name, setName] = useState(playlist?.name ?? '');
  const trimmed = name.trim();
  const creating = playlist === undefined;

  const save = useMutation({
    mutationFn: async () => {
      if (!creating)
        return client.curatedPlaylists.rename({
          id: playlist.id,
          name: trimmed,
        });
      const created = await client.curatedPlaylists.create({ name: trimmed });
      // Dalla scheda di un gioco: la playlist nasce col gioco dentro.
      return gameId
        ? client.curatedPlaylists.add({ listId: created.id, gameId })
        : created;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({
        queryKey: api.curatedPlaylists.key(),
      });
      onDone();
      if (creating) onCreated?.(saved);
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
        if (trimmed) save.mutate();
      }}
    >
      <YStack gap={16}>
        <DialogHeader>
          <DialogTitle>
            {creating ? t('createTitle') : t('renameTitle')}
          </DialogTitle>
        </DialogHeader>

        <YStack gap={8}>
          <Label htmlFor={fieldId}>{t('nameLabel')}</Label>
          <Input
            id={fieldId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={creating ? t('namePlaceholder') : undefined}
            maxLength={80}
            autoFocus
          />
          {creating && !gameId && (
            <Text fontSize={13} lineHeight={18} color="$color11">
              {t('hint')}
            </Text>
          )}
        </YStack>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending || !trimmed}>
            {creating ? t('create') : t('rename')}
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
  playlist: CuratedRef;
  onDone: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations('curated.deleteDialog');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => client.curatedPlaylists.remove({ id: playlist.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: api.curatedPlaylists.key(),
      });
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
