import type { CuratedPlaylistGames } from '@repo/contracts';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  EmptyState,
  Input,
  Label,
  Pagination,
  Skeleton,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  EllipsisVertical,
  GripVertical,
  ListOrdered,
  MoveVertical,
  Plus,
  SearchX,
  Share2,
  Trash2,
} from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { CuratedAddDialog } from '@/components/curated-add-dialog';
import { CuratedPlaylistMenu } from '@/components/curated-playlist-menu';
import {
  GRID_TEMPLATE,
  GridProbe,
  useGridColumns,
  useReanchorPage,
} from '@/components/grid-columns';
import { CARD_WIDTH, HomeCard } from '@/components/home-band';
import { SearchInput } from '@/components/list-controls';
import { PageSizeSelect } from '@/components/page-size-select';
import { ShareForm } from '@/components/share-playlist-dialog';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import {
  type CuratedSearch,
  validateCuratedSearch,
} from '@/lib/backlog-filter';
import { parsePosition, reorderPage } from '@/lib/curated-order';
import { api, client } from '@/lib/orpc';
import {
  defaultPageSize,
  pageSizeOptions,
  snapPageSize,
} from '@/lib/page-size';
import { ButtonLink } from '@/src/components/button-link';
import { Page } from '@/src/components/page';
import { takeLinkClick } from '@/src/link-click';

export const Route = createFileRoute('/_app/_private/playlist/curated/$id')({
  // La pagina, quanti per pagina e la ricerca: tutto nell'URL, come le liste.
  // Niente ordine: la playlist segue la posizione.
  validateSearch: validateCuratedSearch,
  component: CuratedPlaylistPage,
});

type Game = CuratedPlaylistGames['games'][number];

/**
 * Una playlist scelta a mano (15f), aperta: i giochi nell'ordine voluto, con il
 * numero sulla card. Si riordina trascinando dalla maniglia, dentro la pagina
 * che si vede; per un'altra pagina c'è il menu della card («Sposta su», «Sposta
 * giù», «Sposta alla posizione…»). Con la ricerca il trascinamento è spento: su
 * una lista filtrata non è chiaro dove finirebbe il gioco.
 */
