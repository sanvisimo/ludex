import { Text } from '@repo/ui';
import {
  flexRender,
  metaHelper,
  tableFeatures,
  useTable,
  type CellContext,
  type ColumnDef,
  type HeaderContext,
  type RowData,
} from '@tanstack/react-table';
import { useMemo, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import './admin-table.css';

export type AdminColumn<T> = {
  key: string;
  header: ReactNode;
  width?: number;
  flex?: number;
  align?: 'end';
  minWidth?: number;
  render: (row: T) => ReactNode;
};

function adminFeatures<T>() {
  return tableFeatures({ columnMeta: metaHelper<AdminColumn<T>>() });
}

type AdminFeatures<T> = ReturnType<typeof adminFeatures<T>>;

function AdminHeader<T extends RowData>({
  column,
}: HeaderContext<AdminFeatures<T>, T>) {
  const t = useTranslations('admin');
  const header = column.columnDef.meta?.header;
  return column.id === 'actions' && header === '' ? (
    <span className="sr-only">{t('actions')}</span>
  ) : (
    header
  );
}

function AdminCell<T extends RowData>({
  column,
  row,
}: CellContext<AdminFeatures<T>, T>) {
  return column.columnDef.meta?.render(row.original);
}

export function AdminTable<T extends RowData>({
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
  const features = useMemo(() => adminFeatures<T>(), []);
  const definitions = useMemo<ColumnDef<AdminFeatures<T>, T>[]>(
    // I renderer restano stabili anche quando il chiamante ricrea le colonne,
    // così React conserva il focus e lo stato dei controlli dentro le celle.
    () =>
      columns.map((column) => ({
        id: column.key,
        header: AdminHeader<T>,
        cell: AdminCell<T>,
        meta: column,
      })),
    [columns],
  );
  const table = useTable({
    features,
    columns: definitions,
    data: rows,
    getRowId: rowKey,
  });

  const layout = table.getAllLeafColumns().map((column, index, all) => {
    const config = column.columnDef.meta!;
    const padding =
      12 + (index === 0 ? 10 : 0) + (index === all.length - 1 ? 10 : 0);
    return {
      id: column.id,
      basis: (config.width ?? config.minWidth ?? 0) + padding,
      weight: config.width === undefined ? (config.flex ?? 1) : 0,
    };
  });
  const basis = layout.reduce((total, column) => total + column.basis, 0);
  const weight = layout.reduce((total, column) => total + column.weight, 0);

  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="admin-table-scroll"
    >
      <table
        aria-label={label}
        className="admin-table"
        style={{ minWidth: Math.max(640, basis) }}
      >
        <colgroup>
          {layout.map((column) => (
            <col
              key={column.id}
              style={{
                width: column.weight
                  ? `calc(${column.basis}px + (100% - ${basis}px) * ${column.weight / weight})`
                  : column.basis,
              }}
            />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  data-align={header.column.columnDef.meta?.align}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td
                  key={cell.id}
                  data-align={cell.column.columnDef.meta?.align}
                >
                  <div className="admin-table-cell">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
