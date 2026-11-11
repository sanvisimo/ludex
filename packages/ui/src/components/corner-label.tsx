import type { ComponentType } from 'react';
import { Text, XStack, styled } from 'tamagui';
import type { ColorTokens, GetProps } from 'tamagui';

/**
 * In angolo usa la coppia del primario; la variante `floating` usa un fondo
 * opaco neutro, bordo e testo di selezione. I due trattamenti restano leggibili
 * sui colori della copertina e seguono il tema dell’app.
 */
const CornerLabelFrame = styled(XStack, {
  name: 'CornerLabel',

  // Attaccata all'angolo: il raggio esterno è quello della copertina (6).
  position: 'absolute',
  t: 0,
  l: 0,
  maxW: '100%',
  height: 20,
  px: 6,
  gap: 4,
  items: 'center',
  bg: '$accent9',
  borderTopLeftRadius: 6,
  borderBottomRightRadius: 6,

  variants: {
    floating: {
      true: {
        t: 8,
        l: 8,
        height: 26,
        px: 8,
        gap: 5,
        rounded: 7,
        borderTopLeftRadius: 7,
        borderBottomRightRadius: 7,
        bg: '$background',
        borderWidth: 1,
        borderColor: '$selectionBorder',
      },
    },
    compact: {
      true: {
        t: 4,
        l: 4,
        height: 22,
        px: 5,
        gap: 3,
        rounded: 6,
        borderTopLeftRadius: 6,
        borderBottomRightRadius: 6,
      },
    },
  } as const,
});

const CornerLabelText = styled(Text, {
  name: 'CornerLabelText',

  color: '$actionColor',
  fontSize: 11,
  lineHeight: 16,
  fontWeight: '600',
  whiteSpace: 'nowrap',
  minW: 0,
  shrink: 1,

  variants: {
    floating: {
      true: {
        color: '$selectionColor',
        fontSize: 12,
        fontWeight: '500',
      },
    },
    compact: {
      true: {
        fontSize: 11,
      },
    },
  } as const,
});

export type CornerLabelProps = Omit<
  GetProps<typeof CornerLabelFrame>,
  'children'
> & {
  children: string;
  /** Un'icona di `@repo/ui/icons`: la disegna il componente, nel colore del testo. */
  icon?: ComponentType<{ size?: number; color?: ColorTokens }>;
};

/**
 * Il contenitore deve essere relativo, con `overflow: hidden` o lo stesso
 * raggio, o l'angolo sporge; maxW riserva lo spazio dai suoi bordi.
 */
export function CornerLabel({
  children,
  icon: Icon,
  floating = false,
  compact = false,
  ...props
}: CornerLabelProps) {
  return (
    <CornerLabelFrame floating={floating} compact={compact} {...props}>
      {Icon && (
        <XStack shrink={0} aria-hidden>
          <Icon
            size={floating && !compact ? 14 : 12}
            color={floating ? '$selectionColor' : '$actionColor'}
          />
        </XStack>
      )}
      <CornerLabelText floating={floating} compact={compact} numberOfLines={1}>
        {children}
      </CornerLabelText>
    </CornerLabelFrame>
  );
}
