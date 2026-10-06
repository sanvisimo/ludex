import { Text, XStack, YStack } from '@repo/ui';
import type { ReactNode } from 'react';

/**
 * Una colonna della tabella. `width` fissa la larghezza; senza, la colonna
 * prende la sua parte di ciò che resta (`flex`, 1 di default).
 */
export type AdminColumn<T> = {
  key: string;
  header: ReactNode;
  width?: number;
  flex?: number;
  render: (row: T) => ReactNode;
};

/**
 * La tabella delle sezioni admin: la stessa forma della vista compatta del
 * backlog — righe di `XStack` con i ruoli ARIA di una tabella — perché in
 * `@repo/ui` una tabella non c'è, e l'admin è roba da desktop: niente forma
 * per il telefono, sotto si scorre di lato.
 */
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
  return (
    <YStack
      role="table"
      aria-label={label}
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
      overflow="hidden"
      {...({ style: { overflowX: 'auto' } } as object)}
    >
      <XStack
        role="row"
        px={12}
        py={8}
        gap={12}
        items="center"
        bg="$color2"
        borderBottomWidth={1}
        borderColor="$borderColor"
        minW={640}
      >
        {columns.map((column) => (
          <Cell key={column.key} column={column} role="columnheader">
            <Text fontSize={12} lineHeight={16} color="$color11">
              {column.header}
            </Text>
          </Cell>
        ))}
      </XStack>

      {rows.map((row, index) => (
        <XStack
          role="row"
          key={rowKey(row)}
          px={12}
          py={6}
          gap={12}
          items="center"
          minW={640}
          borderTopWidth={index === 0 ? 0 : 1}
          borderColor="$borderColor"
          hoverStyle={{ bg: '$color2' }}
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
  return column.width !== undefined ? (
    <XStack role={role} width={column.width} shrink={0} items="center" gap={6}>
      {children}
    </XStack>
  ) : (
    <XStack role={role} flex={column.flex ?? 1} minW={0} items="center" gap={6}>
      {children}
    </XStack>
  );
}

/** Il testo di una cella: una riga, tagliata se non ci sta. */
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
      lineHeight={18}
      color={muted ? '$color11' : '$color12'}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}
