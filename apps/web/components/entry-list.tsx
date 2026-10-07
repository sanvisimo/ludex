import type { BacklogEntry, BacklogStatus } from '@repo/contracts';
import { toast } from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { BacklogEntries } from '@/components/backlog-views';
import { EditEntryDialog } from '@/components/edit-entry-dialog';
import { RemoveEntryDialog } from '@/components/remove-entry-dialog';
import { useApiErrorMessage } from '@/lib/api-error';
import type { BacklogView } from '@/lib/backlog-filter';
import { useSetEntryHidden } from '@/lib/hide-entry';
import { api, client } from '@/lib/orpc';

/**
 * Le card di una lista di backlog con tutto ciò che si può farci: cambiare
 * stato, modificare, nascondere, togliere.
 *
 * Le usano `/backlog` e la pagina di una playlist, che mostrano lo stesso
 * oggetto e devono permettere gli stessi gesti: il giorno che una azione
 * nuova arriva nel menu di una card, arriva in tutte e due. Chi la monta decide
 * solo la vista e le righe; i dialoghi e le mutazioni stanno qui dentro.
 */
export function ManagedEntries({
  view,
  entries,
}: {
  view: BacklogView;
  entries: BacklogEntry[];
}) {
  const t = useTranslations('backlog');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const setHidden = useSetEntryHidden();

  const [editing, setEditing] = useState<BacklogEntry | null>(null);
  const [removing, setRemoving] = useState<BacklogEntry | null>(null);

  // La riga in modifica si ripesca dalla lista fresca: dopo il salvataggio
  // `editing` sarebbe la copia vecchia, con i tag di prima.
  const editingEntry =
    editing === null
      ? null
      : (entries.find((row) => row.id === editing.id) ?? editing);

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: BacklogStatus }) =>
      client.backlog.setStatus(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('statusFailed') })),
  });

  return (
    <>
      <BacklogEntries
        view={view}
        entries={entries}
        onStatus={(entry, status) => setStatus.mutate({ id: entry.id, status })}
        onEdit={setEditing}
        onToggleHidden={(entry) =>
          setHidden.mutate({ id: entry.id, hidden: entry.hiddenAt === null })
        }
        onRemove={setRemoving}
        hidingDisabled={setHidden.isPending}
      />

      <RemoveEntryDialog
        entry={removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      />

      <EditEntryDialog
        entry={editingEntry}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}
