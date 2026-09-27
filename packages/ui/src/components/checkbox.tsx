import { Checkbox as CheckboxBase } from 'tamagui';
import type { CheckboxProps as CheckboxBaseProps } from 'tamagui';

import { Check } from '../icons';

export type CheckboxProps = Omit<CheckboxBaseProps, 'children' | 'size'>;

/**
 * La spunta: le liste del pannello dei filtri — piattaforme, negozi, generi,
 * tag — e «mai giocato».
 *
 * Il comportamento è quello del Checkbox di Tamagui — `checked`,
 * `onCheckedChange`, `disabled`, `id` — con `role="checkbox"` e
 * `aria-checked` sul web. Qui si decide l'aspetto: 16 × 16, come l'`input`
 * nudo che sostituisce.
 *
 * Gli stessi colori dello Switch, per la stessa ragione: il bordo spento è
 * `$color9`, l'unico grigio sopra il 3:1 in entrambi i temi, e acceso è
 * l'accento, con la spunta scura sopra come il testo del bottone primario.
 *
 * L'etichetta va **accanto**, con `<Label htmlFor>` che punta all'`id`.
 */
export function Checkbox(props: CheckboxProps) {
  return (
    <CheckboxBase
      width={16}
      height={16}
      // Come sullo Switch: senza, la variante `size` di Tamagui mette un
      // `minHeight` che vince sull'altezza.
      minH={16}
      minW={16}
      p={0}
      rounded={4}
      borderWidth={1}
      borderColor="$color9"
      bg="transparent"
      items="center"
      justify="center"
      hoverStyle={{ borderColor: '$color10' }}
      activeStyle={{ bg: '$accent9', borderColor: '$accent9' }}
      focusVisibleStyle={{
        outlineColor: '$outlineColor',
        outlineStyle: 'solid',
        outlineWidth: 2,
        outlineOffset: 2,
      }}
      disabledStyle={{ opacity: 0.5, cursor: 'not-allowed' }}
      {...props}
    >
      <CheckboxBase.Indicator>
        <Check size={12} strokeWidth={3} color="$black1" />
      </CheckboxBase.Indicator>
    </CheckboxBase>
  );
}
