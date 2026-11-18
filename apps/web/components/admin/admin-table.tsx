import { Text, XStack, YStack } from '@repo/ui';
import type { ReactNode } from 'react';

export type AdminColumn<T> = {
  key: string;
  header: ReactNode;
  width?: number;
  flex?: number;
  align?: 'end';
  minWidth?: number;
  render: (row: T) => ReactNode;
};

export function AdminTable<T>({
  label,
  columns,
  rows,
  rowKey,
}: {
  label: string;
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}) {
  const minW = Math.max(
    640,
    columns.reduce(
      (sum, column) => sum + (column.width ?? column.minWidth ?? 0),
      32 + 12 * (columns.length - 1),
    ),
  );

  return (
    <YStack
      role="table"
      aria-label={label}
      tabIndex={0}
      outlineColor="focus-visible:outline-color"
      outlineStyle="focus-visible:solid"
      outlineWidth="focus-visible:2px"
      outlineOffset="focus-visible:2px"
      bg="background"
      rounded={12}
      borderWidth={1}
      borderColor="border-color"
      overflow="hidden"
      style={{ overflowX: 'auto' }}
    >
      <XStack
        role="row"
        px={16}
        py={12}
        gap={12}
        items="center"
        bg="color3"
        borderBottomWidth={1}
        borderColor="border-color"
        minW={minW}
      >
        {columns.map((column) => (
          <Cell key={column.key} column={column} role="columnheader">
            <Text
              fontSize={12}
              lineHeight="16px"
              fontWeight="600"
              color="color11"
            >
              {column.header}
            </Text>
          </Cell>
        ))}
      </XStack>

      {rows.map((row, index) => (
        <XStack
          role="row"
          key={rowKey(row)}
          px={16}
          py={12}
          gap={12}
          items="center"
          minW={minW}
          borderTopWidth={index === 0 ? 0 : 1}
          borderColor="border-color"
          bg="hover:color2"
        >
          {columns.map((column) => (
            <Cell key={column.key} column={column} role="cell">
              {column.render(row)}
            </Cell>
          ))}
        </XStack>
      ))}
    </YStack>
  );
}

function Cell<T>({
  column,
  role,
  children,
}: {
  column: AdminColumn<T>;
  role: 'cell' | 'columnheader';
  children: ReactNode;
}) {
  // Le colonne fisse lasciano visibile il focus dei bottoni oltre il bordo della cella.
  const fixed = column.width !== undefined;
  return (
    <XStack
      role={role}
      width={column.width}
      shrink={fixed ? 0 : undefined}
      flex={fixed ? undefined : (column.flex ?? 1)}
      minW={fixed ? undefined : (column.minWidth ?? 0)}
      overflow={fixed ? undefined : 'hidden'}
      items="center"
      gap={8}
      justify={column.align === 'end' ? 'flex-end' : 'flex-start'}
    >
      {children}
    </XStack>
  );
}

export function CellText({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <Text
      fontSize={13}
      lineHeight="18px"
      color={muted ? 'color11' : 'color12'}
      style={{ overflowWrap: 'anywhere' }}
    >
      {children}
    </Text>
  );
}
