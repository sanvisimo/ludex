import { createContext, useContext, type ReactNode } from 'react';
import { ToggleGroup as ToggleGroupBase } from 'tamagui';

/**
 * Il valore scelto, per le opzioni. A scelta singola il ToggleGroup di
 * Tamagui 2.7.7 toglie `aria-pressed` dalle opzioni e non ci mette niente al
 * suo posto: a un lettore di schermo tre bottoni uguali, senza dire quale è
 * acceso. Lo rimettiamo noi. Si toglie quando Tamagui lo sistema.
 */
const Selected = createContext<string | undefined>(undefined);

export type ToggleGroupProps = {
  value: string;
  onValueChange: (value: string) => void;
  /** Che cosa si sceglie, per i lettori di schermo: «Vista». */
  label: string;
  children: ReactNode;
};

/**
 * Una scelta fra poche opzioni, tutte a vista: la vista del backlog, righe,
 * griglia o compatta.
 *
 * Solo a **scelta singola**, e sempre con una scelta fatta
 * (`disableDeactivation`): ripremere la vista accesa non la spegne, perché
 * una lista senza vista non esiste. Sotto c'è il ToggleGroup di Tamagui, con
 * le frecce che passano da un'opzione all'altra.
 */
export function ToggleGroup({
  value,
  onValueChange,
  label,
  children,
}: ToggleGroupProps) {
  return (
    <Selected.Provider value={value}>
      <ToggleGroupBase
        type="single"
        disableDeactivation
        value={value}
        onValueChange={onValueChange}
        aria-label={label}
        orientation="horizontal"
        flexDirection="row"
        height={32}
        p={2}
        gap={2}
        rounded={8}
        borderWidth={1}
        borderColor="$color9"
        self="flex-start"
      >
        {children}
      </ToggleGroupBase>
    </Selected.Provider>
  );
}

/**
 * Un'opzione. Con sola icona va dato `aria-label`, perché l'icona non dice
 * niente a un lettore di schermo.
 */
export function ToggleGroupItem({
  value,
  children,
  'aria-label': ariaLabel,
}: {
  value: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  const selected = useContext(Selected);
  return (
    <ToggleGroupBase.Item
      value={value}
      aria-label={ariaLabel}
      aria-pressed={value === selected}
      unstyled
      height={26}
      minW={26}
      px={6}
      gap={6}
      rounded={6}
      flexDirection="row"
      items="center"
      justify="center"
      bg="transparent"
      borderWidth={0}
      cursor="pointer"
      hoverStyle={{ bg: '$color4' }}
      pressStyle={{ bg: '$color5' }}
      activeStyle={{ bg: '$color6' }}
      focusVisibleStyle={{
        outlineColor: '$outlineColor',
        outlineStyle: 'solid',
        outlineWidth: 2,
        outlineOffset: 1,
      }}
    >
      {children}
    </ToggleGroupBase.Item>
  );
}
