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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, toast, YStack } from '@repo/ui';
import { GripVertical } from '@repo/ui/icons';
import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
  useId,
  useRef,
} from 'react';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';

/**
 * Chi monta una fascia: avvolge con `header` la riga del nome, che diventa ciò
 * che si prende, con la maniglia della tastiera davanti.
 */
export type BandDrag = { header: (content: ReactNode) => ReactNode };

/**
 * Le fasce di `/playlist` e `/wishlist` (15f) che si riordinano trascinando,
 * **dentro un gruppo** (una sezione): il server tiene l'ordine per tipo.
 *
 * Si prende **l'intestazione** della fascia, non le card, che scorrono di lato e
 * sono già link: col mouse dopo pochi pixel, così il clic sul nome resta un
 * clic; col dito dopo una pressione breve. La tastiera passa dalla maniglia
 * davanti al nome. Al rilascio l'elenco cambia subito (`queryKey` è la query che
 * lo legge) e torna com'era se il server dice di no. «Sposta su / giù» del menu
 * restano.
 */
export function SortableBands<T extends { id: string; name: string }>({
  items,
  queryKey,
  move,
  children,
}: {
  items: T[];
  queryKey: QueryKey;
  /** Porta la fascia al posto `position` del suo gruppo, da 0. */
  move: (id: string, position: number) => Promise<unknown>;
  children: (item: T, index: number, drag: BandDrag) => ReactNode;
}) {
  const t = useTranslations('curated');
  const tDnd = useTranslations('curated.dnd');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
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
  // Come per le card: il clic che arriva al rilascio aprirebbe la playlist.
  const justDragged = useRef(false);
  const endDrag = () => {
    setTimeout(() => (justDragged.current = false), 0);
  };

  const drop = useMutation({
    mutationFn: ({ id, position }: { id: string; position: number }) =>
      move(id, position),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('moveFailed') })),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const placeOf = (id: unknown) => items.findIndex((row) => row.id === id) + 1;
  const nameOf = (id: unknown) =>
    items.find((row) => row.id === id)?.name ?? '';

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag();
    if (!over || active.id === over.id) return;
    const to = items.findIndex((row) => row.id === over.id);
    // L'elenco della query può tenere più gruppi (le liste di `/wishlist`):
    // si spostano le due righe dove stanno, e il resto non si tocca.
    queryClient.setQueryData<{ id: string }[]>(queryKey, (old) => {
      if (!old) return old;
      const from = old.findIndex((row) => row.id === active.id);
      const target = old.findIndex((row) => row.id === over.id);
      return from === -1 || target === -1 ? old : arrayMove(old, from, target);
    });
    drop.mutate({ id: String(active.id), position: to });
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => (justDragged.current = true)}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
      accessibility={{
        screenReaderInstructions: { draggable: tDnd('instructions') },
        announcements: {
          onDragStart: ({ active }) =>
            tDnd('start', {
              name: nameOf(active.id),
              position: placeOf(active.id),
              total: items.length,
            }),
          onDragOver: ({ active, over }) =>
            over
              ? tDnd('over', {
                  name: nameOf(active.id),
                  position: placeOf(over.id),
                  total: items.length,
                })
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? tDnd('end', {
                  name: nameOf(active.id),
                  position: placeOf(over.id),
                  total: items.length,
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
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <YStack gap={24}>
          {items.map((item, index) => (
            <SortableBand
              key={item.id}
              id={item.id}
              name={item.name}
              justDragged={justDragged}
            >
              {(drag) => children(item, index, drag)}
            </SortableBand>
          ))}
        </YStack>
      </SortableContext>
    </DndContext>
  );
}

function SortableBand({
  id,
  name,
  justDragged,
  children,
}: {
  id: string;
  name: string;
  justDragged: RefObject<boolean>;
  children: (drag: BandDrag) => ReactNode;
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
  } = useSortable({ id });
  // Mouse e dito sull'intestazione, la tastiera sulla maniglia.
  const { onKeyDown, ...pointer } = listeners ?? {};

  const header = (content: ReactNode) => (
    <div
      {...pointer}
      onClickCapture={(event) => {
        if (!justDragged.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      // Il trascinamento nativo del link del nome litigherebbe con il nostro.
      onDragStart={(event) => event.preventDefault()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 0,
        flexShrink: 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <Button
        // Sul web il bottone di Tamagui è un `<button>`: il ref è quello.
        ref={setActivatorNodeRef as never}
        variant="ghost"
        size="icon-sm"
        aria-label={t('dragHandle', { name })}
        // `role` è «button», come il bottone che è già: Tamagui vuole il tipo
        // stretto.
        {...(attributes as Omit<typeof attributes, 'role'>)}
        // dnd-kit tipizza i suoi gestori come `Function`.
        onKeyDown={onKeyDown as KeyboardEventHandler | undefined}
      >
        <GripVertical size={16} color="$color11" />
      </Button>
      {content}
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
        opacity: isDragging ? 0.8 : 1,
      }}
    >
      {children({ header })}
    </div>
  );
}
