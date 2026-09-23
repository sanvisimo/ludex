import type { ChangeEventHandler, ReactNode } from 'react';
import { TextArea as TextAreaBase, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

/**
 * Il campo su più righe: oggi solo le note del gioco.
 *
 * Il nome resta `Textarea`, con la `a` minuscola, come in shadcn: è quello che
 * le schermate importano. Quello di Tamagui è `TextArea`.
 *
 * Bordo, fuoco e colori sono quelli dell'Input, per le stesse ragioni scritte
 * lì. Cambia solo l'altezza: parte da tre righe (`rows`, il default di
 * Tamagui) e non scende sotto i 64 di prima.
 */
const TextareaFrame = styled(TextAreaBase, {
  name: 'Textarea',

  minH: 64,
  px: 10,
  py: 8,
  rounded: 8,
  fontSize: 14,
  lineHeight: 20,
  width: '100%',
  bg: 'transparent',
  color: '$color12',
  borderColor: '$color9',
  placeholderTextColor: '$color11',

  hoverStyle: { borderColor: '$color10' },
  focusStyle: { borderColor: '$accent9' },
  focusVisibleStyle: {
    outlineColor: '$outlineColor',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineOffset: 0,
  },

  variants: {
    disabled: {
      true: { opacity: 0.5, cursor: 'not-allowed' },
    },
  } as const,
});

export type TextareaProps = Omit<GetProps<typeof TextAreaBase>, 'onChange'> & {
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
};

/**
 * Stesso cast dell'Input, e qui serve una riga in più: il TextArea di Tamagui
 * dichiara l'`onChange` **dell'input** (`HTMLInputElement`), che è sbagliato
 * già alla fonte. A runtime l'evento viene dalla `<textarea>` — la story
 * `Typing` lo verifica — quindi si corregge solo il tipo, perché
 * `event.target.value` compili come prima.
 */
export const Textarea = TextareaFrame as unknown as (
  props: TextareaProps,
) => ReactNode;
