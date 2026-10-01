import type { ComponentType } from 'react';
import { Text, XStack, styled } from 'tamagui';
import type { ColorTokens, GetProps } from 'tamagui';

/**
 * Il fondo e il testo sono la coppia del Badge `default` e del Button
 * primario: `$accent9` con `$black1`, già misurata. Su una copertina, che
 * ha i suoi colori, serve un fondo pieno e che si distingua dai badge grigi
 * del resto della pagina.
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
});

const CornerLabelText = styled(Text, {
  name: 'CornerLabelText',

  color: '$black1',
  fontSize: 11,
  lineHeight: 16,
  fontWeight: '600',
  whiteSpace: 'nowrap',
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
 * l'ellissi se la copertina è stretta.
 */
export function CornerLabel({
  children,
  icon: Icon,
  ...props
}: CornerLabelProps) {
  return (
    <CornerLabelFrame {...props}>
      {Icon && <Icon size={12} color="$black1" />}
      <CornerLabelText numberOfLines={1}>{children}</CornerLabelText>
    </CornerLabelFrame>
  );
}
