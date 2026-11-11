import type {
  BacklogEntry,
  BacklogStatus,
  BacklogSort,
  SortDirection,
} from '@repo/contracts';
import { backlogStatusValues } from '@repo/contracts';
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import {
  Eye,
  EyeOff,
  EllipsisVertical,
  ListOrdered,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type SortingState,
  type Table,
} from '@tanstack/react-table';
import { useMemo, useState, type ComponentProps } from 'react';
import { useTranslations } from 'use-intl';

import { CuratedPlaylistsDialog } from '@/components/curated-playlist-control';
import { EntryTags } from '@/components/entry-tags';
import { GameCover } from '@/components/game-cover';
import { GRID_TEMPLATE } from '@/components/grid-columns';
import { GameDuration } from '@/components/game-duration';
import { GameTitleLink } from '@/components/game-title-link';
import { GameTypeBadge } from '@/components/game-type-badge';
import { OwnershipBadges } from '@/components/ownership-badges';
import { PlayedTime } from '@/components/played-time';
import { EntryScore } from '@/components/entry-score';
import { statusIcons } from '@/components/status-icon';
import type { BacklogView } from '@/lib/backlog-filter';
import { useStatusLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';
import { latestPlaytime } from '@/lib/playtime';
import { sortLabels } from '@/components/list-controls';

/**
 * Le tre viste del backlog: righe, griglia e compatta.
 *
 * Mostrano i campi che `BacklogEntry` porta già: quali informazioni stanno
 * sulla card, sulla riga e sulla scheda lo decide il 12d, insieme ai dati IGDB
 * che ancora mancano.
 *
 * In tutte e tre lo stato si cambia a vista, perché è il gesto più
 * frequente: un bottone con l'icona dello stato, come su Trakt, che apre la
 * scelta. Modifica, nascondi e rimuovi stanno in un menu accanto.
 */

export type EntryHandlers = {
  onStatus: (entry: BacklogEntry, status: BacklogStatus) => void;
  onEdit: (entry: BacklogEntry) => void;
  onToggleHidden: (entry: BacklogEntry) => void;
  onRemove: (entry: BacklogEntry) => void;
  hidingDisabled?: boolean;
};

export type EntrySorting = {
  sort: BacklogSort;
  direction: SortDirection;
  onChange: (sort: BacklogSort, direction: SortDirection) => void;
};

export function BacklogEntries({
  view,
  entries,
  sorting,
  ...handlers
}: {
  view: BacklogView;
  entries: BacklogEntry[];
  sorting?: EntrySorting;
} & EntryHandlers) {
  if (view === 'grid') return <GridView entries={entries} {...handlers} />;
  if (view === 'compact')
    return <CompactView entries={entries} sorting={sorting} {...handlers} />;
  return <RowsView entries={entries} {...handlers} />;
}

/**
 * Lo stato alla Trakt: un bottone quadrato con l'icona dello stato, che premuto
 * apre la scelta. Prende il posto della tendina larga 176, che su un telefono
 * si mangiava mezza riga.
 *
 * Il nome del bottone dice anche lo stato attuale («Stato di Vane: Da
 * giocare»): a vista c'è solo l'icona, e senza il lettore di schermo non
 * saprebbe cosa c'è scritto sopra. Nel menu ogni voce ha icona ed etichetta,
 * ed è lì che le icone si imparano.
 */
export function StatusButton({
  entry,
  onStatus,
}: {
  entry: BacklogEntry;
  onStatus: (entry: BacklogEntry, status: BacklogStatus) => void;
}) {
  const t = useTranslations('backlog');
  const statusLabels = useStatusLabels();
  const Icon = statusIcons[entry.status];
  return (
    <DropdownMenu align="end">
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={t('statusOf', {
              name: entry.game.name,
              status: statusLabels[entry.status],
            })}
          >
            <Icon size={16} color="$color12" />
          </Button>
        }
      />
      <DropdownMenuContent width={200}>
        <DropdownMenuRadioGroup
          value={entry.status}
          onValueChange={(next) => onStatus(entry, next as BacklogStatus)}
        >
          {backlogStatusValues.map((value) => {
            const ItemIcon = statusIcons[value];
            return (
              // `textValue`: con l'icona dentro la voce non è più un testo
              // solo, e il typeahead del menu non saprebbe cosa cercare.
              <DropdownMenuRadioItem
                key={value}
                value={value}
                textValue={statusLabels[value]}
              >
                <XStack items="center" gap={8}>
                  <ItemIcon size={14} color="$color11" />
                  <Text fontSize={14} lineHeight={20} color="$color12">
                    {statusLabels[value]}
                  </Text>
                </XStack>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Modifica, nascondi, rimuovi: dietro un bottone solo, uguale in ogni vista. */
function EntryActions({
  entry,
  onEdit,
  onToggleHidden,
  onRemove,
  hidingDisabled,
}: { entry: BacklogEntry } & Omit<EntryHandlers, 'onStatus'>) {
  const t = useTranslations('backlog');
  const tHidden = useTranslations('hidden');
  const tCurated = useTranslations('curated.control');
  const [choosing, setChoosing] = useState(false);
  return (
    <>
      <DropdownMenu align="end">
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('actionsFor', { name: entry.game.name })}
            >
              <EllipsisVertical size={16} color="$color11" />
            </Button>
          }
        />
        <DropdownMenuContent width={184}>
          <DropdownMenuItem
            icon={<Pencil size={16} />}
            onClick={() => onEdit(entry)}
          >
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={
              entry.hiddenAt === null ? <EyeOff size={16} /> : <Eye size={16} />
            }
            disabled={hidingDisabled}
            onClick={() => onToggleHidden(entry)}
          >
            {entry.hiddenAt === null ? tHidden('hide') : tHidden('unhide')}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<ListOrdered size={16} />}
            onClick={() => setChoosing(true)}
          >
            {tCurated('menuItem')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            icon={<Trash2 size={16} color="$red11" />}
            onClick={() => onRemove(entry)}
          >
            {t('remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Le playlist scelte a mano (15f): il menu non ha sottomenu. */}
      <CuratedPlaylistsDialog
        game={entry.game}
        open={choosing}
        onOpenChange={setChoosing}
      />
    </>
  );
}

/**
 * Anno e durata stimata a sinistra, voto distinto a destra. Il tempo giocato
 * ha una riga propria, per non confonderlo con HLTB o stringere tutti i fatti.
 * Il voto è il tuo, o quello della critica se non hai votato.
 */
function Facts({ entry }: { entry: BacklogEntry }) {
  return (
    <YStack gap={6} mt="auto">
      <XStack items="center" justify="space-between" gap={8}>
        <XStack flexWrap="wrap" items="center" gap={8} flex={1} minW={0}>
          {entry.game.firstReleaseDate && (
            <Text fontSize={12} lineHeight={20} color="$color11">
              {entry.game.firstReleaseDate.getFullYear()}
            </Text>
          )}
          <GameDuration game={entry.game} short variant="card" />
        </XStack>
        <EntryScore rating={entry.rating} game={entry.game} badge />
      </XStack>
      <PlayedTime ownerships={entry.ownerships} labelled />
    </YStack>
  );
}

/**
 * Le righe: la vista di prima, più bassa. Le azioni in fondo diventano stato
 * e menu, e su una finestra stretta vanno a capo sotto la copertina invece di
 * uscire dallo schermo.
 */
function RowsView({
  entries,
  ...handlers
}: { entries: BacklogEntry[] } & EntryHandlers) {
  return (
    <YStack render="ul" gap={8} p={0} m={0}>
      {entries.map((entry) => (
        <YStack render="li" key={entry.id} style={{ listStyle: 'none' }}>
          {/* `py={0}`: la Card ha già il suo respiro verticale, e sommato al
              nostro lasciava una fascia vuota in fondo a ogni riga. */}
          <Card py={0}>
            <XStack p={8} gap={8} $md={{ gap: 12, p: 12 }} items="flex-start">
              <Link
                to="/games/$slug"
                params={{ slug: entry.game.slug }}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <GameCover
                  imageId={entry.game.coverImageId}
                  name={entry.game.name}
                  width={64}
                />
              </Link>
              <YStack flex={1} minW={0} gap={8}>
                <XStack
                  flexWrap="wrap"
                  items="flex-start"
                  justify="space-between"
                  gap={8}
                >
                  <YStack gap={4} flex={1} minW={0}>
                    <XStack justify="space-between" gap={8}>
                      <XStack flex={1} minW={0} items="center" gap={8}>
                        <GameTitleLink game={entry.game} lines={2} />
                        <GameTypeBadge
                          type={entry.game.gameType}
                          $max-sm={{ display: 'none' }}
                        />
                      </XStack>
                      <XStack items="center" gap={4}>
                        <StatusButton
                          entry={entry}
                          onStatus={handlers.onStatus}
                        />
                        <EntryActions entry={entry} {...handlers} />
                      </XStack>
                    </XStack>
                    <Facts entry={entry} />
                  </YStack>
                </XStack>
                <OwnershipBadges ownerships={entry.ownerships} compact />
                <EntryTags tags={entry.tags} />
              </YStack>
            </XStack>
          </Card>
        </YStack>
      ))}
    </YStack>
  );
}

/**
 * La griglia: la copertina prima di tutto, sotto titolo, anno e durata, e lo
 * stato. Le colonne le decide lo spazio (`auto-fill`), non una media query:
 * la lista sta dentro la pagina, e la finestra non dice quanto è larga.
 */
function GridView({
  entries,
  ...handlers
}: { entries: BacklogEntry[] } & EntryHandlers) {
  return (
    <YStack
      render="ul"
      p={0}
      m={0}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        gap: 12,
      }}
    >
      {entries.map((entry) => (
        <YStack render="li" key={entry.id} style={{ listStyle: 'none' }}>
          {/* `grow` e non `flex`: `flex: 1` in colonna ha base 0, e da lì
              Chrome calcolava l'altezza della riga della griglia — le schede
              uscivano alte una manciata di pixel, con la copertina tagliata. */}
          <Card py={0} gap={0} grow={1}>
            <Link
              to="/games/$slug"
              params={{ slug: entry.game.slug }}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <GameCover
                imageId={entry.game.coverImageId}
                name={entry.game.name}
                size="cover_big"
                fill
                rounded={0}
              />
            </Link>
            <YStack p={12} gap={10} grow={1}>
              <YStack gap={4} grow={1}>
                <YStack minH={40}>
                  <GameTitleLink game={entry.game} lines={2} />
                </YStack>
                <GameTypeBadge type={entry.game.gameType} />
              </YStack>
              <Facts entry={entry} />
              <XStack
                items="center"
                justify="space-between"
                gap={4}
                borderTopWidth={1}
                borderColor="$borderColor"
                pt={8}
              >
                <StatusButton entry={entry} onStatus={handlers.onStatus} />
                <EntryActions entry={entry} {...handlers} />
              </XStack>
            </YStack>
          </Card>
        </YStack>
      ))}
    </YStack>
  );
}

/** Gli stili responsive appartengono alla colonna, per header e celle insieme. */
type CompactColumnMeta = {
  layout: ComponentProps<typeof XStack>;
  headerInset?: number;
};
type CompactColumnDef = ColumnDef<BacklogEntry> & { meta: CompactColumnMeta };

/** Ciò che cambia a ogni render: le celle lo leggono da qui, non dalla chiusura. */
type CompactTableMeta = EntryHandlers & { sorting?: EntrySorting };

function tableMeta(table: Table<BacklogEntry>) {
  return table.options.meta as CompactTableMeta;
}

function columnLayout(column: Column<BacklogEntry>, header = false) {
  const meta = column.columnDef.meta as CompactColumnMeta;
  return { ...meta.layout, ...(header && { pl: meta.headerInset }) };
}

function SortHeader({
  label,
  column,
  sorting,
}: {
  label: string;
  column: Column<BacklogEntry>;
  sorting?: EntrySorting;
}) {
  const t = useTranslations('filters');
  if (!column.getCanSort())
    return (
      <Text fontSize={12} fontWeight="500" color="$color11">
        {label}
      </Text>
    );
  const direction = column.getIsSorted();
  const Icon =
    direction === 'asc'
      ? ArrowUp
      : direction === 'desc'
        ? ArrowDown
        : ArrowUpDown;
  const ratingMenu = column.id === 'rating' && sorting;
  const button = (
    <Button
      variant="ghost"
      size="sm"
      px={0}
      gap={4}
      maxW="100%"
      aria-label={t('sortColumn', { column: label })}
      onPress={ratingMenu ? undefined : () => column.toggleSorting()}
    >
      <Text
        fontSize={12}
        fontWeight="500"
        color={direction ? '$selectionColor' : '$color11'}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Icon size={12} color={direction ? '$selectionColor' : '$color11'} />
    </Button>
  );
  if (!ratingMenu) return button;
  const labels = sortLabels(t);
  return (
    <DropdownMenu align="end">
      <DropdownMenuTrigger render={button} />
      <DropdownMenuContent width={240}>
        <DropdownMenuRadioGroup
          value={direction ? `${sorting.sort}:${sorting.direction}` : ''}
          onValueChange={(value) => {
            const [sort, nextDirection] = value.split(':');
            sorting.onChange(
              sort as BacklogSort,
              nextDirection as SortDirection,
            );
          }}
        >
          {(['rating', 'criticRating'] as const).flatMap((key) =>
            (['asc', 'desc'] as const).map((nextDirection) => (
              <DropdownMenuRadioItem
                key={`${key}:${nextDirection}`}
                value={`${key}:${nextDirection}`}
              >
                {`${labels[key]} · ${t(nextDirection === 'asc' ? 'ascending' : 'descending')}`}
              </DropdownMenuRadioItem>
            )),
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Tabella condivisa da backlog e playlist a filtro. TanStack gestisce colonne
 * e header; URL e server restano la fonte di ordinamento e paginazione.
 * Le colonne secondarie si nascondono via CSS, anche durante l'SSR.
 */
function CompactView({
  entries,
  sorting,
  onStatus,
  onEdit,
  onToggleHidden,
  onRemove,
  hidingDisabled,
}: { entries: BacklogEntry[]; sorting?: EntrySorting } & EntryHandlers) {
  const t = useTranslations('backlog');
  const { data: platforms } = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });
  const nameBySlug = useMemo(
    () => new Map((platforms ?? []).map((p) => [p.slug, p.name])),
    [platforms],
  );
  const columns = useMemo<CompactColumnDef[]>(
    () => [
      {
        id: 'name',
        accessorFn: (entry) => entry.game.name,
        sortDescFirst: false,
        meta: {
          layout: { flex: 2, minW: 0, gap: 12, items: 'center' },
          headerInset: 44,
        },
        header: ({ column }) => (
          <SortHeader label={t('columnTitle')} column={column} />
        ),
        cell: ({ row: { original: entry } }) => (
          <>
            <Link
              to="/games/$slug"
              params={{ slug: entry.game.slug }}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <GameCover
                imageId={entry.game.coverImageId}
                name={entry.game.name}
                width={32}
              />
            </Link>
            <XStack flex={1} minW={0} items="center" gap={8}>
              <YStack shrink={1} minW={0}>
                <GameTitleLink game={entry.game} lines={1} />
              </YStack>
              <XStack display="none" $sm={{ display: 'flex' }}>
                <GameTypeBadge type={entry.game.gameType} />
              </XStack>
            </XStack>
          </>
        ),
      },
      {
        id: 'platforms',
        enableSorting: false,
        meta: {
          layout: {
            flex: 1,
            minW: 0,
            display: 'none',
            $lg: { display: 'flex' },
          },
        },
        header: ({ column }) => (
          <SortHeader label={t('columnPlatforms')} column={column} />
        ),
        cell: ({ row: { original: entry } }) => (
          <Text fontSize={13} color="$color11" numberOfLines={1}>
            {[
              ...new Set(
                entry.ownerships.map(
                  (o) => nameBySlug.get(o.platformSlug) ?? o.platformSlug,
                ),
              ),
            ].join(', ')}
          </Text>
        ),
      },
      {
        id: 'duration',
        accessorFn: (entry) => entry.game.hltbMainMinutes,
        sortDescFirst: false,
        meta: {
          layout: { width: 72, display: 'none', $sm: { display: 'flex' } },
        },
        header: ({ column }) => (
          <SortHeader label={t('columnDuration')} column={column} />
        ),
        cell: ({ row: { original: entry } }) => (
          <GameDuration game={entry.game} short />
        ),
      },
      {
        id: 'playtime',
        accessorFn: (entry) => latestPlaytime(entry.ownerships),
        sortDescFirst: true,
        meta: {
          layout: { width: 72, display: 'none', $md: { display: 'flex' } },
        },
        header: ({ column }) => (
          <SortHeader label={t('columnPlayed')} column={column} />
        ),
        cell: ({ row: { original: entry } }) => (
          <PlayedTime ownerships={entry.ownerships} />
        ),
      },
      {
        id: 'rating',
        accessorFn: (entry) => entry.rating,
        sortDescFirst: true,
        meta: {
          layout: { width: 56, display: 'none', $md: { display: 'flex' } },
        },
        header: ({ column, table }) => (
          <SortHeader
            label={t('columnRating')}
            column={column}
            sorting={tableMeta(table).sorting}
          />
        ),
        // Il valore visibile mantiene la precedenza personale → critica.
        // Il menu sceglie esplicitamente quale scala ordinare sul server.
        cell: ({ row: { original: entry } }) => (
          <EntryScore rating={entry.rating} game={entry.game} />
        ),
      },
      {
        accessorKey: 'status',
        sortDescFirst: false,
        meta: { layout: { width: 72, items: 'center', gap: 4 } },
        header: ({ column }) => (
          <SortHeader label={t('columnStatus')} column={column} />
        ),
        cell: ({ row: { original: entry }, table }) => {
          const meta = tableMeta(table);
          return (
            <>
              <StatusButton entry={entry} onStatus={meta.onStatus} />
              <EntryActions
                entry={entry}
                onEdit={meta.onEdit}
                onToggleHidden={meta.onToggleHidden}
                onRemove={meta.onRemove}
                hidingDisabled={meta.hidingDisabled}
              />
            </>
          );
        },
      },
    ],
    // Solo dipendenze stabili: `flexRender` monta header e celle come
    // componenti, e colonne nuove a ogni render rimonterebbero ogni cella,
    // perdendo il focus. Handler e ordinamento passano da `meta`.
    [t, nameBySlug],
  );

  // I due ordinamenti dei voti condividono un solo header visibile.
  const sortingState: SortingState = sorting
    ? [
        {
          id: sorting.sort === 'criticRating' ? 'rating' : sorting.sort,
          desc: sorting.direction === 'desc',
        },
      ]
    : [];
  const table = useReactTable({
    data: entries,
    columns,
    getRowId: (entry) => entry.id,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableSorting: !!sorting,
    enableMultiSort: false,
    enableSortingRemoval: false,
    state: { sorting: sortingState },
    meta: {
      sorting,
      onStatus,
      onEdit,
      onToggleHidden,
      onRemove,
      hidingDisabled,
    } satisfies CompactTableMeta,
    onSortingChange: (updater) => {
      if (!sorting) return;
      const [next] =
        typeof updater === 'function' ? updater(sortingState) : updater;
      if (!next) return;
      const sort =
        next.id === 'rating' && sorting.sort === 'criticRating'
          ? 'criticRating'
          : (next.id as BacklogSort);
      sorting.onChange(sort, next.desc ? 'desc' : 'asc');
    },
  });

  return (
    <YStack
      role="table"
      aria-label={t('title')}
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
      overflow="hidden"
    >
      {table.getHeaderGroups().map((group) => (
        <XStack
          key={group.id}
          role="row"
          px={12}
          py={8}
          gap={12}
          items="center"
          bg="$surface"
          borderBottomWidth={1}
          borderColor="$borderColor"
        >
          {group.headers.map((header) => {
            const direction = header.column.getIsSorted();
            return (
              <XStack
                key={header.id}
                role="columnheader"
                {...columnLayout(header.column, true)}
                aria-sort={
                  header.column.getCanSort()
                    ? direction === 'asc'
                      ? 'ascending'
                      : direction === 'desc'
                        ? 'descending'
                        : 'none'
                    : undefined
                }
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </XStack>
            );
          })}
        </XStack>
      ))}
      {table.getRowModel().rows.map((row, index) => (
        <XStack
          role="row"
          key={row.id}
          px={12}
          py={6}
          gap={12}
          items="center"
          borderTopWidth={index === 0 ? 0 : 1}
          borderColor="$borderColor"
          hoverStyle={{ bg: '$color2' }}
        >
          {row.getVisibleCells().map((cell) => (
            <XStack role="cell" key={cell.id} {...columnLayout(cell.column)}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </XStack>
          ))}
        </XStack>
      ))}
    </YStack>
  );
}
