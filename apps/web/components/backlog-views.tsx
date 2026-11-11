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
      <CuratedPlaylistsDialog
        game={entry.game}
        open={choosing}
        onOpenChange={setChoosing}
      />
    </>
  );
}

function Facts({
  entry,
  inlineScore,
  ...props
}: { entry: BacklogEntry; inlineScore?: boolean } & ComponentProps<
  typeof YStack
>) {
  const score = <EntryScore rating={entry.rating} game={entry.game} badge />;
  return (
    <YStack gap={6} {...props}>
      <XStack items="center" justify="space-between" gap={8}>
        <XStack flexWrap="wrap" items="center" gap={8} flex={1} minW={0}>
          {entry.game.firstReleaseDate && (
            <Text fontSize={12} lineHeight={20} color="$color11">
              {entry.game.firstReleaseDate.getFullYear()}
            </Text>
          )}
          <GameDuration game={entry.game} short variant="card" />
          {inlineScore && score}
        </XStack>
        {!inlineScore && score}
      </XStack>
      <PlayedTime ownerships={entry.ownerships} labelled />
    </YStack>
  );
}

function RowsView({
  entries,
  ...handlers
}: { entries: BacklogEntry[] } & EntryHandlers) {
  return (
    <YStack render="ul" gap={8} p={0} m={0}>
      {entries.map((entry) => (
        <YStack render="li" key={entry.id} style={{ listStyle: 'none' }}>
          {/* La spaziatura è sul contenuto: il padding della Card la raddoppierebbe. */}
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
                <XStack justify="space-between" items="flex-start" gap={8}>
                  <YStack gap={4} flex={1} minW={0}>
                    <XStack minW={0} items="center" gap={8}>
                      <YStack shrink={1} minW={0}>
                        <GameTitleLink game={entry.game} lines={2} />
                      </YStack>
                      <GameTypeBadge
                        type={entry.game.gameType}
                        $max-sm={{ display: 'none' }}
                      />
                    </XStack>
                    <Facts entry={entry} inlineScore />
                  </YStack>
                  <YStack items="flex-end" gap={4} shrink={0}>
                    <XStack items="center" gap={4}>
                      <StatusButton
                        entry={entry}
                        onStatus={handlers.onStatus}
                      />
                      <EntryActions entry={entry} {...handlers} />
                    </XStack>
                    <OwnershipBadges
                      ownerships={entry.ownerships}
                      storesOnly
                      max={2}
                    />
                  </YStack>
                </XStack>
                <EntryTags tags={entry.tags} />
              </YStack>
            </XStack>
          </Card>
        </YStack>
      ))}
    </YStack>
  );
}

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
          {/* `flex: 1` azzera la base e fa collassare l'altezza della riga in Chrome. */}
          <Card py={0} gap={0} grow={1}>
            <YStack position="relative">
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
              <GameTypeBadge
                type={entry.game.gameType}
                position="absolute"
                b={8}
                l={8}
                maxW="calc(100% - 16px)"
                overflow="hidden"
              />
            </YStack>
            <YStack p={12} gap={8} grow={1}>
              <YStack minH={40}>
                <GameTitleLink game={entry.game} lines={2} />
              </YStack>
              <Facts entry={entry} />
              <XStack
                items="flex-start"
                gap={2}
                mt="auto"
                borderTopWidth={1}
                borderColor="$borderColor"
                pt={8}
              >
                <XStack shrink={0}>
                  <StatusButton entry={entry} onStatus={handlers.onStatus} />
                </XStack>
                <YStack flex={1} minW={0} items="flex-start">
                  <OwnershipBadges
                    ownerships={entry.ownerships}
                    storesOnly
                    max={2}
                  />
                </YStack>
                <XStack shrink={0}>
                  <EntryActions entry={entry} {...handlers} />
                </XStack>
              </XStack>
            </YStack>
          </Card>
        </YStack>
      ))}
    </YStack>
  );
}

type CompactColumnMeta = {
  layout: ComponentProps<typeof XStack>;
  headerInset?: number;
};
type CompactColumnDef = ColumnDef<BacklogEntry> & { meta: CompactColumnMeta };

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
            <YStack flex={1} minW={0} gap={4}>
              <XStack minW={0} items="center" gap={8}>
                <YStack shrink={1} minW={0}>
                  <GameTitleLink game={entry.game} lines={1} />
                </YStack>
                <XStack display="none" $sm={{ display: 'flex' }}>
                  <GameTypeBadge type={entry.game.gameType} />
                </XStack>
              </XStack>
              <YStack $md={{ display: 'none' }}>
                <OwnershipBadges ownerships={entry.ownerships} storesOnly />
              </YStack>
            </YStack>
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
        id: 'stores',
        enableSorting: false,
        meta: {
          layout: {
            flex: 1,
            minW: 0,
            display: 'none',
            $md: { display: 'flex' },
          },
        },
        header: ({ column }) => (
          <SortHeader label={t('columnStores')} column={column} />
        ),
        cell: ({ row: { original: entry } }) => (
          <OwnershipBadges ownerships={entry.ownerships} storesOnly />
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
