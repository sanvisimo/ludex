import { Input as InputBase, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

/**
 * Il campo di testo.
 *
 * L'Input di Tamagui 2 è **web-first**: prende le props di `<input>` —
 * `onChange` con l'evento, `type`, `autoComplete`, `maxLength` — e su mobile
 * le traduce per `TextInput`. È ciò che permette alle schermate di cambiare
 * l'import e nient'altro: `onChange={(e) => set(e.target.value)}` resta com'è.
 *
 * Qui si decide solo l'aspetto, sugli stessi numeri del Button (32 di altezza,
 * raggio 8), perché campo e bottone stanno quasi sempre sulla stessa riga.
 *
 * Il bordo è `$color9` per la ragione misurata sul Button `outline`: è l'unico
 * grigio sopra il 3:1 in entrambi i temi, ed è la soglia WCAG per il contorno
 * di un controllo. `$borderColor` sul fondo scuro fa 1.20, un campo che non
 * si vede dove comincia.
 */
const InputFrame = styled(InputBase, {
  name: 'Input',
  // Sul telefono: 44, la misura minima di tocco di Apple e Google, e niente
  // padding verticale, che il TextInput di Android aggiunge da sé (circa 10 dp
  // per lato) e che in 32 pixel lasciava al testo una dozzina di pixel.
  height: '32px native:44px',
  px: 10,
  rounded: 8,
  fontSize: 14,
  width: '100%',
  bg: 'transparent',
  color: 'color12',
  borderColor: 'color9 hover:color10 focus:accent9',
  placeholderTextColor: 'color11',
  py: 'native:0px',
  outlineColor: 'focus-visible:outline-color',
  outlineStyle: 'focus-visible:solid',
  outlineWidth: 'focus-visible:2px',
  outlineOffset: 'focus-visible:0px',
  variants: {
    disabled: {
      true: { opacity: 0.5, cursor: 'not-allowed' },
    },
  } as const,
});

/**
 * Il tipo è quello dell'Input di Tamagui, e non quello che `styled()`
 * dedurrebbe: passando da `styled()` l'`onChange` perde il suo
 * `HTMLInputElement` e diventa l'unione con quello di un `View`, e
 * `event.target.value` smette di compilare — cioè proprio la riga che le
 * schermate hanno ovunque. Il cast è onesto perché qui non si aggiunge nessuna
 * prop: `disabled` c'è già sul componente di partenza.
 */
export const Input = InputFrame as unknown as typeof InputBase;

export type InputProps = GetProps<typeof InputBase>;
