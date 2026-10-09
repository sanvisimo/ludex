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
  /**
   * Una colonna elastica non scende sotto questa larghezza: sotto, la tabella
   * scorre di lato. Senza, stretta la finestra, un numero finiva spezzato a
   * metà e un motivo restava una colonna di tre parole.
   */
  minWidth?: number;
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
  // La larghezza sotto cui la tabella scorre: quella delle colonne che hanno una
  // misura, più i vuoti. Mai meno di 640, com'è sempre stato.
  const minW = Math.max(
    640,
    columns.reduce(
      (sum, column) => sum + (column.width ?? column.minWidth ?? 0),
      24 + 12 * (columns.length - 1),
    ),
  );

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
        minW={minW}
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
          minW={minW}
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
  // Solo le colonne elastiche tagliano: le view di Tamagui non si restringono
  // da sole, e un id Amazon lungo usciva dalla sua colonna e finiva sopra
  // quella accanto. Le fisse no, perché tengono i bottoni, e tagliandole si
  // perderebbe l'anello del focus: la loro larghezza va data giusta.
  return column.width !== undefined ? (
    <XStack role={role} width={column.width} shrink={0} items="center" gap={6}>
      {children}
    </XStack>
  ) : (
    <XStack
      role={role}
      flex={column.flex ?? 1}
      minW={column.minWidth ?? 0}
      overflow="hidden"
      items="center"
      gap={6}
    >
      {children}
    </XStack>
  );
}

/**
 * Il testo di una cella: una riga, tagliata se non ci sta. Accanto a una
 * copertina va dentro un blocco con `flex={1} minW={0}`, o il taglio non
 * scatta: il blocco resterebbe largo quanto il testo.
 *
 * Con `wrap` va invece a capo — in mezzo a una parola solo se la parola non ci
 * sta nemmeno da sola —: serve dove il testo **è** l'informazione, il motivo di
 * un errore o uno slug lungo, e tagliarlo lo renderebbe illeggibile. La riga si
 * alza quanto serve.
 */
export function CellText({
  children,
  muted = false,
  wrap = false,
}: {
  children: ReactNode;
  muted?: boolean;
  wrap?: boolean;
}) {
  return (
    <Text
      fontSize={13}
      lineHeight={18}
      color={muted ? '$color11' : '$color12'}
      numberOfLines={wrap ? undefined : 1}
      {...(wrap ? { style: { overflowWrap: 'break-word' } } : {})}
    >
      {children}
    </Text>
  );
}
