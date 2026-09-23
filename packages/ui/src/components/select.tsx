import { Children, cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
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
 * Due cose che Tamagui vuole e le schermate non devono sapere:
 *
 * - **ogni voce ha un `index`**, la sua posizione, che serve alla tastiera.
 *   Lo aggiunge `SelectContent` contando i figli, così una voce fissa seguita
 *   da un `.map()` — «Nessun negozio» e poi i negozi — resta scritta com'è.
 * - **il testo del valore scelto** Tamagui lo legge dalla voce, che però
 *   esiste solo a tendina aperta. `items` (valore → etichetta) è la stessa
 *   prop di Base UI, e qui diventa `renderValue`: il bottone mostra
 *   l'etichetta anche prima del primo clic.
 */
export type SelectProps = SelectBaseProps & {
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
          <Sheet.Frame p="$3">
            <Sheet.ScrollView>
              <Adapt.Contents />
            </Sheet.ScrollView>
          </Sheet.Frame>
          <Sheet.Overlay bg="$shadow6" />
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
      borderColor="$color9"
      bg="transparent"
      width="auto"
      self="flex-start"
      hoverStyle={{ borderColor: '$color10', bg: '$color3' }}
      pressStyle={{ borderColor: '$color10', bg: '$color4' }}
      focusStyle={{ borderColor: '$accent9' }}
      iconAfter={<ChevronDown size={16} color="$color11" />}
      {...props}
    >
      {children}
    </SelectBase.Trigger>
  );
}

type SelectValueProps = Parameters<typeof SelectBase.Value>[0];

export function SelectValue(props: SelectValueProps) {
  return (
    <SelectBase.Value
      fontSize={14}
      color="$color12"
      whiteSpace="nowrap"
      {...props}
    />
  );
}

/** Il pannello aperto. Numera le voci — vedi sopra — e le mette in fila. */
export function SelectContent({ children }: { children: ReactNode }) {
  let index = 0;
  const indexed = Children.toArray(children).map((child) =>
    isValidElement(child)
      ? cloneElement(child as ReactElement<{ index?: number }>, {
          index: index++,
        })
      : child,
  );

  return (
    <SelectBase.Content>
      <SelectBase.Viewport
        minW={160}
        p={4}
        rounded={8}
        bg="$color2"
        borderWidth={1}
        borderColor="$borderColor"
      >
        <SelectBase.Group>{indexed}</SelectBase.Group>
      </SelectBase.Viewport>
    </SelectBase.Content>
  );
}

type SelectItemProps = Omit<
  Parameters<typeof SelectBase.Item>[0],
  'index' | 'value'
> & {
  value: string;
  /** Lo mette `SelectContent`: non va scritto a mano. */
  index?: number;
};

export function SelectItem({
  value,
  index = 0,
  children,
  ...props
}: SelectItemProps) {
  return (
    <SelectBase.Item
      index={index}
      value={value}
      height={32}
      minH={32}
      px={8}
      py={0}
      gap={8}
      rounded={6}
      bg="transparent"
      hoverStyle={{ bg: '$color4' }}
      focusStyle={{ bg: '$color4' }}
      pressStyle={{ bg: '$color5' }}
      {...props}
    >
      <SelectBase.ItemText fontSize={14} color="$color12">
        {children}
      </SelectBase.ItemText>
      <SelectBase.ItemIndicator ml="auto">
        <Check size={14} color="$color12" />
      </SelectBase.ItemIndicator>
    </SelectBase.Item>
  );
}
