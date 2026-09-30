import type { BacklogEntry, BacklogStatus } from '@repo/contracts';
import {
  Button,
  Drawer,
  EmptyState,
  Label,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Text,
  toast,
  ToggleGroup,
  ToggleGroupItem,
  XStack,
  YStack,
} from '@repo/ui';
import {
  EyeOff,
  Gamepad2,
  LayoutGrid,
  List,
  Rows3,
  SearchX,
} from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { useEffect, useId, useMemo, useState } from 'react';

import { AddGameDialog } from '@/components/add-game-dialog';
import { BacklogToolbar, FilterPanel } from '@/components/backlog-filters';
import { BacklogEntries } from '@/components/backlog-views';
import { EditEntryDialog } from '@/components/edit-entry-dialog';
import { RemoveEntryDialog } from '@/components/remove-entry-dialog';
import { useApiErrorMessage } from '@/lib/api-error';
import {
  type BacklogView,
  pageSizeValues,
  type PageSize,
  toQueryInput,
  useBacklogFilter,
  validateBacklogSearch,
} from '@/lib/backlog-filter';
import { useSetEntryHidden } from '@/lib/hide-entry';
import { api, client } from '@/lib/orpc';
import { Page } from '@/src/components/page';
import { takeLinkClick } from '@/src/link-click';

export const Route = createFileRoute('/_app/_private/backlog')({
  validateSearch: validateBacklogSearch,
  component: BacklogPage,
});

function BacklogPage() {
  const t = useTranslations('backlog');
  const tFilters = useTranslations('filters');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const errorMessage = useApiErrorMessage();

  const queryClient = useQueryClient();
  const { filter, setFilter, reset, activeCount, goToPage, pageHref } =
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
  const pageCount = Math.ceil(total / filter.size);

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
      // Più larga delle altre: la griglia e la compatta vivono di colonne, e
      // su uno schermo largo le righe non devono stare in un corridoio.
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
        <Text fontSize={14} lineHeight={20} color="$color11">
          {t('hiddenViewHint')}
        </Text>
      )}

      <BacklogToolbar
        onOpenFilters={() => setFiltersOpen(true)}
        view={
          <ToggleGroup
            label={t('view')}
            value={filter.view}
            // La pagina resta: le viste mostrano gli stessi 48 giochi.
            onValueChange={(view) =>
              setFilter({ view: view as BacklogView, page: filter.page })
            }
          >
            <ToggleGroupItem value="rows" aria-label={t('viewRows')}>
              <Rows3 size={16} color="$color12" />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label={t('viewGrid')}>
              <LayoutGrid size={16} color="$color12" />
            </ToggleGroupItem>
            <ToggleGroupItem value="compact" aria-label={t('viewCompact')}>
              <List size={16} color="$color12" />
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />

      {/* Tutta la larghezza alla lista: i filtri stanno nel drawer, anche
          sul desktop, dove una colonna fissa accanto alla barra del guscio
          sembrava un secondo menu. */}
      <YStack gap={16}>
        {backlog.error ? (
          <Text fontSize={14} color="$red11">
            {t('error')}
          </Text>
        ) : backlog.isPending ? (
          <YStack gap={8}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={96} width="100%" rounded={12} />
            ))}
          </YStack>
        ) : entries.length === 0 ? (
          // Vuoto perché non hai giochi e vuoto perché nessuno passa i
          // filtri sono due cose diverse, e la seconda ha una via d'uscita.
          activeCount > 0 ? (
            <EmptyState
              icon={<SearchX size={24} color="$color11" />}
              title={t('noMatchTitle')}
              description={t('noMatchHint')}
              action={
                <Button variant="outline" onClick={() => void reset()}>
                  {tFilters('reset', { count: activeCount })}
                </Button>
              }
            />
          ) : inHidden ? (
            <EmptyState
              icon={<EyeOff size={24} color="$color11" />}
              title={t('hiddenEmptyTitle')}
            />
          ) : (
            <EmptyState
              icon={<Gamepad2 size={24} color="$color11" />}
              title={t('emptyTitle')}
              description={t('emptyHint')}
            />
          )
        ) : (
          <>
            <BacklogEntries
              view={filter.view}
              entries={entries}
              onStatus={(entry, status) =>
                setStatus.mutate({ id: entry.id, status })
              }
              onEdit={setEditing}
              onToggleHidden={(entry) =>
                setHidden.mutate({
                  id: entry.id,
                  hidden: entry.hiddenAt === null,
                })
              }
              onRemove={setRemoving}
              hidingDisabled={setHidden.isPending}
            />

            {/* Quanti per pagina a sinistra, le pagine e «vai a» a destra; su
                un telefono vanno a capo. La scelta c'è anche con una pagina
                sola, se i giochi sono più di 15: chi ha scelto 120 su 50
                giochi deve poter tornare indietro. */}
            <XStack
              flexWrap="wrap"
              items="center"
              justify="center"
              $sm={{ justify: 'space-between' }}
              gap={16}
            >
              {total > pageSizeValues[0] && (
                <PageSizeSelect
                  value={filter.size}
                  onChange={(size) => void setFilter({ size })}
                />
              )}
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
                goToLabel={t('goToPage')}
                onGoTo={(page) => void goToPage(page)}
              />
            </XStack>
          </>
        )}
      </YStack>

      <Drawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title={tFilters('panelLabel')}
        closeLabel={tFilters('closePanel')}
      >
        <FilterPanel />
      </Drawer>

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

/** Quanti giochi per pagina: una tendina stretta, accanto alla paginazione. */
function PageSizeSelect({
  value,
  onChange,
}: {
  value: PageSize;
  onChange: (size: PageSize) => void;
}) {
  const t = useTranslations('backlog');
  const id = useId();
  const items = Object.fromEntries(
    pageSizeValues.map((size) => [String(size), String(size)]),
  );
  return (
    <XStack items="center" gap={8}>
      <Label htmlFor={id} color="$color11" fontWeight="400">
        {t('pageSize')}
      </Label>
      <Select
        items={items}
        value={String(value)}
        onValueChange={(next) => onChange(Number(next) as PageSize)}
      >
        <SelectTrigger id={id} width={80}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pageSizeValues.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {String(size)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </XStack>
  );
}
