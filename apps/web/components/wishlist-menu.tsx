import type { Wishlist } from '@repo/contracts';
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
  Trash2,
} from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

type ListRef = Pick<Wishlist, 'id' | 'name'>;

/**
 * Il menu di una lista a mano (step 15b): rinomina, sposta, elimina. Lo monta
 * l'elenco, una fascia per volta, e la lista aperta; in quest'ultima non c'è
 * `position` e quindi non c'è lo spostamento, che ha senso solo in un elenco.
 */
export function WishlistMenu({
  list,
  position,
  onDeleted,
}: {
  list: ListRef;
  position?: { index: number; count: number };
  onDeleted?: () => void;
}) {
  const t = useTranslations('wishlist');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const move = useMutation({
    mutationFn: (direction: 'up' | 'down') =>
      client.wishlists.move({ id: list.id, direction }),
    // Solo l'elenco: le fasce sono per id, e i loro giochi non sono cambiati.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: api.wishlists.list.key() }),
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
              aria-label={t('actionsFor', { name: list.name })}
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
            <ListNameForm
              mode="rename"
              list={list}
              onDone={() => setRenaming(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent maxW={448}>
          {deleting && (
            <DeleteForm
              list={list}
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
 * «Nuova lista», dall'elenco o dalla scheda di un gioco. Con `gameId` la lista
 * nasce già col gioco dentro.
 */
export function NewListDialog({
  open,
  onOpenChange,
  gameId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={448}>
        {open && (
          <ListNameForm
            mode="create"
            gameId={gameId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Il nome di una lista: lo stesso modulo per crearla e per rinominarla. */
function ListNameForm({
  mode,
  list,
  gameId,
  onDone,
}: {
  mode: 'create' | 'rename';
  list?: ListRef;
  gameId?: string;
  onDone: () => void;
}) {
  const t = useTranslations('wishlist.nameDialog');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const [name, setName] = useState(list?.name ?? '');
  const trimmed = name.trim();

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'rename')
        return client.wishlists.rename({ id: list!.id, name: trimmed });
      const created = await client.wishlists.create({ name: trimmed });
      // Dalla scheda di un gioco: la lista nasce col gioco dentro.
      if (gameId) await client.wishlists.add({ gameId, listId: created.id });
      return created;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: api.wishlists.key() });
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
        if (trimmed) save.mutate();
      }}
    >
      <YStack gap={16}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('createTitle') : t('renameTitle')}
          </DialogTitle>
        </DialogHeader>

        <YStack gap={8}>
          <Label htmlFor={fieldId}>{t('nameLabel')}</Label>
          <Input
            id={fieldId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={mode === 'create' ? t('namePlaceholder') : undefined}
            maxLength={80}
            autoFocus
          />
        </YStack>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending || !trimmed}>
            {mode === 'create' ? t('create') : t('rename')}
          </Button>
        </DialogFooter>
      </YStack>
    </form>
  );
}

function DeleteForm({
  list,
  onDone,
  onDeleted,
}: {
  list: ListRef;
  onDone: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations('wishlist.deleteDialog');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => client.wishlists.remove({ id: list.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: api.wishlists.key() });
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
        <DialogTitle>{t('title', { name: list.name })}</DialogTitle>
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
