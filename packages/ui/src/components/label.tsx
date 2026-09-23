import { Label as LabelBase, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

/**
 * L'etichetta di un campo.
 *
 * Il lavoro vero lo fa il Label di Tamagui, e per questo si avvolge invece di
 * riscriverlo: sul web è un `<label>` e scrive `aria-labelledby` sul
 * controllo di `htmlFor`, su mobile il tocco porta il focus a quel controllo.
 *
 * Qui si toglie solo la sua misura. Di serie il `lineHeight` viene
 * dall'altezza di un **bottone**, e l'etichetta sarebbe alta come il campo che
 * nomina; 14 è il `leading-none` di prima.
 *
 * Non contiene controlli: è un testo, e su React Native un testo non ha figli
 * che non siano testo. Uno `Switch` con la sua etichetta si scrive accanto,
 * `<Switch id="x" />` e `<Label htmlFor="x">`, non dentro.
 */
export const Label = styled(LabelBase, {
  name: 'Label',

  fontSize: 14,
  lineHeight: 14,
  fontWeight: '500',
  color: '$color12',
  pressStyle: { color: '$color12' },
});

export type LabelProps = GetProps<typeof Label>;
