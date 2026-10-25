import { useRef } from 'react';

import { X } from '../icons';
import type { InputProps } from './input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from './input-group';

export type ClearableInputProps = Omit<
  InputProps,
  'value' | 'onChange' | 'onChangeText'
> & {
  value: string;
  onChangeText: (value: string) => void;
  /** L'etichetta della x, per i lettori di schermo: il testo lo decide l'app. */
  clearLabel: string;
};

/**
 * Il campo delle ricerche, con la x che svuota quando c'è del testo: la stessa
 * del `SearchField`, senza la tendina.
 *
 * La x chiama `onChangeText('')` e rimette il fuoco nel campo: sul telefono il
 * tocco sul bottone lo porterebbe via, e la tastiera si chiuderebbe proprio
 * quando si vuole scrivere altro. Sta fuori dal giro del Tab, come nel
 * `SearchField`: col campo vuoto non c'è, e da tastiera si seleziona il testo.
 *
 * Il bordo e la larghezza sono del gruppo, e le props vanno al campo: chi lo
 * mette in una fila accanto a un bottone lo avvolge in un `YStack` con
 * `flex={1}`.
 */
export function ClearableInput({
  value,
  onChangeText,
  clearLabel,
  ...props
}: ClearableInputProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <InputGroup>
      <InputGroupInput
        ref={input as never}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
        {...props}
      />
      {value.length > 0 && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={clearLabel}
            tabIndex={-1}
            onPress={() => {
              onChangeText('');
              input.current?.focus();
            }}
          >
            <X size={12} />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
