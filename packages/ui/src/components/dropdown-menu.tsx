import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { Menu } from 'tamagui';
import type { GetProps } from 'tamagui';

import { Check } from '../icons';

type DropdownMenuProps = Omit<
  ComponentProps<typeof Menu>,
  'placement' | 'offset'
> & {
  align?: 'start' | 'end';
};

export function DropdownMenu({ align = 'start', ...props }: DropdownMenuProps) {
  return <Menu placement={`bottom-${align}`} offset={4} {...props} />;
}

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
        bg="color2"
        borderWidth={1}
        borderColor="border-color"
        transition="quick"
        opacity="1 enter:0 exit:0"
        y="0 enter:-4px exit:-4px"
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
      lineHeight="16px"
      fontWeight="500"
      color="color11"
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator mx={-4} my={4} bg="border-color" />;
}

function ItemText({
  children,
  color = 'color12',
}: {
  children: ReactNode;
  color?: 'color12' | 'red11';
}) {
  return typeof children === 'string' || typeof children === 'number' ? (
    <Menu.ItemTitle fontSize={14} lineHeight="20px" color={color}>
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
  bg: 'focus:color5 press:color6',
} as const;

type DropdownMenuItemProps = Omit<GetProps<typeof Menu.Item>, 'onSelect'> & {
  onClick?: () => void;
  icon?: ReactNode;
  destructive?: boolean;
};

const destructiveStyle = {
  bg: 'focus:red4 press:red5',
} as const;

export function DropdownMenuItem({
  onClick,
  icon,
  destructive = false,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <Menu.Item
      flexDirection="row"
      items="center"
      {...itemStyle}
      {...(destructive && destructiveStyle)}
      onSelect={onClick}
      {...props}
    >
      {icon}
      <ItemText color={destructive ? 'red11' : 'color12'}>{children}</ItemText>
    </Menu.Item>
  );
}

export function DropdownMenuRadioGroup(
  props: GetProps<typeof Menu.RadioGroup>,
) {
  // Il fondo predefinito di RadioGroup crea una fascia più scura nel tema scuro.
  return <Menu.RadioGroup bg="transparent" {...props} />;
}

export function DropdownMenuRadioItem({
  children,
  ...props
}: GetProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem {...itemStyle} pr={28} {...props}>
      <ItemText>{children}</ItemText>
      <Menu.ItemIndicator position="absolute" r={8}>
        <Check size={14} color="color12" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export type {
  DropdownMenuContentProps,
  DropdownMenuItemProps,
  DropdownMenuProps,
};