function CuratedPlaylistPage() {
  const t = useTranslations('curated');
  const tPlaylists = useTranslations('playlists');
  const tBacklog = useTranslations('backlog');
  const router = useRouter();
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Un multiplo delle colonne che si vedono, come in `/backlog`.
  const grid = useGridColumns();
  const step = grid.columns ?? 1;
  const sizeOptions = pageSizeOptions(step);
  const size = snapPageSize(search.size ?? defaultPageSize, step);
  const sizeKnown = grid.columns !== null;
  const page = search.page ?? 1;

  const input = {
    id,
    q: search.q,
    limit: size,
    offset: (page - 1) * size,
  };
  const list = useQuery({
    ...api.curatedPlaylists.get.queryOptions({ input }),
    enabled: sizeKnown,
    placeholderData: (previous) => (previous?.id === id ? previous : undefined),
  });
  // Quanti giochi ha la lista intera: con la ricerca `total` conta solo quelli
  // trovati, e «Sposta giù» deve sapere qual è l'ultimo.
  const lists = useQuery(api.curatedPlaylists.list.queryOptions());
  const listCount =
    lists.data?.find((row) => row.id === id)?.count ?? list.data?.total ?? 0;

  const data = list.data;
  const games = data?.games ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / size);
  const searching = search.q !== undefined;

  const paging = (patch: Partial<CuratedSearch>) =>
    validateCuratedSearch({ ...search, ...patch });
  const goToPage = (next: number) =>
    void navigate({ search: () => paging({ page: next }) });
  const pageHref = (next: number) =>
    router.buildLocation({
      to: '/playlist/curated/$id',
      params: { id },
      search: paging({ page: next }),
    }).href;

  useReanchorPage({
    size,
    ready: sizeKnown,
    page,
    onChange: (next) =>
      void navigate({ search: () => paging({ page: next }), replace: true }),
  });

  // Come nelle liste: una pagina oltre l'ultima torna alla prima.
  const outOfRange =
    data !== undefined &&
    !list.isPlaceholderData &&
    games.length === 0 &&
    page > 1;
  useEffect(() => {
    if (outOfRange) void navigate({ search: () => paging({ page: 1 }) });
    // `paging` si ricrea a ogni render e non cambia ciò che fa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfRange, navigate]);

  const back = (
    <Link
      to="/playlist"
      style={{
        color: 'inherit',
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <XStack items="center" gap={2}>
        <ChevronLeft size={14} color="$color11" />
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('back')}
        </Text>
      </XStack>
    </Link>
  );

  if (list.error) {
    return (
      <Page eyebrow={back} title={tPlaylists('title')}>
        {hasErrorCode(list.error, 'NOT_FOUND') ? (
          <EmptyState
            icon={<ListOrdered size={24} color="$color11" />}
            title={t('notFoundTitle')}
            description={t('notFoundHint')}
            action={<ButtonLink href="/playlist">{t('back')}</ButtonLink>}
          />
        ) : (
          <Text fontSize={14} color="$red11">
            {t('loadFailed')}
          </Text>
        )}
      </Page>
    );
  }

  return (
    <Page
      maxW={1280}
      eyebrow={back}
      title={data?.name ?? ' '}
      subtitle={data ? tBacklog('count', { count: total }) : ' '}
      actions={
        data && (
          <XStack items="center" gap={8}>
            <Button
              variant="outline"
              onClick={() => setSharing(true)}
              aria-label={t('share')}
            >
              <Share2 size={16} color="$color12" />
              {/* Sul telefono resta l'icona, come gli altri bottoni in alto. */}
              <XStack $max-sm={{ display: 'none' }}>
                <Text fontSize={14} color="$color12">
                  {t('share')}
                </Text>
              </XStack>
            </Button>
            <CuratedPlaylistMenu
              playlist={data}
              onDeleted={() => void navigate({ to: '/playlist' })}
            />
          </XStack>
        )
      }
    >
      {data && (
        // Una riga, che sul telefono va a capo: la ricerca e «Aggiungi giochi».
        <XStack items="center" flexWrap="wrap" gap={8}>
          <YStack flex={1} minW={140} maxW={320}>
            <SearchInput
              value={search.q ?? ''}
              onChange={(q) =>
                void navigate({
                  search: () => paging({ q: q || undefined, page: undefined }),
                  replace: true,
                })
              }
            />
          </YStack>
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} color="$color1" />
            {t('add')}
          </Button>
        </XStack>
      )}

      <YStack gap={16} position="relative">
        <GridProbe probeRef={grid.ref} />
        {list.isPending ? (
          <Cards>
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton
                key={index}
                width="100%"
                height={(CARD_WIDTH * 374) / 264}
                rounded={6}
              />
            ))}
          </Cards>
        ) : data && games.length === 0 ? (
          <EmptyState
            icon={
              searching ? (
                <SearchX size={24} color="$color11" />
              ) : (
                <ListOrdered size={24} color="$color11" />
              )
            }
            title={searching ? t('emptySearch') : t('emptyList')}
            description={searching ? undefined : t('emptyListHint')}
            action={
              searching ? undefined : (
                <Button onClick={() => setAdding(true)}>
                  <Plus size={16} color="$color1" />
                  {t('add')}
                </Button>
              )
            }
          />
        ) : (
          data && (
            <>
              <SortableGrid
                data={data}
                input={input}
                listCount={listCount}
                draggable={!searching}
              />
              <XStack
                flexWrap="wrap"
                items="center"
                justify="center"
                $sm={{ justify: 'space-between' }}
                gap={16}
              >
                {total > (sizeOptions[0] ?? 0) && (
                  <PageSizeSelect
                    value={size}
                    options={sizeOptions}
                    onChange={(next) =>
                      // Cambiare quanti per pagina riporta alla prima.
                      void navigate({
                        search: () => paging({ size: next, page: 1 }),
                      })
                    }
                  />
                )}
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  href={pageHref}
                  onNavigate={(next, event) => {
                    if (takeLinkClick(event)) goToPage(next);
                  }}
                  label={tBacklog('pages')}
                  previousLabel={tBacklog('previousPage')}
                  nextLabel={tBacklog('nextPage')}
                  goToLabel={tBacklog('goToPage')}
                  onGoTo={goToPage}
                />
              </XStack>
            </>
          )
        )}
      </YStack>

      {data && (
        <CuratedAddDialog
          open={adding}
          onOpenChange={setAdding}
          playlist={data}
        />
      )}
      <Dialog open={sharing} onOpenChange={setSharing}>
        <DialogContent>
          {sharing && data && (
            <ShareForm
              playlist={data}
              kind="curated"
              onDone={() => setSharing(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

/**
 * La griglia che si riordina. dnd-kit sposta le card mentre si trascina; al
 * rilascio la pagina mostra subito il nuovo ordine (`reorderPage`), il server
 * riscrive la lista, e se dice di no la pagina torna com'era.
 *
 * Mouse dopo pochi pixel, dito dopo una pressione breve — così sul telefono
 * la pagina scorre anche toccando la maniglia di sfuggita — e tastiera: Spazio,
 * frecce, Spazio. Gli annunci per lo screen reader dicono il posto.
 */
function SortableGrid({
  data,
  input,
  listCount,
  draggable,
}: {
  data: CuratedPlaylistGames;
  input: { id: string; q?: string; limit: number; offset: number };
  listCount: number;
  draggable: boolean;
}) {
  const t = useTranslations('curated');
  const tDnd = useTranslations('curated.dnd');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  // Lo stesso id sul server e nel browser: senza, gli `aria-describedby` che
  // dnd-kit scrive non tornano all'idratazione.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const queryKey = api.curatedPlaylists.get.queryKey({ input });

  const drop = useMutation({
    mutationFn: (move: {
      gameId: string;
      position: number;
      previous: CuratedPlaylistGames;
    }) =>
      client.curatedPlaylists.moveGame({
        listId: data.id,
        gameId: move.gameId,
        position: move.position,
      }),
    onError: (error, move) => {
      queryClient.setQueryData(queryKey, move.previous);
      toast.error(errorMessage(error, { fallback: t('moveFailed') }));
    },
  });

  const placeOf = (gameId: unknown) => {
    const game = data.games.find((row) => row.id === gameId);
    return game ? game.position + 1 : 0;
  };
  const nameOf = (gameId: unknown) =>
    data.games.find((row) => row.id === gameId)?.name ?? '';

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const from = data.games.findIndex((row) => row.id === active.id);
    const to = data.games.findIndex((row) => row.id === over.id);
    const moved = reorderPage(data.games, from, to);
    if (!moved) return;
    queryClient.setQueryData(queryKey, { ...data, games: moved.games });
    drop.mutate({
      gameId: String(active.id),
      position: moved.target,
      previous: data,
    });
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: tDnd('instructions') },
        announcements: {
          onDragStart: ({ active }) =>
            tDnd('start', {
              name: nameOf(active.id),
              position: placeOf(active.id),
              total: listCount,
            }),
          onDragOver: ({ active, over }) =>
            over
              ? tDnd('over', {
                  name: nameOf(active.id),
                  position: placeOf(over.id),
                  total: listCount,
                })
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? tDnd('end', {
                  name: nameOf(active.id),
                  position: placeOf(over.id),
                  total: listCount,
                })
              : undefined,
          onDragCancel: ({ active }) =>
            tDnd('cancel', {
              name: nameOf(active.id),
              position: placeOf(active.id),
            }),
        },
      }}
    >
      <SortableContext
        items={data.games.map((game) => game.id)}
        strategy={rectSortingStrategy}
        disabled={!draggable}
      >
        <Cards>
          {data.games.map((game) => (
            <SortableCard
              key={game.id}
              game={game}
              listId={data.id}
              listCount={listCount}
              draggable={draggable}
            />
          ))}
        </Cards>
      </SortableContext>
    </DndContext>
  );
}

