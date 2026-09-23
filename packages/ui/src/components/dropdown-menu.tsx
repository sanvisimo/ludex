import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { Menu } from 'tamagui';
import type { GetProps } from 'tamagui';

import { Check } from '../icons';

/**
 * Il menu a tendina: tema, lingua, e il «Nascondi come…» degli scarti.
 *
 * Sotto c'è il Menu di Tamagui — tastiera, typeahead, chiusura con Esc e al
 * clic fuori, `role="menu"` e `menuitem` — e qui ci sono i nomi di prima:
 * `DropdownMenu`, `…Trigger`, `…Content`, `…Group`, `…Label`, `…Item`,
 * `…RadioGroup`, `…RadioItem`, `…Separator`. Le altre voci di shadcn — le
 * spunte, i sottomenu, le scorciatoie, la variante `destructive` — non le
 * usava nessuno.
 *
 * Due traduzioni, perché le schermate non cambino:
 *
 * - `onClick` sulla voce diventa l'`onSelect` di Tamagui, che è ciò che
 *   scatta anche da tastiera.
 * - `align` (`start` / `end`) diventa la `placement` del popper: il menu
 *   del tema, in fondo a destra della barra, si allinea al bordo destro.
 *   Sta sul **`DropdownMenu`** e non sul `Content` come in shadcn, perché in
 *   Tamagui il popper lo governa la radice: nelle schermate la prop si sposta
 *   di due righe.
 */
type DropdownMenuProps = Omit<
  ComponentProps<typeof Menu>,
  'placement' | 'offset'
> & {
  align?: 'start' | 'end';
};

export function DropdownMenu({ align = 'start', ...props }: DropdownMenuProps) {
  return <Menu placement={`bottom-${align}`} offset={4} {...props} />;
}

/** Avvolge il bottone che gli si passa, come il trigger del Dialog. */
export function DropdownMenuTrigger({ render }: { render: ReactElement }) {
  return <Menu.Trigger asChild>{render}</Menu.Trigger>;
}

type DropdownMenuContentProps = GetProps<typeof Menu.Content>;

export function DropdownMenuContent({
  children,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Menu.Portal zIndex={200_000}>
      <Menu.Content
        minW={128}
        p={4}
        rounded={8}
        bg="$color2"
        borderWidth={1}
        borderColor="$borderColor"
        transition="quick"
        opacity={1}
        y={0}
        enterStyle={{ opacity: 0, y: -4 }}
        exitStyle={{ opacity: 0, y: -4 }}
        {...props}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownMenuGroup(props: GetProps<typeof Menu.Group>) {
  return <Menu.Group bg="transparent" {...props} />;
}

export function DropdownMenuLabel(props: GetProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      px={6}
      py={4}
      fontSize={12}
      lineHeight={16}
      fontWeight="500"
      color="$color11"
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator mx={-4} my={4} bg="$borderColor" />;
}

/** Il testo della voce, che è anche ciò su cui cerca il typeahead. */
function ItemText({ children }: { children: ReactNode }) {
  return typeof children === 'string' || typeof children === 'number' ? (
    <Menu.ItemTitle fontSize={14} lineHeight={20} color="$color12">
      {children}
    </Menu.ItemTitle>
  ) : (
    <>{children}</>
  );
}

const itemStyle = {
  gap: 6,
  px: 6,
  py: 4,
  rounded: 6,
  minH: 28,
  focusStyle: { bg: '$color5' },
  pressStyle: { bg: '$color6' },
} as const;

type DropdownMenuItemProps = Omit<GetProps<typeof Menu.Item>, 'onSelect'> & {
  onClick?: () => void;
};

export function DropdownMenuItem({
  onClick,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <Menu.Item {...itemStyle} onSelect={onClick} {...props}>
      <ItemText>{children}</ItemText>
    </Menu.Item>
  );
}

export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuRadioItem({
  children,
  ...props
}: GetProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem {...itemStyle} pr={28} {...props}>
      <ItemText>{children}</ItemText>
      <Menu.ItemIndicator position="absolute" r={8}>
        <Check size={14} color="$color12" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export type {
  DropdownMenuContentProps,
  DropdownMenuItemProps,
  DropdownMenuProps,
};
