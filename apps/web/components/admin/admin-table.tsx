import type { AdminSort } from '@repo/contracts';
import { Skeleton, Text } from '@repo/ui';
import { ArrowDown, ArrowUp, ArrowUpDown } from '@repo/ui/icons';
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
import { useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';

import './admin-table.css';

export type AdminColumn<T> = {
  key: string;
  header: ReactNode;
  width?: number;
  flex?: number;
  align?: 'end';
  minWidth?: number;
  sortValue?: (row: T) => string | number | Date | null;
  render: (row: T) => ReactNode;
};

type ServerSort<K extends string> = {
  value: AdminSort<K>;
  keys: readonly K[];
  onChange: (sort: AdminSort<K>) => void;
};

const emptyRows: never[] = [];

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

export function AdminTable<T extends RowData, K extends string = string>({
  label,
  columns,
  rows,
  rowKey,
  serverSort,
}: {
  label: string;
  columns: AdminColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  serverSort?: ServerSort<K>;
}) {
  const locale = useLocale();
  const t = useTranslations('filters');
  const [localSort, setLocalSort] = useState<AdminSort>();
  const sorting = serverSort?.value ?? localSort;
  const sortValue = serverSort
    ? undefined
    : columns.find((column) => column.key === sorting?.sort)?.sortValue;
  const collator = useMemo(
    () => new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }),
    [locale],
  );
  const sortedRows = useMemo(() => {
    if (!rows || !sortValue || !sorting) return rows;
    const direction = sorting.direction === 'asc' ? 1 : -1;
    return rows
      .map((row) => ({ row, value: sortValue(row) }))
      .sort(({ value: a }, { value: b }) => {
        if (a === null || b === null)
          return Number(a === null) - Number(b === null);
        const order =
          typeof a === 'string' && typeof b === 'string'
            ? collator.compare(a, b)
            : Number(a) - Number(b);
        return direction * order;
      })
      .map(({ row }) => row);
  }, [collator, rows, sorting, sortValue]);
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
    data: sortedRows ?? emptyRows,
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
        aria-busy={rows === undefined || undefined}
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
              {group.headers.map((header) => {
                const { id, columnDef } = header.column;
                const config = columnDef.meta;
                const serverKey = serverSort?.keys.find((key) => key === id);
                const canSort = serverSort
                  ? serverKey !== undefined
                  : !!config?.sortValue;
                const direction =
                  sorting?.sort === id ? sorting.direction : undefined;
                const Icon =
                  direction === 'asc'
                    ? ArrowUp
                    : direction === 'desc'
                      ? ArrowDown
                      : ArrowUpDown;
                const content = flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                );
                return (
                  <th
                    key={header.id}
                    scope="col"
                    data-align={config?.align}
                    aria-sort={
                      direction === 'asc'
                        ? 'ascending'
                        : direction === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className="admin-table-sort"
                        aria-label={
                          typeof config?.header === 'string'
                            ? t('sortColumn', { column: config.header })
                            : undefined
                        }
                        onClick={() => {
                          const nextDirection =
                            direction === 'asc' ? 'desc' : 'asc';
                          if (serverSort && serverKey !== undefined) {
                            serverSort.onChange({
                              sort: serverKey,
                              direction: nextDirection,
                            });
                          } else {
                            setLocalSort({
                              sort: id,
                              direction: nextDirection,
                            });
                          }
                        }}
                      >
                        {content}
                        <Icon size={12} aria-hidden />
                      </button>
                    ) : (
                      content
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows === undefined ? (
            <tr>
              <td colSpan={layout.length}>
                <Skeleton height={160} width="100%" rounded={8} />
              </td>
            </tr>
          ) : null}
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
