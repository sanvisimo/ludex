import type { BacklogStatus } from '@repo/contracts';
import { toast } from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { api, client } from './orpc';

/** Stato e voto di una voce, con la lista e la pagina del gioco rilette. */
export function useEntryMutations() {
  const t = useTranslations('backlog');
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
      queryClient.invalidateQueries({ queryKey: api.games.bySlug.key() }),
    ]);

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: BacklogStatus }) =>
      client.backlog.setStatus(input),
    onSuccess: refresh,
    onError: () => toast.error(t('saveFailed')),
  });

  const setRating = useMutation({
    mutationFn: (input: { id: string; rating: number | null }) =>
      client.backlog.update(input),
    onSuccess: refresh,
    onError: () => toast.error(t('saveFailed')),
  });

  return { setStatus, setRating };
}