function SortableCard({
  game,
  listId,
  listCount,
  draggable,
}: {
  game: Game;
  listId: string;
  listCount: number;
  draggable: boolean;
}) {
  const t = useTranslations('curated');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: game.id, disabled: !draggable });

  return (
    <li
      ref={setNodeRef}
      style={{
        listStyle: 'none',
        transform: CSS.Translate.toString(transform),
        transition,
        // Sopra le altre mentre si trascina, e un po' trasparente: si vede dove
        // va a finire.
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
        opacity: isDragging ? 0.8 : 1,
      }}
    >
      <YStack gap={6}>
        <HomeCard game={game} fill rank={game.position + 1} />
        <XStack items="center" justify="space-between">
          {draggable ? (
            <Button
              // Sul web il bottone di Tamagui è un `<button>`: il ref è quello.
              ref={setActivatorNodeRef as never}
              variant="ghost"
              size="icon-sm"
              aria-label={t('dragHandle', { name: game.name })}
              // Il dito sulla maniglia non scorre la pagina, una volta presa.
              style={{ touchAction: 'manipulation', cursor: 'grab' }}
              // `role` è «button», come il bottone che è già: Tamagui vuole il
              // tipo stretto.
              {...(attributes as Omit<typeof attributes, 'role'>)}
              {...listeners}
            >
              <GripVertical size={16} color="$color11" />
            </Button>
          ) : (
            <XStack />
          )}
          <CardMenu game={game} listId={listId} listCount={listCount} />
        </XStack>
      </YStack>
    </li>
  );
}

