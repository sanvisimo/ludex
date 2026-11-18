import type { ReactNode } from 'react';
import { Adapt, Select as SelectBase, Sheet } from 'tamagui';
import type { SelectProps as SelectBaseProps } from 'tamagui';

import { Check, ChevronDown } from '../icons';

/**
 * La tendina a scelta singola: stato del gioco, negozio, supporto, ordinamento.
 *
 * I pezzi sono quelli di prima — `Select`, `SelectTrigger`, `SelectValue`,
 * `SelectContent`, `SelectItem` — perché le schermate cambino l'import e non
 * la struttura. Sotto c'è il Select di Tamagui, che sul web è una tendina
 * ancorata al bottone e su un dispositivo touch diventa un foglio dal basso
 * (`Adapt`): è l'unico componente del kit che su telefono cambia forma, ed è
 * giusto così, perché una tendina minuscola sotto un pollice non si usa.
 *
 * Una cosa che Tamagui vuole e le schermate non devono sapere: **il testo
 * del valore scelto** Tamagui lo legge dalla voce, che però esiste solo a
 * tendina aperta. `items` (valore → etichetta) è la stessa prop di Base UI, e
 * qui diventa `renderValue`: il bottone mostra l'etichetta anche prima del
 * primo clic.
 */
// Le taglie di Tamagui (`xs`…`xl`) qui non valgono: le misure le danno i
// pezzi qui sotto.
export type SelectProps = Omit<SelectBaseProps, 'size'> & {
  items?: Record<string, ReactNode>;
};

export function Select({ items, children, ...props }: SelectProps) {
  return (
    <SelectBase
      disablePreventBodyScroll
      zIndex={200_000}
      renderValue={items ? (value: string) => items[value] : undefined}
      {...props}
    >
      {children}

      <SelectBase.Adapt platform="touch">
        <Sheet modal dismissOnSnapToBottom snapPointsMode="fit">
          <Sheet.Container p="3">
            <Sheet.Background />
            <Sheet.ScrollView>
              <Adapt.Contents />
            </Sheet.ScrollView>
          </Sheet.Container>
          <Sheet.Overlay bg="shadow6" />
        </Sheet>
      </SelectBase.Adapt>
    </SelectBase>
  );
}

type SelectTriggerProps = Parameters<typeof SelectBase.Trigger>[0];

/**
 * Il bottone: stesse misure e stesso bordo dell'Input, perché nei form stanno
 * sulla stessa colonna e devono sembrare parenti.
 */
export function SelectTrigger({ children, ...props }: SelectTriggerProps) {
  return (
    <SelectBase.Trigger
      height={32}
      minH={32}
      px={10}
      py={0}
      gap={6}
      rounded={8}
      borderWidth={1}
      borderColor="color9 hover:color10 press:color10 focus:accent9"
      bg="transparent hover:color3 press:color4"
      width="auto"
      self="flex-start"
      {...props}
    >
      {children}
      <SelectBase.Icon>
        <ChevronDown size={16} color="color11" />
      </SelectBase.Icon>
    </SelectBase.Trigger>
  );
}

type SelectValueProps = Parameters<typeof SelectBase.Value>[0];

export function SelectValue(props: SelectValueProps) {
  return (
    <SelectBase.Value
      fontSize={14}
      color="color12"
      whiteSpace="nowrap"
      {...props}
    />
  );
}

/** Il pannello aperto, con le voci in fila. */
export function SelectContent({ children }: { children: ReactNode }) {
  return (
    <SelectBase.Content>
      <SelectBase.Viewport
        minW={160}
        p={4}
        rounded={8}
        bg="color2"
        borderWidth={1}
        borderColor="border-color"
      >
        <SelectBase.Group>{children}</SelectBase.Group>
      </SelectBase.Viewport>
    </SelectBase.Content>
  );
}

type SelectItemProps = Omit<Parameters<typeof SelectBase.Item>[0], 'value'> & {
  value: string;
};

export function SelectItem({ value, children, ...props }: SelectItemProps) {
  return (
    <SelectBase.Item
      value={value}
      height={32}
      minH={32}
      px={8}
      py={0}
      gap={8}
      rounded={6}
      bg="transparent hover:color4 press:color5 focus:color4"
      {...props}
    >
      <SelectBase.ItemText fontSize={14} color="color12">
        {children}
      </SelectBase.ItemText>
      <SelectBase.ItemIndicator ml="auto">
        <Check size={14} color="color12" />
      </SelectBase.ItemIndicator>
    </SelectBase.Item>
  );
}
