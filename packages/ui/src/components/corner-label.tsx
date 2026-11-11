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

  // Attaccata all'angolo, non appoggiata: il raggio esterno è quello della
  // copertina che la contiene (6), e solo l'angolo interno è arrotondato.
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
  } as const,
});

const CornerLabelText = styled(Text, {
  name: 'CornerLabelText',

  color: '$actionColor',
  fontSize: 11,
  lineHeight: 16,
  fontWeight: '600',
  whiteSpace: 'nowrap',

  variants: {
    floating: {
      true: {
        color: '$selectionColor',
        fontSize: 12,
        fontWeight: '500',
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
 * L'etichetta in un angolo di una copertina: «Da giocare», «In corso».
 *
 * Si posiziona da sé in alto a sinistra rispetto al contenitore più vicino,
 * che quindi deve essere `position: relative` e avere `overflow: hidden` o
 * lo stesso raggio, altrimenti l'angolo sporge. Il testo si accorcia con
 * l'ellissi se la copertina è stretta. `floating` la stacca di 8 px dal bordo
 * e aumenta testo e icona; chi la usa limita `maxW` allo spazio disponibile.
 */
export function CornerLabel({
  children,
  icon: Icon,
  floating = false,
  ...props
}: CornerLabelProps) {
  return (
    <CornerLabelFrame floating={floating} {...props}>
      {Icon && (
        <Icon
          size={floating ? 14 : 12}
          color={floating ? '$selectionColor' : '$actionColor'}
        />
      )}
      <CornerLabelText floating={floating} numberOfLines={1}>
        {children}
      </CornerLabelText>
    </CornerLabelFrame>
  );
}