/**
 * Il menu ⋯ della card: su, giù, alla posizione…, togli. Su e giù passano anche
 * da una pagina all'altra: il primo della pagina 2 sale in fondo alla 1.
 */
function CardMenu({
  game,
  listId,
  listCount,
}: {
  game: Game;
  listId: string;
  listCount: number;
}) {
  const t = useTranslations('curated');
  const errorMessage = useApiErrorMessage();
  const [movingTo, setMovingTo] = useState(false);

  const move = useMutation({
    mutationFn: (position: number) =>
      client.curatedPlaylists.moveGame({ listId, gameId: game.id, position }),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('moveFailed') })),
  });

  const remove = useMutation({
    mutationFn: () =>
      client.curatedPlaylists.removeGame({ listId, gameId: game.id }),
    onSuccess: () =>
      toast.success(t('removed', { name: game.name }), {
        action: {
          label: t('undo'),
          // Torna in fondo e poi al posto di prima.
          onClick: () =>
            void client.curatedPlaylists
              .add({ listId, gameId: game.id })
              .then(() => move.mutate(game.position)),
        },
      }),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('removeFailed') })),
  });

  return (
    <>
      <DropdownMenu align="end">
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('actionsFor', { name: game.name })}
            >
              <EllipsisVertical size={16} color="$color11" />
            </Button>
          }
        />
        <DropdownMenuContent width={224}>
          <DropdownMenuItem
            icon={<ArrowUp size={16} />}
            disabled={game.position === 0 || move.isPending}
            onClick={() => move.mutate(game.position - 1)}
          >
            {t('moveUp')}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<ArrowDown size={16} />}
            disabled={game.position >= listCount - 1 || move.isPending}
            onClick={() => move.mutate(game.position + 1)}
          >
            {t('moveDown')}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<MoveVertical size={16} />}
            disabled={listCount < 2}
            onClick={() => setMovingTo(true)}
          >
            {t('moveTo')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            icon={<Trash2 size={16} color="$red11" />}
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {t('remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={movingTo} onOpenChange={setMovingTo}>
        <DialogContent>
          {movingTo && (
            <MoveToForm
              game={game}
              listCount={listCount}
              onMove={(position) => {
                move.mutate(position);
                setMovingTo(false);
              }}
              onCancel={() => setMovingTo(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MoveToForm({
  game,
  listCount,
  onMove,
  onCancel,
}: {
  game: Game;
  listCount: number;
  onMove: (position: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('curated.moveDialog');
  const fieldId = useId();
  const [text, setText] = useState(String(game.position + 1));
  const target = parsePosition(text, listCount);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (target !== null) onMove(target);
      }}
    >
      <YStack gap={16}>
        <DialogHeader>
          <DialogTitle>{t('title', { name: game.name })}</DialogTitle>
          <DialogDescription>
            {t('current', { position: game.position + 1, total: listCount })}
          </DialogDescription>
        </DialogHeader>

        <YStack gap={8}>
          <Label htmlFor={fieldId}>{t('label')}</Label>
          <XStack items="center" gap={12}>
            <YStack width={100}>
              <Input
                id={fieldId}
                inputMode="numeric"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                autoFocus
              />
            </YStack>
            <Text fontSize={14} color="$color11">
              {t('range', { total: listCount })}
            </Text>
          </XStack>
        </YStack>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={target === null || target === game.position}
          >
            {t('submit')}
          </Button>
        </DialogFooter>
      </YStack>
    </form>
  );
}

/** La griglia delle card: la stessa del backlog, che la sonda misura. */
function Cards({ children }: { children: React.ReactNode }) {
  return (
    <YStack
      render="ul"
      p={0}
      m={0}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        gap: 12,
        listStyle: 'none',
      }}
    >
      {children}
    </YStack>
  );
}
