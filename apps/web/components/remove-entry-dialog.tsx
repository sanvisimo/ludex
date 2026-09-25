import type { BacklogEntry } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { useSetEntryHidden } from '@/lib/hide-entry';
import { api, client } from '@/lib/orpc';

/**
 * «Rimuovi» è ambiguo, e il dialogo esiste per disambiguarlo.
 *
 * Su un gioco che viene da un import la cancellazione non dura: il prossimo
 * giro ricrea la riga e i possessi, e su PSN gira da solo ogni tre giorni. Ciò
 * che **non** torna è la roba dell'utente — voto, note e tag — che la cascade
 * si porta via. Detto altrimenti: sul gioco importato l'unico effetto duraturo
 * di «Rimuovi» è cancellare i propri dati e lasciare il gioco, ed è il
 * contrario di quello che chi preme si aspetta.
 *
 * Quindi il dialogo dice cosa se ne va davvero e, dove il gioco tornerà, offre
 * «Nascondi» — che è il gesto giusto e sopravvive ai reimport.
 */
export function RemoveEntryDialog({
  entry,
  onOpenChange,
}: {
  entry: BacklogEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('removeEntry');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const setHidden = useSetEntryHidden();

  const remove = useMutation({
    mutationFn: () => client.backlog.remove({ id: entry!.id }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
        queryClient.invalidateQueries({ queryKey: api.games.byId.key() }),
        queryClient.invalidateQueries({
          queryKey: api.backlog.filterOptions.key(),
        }),
      ]);
      toast.success(t('removed'));
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  // Basta un possesso che venga da un account collegato: quello lo riscrive
  // l'import, e con lui torna la riga di backlog.
  const fromImport = (entry?.ownerships ?? []).some(
    (ownership) => ownership.storeAccount !== null,
  );

  // Si elenca solo ciò che c'è davvero: «perderai il voto» su un gioco non
  // votato è una minaccia inventata, e insegna a non leggere il dialogo.
  const personal = [
    entry?.rating !== null && entry?.rating !== undefined ? t('rating') : null,
    entry?.notes ? t('notes') : null,
    entry && entry.tags.length > 0 ? t('tags') : null,
  ].filter((voce): voce is string => voce !== null);

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent maxW={512}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{entry?.game.name ?? ''}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <p>{t('ownerships', { count: entry?.ownerships.length ?? 0 })}</p>
          {personal.length > 0 && (
            <p className="text-destructive">
              {t('personal', { what: personal.join(', ') })}
            </p>
          )}
          {fromImport && (
            <p className="rounded-lg bg-muted/50 px-3 py-2">{t('comesBack')}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={remove.isPending}
          >
            {t('cancel')}
          </Button>
          {/* Dove il gioco tornerebbe, nascondere è quasi sempre ciò che si
              voleva: sta accanto e non al posto di «Rimuovi», perché la scelta
              resta di chi guarda. */}
          {fromImport && (
            <Button
              variant="outline"
              disabled={remove.isPending || setHidden.isPending}
              onClick={() => {
                setHidden.mutate({ id: entry!.id, hidden: true });
                onOpenChange(false);
              }}
            >
              {t('hideInstead')}
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
