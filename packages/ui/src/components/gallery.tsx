import { useEffect, useRef, useState, type ElementRef } from 'react';
import { Image, ScrollView, XStack, YStack, isWeb } from 'tamagui';

import { ChevronLeft, ChevronRight } from '../icons';
import { Button } from './button';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { YoutubeVideo, youtubeThumbnail } from './youtube-video';

/** Sotto questi pixel il mouse ha cliccato una miniatura, non trascinato la fila. */
const DRAG_THRESHOLD = 5;

export type GalleryItem =
  | {
      kind: 'image';
      /** L'immagine nella gallery, larga quanto la colonna. */
      src: string;
      /** La miniatura sotto. */
      thumb: string;
      /** L'immagine a tutto schermo; se manca, `src`. */
      full?: string;
      alt: string;
    }
  | { kind: 'video'; videoId: string; title: string };

export type GalleryProps = {
  items: GalleryItem[];
  /** I testi li decide l'app: `@repo/ui` non ha traduzioni. */
  labels: {
    previous: string;
    next: string;
    /** «Guarda», davanti al titolo del video. */
    play: string;
    /** «Ingrandisci», sull'immagine che apre il tutto schermo. */
    enlarge: string;
    close: string;
    /** Il nome di ciascuna miniatura, es. «Immagine 3 di 8». */
    item: (index: number, total: number) => string;
  };
};

/**
 * La gallery della pagina del gioco, come quella di GOG: l'elemento scelto in
 * grande, le frecce ai lati, le miniature sotto. Un'immagine si apre a tutto
 * schermo; un video si guarda lì dove sta (vedi `YoutubeVideo`, che su web e
 * mobile fa due cose diverse).
 *
 * Le frecce agli estremi si spengono invece di ricominciare dal primo, come
 * quelle di `Pagination`: arrivati in fondo si sa di esserci arrivati.
 *
 * Le miniature scorrono di lato quando non ci stanno, ed è anche la forma che
 * la gallery ha su un telefono. Quella scelta si porta in vista da sola: su
 * desktop la rotella non muove la fila e la barra è nascosta. Col mouse la fila
 * si trascina, come col dito ma senza inerzia.
 */
