import { XStack, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

import { Button } from './button';
import { Input } from './input';

/**
 * Un campo con qualcosa attaccato dentro il bordo: oggi il Combobox, che ci
 * mette la freccia della tendina e la x per svuotare.
 *
 * Il bordo sta sul **gruppo**, non sul campo: altrimenti i bottoni finirebbero
 * fuori dal riquadro. Per lo stesso motivo il fuoco si segna sul gruppo, con
 * `focusWithinStyle`, e il campo dentro perde bordo e anello suoi.
 *
 * Porta i quattro pezzi che il Combobox usa. `InputGroupText`,
 * `InputGroupTextarea` e gli addon `block-start` / `block-end` non li usava
 * nessuno e restano fuori; così anche il clic sull'addon che dava il fuoco al
 * campo, che in un addon fatto solo di bottoni non scatta mai.
 */
export const InputGroup = styled(XStack, {
  name: 'InputGroup',
  role: 'group',

  height: 32,
  width: '100%',
  minW: 0,
  items: 'center',
  rounded: 8,
  borderWidth: 1,
  borderColor: '$color9',

  hoverStyle: { borderColor: '$color10' },
  focusWithinStyle: {
    borderColor: '$accent9',
    outlineColor: '$outlineColor',
    outlineStyle: 'solid',
    outlineWidth: 2,
  },
});

/**
 * Il campo dentro il gruppo: senza bordo e senza anello, che ce li ha il
 * gruppo. `flex: 1` perché gli addon prendano solo lo spazio che serve.
 */
export const InputGroupInput = styled(Input, {
  name: 'InputGroupInput',

  flex: 1,
  height: '100%',
  borderWidth: 0,
  rounded: 0,
  bg: 'transparent',

  hoverStyle: { borderColor: 'transparent' },
  focusStyle: { borderColor: 'transparent' },
  focusVisibleStyle: { outlineWidth: 0 },
}) as unknown as typeof Input;

/** Ciò che sta accanto al campo, prima o dopo. */
export const InputGroupAddon = styled(XStack, {
  name: 'InputGroupAddon',

  items: 'center',
  gap: 4,

  variants: {
    align: {
      'inline-start': { order: -1, pl: 4 },
      'inline-end': { order: 1, pr: 4 },
    },
  } as const,

  defaultVariants: {
    align: 'inline-start',
  },
});

/** Il bottone dentro l'addon: `ghost` e quadrato piccolo, come nel Combobox. */
export const InputGroupButton = styled(Button, {
  name: 'InputGroupButton',

  variant: 'ghost',
  size: 'icon-xs',
});

export type InputGroupProps = GetProps<typeof InputGroup>;
