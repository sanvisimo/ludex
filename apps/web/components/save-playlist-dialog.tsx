import type { Playlist } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { BookmarkPlus } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { toPlaylistQuery, useBacklogFilter } from '@/lib/backlog-filter';
import { api, client } from '@/lib/orpc';

/**
 * Il bottone «Salva come playlist». Non tiene il dialogo: lo apre chi lo
 * monta (`SavePlaylistDialog`, a livello pagina), perché il bottone sta anche
 * nel drawer dei filtri, che quando si chiude smonta ciò che ha dentro.
 *
 * Da telefono, nella toolbar, è solo l'icona e la riga resta una; nel drawer c'è
 * posto per l'etichetta (`labelled`).
 */
export function SavePlaylistButton({
  onOpen,
  labelled = false,
}: {
  onOpen: () => void;
  labelled?: boolean;
}) {
  const t = useTranslations('playlists.save');

  return (
    <Button variant="outline" aria-label={t('button')} onClick={onOpen}>
      <BookmarkPlus size={16} color="$color12" />
      <XStack
        display={labelled ? 'flex' : 'none'}
        {...(!labelled && { $md: { display: 'flex' } })}
        aria-hidden
      >
        <Text fontSize={14} fontWeight="500" color="$color12">
          {t('button')}
        </Text>
      </XStack>
    </Button>
  );
}

/**
 * Il dialogo del nome: salva i filtri accesi **adesso** e l'ordinamento, non la
 * pagina né la vista.
 */
export function SavePlaylistDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { filter } = useBacklogFilter();

  // La playlist da cui si è arrivati con «Modifica filtri», se c'è e c'è ancora:
  // il dialogo parte dal suo nome. L'elenco può non essere ancora arrivato, e
  // `key` fa rimontare il modulo quando arriva, con il nome già dentro.
  const playlists = useQuery({
    ...api.playlists.list.queryOptions(),
    enabled: filter.playlist !== '',
  });
  const source = playlists.data?.find((p) => p.id === filter.playlist);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={448}>
        {/* Si rimonta a ogni apertura: il campo riparte dal nome di partenza,
            vuoto se non si sta modificando una playlist. */}
        {open && (
          <SaveForm
            key={source?.id ?? 'new'}
            source={source}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SaveForm({
  source,
  onDone,
}: {
  /** La playlist che si sta modificando: il nome di partenza, e il caso in cui salvare la aggiorna. */
  source?: Playlist;
  onDone: () => void;
}) {
  const t = useTranslations('playlists.save');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const fieldId = useId();
  const { filter, activeCount } = useBacklogFilter();
  const query = useMemo(() => toPlaylistQuery(filter), [filter]);
  const [name, setName] = useState(source?.name ?? '');

  const playlists = useQuery(api.playlists.list.queryOptions());
  const trimmed = name.trim();
  // Il confronto è quello del server (nome unico senza guardare le maiuscole),
  // fatto qui per dirlo mentre si scrive e offrire di sostituire.
  const clash = playlists.data?.find(
    (playlist) => playlist.name.toLowerCase() === trimmed.toLowerCase(),
  );

  // Il nome è quello della playlist che si sta modificando: salvare ne
  // sostituisce i filtri, e non è un conflitto da segnalare.
  const updatingSource = clash !== undefined && clash.id === source?.id;
  const blocked = clash !== undefined && !updatingSource;

  const save = useMutation({
    mutationFn: () =>
      clash
        ? client.playlists.update({ id: clash.id, query })
        : client.playlists.create({ name: trimmed, query }),
    onSuccess: async (playlist) => {
      await queryClient.invalidateQueries({ queryKey: api.playlists.key() });
      toast.success(
        clash
          ? t('replaced', { name: playlist.name })
          : t('saved', { name: playlist.name }),
        {
          action: {
            label: t('open'),
            onClick: () =>
              void router.navigate({
                to: '/playlist/$id',
                params: { id: playlist.id },
              }),
          },
        },
      );
      onDone();
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, {
          fallback: t('failed'),
          CONFLICT: t('exists', { name: trimmed }),
        }),
      ),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed && !blocked) save.mutate();
      }}
    >
      <YStack gap={16}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { count: activeCount })}
          </DialogDescription>
        </DialogHeader>

        <YStack gap={8}>
          <Label htmlFor={fieldId}>{t('nameLabel')}</Label>
          <Input
            id={fieldId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('namePlaceholder')}
            maxLength={80}
            autoFocus
            aria-invalid={blocked ? true : undefined}
          />
          {updatingSource && (
            <Text fontSize={13} lineHeight={18} color="$color11">
              {t('editing', { name: clash.name })}
            </Text>
          )}
          {blocked && (
            <YStack gap={8}>
              <Text fontSize={13} lineHeight={18} color="$red11">
                {t('exists', { name: clash.name })}
              </Text>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                {t('replace', { name: clash.name })}
              </Button>
              <Text fontSize={13} lineHeight={18} color="$color11">
                {t('orRename')}
              </Text>
            </YStack>
          )}
        </YStack>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={save.isPending || !trimmed || blocked}
          >
            {updatingSource ? t('update') : t('submit')}
          </Button>
        </DialogFooter>
      </YStack>
    </form>
  );
}
