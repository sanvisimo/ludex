import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';

/** Le fasce privilegiano la copertina; sotto `sm` ne restano visibili due. */
export const COVER_CARD_WIDTH = 200;
export const COVER_CARD_SMALL_WIDTH = 160;

/**
 * La card di un gioco nelle fasce e nelle griglie, su web e mobile: la
 * copertina in alto, sotto il titolo su due righe e i metadati. La copertina
 * (con lo stato) e il titolo li passa l'app, perché sono i suoi link: sul web
 * due `<a>` alla stessa scheda, su native un `onPress`. `overlay` sta sopra la
 * copertina e fuori dal suo link, per i bottoni (il cuore) e il numero.
 *
 * Larga `COVER_CARD_WIDTH` nelle fasce; con `fill` riempie la cella.
 */
export function CoverCard({
  cover,
  overlay,
  title,
  meta,
  footer,
  fill = false,
  width,
}: {
  cover: ReactNode;
  overlay?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
  fill?: boolean;
  /** Una larghezza fissa al posto di quella delle fasce. */
  width?: number;
}) {
  return (
    <YStack
      width={
        fill
          ? '100%'
          : width !== undefined
            ? width
            : `${COVER_CARD_WIDTH}px max-sm:${COVER_CARD_SMALL_WIDTH}px`
      }
      bg="surface"
      rounded={12}
      overflow="hidden"
      grow={1}
    >
      <YStack position="relative" overflow="hidden">
        {cover}
        {overlay}
      </YStack>
      <YStack p={12} gap={8} grow={1}>
        <YStack minH={40}>{title}</YStack>
        {meta ? (
          <XStack items="center" justify="space-between" gap={8} mt="auto">
            {meta}
          </XStack>
        ) : null}
        {footer}
      </YStack>
    </YStack>
  );
}

/**
 * Il posto di un gioco in una playlist scelta a mano, in basso a sinistra
 * sulla copertina. Fuori dal link della copertina, che i lettori di schermo
 * saltano: il posto lo dice `label`.
 */
export function RankLabel({ rank, label }: { rank: number; label: string }) {
  return (
    <XStack
      position="absolute"
      b={6}
      l={6}
      minW={28}
      height={28}
      px={6}
      items="center"
      justify="center"
      rounded={6}
      bg="background"
      pointerEvents="none"
      role="img"
      aria-label={label}
    >
      <Text fontSize={14} lineHeight="20px" fontWeight="600" color="color12">
        {rank}
      </Text>
    </XStack>
  );
}