export function Gallery({ items, labels }: GalleryProps) {
  const [index, setIndex] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const scroller = useRef<ElementRef<typeof ScrollView>>(null);
  const thumbs = useRef<HTMLElement | null>(null);
  const previousIndex = useRef(index);

  // Solo quando la scelta cambia, non al montaggio: la gallery può stare sotto
  // la piega, e la pagina salterebbe da sola. `nearest` lascia ferma la fila se
  // la miniatura è già visibile. Il `ref` sta sulla fila e non sulla miniatura
  // scelta: un `ref` che passa da una all'altra, Tamagui lo lascia sulla prima.
  useEffect(() => {
    if (index === previousIndex.current) return;
    previousIndex.current = index;
    thumbs.current?.children?.[index]?.scrollIntoView?.({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [index]);

  // Il trascinamento col mouse: il dito scorre già da solo, quindi solo qui.
  const hasThumbs = items.length > 1;
  useEffect(() => {
    if (!isWeb || !hasThumbs) return;
    const node = scroller.current?.getScrollableNode() as
      | HTMLElement
      | undefined;
    if (!node) return;

    const onPointerDown = (down: PointerEvent) => {
      if (down.pointerType !== 'mouse' || down.button !== 0) return;
      const startScroll = node.scrollLeft;
      let dragging = false;

      const onMove = (move: PointerEvent) => {
        const distance = move.clientX - down.clientX;
        if (!dragging && Math.abs(distance) < DRAG_THRESHOLD) return;
        if (!dragging) {
          dragging = true;
          // Senza eventi sulle miniature il cursore è quello della fila, e il
          // loro hover non lampeggia passandoci sopra.
          node.style.cursor = 'grabbing';
          if (thumbs.current) thumbs.current.style.pointerEvents = 'none';
        }
        node.scrollLeft = startScroll - distance;
      };

      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        if (!dragging) return;
        node.style.cursor = '';
        if (thumbs.current) thumbs.current.style.pointerEvents = '';
        // Il clic che il browser genera al rilascio non deve scegliere niente.
        // Arriva subito dopo: se non arriva, il prossimo vero non va perso.
        const swallow = (click: MouseEvent) => {
          click.stopPropagation();
          click.preventDefault();
        };
        window.addEventListener('click', swallow, {
          capture: true,
          once: true,
        });
        setTimeout(
          () => window.removeEventListener('click', swallow, { capture: true }),
          0,
        );
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    };
    // Le miniature sono `<img>`: il browser trascinerebbe l'immagine, non la fila.
    const onDragStart = (event: DragEvent) => event.preventDefault();

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('dragstart', onDragStart);
    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('dragstart', onDragStart);
    };
  }, [hasThumbs]);

  if (items.length === 0) return null;

  const current = items[Math.min(index, items.length - 1)]!;
  const total = items.length;
  const hasPrevious = index > 0;
  const hasNext = index < total - 1;

  const arrows = (
    <>
      <Button
        variant="secondary"
        size="icon"
        aria-label={labels.previous}
        disabled={!hasPrevious}
        onPress={() => setIndex(index - 1)}
      >
        <ChevronLeft size={16} />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        aria-label={labels.next}
        disabled={!hasNext}
        onPress={() => setIndex(index + 1)}
      >
        <ChevronRight size={16} />
      </Button>
    </>
  );

  return (
    <YStack gap={8}>
      {current.kind === 'video' ? (
        // `key`: cambiando video l'`iframe` di prima non deve restare montato.
        <YoutubeVideo
          key={current.videoId}
          videoId={current.videoId}
          title={current.title}
          playLabel={labels.play}
        />
      ) : (
        <YStack
          render="button"
          aria-label={`${labels.enlarge}: ${current.alt}`}
          onPress={() => setEnlarged(true)}
          width="100%"
          aspectRatio={16 / 9}
          overflow="hidden"
          rounded={8}
          bg="$color3"
          borderWidth={0}
          p={0}
          cursor="zoom-in"
          focusVisibleStyle={{
            outlineColor: '$outlineColor',
            outlineStyle: 'solid',
            outlineWidth: 2,
          }}
        >
          <Image
            src={current.src}
            alt={current.alt}
            width="100%"
            height="100%"
            objectFit="cover"
          />
        </YStack>
      )}

      {total > 1 && (
        <XStack items="center" gap={8}>
          <ScrollView
            ref={scroller}
            horizontal
            flex={1}
            showsHorizontalScrollIndicator={false}
          >
            <XStack ref={thumbs as never} gap={8} py={2} px={2}>
              {items.map((item, i) => (
                <YStack
                  key={item.kind === 'video' ? item.videoId : item.src}
                  render="button"
                  aria-label={labels.item(i + 1, total)}
                  aria-pressed={i === index}
                  onPress={() => setIndex(i)}
                  width={96}
                  aspectRatio={16 / 9}
                  shrink={0}
                  overflow="hidden"
                  rounded={6}
                  p={0}
                  bg="$color3"
                  borderWidth={2}
                  borderColor={i === index ? '$accent9' : 'transparent'}
                  opacity={i === index ? 1 : 0.7}
                  cursor="pointer"
                  hoverStyle={{ opacity: 1 }}
                  focusVisibleStyle={{
                    outlineColor: '$outlineColor',
                    outlineStyle: 'solid',
                    outlineWidth: 2,
                  }}
                >
                  <Image
                    src={
                      item.kind === 'video'
                        ? youtubeThumbnail(item.videoId)
                        : item.thumb
                    }
                    alt=""
                    width="100%"
                    height="100%"
                    objectFit="cover"
                  />
                </YStack>
              ))}
            </XStack>
          </ScrollView>
          {arrows}
        </XStack>
      )}

      {current.kind === 'image' && (
        <Dialog modal open={enlarged} onOpenChange={setEnlarged}>
          <DialogContent width="95%" maxW={1280} closeLabel={labels.close}>
            <DialogTitle>{current.alt}</DialogTitle>
            <Image
              src={current.full ?? current.src}
              alt={current.alt}
              width="100%"
              aspectRatio={16 / 9}
              objectFit="contain"
            />
            {total > 1 && (
              <XStack justify="center" gap={8}>
                {arrows}
              </XStack>
            )}
          </DialogContent>
        </Dialog>
      )}
    </YStack>
  );
}
