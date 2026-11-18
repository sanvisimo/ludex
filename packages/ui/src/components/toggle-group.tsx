import { createContext, useContext, type ReactNode } from 'react';
import { style } from 'tamagui';
import { ToggleGroup as ToggleGroupBase } from 'tamagui/unstyled';

/**
 * Il valore scelto, per le opzioni. A scelta singola il ToggleGroup di
 * Tamagui (anche la 3.3.3) toglie `aria-pressed` e non ci mette niente al
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
        borderColor="color9"
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
const selectedStyle = style({
  bg: 'selectionBackground',
  borderColor: 'selectionBorder',
});

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
  const active = value === selected;
  return (
    <ToggleGroupBase.Item
      value={value}
      aria-label={ariaLabel}
      aria-pressed={active}
      height={26}
      minW={26}
      px={6}
      gap={6}
      rounded={6}
      flexDirection="row"
      items="center"
      justify="center"
      bg={`${active ? 'selectionBackground' : 'transparent'} hover:${active ? 'selectionBackgroundHover' : 'color4'} press:${active ? 'selectionBackgroundPress' : 'color5'}`}
      borderWidth={1}
      borderColor={`${active ? 'selectionBorder' : 'transparent'} hover:${active ? 'selectionBorderHover' : 'transparent'} press:${active ? 'selectionBorderPress' : 'transparent'}`}
      cursor="pointer"
      outlineColor="focus-visible:outline-color"
      outlineStyle="focus-visible:solid"
      outlineWidth="focus-visible:2px"
      outlineOffset="focus-visible:1px"
      activeStyle={selectedStyle}
    >
      {children}
    </ToggleGroupBase.Item>
  );
}
