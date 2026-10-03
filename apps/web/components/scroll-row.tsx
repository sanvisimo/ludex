import { Button, ScrollView, XStack, YStack } from '@repo/ui';
import { ChevronLeft, ChevronRight } from '@repo/ui/icons';
import {
  useEffect,
  useRef,
  useState,
  type ElementRef,
  type ReactNode,
} from 'react';
import { useTranslations } from 'use-intl';

/**
 * Una fila che scorre di lato, col titolo sopra e le frecce accanto: i giochi
 * legati nella pagina del gioco e le fasce della home.
 *
 * Con la rotella del mouse una fila orizzontale non si muove e la barra è
 * nascosta, quindi le frecce: compaiono solo se la fila non ci sta, e agli
 * estremi si spengono, come in `Gallery`. Con `arrowsFromMd` sotto `$md` non
 * ci sono: sul telefono si scorre col dito.
 */
export function ScrollRow({
  title,
  itemCount,
  arrowsFromMd = false,
  children,
}: {
  title: ReactNode;
  /** Quanti elementi ha la fila: cambiando, le misure si rifanno. */
  itemCount: number;
  arrowsFromMd?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('game');
  const scroller = useRef<ElementRef<typeof ScrollView>>(null);
  const [{ x, content, viewport }, setScroll] = useState({
    x: 0,
    content: 0,
    viewport: 0,
  });

  // Le misure si leggono dal DOM: `onLayout` e `onContentSizeChange` passati
  // al `ScrollView` di Tamagui sul web non arrivano mai.
  useEffect(() => {
    const node = scroller.current?.getScrollableNode() as
      | HTMLElement
      | undefined;
    if (!node) return;
    const measure = () =>
      setScroll({
        x: node.scrollLeft,
        content: node.scrollWidth,
        viewport: node.clientWidth,
      });
    measure();
    node.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => {
      node.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [itemCount]);

  const overflows = content > viewport + 1;
  const scrollBy = (direction: -1 | 1) =>
    scroller.current?.scrollTo({
      x: Math.max(0, x + direction * viewport * 0.8),
      animated: true,
    });

  return (
    <YStack gap={8} render="section">
      <XStack items="center" justify="space-between" gap={8}>
        {title}
        {overflows && (
          <XStack
            gap={8}
            {...(arrowsFromMd && {
              display: 'none',
              $md: { display: 'flex' },
            })}
          >
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('galleryPrevious')}
              disabled={x <= 0}
              onPress={() => scrollBy(-1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('galleryNext')}
              disabled={x + viewport >= content - 1}
              onPress={() => scrollBy(1)}
            >
              <ChevronRight size={16} />
            </Button>
          </XStack>
        )}
      </XStack>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <XStack gap={12} pb={4}>
          {children}
        </XStack>
      </ScrollView>
    </YStack>
  );
}
