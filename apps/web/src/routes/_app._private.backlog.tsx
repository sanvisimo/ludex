import type { BacklogEntry, BacklogStatus } from '@repo/contracts';
import { backlogStatusValues } from '@repo/contracts';
import {
  Button,
  Card,
  CardContent,
  Pagination,
  ScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  Skeleton,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { useEffect, useMemo, useState } from 'react';

import { AddGameDialog } from '@/components/add-game-dialog';
import { BacklogToolbar, FilterPanel } from '@/components/backlog-filters';
import { EditEntryDialog } from '@/components/edit-entry-dialog';
import { RemoveEntryDialog } from '@/components/remove-entry-dialog';
import { EntryTags } from '@/components/entry-tags';
import { GameCover } from '@/components/game-cover';
import { GameDuration } from '@/components/game-duration';
import { GameTypeBadge } from '@/components/game-type-badge';
import { OwnershipBadges } from '@/components/ownership-badges';
import { RatingValue } from '@/components/rating-value';
import { useApiErrorMessage } from '@/lib/api-error';
import {
  PAGE_SIZE,
  toQueryInput,
  useBacklogFilter,
  validateBacklogSearch,
} from '@/lib/backlog-filter';
import { useSetEntryHidden } from '@/lib/hide-entry';
import { useStatusLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { Page } from '@/src/components/page';
import { takeLinkClick } from '@/src/link-click';

export const Route = createFileRoute('/_app/_private/backlog')({
  validateSearch: validateBacklogSearch,
  component: BacklogPage,
});

function BacklogPage() {
  const t = useTranslations('backlog');
  const tHidden = useTranslations('hidden');
  const tFilters = useTranslations('filters');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const statusLabels = useStatusLabels();
  const errorMessage = useApiErrorMessage();

  const queryClient = useQueryClient();
  const { filter, setFilter, activeCount, goToPage, pageHref } =
    useBacklogFilter();
  const inHidden = filter.hidden;

  const input = useMemo(() => toQueryInput(filter), [filter]);

  const backlog = useQuery({
    ...api.backlog.list.queryOptions({ input }),
    // La lista precedente resta a schermo mentre arriva quella nuova: senza,
    // ogni tasto nel campo di ricerca farebbe lampeggiare gli scheletri.
    placeholderData: (precedente) => precedente,
  });

  // Quanti sono i nascosti, per il bottone che ci porta. Una riga sola: il
  // totale viene dalla window function della ricerca, e serve solo quello.
  const hiddenCount = useQuery(
    api.backlog.list.queryOptions({ input: { hidden: true, limit: 1 } }),
  );
  const hiddenTotal = hiddenCount.data?.total ?? 0;

  const setHidden = useSetEntryHidden();

  const [editing, setEditing] = useState<BacklogEntry | null>(null);
  const [removing, setRemoving] = useState<BacklogEntry | null>(null);

  // La riga in modifica si ripesca dalla lista fresca: dopo il salvataggio
  // `editing` sarebbe la copia vecchia, con i tag di prima.
  const editingEntry =
    editing === null
      ? null
      : (backlog.data?.entries.find((row) => row.id === editing.id) ?? editing);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: api.backlog.list.key() });
  }

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: BacklogStatus }) =>
      client.backlog.setStatus(input),
    onSuccess: refresh,
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('statusFailed') })),
  });

  const entries = backlog.data?.entries ?? [];
  const total = backlog.data?.total ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  // Una pagina oltre l'ultima — un link vecchio, o un gioco nascosto
  // dall'ultima pagina che aveva solo lui — torna alla prima invece di dire
  // «nessun gioco» con dei giochi che ci sono. Alla prima e non all'ultima
  // perché l'ultima non la sappiamo: `total` viene da `count(*) over()`, che
  // senza righe restituite non c'è, e il server risponde zero.
  const outOfRange =
    backlog.data !== undefined &&
    !backlog.isPlaceholderData &&
    entries.length === 0 &&
    filter.page > 1;
  useEffect(() => {
    if (outOfRange) void setFilter({ page: null });
  }, [outOfRange, setFilter]);

  return (
    <Page
      // Più larga delle altre: da `$xl` il pannello dei filtri sta accanto
      // alla lista, e la lista non deve restringersi per fargli posto.
      maxW={1280}
      title={inHidden ? t('hiddenViewTitle') : t('title')}
      // Uno spazio e non niente mentre carica: la riga del conteggio tiene il
      // suo posto, e il titolo non salta quando arriva.
      subtitle={backlog.data ? t('count', { count: total }) : ' '}
      actions={
        <>
          {/* Il posto dove ripensarci. Senza, un gioco nascosto per sbaglio
              sparirebbe per sempre: è l'unico pezzo di interfaccia che il
              nascondere richiede davvero. Compare solo se c'è qualcosa. */}
          {inHidden ? (
            <Button
              variant="outline"
              onClick={() => setFilter({ hidden: null })}
            >
              {t('backToList')}
            </Button>
          ) : (
            hiddenTotal > 0 && (
              <Button
                variant="ghost"
                onClick={() => setFilter({ hidden: true })}
              >
                {t('showHidden', { count: hiddenTotal })}
              </Button>
            )
          )}
          <AddGameDialog />
        </>
      }
    >
      {inHidden && (
        <p className="text-muted-foreground">{t('hiddenViewHint')}</p>
      )}

      <BacklogToolbar onOpenFilters={() => setFiltersOpen(true)} />

      <XStack gap={32} items="flex-start">
        {/* Due forme dello stesso pannello, e come nel guscio le sceglie il
            CSS: di lato da `$xl`, nel foglio sotto. Da `$lg` la barra del
            guscio si prende già 240 px, e accanto a lei una colonna di
            filtri lascerebbe alla lista meno di 500. */}
        <YStack
          render="aside"
          aria-label={tFilters('panelLabel')}
          width={256}
          shrink={0}
          display="none"
          $xl={{ display: 'flex' }}
        >
          <FilterPanel />
        </YStack>

        <YStack flex={1} minW={0} gap={16}>
          {backlog.error ? (
            <p className="text-destructive">{t('error')}</p>
          ) : backlog.isPending ? (
            <div className="grid gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} height={96} width="100%" rounded={12} />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <Card>
              <CardContent gap={8}>
                {/* Vuoto perché non hai giochi e vuoto perché nessuno passa i
                filtri sono due cose diverse, e la seconda ha una via d'uscita. */}
                <p className="font-medium">
                  {activeCount > 0
                    ? t('noMatchTitle')
                    : inHidden
                      ? t('hiddenEmptyTitle')
                      : t('emptyTitle')}
                </p>
                {(activeCount > 0 || !inHidden) && (
                  <p className="text-muted-foreground">
                    {activeCount > 0 ? t('noMatchHint') : t('emptyHint')}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <ul className="grid gap-2">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <Card>
                      <CardContent gap={12}>
                        <div className="flex items-start gap-3">
                          <GameCover
                            imageId={entry.game.coverImageId}
                            name={entry.game.name}
                          />
                          <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                            <div className="grid gap-0.5">
                              <span className="flex flex-wrap items-center gap-2">
                                <Link
                                  to="/games/$id"
                                  params={{ id: entry.game.id }}
                                  className="font-medium underline-offset-4 hover:underline"
                                >
                                  {entry.game.name}
                                </Link>
                                <GameTypeBadge type={entry.game.gameType} />
                              </span>
                              {entry.game.firstReleaseDate && (
                                <span className="text-muted-foreground">
                                  {entry.game.firstReleaseDate.getFullYear()}
                                </span>
                              )}
                              <GameDuration game={entry.game} />
                              <RatingValue value={entry.rating} />
                            </div>
                            <OwnershipBadges ownerships={entry.ownerships} />
                          </div>
                        </div>

                        <EntryTags tags={entry.tags} />

                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            items={statusLabels}
                            value={entry.status}
                            onValueChange={(next) =>
                              setStatus.mutate({
                                id: entry.id,
                                status: next as BacklogStatus,
                              })
                            }
                          >
                            <SelectTrigger width={176}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {backlogStatusValues.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {statusLabels[value]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            variant="outline"
                            size="sm"
                            ml="auto"
                            onClick={() => setEditing(entry)}
                          >
                            {t('edit')}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setHidden.mutate({
                                id: entry.id,
                                hidden: entry.hiddenAt === null,
                              })
                            }
                            disabled={setHidden.isPending}
                          >
                            {entry.hiddenAt === null
                              ? tHidden('hide')
                              : tHidden('unhide')}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoving(entry)}
                          >
                            {t('remove')}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>

              <Pagination
                page={filter.page}
                pageCount={pageCount}
                href={pageHref}
                onNavigate={(page, event) => {
                  if (takeLinkClick(event)) void goToPage(page);
                }}
                label={t('pages')}
                previousLabel={t('previousPage')}
                nextLabel={t('nextPage')}
              />
            </>
          )}
        </YStack>
      </XStack>

      <Sheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        label={tFilters('panelLabel')}
      >
        <ScrollView maxH="75vh">
          <FilterPanel />
        </ScrollView>
      </Sheet>

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
    </Page>
  );
}
