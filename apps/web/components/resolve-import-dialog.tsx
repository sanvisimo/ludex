import type { IgdbSearchHit, UnresolvedImport } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  toast,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { useState } from 'react';

import { useApiErrorMessage } from '@/lib/api-error';
import { useGameTypeLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { GameCover } from '@/components/game-cover';

/**
 * Sistema a mano una voce che l'import non ha saputo risolvere.
 *
 * La ricerca parte dal nome che dava il negozio, che è quasi sempre sbagliato in
 * modo utile ("Starbound - Unstable" → "Starbound"): si può correggere prima di
 * cercare, invece di ripartire da zero.
 */
export function ResolveImportDialog({
  entry,
  onOpenChange,
}: {
  entry: UnresolvedImport | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('account.unresolved');
  // Il tipo di una scheda IGDB arriva come valore (`dlc`, `remaster`): il nome
  // da mostrare lo mette il client, e su un gioco principale non si mostra —
  // è la normalità, non un'informazione.
  const gameTypeLabels = useGameTypeLabels();
  const hitType = (type: IgdbSearchHit['gameType']) =>
    type && type !== 'main_game' ? gameTypeLabels[type] : null;
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  const search = useQuery({
    ...api.games.search.queryOptions({ input: { query: submitted ?? '' } }),
    enabled: submitted !== null && submitted.trim().length >= 2,
  });

  const resolve = useMutation({
    mutationFn: (igdbId: number) =>
      client.imports.resolve({ id: entry!.id, igdbId }),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: api.imports.unresolved.key(),
        }),
        queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
      ]);
      toast.success(t('resolved', { name: created.game.name }));
      setQuery('');
      setSubmitted(null);
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('resolveFailed') })),
  });

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) {
          setQuery('');
          setSubmitted(null);
        }
        onOpenChange(open);
      }}
    >
      <DialogContent maxW={512}>
        <DialogHeader>
          <DialogTitle>{t('resolveTitle')}</DialogTitle>
          <DialogDescription>
            {t('resolveDescription', {
              name: entry?.name ?? '',
              store: `${entry?.store}/${entry?.storeName}`,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Label htmlFor="cerca">{t('searchLabel')}</Label>
          <div className="flex gap-2">
            <Input
              flex={1}
              id="cerca"
              value={query || (entry?.name ?? '')}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              shrink={0}
              onClick={() => setSubmitted(query || (entry?.name ?? ''))}
            >
              {t('search')}
            </Button>
          </div>

          {submitted !== null && (
            <div className="max-h-64 overflow-y-auto rounded-lg ring-1 ring-foreground/10">
              {search.isFetching ? (
                <div className="grid gap-2 p-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      height={40}
                      width="100%"
                      rounded={6}
                    />
                  ))}
                </div>
              ) : search.error ? (
                <p className="p-3 text-destructive">{t('searchFailed')}</p>
              ) : search.data?.length === 0 ? (
                <p className="p-3 text-muted-foreground">{t('noResults')}</p>
              ) : (
                <ul className="grid gap-0.5 p-1">
                  {search.data?.map((hit) => (
                    <li key={hit.igdbId} className="flex">
                      <GameCover imageId={hit.cover} name={hit.name} />
                      <button
                        type="button"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate(hit.igdbId)}
                        className="w-full rounded-md px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
                      >
                        <span className="font-medium">
                          {hit.name}
                          {hit.releaseYear ? ` (${hit.releaseYear})` : ''}
                        </span>
                        <span className="block text-muted-foreground">
                          {[hitType(hit.gameType), hit.developer]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
